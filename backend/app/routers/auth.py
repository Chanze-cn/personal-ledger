"""登录与账号设置。

密码在任何接口都不以明文出现：客户端先握手取公钥，再用 AES-GCM + RSA-OAEP
混合加密提交，服务端解密后校验一次性 nonce 与时间窗。
"""

from __future__ import annotations

import datetime as dt
import re
import time

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from ..config import NONCE_TTL_SECONDS, REQUEST_TS_WINDOW_SECONDS
from ..crypto_transport import TransportCrypto, TransportDecryptError
from ..database import WRITE_LOCK, get_db
from ..deps import get_current_user
from ..models import AuthNonce, User, now
from ..schemas import SealedPayload, TokenOut, UserOut, UserUpdate
from ..security import create_access_token, hash_password, verify_password
from ..services.seed import ensure_default_categories

router = APIRouter(prefix="/auth", tags=["auth"])

# 账号规则：3-32 位中英文、数字、下划线或短横线
USERNAME_PATTERN = re.compile(r"^[A-Za-z0-9_\-\u4e00-\u9fa5]{3,32}$")
MIN_PASSWORD_LENGTH = 6
MAX_PASSWORD_LENGTH = 128


def _crypto(request: Request) -> TransportCrypto:
    return request.app.state.crypto


def _consume_nonce(db: Session, nonce: str) -> None:
    row = db.get(AuthNonce, nonce)
    if row is None:
        raise HTTPException(status_code=400, detail="握手已失效，请重试")
    if row.expires_at < now():
        db.delete(row)
        db.commit()
        raise HTTPException(status_code=400, detail="握手已过期，请重试")
    db.delete(row)
    db.commit()


def _open_payload(request: Request, sealed: SealedPayload, db: Session) -> dict:
    """解密信封，并校验时间窗与一次性 nonce。"""
    try:
        payload = _crypto(request).open_sealed(
            sealed.key_id, sealed.key, sealed.iv, sealed.data
        )
    except TransportDecryptError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    issued_at = payload.get("ts")
    try:
        skew = abs(time.time() - float(issued_at))
    except (TypeError, ValueError) as exc:
        raise HTTPException(status_code=400, detail="请求时间戳不合法") from exc
    if skew > REQUEST_TS_WINDOW_SECONDS:
        raise HTTPException(status_code=400, detail="请求已过期，请重试")

    nonce = payload.get("nonce")
    if not isinstance(nonce, str) or len(nonce) < 8:
        raise HTTPException(status_code=400, detail="缺少握手标识")
    _consume_nonce(db, nonce)
    return payload


@router.get("/handshake", summary="获取加密公钥与一次性握手串")
def handshake(request: Request, db: Session = Depends(get_db)) -> dict:
    crypto = _crypto(request)
    current = now()
    with WRITE_LOCK:
        db.execute(delete(AuthNonce).where(AuthNonce.expires_at < current))
        nonce = crypto.issue_nonce()
        db.add(
            AuthNonce(
                nonce=nonce,
                created_at=current,
                expires_at=current + dt.timedelta(seconds=NONCE_TTL_SECONDS),
            )
        )
        db.commit()
    return {
        "key_id": crypto.key_id,
        "public_key": crypto.public_key_b64,
        "algorithm": "RSA-OAEP-256+A256GCM",
        "nonce": nonce,
        "expires_in": NONCE_TTL_SECONDS,
    }


@router.post("/login", response_model=TokenOut, summary="加密提交账号密码登录")
def login(
    sealed: SealedPayload, request: Request, db: Session = Depends(get_db)
) -> TokenOut:
    payload = _open_payload(request, sealed, db)
    username = str(payload.get("username") or "").strip()
    password = str(payload.get("password") or "")
    if not username or not password:
        raise HTTPException(status_code=400, detail="账号与密码不能为空")

    user = db.scalar(select(User).where(User.username == username))
    if user is None or not verify_password(password, user.password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="账号或密码不正确")
    if not user.is_active:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="账号已被停用")
    token = create_access_token(user.id, user.username)
    return TokenOut(access_token=token, user=UserOut.model_validate(user))


@router.post("/register", response_model=TokenOut, summary="加密提交注册新账号")
def register(
    sealed: SealedPayload, request: Request, db: Session = Depends(get_db)
) -> TokenOut:
    """注册成功后直接返回登录令牌，并自动铺一套默认品类（不含流水与预算）。"""
    payload = _open_payload(request, sealed, db)
    username = str(payload.get("username") or "").strip()
    password = str(payload.get("password") or "")
    display_name = str(payload.get("display_name") or "").strip()

    if not username or not password:
        raise HTTPException(status_code=400, detail="账号与密码不能为空")
    if not USERNAME_PATTERN.fullmatch(username):
        raise HTTPException(
            status_code=400, detail="账号需为 3-32 位中英文、数字、下划线或短横线"
        )
    if len(password) < MIN_PASSWORD_LENGTH:
        raise HTTPException(status_code=400, detail=f"密码至少 {MIN_PASSWORD_LENGTH} 位")
    if len(password) > MAX_PASSWORD_LENGTH:
        raise HTTPException(status_code=400, detail=f"密码不能超过 {MAX_PASSWORD_LENGTH} 位")

    password_hash = hash_password(password)
    with WRITE_LOCK:
        if db.scalar(select(User.id).where(User.username == username)) is not None:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT, detail="该账号已被注册，请换一个"
            )
        user = User(
            username=username,
            password_hash=password_hash,
            display_name=display_name or username,
            role="user",
            avatar_emoji="🙂",
            currency="CNY",
        )
        db.add(user)
        db.flush()
        ensure_default_categories(db, user.id)
        db.commit()

    token = create_access_token(user.id, user.username)
    return TokenOut(access_token=token, user=UserOut.model_validate(user))


@router.get("/me", response_model=UserOut, summary="当前用户信息")
def me(user: User = Depends(get_current_user)) -> UserOut:
    return UserOut.model_validate(user)


@router.patch("/me", response_model=UserOut, summary="更新个人资料")
def update_me(
    payload: UserUpdate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> UserOut:
    with WRITE_LOCK:
        if payload.display_name is not None:
            user.display_name = payload.display_name.strip() or user.username
        if payload.avatar_emoji is not None:
            user.avatar_emoji = payload.avatar_emoji
        if payload.currency is not None:
            user.currency = payload.currency
        db.add(user)
        db.commit()
    return UserOut.model_validate(user)


@router.post("/me/password", summary="修改密码（加密提交）")
def change_password(
    sealed: SealedPayload,
    request: Request,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    payload = _open_payload(request, sealed, db)
    old_password = str(payload.get("old_password") or "")
    new_password = str(payload.get("new_password") or "")
    if not old_password or not new_password:
        raise HTTPException(status_code=400, detail="原密码与新密码不能为空")
    if len(new_password) < 6:
        raise HTTPException(status_code=400, detail="新密码至少 6 位")
    if not verify_password(old_password, user.password_hash):
        raise HTTPException(status_code=400, detail="原密码不正确")
    with WRITE_LOCK:
        user.password_hash = hash_password(new_password)
        db.add(user)
        db.commit()
    return {"ok": True}
