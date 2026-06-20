"""Auth session management, OTP email delivery, and validation."""
from __future__ import annotations

import base64
import hashlib
import hmac
import json
import logging
import os
import re
import secrets
import smtplib
import time
from dotenv import load_dotenv
from email.mime.text import MIMEText
from pathlib import Path
from typing import Any

logger = logging.getLogger("identitysphere.auth")

ROLE_DASHBOARD = {
    "admin": "/admin",
    "auditor": "/auditor",
    "employee": "/employee",
    "executive": "/executive",
    "contractor": "/contractor",
}

ALLOWED_ROLES = set(ROLE_DASHBOARD.keys())
OTP_TTL_SECONDS = 300
OTP_MAX_ATTEMPTS = 5
SESSION_TTL_SECONDS = 600
AUTH_TOKEN_TTL_SECONDS = 8 * 3600

EMAIL_REGEX = re.compile(
    r"^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@"
    r"[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?"
    r"(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$"
)

_sessions: dict[str, dict[str, Any]] = {}
_webauthn_challenges: dict[str, dict[str, Any]] = {}

DATA_DIR = Path(__file__).resolve().parent.parent / "data"
CREDENTIALS_FILE = DATA_DIR / "webauthn_credentials.json"


def _secret() -> bytes:
    return os.getenv("AUTH_SECRET_KEY", "identitysphere-dev-secret-change-me").encode()


def mask_email(email: str) -> str:
    local, _, domain = email.partition("@")
    if len(local) <= 2:
        masked_local = local[0] + "***"
    else:
        masked_local = local[0] + "***" + local[-1]
    return f"{masked_local}@{domain}"


def validate_email(email: str) -> str | None:
    email = (email or "").strip()
    if not email:
        return "Email address is required."
    if len(email) > 254:
        return "Email address is too long."
    if not EMAIL_REGEX.match(email):
        return "Enter a valid email address."
    return None


def validate_password(password: str) -> list[str]:
    errors: list[str] = []
    if not password:
        errors.append("Password is required.")
    if password and len(password) < 12:
        errors.append("Password must be at least 12 characters.")
    if password and not re.search(r"[A-Z]", password):
        errors.append("Include at least one uppercase letter.")
    if password and not re.search(r"[a-z]", password):
        errors.append("Include at least one lowercase letter.")
    if password and not re.search(r"\d", password):
        errors.append("Include at least one number.")
    if password and not re.search(r"[^A-Za-z0-9]", password):
        errors.append("Include at least one special character.")
    if password and re.search(r"\s", password):
        errors.append("Password must not contain spaces.")
    return errors


def validate_role(role: str) -> str | None:
    if role not in ALLOWED_ROLES:
        return f"Invalid role. Allowed: {', '.join(sorted(ALLOWED_ROLES))}."
    return None


def _sign_session_id(session_id: str) -> str:
    sig = hmac.new(_secret(), session_id.encode(), hashlib.sha256).hexdigest()
    return f"{session_id}.{sig}"


def verify_session_cookie(cookie: str | None) -> str | None:
    if not cookie or "." not in cookie:
        return None
    session_id, sig = cookie.rsplit(".", 1)
    expected = hmac.new(_secret(), session_id.encode(), hashlib.sha256).hexdigest()
    if not hmac.compare_digest(sig, expected):
        return None
    session = _sessions.get(session_id)
    if not session or session.get("expires_at", 0) < time.time():
        _sessions.pop(session_id, None)
        return None
    return session_id


def create_mfa_session(email: str, role: str) -> tuple[str, str]:
    session_id = secrets.token_urlsafe(32)
    otp = f"{secrets.randbelow(1_000_000):06d}"
    _sessions[session_id] = {
        "email": email.strip(),
        "role": role,
        "otp_hash": hashlib.sha256(otp.encode()).hexdigest(),
        "otp_expires_at": time.time() + OTP_TTL_SECONDS,
        "attempts": 0,
        "expires_at": time.time() + SESSION_TTL_SECONDS,
        "sent_at": time.time(),
    }
    return session_id, otp


def get_session(session_id: str) -> dict[str, Any] | None:
    session = _sessions.get(session_id)
    if not session or session.get("expires_at", 0) < time.time():
        _sessions.pop(session_id, None)
        return None
    return session


def verify_otp(session_id: str, otp: str) -> dict[str, Any]:
    session = get_session(session_id)
    if not session:
        raise ValueError("Session expired. Please sign in again.")

    if session.get("otp_expires_at", 0) < time.time():
        _sessions.pop(session_id, None)
        raise ValueError("Verification code expired. Please sign in again.")

    session["attempts"] = session.get("attempts", 0) + 1
    if session["attempts"] > OTP_MAX_ATTEMPTS:
        _sessions.pop(session_id, None)
        raise ValueError("Too many invalid attempts. Please sign in again.")

    otp_hash = hashlib.sha256((otp or "").strip().encode()).hexdigest()
    if not hmac.compare_digest(otp_hash, session["otp_hash"]):
        remaining = OTP_MAX_ATTEMPTS - session["attempts"]
        raise ValueError(f"Invalid verification code. {remaining} attempt(s) remaining.")

    role = session["role"]
    email = session["email"]
    _sessions.pop(session_id, None)
    return {
        "email": email,
        "role": role,
        "redirect": ROLE_DASHBOARD.get(role, "/admin"),
        "auth_token": issue_auth_token(email, role),
    }


def resend_otp(session_id: str) -> tuple[str, dict[str, Any]]:
    session = get_session(session_id)
    if not session:
        raise ValueError("Session expired. Please sign in again.")

    otp = f"{secrets.randbelow(1_000_000):06d}"
    session["otp_hash"] = hashlib.sha256(otp.encode()).hexdigest()
    session["otp_expires_at"] = time.time() + OTP_TTL_SECONDS
    session["attempts"] = 0
    session["sent_at"] = time.time()
    delivery = deliver_otp(session["email"], otp, session["role"])
    session["delivery_mode"] = delivery
    return otp, session


def dev_log_otp_enabled() -> bool:
    load_dotenv(override=True)
    return os.getenv("AUTH_DEV_LOG_OTP", "").strip().lower() in ("1", "true", "yes")


def otp_delivery_mode() -> str:
    if smtp_configured():
        return "email"
    if dev_log_otp_enabled():
        return "console"
    return "none"


_PLACEHOLDER_MARKERS = (
    "your.email@gmail.com",
    "your@gmail.com",
    "example@gmail.com",
    "your sixteen char app password",
    "your_app_password",
)


def smtp_configured() -> bool:
    load_dotenv(override=True)
    user = os.getenv("GMAIL_USER", "").strip().lower()
    password = os.getenv("GMAIL_APP_PASSWORD", "").replace(" ", "").strip()
    if not user or not password:
        return False
    if user in _PLACEHOLDER_MARKERS or password.lower() in _PLACEHOLDER_MARKERS:
        return False
    if user.startswith("your.") or "example.com" in user:
        return False
    return True


def _log_dev_otp(to_email: str, otp: str, role: str, note: str = "") -> None:
    """Best-effort server log for dev OTP (never raises)."""
    msg = f"OTP for {to_email} (role={role}): {otp}"
    if note:
        msg = f"{note} {msg}"
    try:
        logger.info("[AUTH_DEV_LOG_OTP] %s", msg)
    except Exception:
        pass


def send_otp_email(to_email: str, otp: str, role: str) -> None:
    load_dotenv(override=True)
    gmail_user = os.getenv("GMAIL_USER", "").strip()
    gmail_pass = os.getenv("GMAIL_APP_PASSWORD", "").replace(" ", "").strip()

    if not gmail_user or not gmail_pass:
        raise RuntimeError(
            "Gmail SMTP is not configured. Set GMAIL_USER and GMAIL_APP_PASSWORD in a .env file."
        )

    role_label = role.capitalize()
    body = (
        f"IdentitySphere AI - Verification Code\n\n"
        f"Your one-time verification code is: {otp}\n\n"
        f"Role: {role_label}\n"
        f"This code expires in {OTP_TTL_SECONDS // 60} minutes.\n\n"
        f"If you did not request this code, contact security immediately."
    )
    msg = MIMEText(body, "plain", "utf-8")
    msg["Subject"] = "IdentitySphere AI - Your Verification Code"
    msg["From"] = gmail_user
    msg["To"] = to_email

    with smtplib.SMTP("smtp.gmail.com", 587, timeout=30) as server:
        server.ehlo()
        server.starttls()
        server.ehlo()
        server.login(gmail_user, gmail_pass)
        server.send_message(msg)


def deliver_otp(to_email: str, otp: str, role: str) -> str:
    """Send OTP by email, or use on-screen dev delivery. Returns delivery mode."""
    load_dotenv(override=True)

    if smtp_configured():
        try:
            send_otp_email(to_email, otp, role)
            return "email"
        except Exception as exc:
            if not dev_log_otp_enabled():
                raise RuntimeError(f"Could not send verification email: {exc}") from exc
            _log_dev_otp(to_email, otp, role, note=f"Gmail send failed ({exc}).")
            return "console"

    if dev_log_otp_enabled():
        _log_dev_otp(to_email, otp, role)
        return "console"

    raise RuntimeError(
        "Gmail is not configured. Enable 2-Step Verification, create an App Password at "
        "https://myaccount.google.com/apppasswords, then run: python setup_gmail.py"
    )


def mfa_response(
    session_id: str,
    email: str,
    role: str,
    resent: bool = False,
    delivery: str = "email",
    dev_otp: str | None = None,
) -> dict[str, Any]:
    if delivery == "console":
        message = (
            f"Dev mode: your verification code is shown below for {mask_email(email)}. "
            f"Enter it to continue. (Enable Gmail App Password for real email delivery.)"
        )
        hint = "Use the 6-digit code shown in the yellow box below."
    else:
        message = (
            f"{'New verification code sent' if resent else 'Verification code sent'} to {mask_email(email)} "
            f"(the email you entered). Open that Gmail inbox and enter the 6-digit code below."
        )
        hint = f"Open Gmail for {mask_email(email)} to retrieve your code."

    payload: dict[str, Any] = {
        "mfa_required": True,
        "masked_email": mask_email(email),
        "message": message,
        "otp_expires_in": OTP_TTL_SECONDS,
        "session_token": _sign_session_id(session_id),
        "delivery_mode": delivery,
        "notification": {"hint": hint},
    }
    if delivery == "console" and dev_otp and dev_log_otp_enabled():
        payload["dev_otp"] = dev_otp
    return payload


def inbox_notification(session_id: str) -> dict[str, Any]:
    session = get_session(session_id)
    if not session:
        raise ValueError("Session expired. Please sign in again.")
    mode = session.get("delivery_mode", "email")
    if mode == "console":
        message = (
            "Gmail App Password is not configured. Your OTP was printed in the API server terminal "
            "(the window running uvicorn). Enter that 6-digit code below."
        )
    else:
        message = "Your verification code was sent to this Gmail address. Enter the 6-digit code from the email."
    return {
        "to": session["email"],
        "sent_at": session.get("sent_at"),
        "subject": "IdentitySphere AI — Your Verification Code",
        "message": message,
        "delivery_mode": mode,
    }


def _load_credentials() -> dict[str, Any]:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    if not CREDENTIALS_FILE.exists():
        return {}
    try:
        with open(CREDENTIALS_FILE, encoding="utf-8") as f:
            return json.load(f)
    except (json.JSONDecodeError, OSError):
        return {}


def _save_credentials(data: dict[str, Any]) -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    with open(CREDENTIALS_FILE, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2)


def get_webauthn_credentials(email: str) -> list[dict[str, Any]]:
    store = _load_credentials()
    return store.get(email.lower(), [])


def save_webauthn_credential(email: str, credential: dict[str, Any]) -> None:
    store = _load_credentials()
    key = email.lower()
    existing = store.get(key, [])
    existing = [c for c in existing if c.get("credential_id") != credential.get("credential_id")]
    existing.append(credential)
    store[key] = existing
    _save_credentials(store)


def store_webauthn_challenge(challenge_id: str, payload: dict[str, Any]) -> None:
    payload["expires_at"] = time.time() + 120
    _webauthn_challenges[challenge_id] = payload


def pop_webauthn_challenge(challenge_id: str) -> dict[str, Any] | None:
    payload = _webauthn_challenges.pop(challenge_id, None)
    if not payload or payload.get("expires_at", 0) < time.time():
        return None
    return payload


def rp_id() -> str:
    return os.getenv("WEBAUTHN_RP_ID", "localhost")


def rp_origin() -> str:
    return os.getenv("WEBAUTHN_ORIGIN", "http://localhost:5173")


def allowed_origins() -> list[str]:
    configured = rp_origin().strip()
    origins = {configured}
    if "localhost" in configured:
        origins.add(configured.replace("localhost", "127.0.0.1"))
    if "127.0.0.1" in configured:
        origins.add(configured.replace("127.0.0.1", "localhost"))
    extra = os.getenv("WEBAUTHN_ORIGINS", "")
    for item in extra.split(","):
        item = item.strip()
        if item:
            origins.add(item)
    return sorted(origins)


def resolve_origin(request_origin: str | None) -> str:
    if request_origin and request_origin in allowed_origins():
        return request_origin
    return rp_origin()


def credential_id_to_bytes(credential_id: str) -> bytes:
    value = (credential_id or "").strip()
    if not value:
        raise ValueError("Missing credential id")
    if re.fullmatch(r"[0-9a-fA-F]+", value) and len(value) % 2 == 0:
        return bytes.fromhex(value)
    padding = "=" * ((4 - len(value) % 4) % 4)
    return base64.urlsafe_b64decode(value + padding)


def credential_ids_match(stored_id: str, client_id: str) -> bool:
    if not stored_id or not client_id:
        return False
    if stored_id == client_id:
        return True
    try:
        return credential_id_to_bytes(stored_id) == credential_id_to_bytes(client_id)
    except (ValueError, UnicodeDecodeError):
        return False


def issue_auth_token(email: str, role: str) -> str:
    exp = int(time.time()) + AUTH_TOKEN_TTL_SECONDS
    payload = f"{email.strip().lower()}|{role}|{exp}"
    sig = hmac.new(_secret(), payload.encode(), hashlib.sha256).hexdigest()
    raw = f"{payload}|{sig}".encode()
    return base64.urlsafe_b64encode(raw).decode().rstrip("=")


def verify_auth_token(token: str | None) -> dict[str, Any] | None:
    if not token:
        return None
    try:
        padding = "=" * ((4 - len(token) % 4) % 4)
        decoded = base64.urlsafe_b64decode(token + padding).decode()
        email, role, exp_str, sig = decoded.rsplit("|", 3)
        payload = f"{email}|{role}|{exp_str}"
        expected = hmac.new(_secret(), payload.encode(), hashlib.sha256).hexdigest()
        if not hmac.compare_digest(sig, expected):
            return None
        if int(exp_str) < time.time():
            return None
        if validate_role(role):
            return None
        return {
            "email": email,
            "role": role,
            "redirect": ROLE_DASHBOARD.get(role, "/admin"),
        }
    except (ValueError, UnicodeDecodeError):
        return None
