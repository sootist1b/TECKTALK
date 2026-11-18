"""데모용 로그인 토큰.

계정은 환경변수 DEMO_USER / DEMO_PASSWORD(기본 demo / demo) 하나뿐이다.
토큰은 '사용자.만료시각.서명' 형태이며 SECRET_KEY로 HMAC 서명한다.
"""
from __future__ import annotations

import base64
import hashlib
import hmac
import os
import secrets
import time
from typing import Optional

TOKEN_TTL_SECONDS = 60 * 60 * 12

_SECRET = os.environ.get("SECRET_KEY") or secrets.token_hex(32)


def demo_credentials() -> tuple[str, str]:
    return os.environ.get("DEMO_USER", "demo"), os.environ.get("DEMO_PASSWORD", "demo")


def _sign(payload: str) -> str:
    return hmac.new(_SECRET.encode(), payload.encode(), hashlib.sha256).hexdigest()


def issue_token(user: str) -> str:
    raw_user = base64.urlsafe_b64encode(user.encode()).decode().rstrip("=")
    payload = f"{raw_user}.{int(time.time()) + TOKEN_TTL_SECONDS}"
    return f"{payload}.{_sign(payload)}"


def verify_token(token: Optional[str]) -> Optional[str]:
    if not token:
        return None
    try:
        raw_user, expires, signature = token.split(".")
    except ValueError:
        return None
    if not hmac.compare_digest(signature, _sign(f"{raw_user}.{expires}")):
        return None
    if int(expires) < time.time():
        return None
    padded = raw_user + "=" * (-len(raw_user) % 4)
    return base64.urlsafe_b64decode(padded.encode()).decode()


def check_login(user: str, password: str) -> bool:
    expected_user, expected_password = demo_credentials()
    return hmac.compare_digest(user, expected_user) and hmac.compare_digest(password, expected_password)
