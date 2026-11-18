"""登录凭据的传输层加密。

协议（混合加密，避免 RSA 明文长度上限）：
1. 客户端 `GET /api/auth/handshake` 拿到 RSA 公钥（SPKI/DER base64）、`key_id` 与一次性 `nonce`；
2. 客户端生成随机 AES-256-GCM 密钥，用 RSA-OAEP(SHA-256) 包裹该密钥；
3. 业务数据（含 nonce）用 AES-GCM 加密，随密文一起提交；
4. 服务端用私钥解出 AES 密钥，再解出业务 JSON，校验 nonce 一次性 + 时间窗。

密码本身仍以 PBKDF2-SHA256 落库，本模块只负责「不明文过网」。
"""

from __future__ import annotations

import base64
import hashlib
import json
import os
import secrets
from pathlib import Path

from cryptography.exceptions import InvalidTag
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import padding, rsa
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

_MAX_CIPHERTEXT = 64 * 1024


class TransportDecryptError(Exception):
    """密文无法解开（密钥轮换、被篡改或格式不合法）。"""


def _b64decode(value: str) -> bytes:
    try:
        return base64.b64decode(value, validate=True)
    except Exception as exc:  # noqa: BLE001
        raise TransportDecryptError("密文编码不合法") from exc


class TransportCrypto:
    """持有 RSA 私钥并提供一次性握手与解密能力。"""

    def __init__(self, key_path: Path) -> None:
        self._key_path = key_path
        self._private_key = self._load_or_create()
        self._public_der = self._private_key.public_key().public_bytes(
            encoding=serialization.Encoding.DER,
            format=serialization.PublicFormat.SubjectPublicKeyInfo,
        )
        self.key_id = hashlib.sha256(self._public_der).hexdigest()[:16]

    def _load_or_create(self) -> rsa.RSAPrivateKey:
        if self._key_path.exists():
            raw = self._key_path.read_bytes()
            loaded = serialization.load_pem_private_key(raw, password=None)
            if isinstance(loaded, rsa.RSAPrivateKey):
                return loaded
        key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
        pem = key.private_bytes(
            encoding=serialization.Encoding.PEM,
            format=serialization.PrivateFormat.PKCS8,
            encryption_algorithm=serialization.NoEncryption(),
        )
        self._key_path.parent.mkdir(parents=True, exist_ok=True)
        self._key_path.write_bytes(pem)
        try:
            os.chmod(self._key_path, 0o600)
        except OSError:  # pragma: no cover - 某些文件系统不支持
            pass
        return key

    @property
    def public_key_b64(self) -> str:
        return base64.b64encode(self._public_der).decode("ascii")

    @staticmethod
    def issue_nonce() -> str:
        return secrets.token_urlsafe(24)

    def open_sealed(self, key_id: str, wrapped_key: str, iv_b64: str, data_b64: str) -> dict:
        """解开客户端密文，返回业务 JSON。"""
        if key_id != self.key_id:
            raise TransportDecryptError("加密密钥已轮换，请刷新页面重试")

        wrapped = _b64decode(wrapped_key)
        iv = _b64decode(iv_b64)
        ciphertext = _b64decode(data_b64)
        if len(iv) != 12:
            raise TransportDecryptError("初始向量长度不合法")
        if not ciphertext or len(ciphertext) > _MAX_CIPHERTEXT:
            raise TransportDecryptError("密文长度不合法")

        try:
            aes_key = self._private_key.decrypt(
                wrapped,
                padding.OAEP(
                    mgf=padding.MGF1(algorithm=hashes.SHA256()),
                    algorithm=hashes.SHA256(),
                    label=None,
                ),
            )
        except ValueError as exc:
            raise TransportDecryptError("会话密钥解密失败") from exc

        if len(aes_key) != 32:
            raise TransportDecryptError("会话密钥长度不合法")

        try:
            plain = AESGCM(aes_key).decrypt(iv, ciphertext, None)
        except InvalidTag as exc:
            raise TransportDecryptError("密文校验失败") from exc

        try:
            payload = json.loads(plain.decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError) as exc:
            raise TransportDecryptError("业务数据格式不合法") from exc

        if not isinstance(payload, dict):
            raise TransportDecryptError("业务数据格式不合法")
        return payload
