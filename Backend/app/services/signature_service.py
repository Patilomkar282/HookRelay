import hmac
import hashlib
from typing import Any, Dict, Optional


def verify_webhook_signature(
    provider_type: str,
    signing_secret: Optional[str],
    headers: Dict[str, Any],
    body_bytes: bytes,
) -> bool:
    """
    Verify HMAC-SHA256 signature for GitHub, Stripe, or generic webhook providers.
    Returns True if valid signature matched, False otherwise.
    """
    if not signing_secret:
        return False

    norm_headers = {k.lower(): str(v) for k, v in headers.items()}
    secret_bytes = signing_secret.encode("utf-8")

    # 1. GitHub Signature Verification (X-Hub-Signature-256 or X-Hub-Signature)
    if "x-hub-signature-256" in norm_headers:
        raw_sig = norm_headers["x-hub-signature-256"].strip()
        expected_sig = raw_sig[7:] if raw_sig.startswith("sha256=") else raw_sig
        computed_sig = hmac.new(secret_bytes, body_bytes, hashlib.sha256).hexdigest()
        return hmac.compare_digest(computed_sig, expected_sig)

    if "x-hub-signature" in norm_headers:
        raw_sig = norm_headers["x-hub-signature"].strip()
        expected_sig = raw_sig[5:] if raw_sig.startswith("sha1=") else raw_sig
        computed_sig = hmac.new(secret_bytes, body_bytes, hashlib.sha1).hexdigest()
        return hmac.compare_digest(computed_sig, expected_sig)

    # 2. Generic & Razorpay HMAC-SHA256 headers
    generic_keys = [
        "x-razorpay-signature",
        "x-signature-sha256",
        "x-webhook-signature",
        "x-signature",
        "x-hookrelay-signature",
        "signature",
    ]

    for key in generic_keys:
        if key in norm_headers:
            raw_sig = norm_headers[key].strip()
            expected_sig = raw_sig[7:] if raw_sig.startswith("sha256=") else raw_sig
            computed_sig = hmac.new(secret_bytes, body_bytes, hashlib.sha256).hexdigest()
            if hmac.compare_digest(computed_sig, expected_sig):
                return True
            return False

    # 3. Stripe signature format: t=timestamp,v1=signature
    if "stripe-signature" in norm_headers:
        stripe_sig = norm_headers["stripe-signature"]
        # Extract components: t=..., v1=...
        elements = dict(item.split("=", 1) for item in stripe_sig.split(",") if "=" in item)
        timestamp = elements.get("t")
        v1 = elements.get("v1")
        if timestamp and v1:
            signed_payload = f"{timestamp}.".encode("utf-8") + body_bytes
            computed_sig = hmac.new(secret_bytes, signed_payload, hashlib.sha256).hexdigest()
            return hmac.compare_digest(computed_sig, v1)

    return False
