"""FastAPI auth routes — login, OTP, WebAuthn biometrics."""
from __future__ import annotations

import json
import secrets
from typing import Any

from fastapi import APIRouter, HTTPException, Request, Response
from pydantic import BaseModel

from identitysphere.auth import service as auth

router = APIRouter(prefix="/api/auth", tags=["auth"])

COOKIE_NAME = "is_mfa_session"


class LoginBody(BaseModel):
    email: str = ""
    username: str = ""
    password: str = ""
    role: str = ""


class OtpBody(BaseModel):
    otp: str = ""


class WebAuthnBeginBody(BaseModel):
    email: str
    password: str = ""
    role: str = ""


class WebAuthnFinishBody(BaseModel):
    email: str
    challenge_id: str
    credential: dict[str, Any]
    role: str = ""


def _email_from_body(body: LoginBody) -> str:
    return (body.email or body.username or "").strip()


def _set_mfa_cookie(response: Response, session_id: str) -> None:
    response.set_cookie(
        key=COOKIE_NAME,
        value=auth._sign_session_id(session_id),
        httponly=True,
        samesite="lax",
        max_age=auth.SESSION_TTL_SECONDS,
        path="/",
    )


def _session_from_request(request: Request) -> str | None:
    return auth.verify_session_cookie(request.cookies.get(COOKIE_NAME))


def _start_mfa(email: str, role: str, response: Response, resent: bool = False) -> dict[str, Any]:
    session_id, otp = auth.create_mfa_session(email, role)
    delivery = auth.deliver_otp(email, otp, role)
    session = auth.get_session(session_id)
    if session:
        session["delivery_mode"] = delivery
    _set_mfa_cookie(response, session_id)
    return auth.mfa_response(
        session_id, email, role, resent=resent, delivery=delivery,
        dev_otp=otp if delivery == "console" else None,
    )


@router.post("/login")
def login(body: LoginBody, response: Response):
    email = _email_from_body(body)
    email_err = auth.validate_email(email)
    if email_err:
        raise HTTPException(400, {"error": email_err})

    pw_errors = auth.validate_password(body.password)
    if pw_errors:
        raise HTTPException(400, {"error": "Password validation failed", "details": pw_errors})

    role_err = auth.validate_role(body.role)
    if role_err:
        raise HTTPException(400, {"error": role_err})

    try:
        return _start_mfa(email, body.role, response)
    except RuntimeError as exc:
        raise HTTPException(503, {"error": str(exc)}) from exc


@router.post("/verify-mfa")
def verify_mfa(body: OtpBody, request: Request, response: Response):
    session_id = _session_from_request(request)
    if not session_id:
        raise HTTPException(401, {"error": "Session expired. Please sign in again."})

    try:
        result = auth.verify_otp(session_id, body.otp)
    except ValueError as exc:
        raise HTTPException(400, {"error": str(exc)}) from exc

    response.delete_cookie(COOKIE_NAME, path="/")
    return result


@router.get("/me")
def auth_me(request: Request):
    auth_header = request.headers.get("Authorization", "")
    token = auth_header.removeprefix("Bearer ").strip()
    if not token:
        token = request.headers.get("X-Auth-Token", "").strip()
    user = auth.verify_auth_token(token)
    if not user:
        raise HTTPException(401, {"error": "Invalid or expired session. Please sign in again."})
    return user


@router.post("/resend-mfa")
def resend_mfa(request: Request):
    session_id = _session_from_request(request)
    if not session_id:
        raise HTTPException(401, {"error": "Session expired. Please sign in again."})

    try:
        otp, session = auth.resend_otp(session_id)
        delivery = session.get("delivery_mode", "email")
        return auth.mfa_response(
            session_id, session["email"], session["role"], resent=True, delivery=delivery,
            dev_otp=otp if delivery == "console" else None,
        )
    except RuntimeError as exc:
        raise HTTPException(503, {"error": str(exc)}) from exc
    except ValueError as exc:
        raise HTTPException(400, {"error": str(exc)}) from exc
    except Exception as exc:
        raise HTTPException(500, {"error": f"Could not resend verification email: {exc}"}) from exc


@router.get("/notification/inbox")
def notification_inbox(request: Request):
    session_id = _session_from_request(request)
    if not session_id:
        raise HTTPException(401, {"error": "Session expired. Please sign in again."})
    try:
        return auth.inbox_notification(session_id)
    except ValueError as exc:
        raise HTTPException(400, {"error": str(exc)}) from exc


@router.get("/status")
def auth_status():
    return {
        "smtp_configured": auth.smtp_configured(),
        "dev_log_otp": auth.dev_log_otp_enabled(),
        "otp_delivery": auth.otp_delivery_mode(),
        "webauthn_rp_id": auth.rp_id(),
        "webauthn_origin": auth.rp_origin(),
        "allowed_origins": auth.allowed_origins(),
    }


# ─── WebAuthn (fingerprint / face) ───────────────────────────────────────────

def _webauthn_imports():
    try:
        from webauthn import (
            generate_authentication_options,
            generate_registration_options,
            verify_authentication_response,
            verify_registration_response,
        )
        from webauthn.helpers.cose import COSEAlgorithmIdentifier
        from webauthn.helpers.parse_authentication_credential_json import (
            parse_authentication_credential_json,
        )
        from webauthn.helpers.parse_registration_credential_json import (
            parse_registration_credential_json,
        )
        from webauthn.helpers.structs import (
            AuthenticatorSelectionCriteria,
            PublicKeyCredentialDescriptor,
            UserVerificationRequirement,
        )

        return {
            "generate_registration_options": generate_registration_options,
            "verify_registration_response": verify_registration_response,
            "generate_authentication_options": generate_authentication_options,
            "verify_authentication_response": verify_authentication_response,
            "COSEAlgorithmIdentifier": COSEAlgorithmIdentifier,
            "AuthenticatorSelectionCriteria": AuthenticatorSelectionCriteria,
            "PublicKeyCredentialDescriptor": PublicKeyCredentialDescriptor,
            "UserVerificationRequirement": UserVerificationRequirement,
            "parse_registration_credential_json": parse_registration_credential_json,
            "parse_authentication_credential_json": parse_authentication_credential_json,
        }
    except ImportError as exc:
        raise HTTPException(503, {"error": "WebAuthn support is not installed on the server."}) from exc


@router.post("/webauthn/register/begin")
def webauthn_register_begin(body: WebAuthnBeginBody):
    w = _webauthn_imports()
    email = body.email.strip().lower()
    email_err = auth.validate_email(email)
    if email_err:
        raise HTTPException(400, {"error": email_err})
    pw_errors = auth.validate_password(body.password)
    if pw_errors:
        raise HTTPException(400, {"error": "Password validation failed", "details": pw_errors})
    role_err = auth.validate_role(body.role)
    if role_err:
        raise HTTPException(400, {"error": role_err})

    challenge_id = secrets.token_urlsafe(16)
    user_id = email.encode("utf-8")[:64]

    options = w["generate_registration_options"](
        rp_id=auth.rp_id(),
        rp_name="IdentitySphere AI",
        user_id=user_id,
        user_name=email,
        user_display_name=email.split("@")[0],
        authenticator_selection=w["AuthenticatorSelectionCriteria"](
            user_verification=w["UserVerificationRequirement"].REQUIRED,
        ),
        supported_pub_key_algs=[w["COSEAlgorithmIdentifier"].ECDSA_SHA_256],
    )

    from webauthn.helpers.options_to_json_dict import options_to_json_dict

    auth.store_webauthn_challenge(challenge_id, {
        "type": "register",
        "email": email,
        "role": body.role,
        "challenge": options.challenge,
    })

    payload = options_to_json_dict(options)
    payload["challenge_id"] = challenge_id
    return payload


@router.post("/webauthn/register/complete")
def webauthn_register_complete(body: WebAuthnFinishBody, request: Request):
    w = _webauthn_imports()
    email = body.email.strip().lower()
    stored = auth.pop_webauthn_challenge(body.challenge_id)
    if not stored or stored.get("type") != "register" or stored.get("email") != email:
        raise HTTPException(400, {"error": "Biometric registration expired. Try again."})

    origin = auth.resolve_origin(request.headers.get("origin"))

    try:
        verification = w["verify_registration_response"](
            credential=w["parse_registration_credential_json"](json.dumps(body.credential)),
            expected_challenge=stored["challenge"],
            expected_rp_id=auth.rp_id(),
            expected_origin=origin,
        )
    except Exception as exc:
        raise HTTPException(400, {"error": f"Biometric registration failed: {exc}"}) from exc

    client_cred_id = body.credential.get("id") or ""
    auth.save_webauthn_credential(email, {
        "credential_id": client_cred_id or verification.credential_id.hex(),
        "public_key": verification.credential_public_key.hex(),
        "sign_count": verification.sign_count,
    })
    return {"registered": True, "message": "Biometric credential registered for this account."}


@router.post("/webauthn/login/begin")
def webauthn_login_begin(body: WebAuthnBeginBody):
    w = _webauthn_imports()
    email = body.email.strip().lower()
    email_err = auth.validate_email(email)
    if email_err:
        raise HTTPException(400, {"error": email_err})

    creds = auth.get_webauthn_credentials(email)
    if not creds:
        raise HTTPException(404, {"error": "No biometric credential found. Register first using the button."})

    allow_credentials = [
        w["PublicKeyCredentialDescriptor"](id=auth.credential_id_to_bytes(c["credential_id"]))
        for c in creds
    ]

    challenge_id = secrets.token_urlsafe(16)
    options = w["generate_authentication_options"](
        rp_id=auth.rp_id(),
        allow_credentials=allow_credentials,
        user_verification=w["UserVerificationRequirement"].REQUIRED,
    )

    from webauthn.helpers.options_to_json_dict import options_to_json_dict

    auth.store_webauthn_challenge(challenge_id, {
        "type": "login",
        "email": email,
        "role": body.role,
        "challenge": options.challenge,
    })

    payload = options_to_json_dict(options)
    payload["challenge_id"] = challenge_id
    payload["has_credentials"] = True
    return payload


@router.post("/webauthn/login/complete")
def webauthn_login_complete(body: WebAuthnFinishBody, request: Request, response: Response):
    w = _webauthn_imports()
    email = body.email.strip().lower()
    stored = auth.pop_webauthn_challenge(body.challenge_id)
    if not stored or stored.get("type") != "login" or stored.get("email") != email:
        raise HTTPException(400, {"error": "Biometric verification expired. Try again."})

    cred_id = body.credential.get("id") or body.credential.get("rawId")
    if not cred_id:
        raise HTTPException(400, {"error": "Invalid biometric response."})

    stored_cred = next(
        (
            c for c in auth.get_webauthn_credentials(email)
            if auth.credential_ids_match(c.get("credential_id", ""), cred_id if isinstance(cred_id, str) else "")
        ),
        None,
    )
    if not stored_cred:
        raise HTTPException(400, {"error": "Unknown biometric credential."})

    origin = auth.resolve_origin(request.headers.get("origin"))

    try:
        verification = w["verify_authentication_response"](
            credential=w["parse_authentication_credential_json"](json.dumps(body.credential)),
            expected_challenge=stored["challenge"],
            expected_rp_id=auth.rp_id(),
            expected_origin=origin,
            credential_public_key=bytes.fromhex(stored_cred["public_key"]),
            credential_current_sign_count=stored_cred.get("sign_count", 0),
        )
    except Exception as exc:
        raise HTTPException(400, {"error": f"Biometric verification failed: {exc}"}) from exc

    stored_cred["sign_count"] = verification.new_sign_count
    auth.save_webauthn_credential(email, stored_cred)

    role = stored.get("role") or body.role
    role_err = auth.validate_role(role)
    if role_err:
        raise HTTPException(400, {"error": role_err})

    try:
        return _start_mfa(email, role, response)
    except RuntimeError as exc:
        raise HTTPException(503, {"error": str(exc)}) from exc
