"""One-time Gmail SMTP setup for IdentitySphere OTP delivery.

OTP is sent TO whatever email each user enters on the login form.
GMAIL_USER is the single Gmail account the app uses to send those emails.

Usage:
  python setup_gmail.py
  python setup_gmail.py sender@gmail.com xxxx-xxxx-xxxx-xxxx
"""
from __future__ import annotations

import getpass
import secrets
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
ENV_PATH = ROOT / ".env"
EXAMPLE_PATH = ROOT / ".env.example"


def _read_existing() -> dict[str, str]:
    if not ENV_PATH.exists():
        return {}
    values: dict[str, str] = {}
    for line in ENV_PATH.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, val = line.partition("=")
        values[key.strip()] = val.strip()
    return values


def _write_env(values: dict[str, str]) -> None:
    lines: list[str] = []
    if EXAMPLE_PATH.exists():
        for raw in EXAMPLE_PATH.read_text(encoding="utf-8").splitlines():
            if "=" in raw and not raw.strip().startswith("#"):
                key = raw.split("=", 1)[0].strip()
                if key in values:
                    lines.append(f"{key}={values[key]}")
                    continue
            lines.append(raw)
    else:
        for key, val in values.items():
            lines.append(f"{key}={val}")

    ENV_PATH.write_text("\n".join(lines) + "\n", encoding="utf-8")


def main() -> int:
    existing = _read_existing()
    gmail_user = (sys.argv[1] if len(sys.argv) > 1 else "").strip()
    gmail_pass = (sys.argv[2] if len(sys.argv) > 2 else "").replace(" ", "").strip()

    if not gmail_user:
        gmail_user = input("Gmail address used to send OTP emails: ").strip()
    if not gmail_pass:
        gmail_pass = getpass.getpass("Google App Password (16 chars, spaces ok): ").replace(" ", "").strip()

    if not gmail_user or "@" not in gmail_user:
        print("Error: enter a valid Gmail address.", file=sys.stderr)
        return 1
    if len(gmail_pass) < 16:
        print("Error: App Password looks too short. Create one at https://myaccount.google.com/apppasswords", file=sys.stderr)
        return 1

    auth_secret = existing.get("AUTH_SECRET_KEY") or secrets.token_urlsafe(48)
    values = {
        **existing,
        "GMAIL_USER": gmail_user,
        "GMAIL_APP_PASSWORD": gmail_pass,
        "AUTH_SECRET_KEY": auth_secret,
        "WEBAUTHN_RP_ID": existing.get("WEBAUTHN_RP_ID", "localhost"),
        "WEBAUTHN_ORIGIN": existing.get("WEBAUTHN_ORIGIN", "http://localhost:5173"),
        "WEBAUTHN_ORIGINS": existing.get("WEBAUTHN_ORIGINS", ""),
    }
    _write_env(values)
    print(f"Wrote {ENV_PATH}")
    print("Restart the API server: uvicorn api_server:app --reload --port 8000")
    print(f"Each user who signs in will receive the OTP at the email they enter (e.g. their Gmail inbox).")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
