import socket
import ipaddress
from typing import Optional
from urllib.parse import urlparse
from fastapi import HTTPException, status
from app.config import settings

# Blocked hostnames known for cloud metadata or loopback
BLOCKED_HOSTS = {
    "localhost",
    "127.0.0.1",
    "::1",
    "0.0.0.0",
    "169.254.169.254",  # AWS/GCP/Azure link-local metadata
    "metadata.google.internal",
    "instance-data",
}


def is_ip_private_or_restricted(ip_str: str) -> bool:
    """
    Check if an IP string belongs to private, loopback, link-local,
    reserved, or multicast IP ranges.
    """
    try:
        ip = ipaddress.ip_address(ip_str)
        return (
            ip.is_private
            or ip.is_loopback
            or ip.is_link_local
            or ip.is_reserved
            or ip.is_multicast
            or ip.is_unspecified
        )
    except ValueError:
        return True


def validate_target_url(url: str, allow_private: Optional[bool] = None) -> str:
    """
    Validate forwarding destination URL against SSRF (Server-Side Request Forgery).
    Blocks loopback (127.0.0.1), RFC1918 subnets (10.x, 172.16-31.x, 192.168.x),
    cloud metadata services (169.254.169.254), and unresolvable internal hosts.
    """
    trimmed = url.strip()
    if not trimmed:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Destination target URL cannot be empty.",
        )

    parsed = urlparse(trimmed)
    if parsed.scheme not in ("http", "https"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid URL protocol '{parsed.scheme}'. Only http:// and https:// are permitted.",
        )

    # In production, require HTTPS
    if getattr(settings, "ENFORCE_HTTPS", False) and parsed.scheme != "https":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="HTTPS is required for all destination URLs in production.",
        )

    hostname = parsed.hostname
    if not hostname:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Target URL must specify a valid hostname.",
        )

    hostname_lower = hostname.lower()

    # If test mode explicitly allows private targets (for local mock servers), skip DNS SSRF checks
    should_allow = allow_private if allow_private is not None else getattr(settings, "ALLOW_PRIVATE_TARGETS", False)
    if should_allow:
        return trimmed

    # 1. Direct match on blocked hostnames
    if hostname_lower in BLOCKED_HOSTS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Target URL '{hostname}' is an internal/loopback address and is blocked (SSRF Protection).",
        )

    # 2. Check if hostname is directly an IP literal
    try:
        ip = ipaddress.ip_address(hostname_lower)
        if is_ip_private_or_restricted(str(ip)):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Target URL points to private/restricted IP '{ip}' (SSRF Protection).",
            )
        return trimmed
    except ValueError:
        # Not a direct IP literal; proceed to DNS resolution
        pass

    # 3. DNS Resolution check (prevent DNS rebinding or resolving to internal subnets)
    try:
        addr_info = socket.getaddrinfo(hostname_lower, None)
        resolved_ips = {item[4][0] for item in addr_info}
    except socket.gaierror:
        # Unable to resolve hostname
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Target URL hostname '{hostname}' could not be resolved by DNS.",
        )

    for resolved_ip in resolved_ips:
        if is_ip_private_or_restricted(resolved_ip):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Target URL '{hostname}' resolves to private/internal IP '{resolved_ip}' (SSRF Protection).",
            )

    return trimmed
