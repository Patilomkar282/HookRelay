import json
from cryptography.fernet import Fernet
from app.core.config import settings


def _get_fernet() -> Fernet:
    key = settings.ENCRYPTION_KEY
    if isinstance(key, str):
        key = key.encode()
    return Fernet(key)


def encrypt_json(data: dict) -> str:
    """Encrypt a dictionary using Fernet symmetric encryption and return a string token."""
    f = _get_fernet()
    return f.encrypt(json.dumps(data).encode()).decode()


def decrypt_json(token: str) -> dict:
    """Decrypt a Fernet token and parse it back into a dictionary."""
    f = _get_fernet()
    raw = token.encode() if isinstance(token, str) else token
    return json.loads(f.decrypt(raw))


def hint(value: str) -> str:
    """Mask a sensitive secret, displaying only the last 4 characters."""
    if not value:
        return "****"
    if len(value) <= 4:
        return "****"
    return "****" + value[-4:]
