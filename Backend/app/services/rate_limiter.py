import time
from collections import defaultdict
from typing import Dict, List, Tuple
from fastapi import HTTPException, status
from app.config import settings


class SlidingWindowRateLimiter:
    """
    Sliding window rate limiter for public webhook ingestion endpoints.
    Tracks timestamps per key (slug + client IP) and enforces limit per minute.
    """

    def __init__(self, default_limit: int = 120, window_seconds: int = 60):
        self.default_limit = default_limit
        self.window_seconds = window_seconds
        # Mapping: key -> list of float timestamps
        self._requests: Dict[str, List[float]] = defaultdict(list)
        self._last_cleanup = time.time()

    def _cleanup_old_keys(self, now: float) -> None:
        """Periodically prune keys with no active requests in current window."""
        if now - self._last_cleanup < 60:
            return

        self._last_cleanup = now
        expired_keys = []
        for key, timestamps in self._requests.items():
            valid = [ts for ts in timestamps if now - ts < self.window_seconds]
            if not valid:
                expired_keys.append(key)
            else:
                self._requests[key] = valid

        for k in expired_keys:
            self._requests.pop(k, None)

    def check_rate_limit(self, key: str, limit: int = None) -> Tuple[bool, int, int]:
        """
        Check and record an incoming request for the given key.
        Returns: (is_allowed, remaining_requests, retry_after_seconds)
        """
        now = time.time()
        self._cleanup_old_keys(now)

        max_limit = limit or getattr(settings, "INGEST_RATE_LIMIT_PER_MINUTE", self.default_limit)
        timestamps = self._requests[key]

        # Filter out timestamps outside window
        window_start = now - self.window_seconds
        valid_timestamps = [ts for ts in timestamps if ts > window_start]
        self._requests[key] = valid_timestamps

        count = len(valid_timestamps)
        if count >= max_limit:
            # Calculate oldest timestamp to determine when the earliest slot frees up
            oldest = valid_timestamps[0]
            retry_after = max(1, int(self.window_seconds - (now - oldest)))
            return False, 0, retry_after

        # Record this request
        valid_timestamps.append(now)
        remaining = max(0, max_limit - len(valid_timestamps))
        return True, remaining, 0

    def enforce_rate_limit(self, key: str, limit: int = None) -> None:
        """Enforce rate limit or raise HTTP 429."""
        is_allowed, remaining, retry_after = self.check_rate_limit(key, limit)
        if not is_allowed:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail=f"Rate limit exceeded. Maximum {limit or self.default_limit} requests per minute allowed.",
                headers={
                    "Retry-After": str(retry_after),
                    "X-RateLimit-Limit": str(limit or self.default_limit),
                    "X-RateLimit-Remaining": "0",
                },
            )


# Global rate limiter instance
ingest_rate_limiter = SlidingWindowRateLimiter(default_limit=120, window_seconds=60)
