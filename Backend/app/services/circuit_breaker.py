import random
from datetime import datetime, timezone, timedelta
from typing import Optional
from sqlalchemy import text
from app.config import settings as s

# Cooldown in seconds: base * 2^open_count, capped, with +/-20% jitter (computed inside Postgres)
COOLDOWN_PG = (
    "LEAST(CAST(:base AS float8) * POWER(2, open_count), CAST(:cap AS float8))"
    " * (0.8 + random() * 0.4)"
)
P = dict(
    base=s.CB_BASE_COOLDOWN_S,
    cap=s.CB_MAX_COOLDOWN_S,
    thr=s.CB_FAILURE_THRESHOLD,
    ttl=s.CB_PROBE_TTL_S,
)


def counts_as_failure(status_code: int | None) -> bool:
    """status_code is None for timeouts and connection errors."""
    return status_code is None or status_code >= 500 or status_code in (408, 429)


async def _log(db, endpoint_id: str, frm: str, to: str, reason: str):
    if _is_sqlite(db):
        now_dt = datetime.now(timezone.utc)
        await db.execute(
            text(
                "INSERT INTO circuit_events (endpoint_id, from_state, to_state, reason, created_at) "
                "VALUES (:id, :f, :t, :r, :created_at)"
            ),
            dict(id=str(endpoint_id), f=frm, t=to, r=reason, created_at=now_dt),
        )
    else:
        await db.execute(
            text(
                "INSERT INTO circuit_events (endpoint_id, from_state, to_state, reason) "
                "VALUES (:id, :f, :t, :r)"
            ),
            dict(id=str(endpoint_id), f=frm, t=to, r=reason),
        )


def _is_sqlite(db) -> bool:
    try:
        bind = db.get_bind()
        return bind.dialect.name == "sqlite"
    except Exception:
        return False


async def admit(db, endpoint_id: str) -> str:
    """Returns 'send', 'probe' or 'skip'. Atomically claims the single probe slot."""
    if _is_sqlite(db):
        now_dt = datetime.now(timezone.utc)
        ttl_dt = now_dt - timedelta(seconds=P["ttl"])
        claimed = await db.execute(
            text("""
                UPDATE endpoints SET circuit_state = 'half_open', probe_started_at = :now
                WHERE id = :id AND (
                      (circuit_state = 'open' AND circuit_open_until <= :now)
                   OR (circuit_state = 'half_open' AND probe_started_at < :ttl_dt)
                )
                RETURNING id"""),
            dict(id=str(endpoint_id), now=now_dt, ttl_dt=ttl_dt),
        )
        if claimed.first():
            await _log(db, endpoint_id, "open", "half_open", "cooldown_elapsed")
            return "probe"
        state = (
            await db.execute(
                text("SELECT circuit_state FROM endpoints WHERE id = :id"),
                dict(id=str(endpoint_id)),
            )
        ).scalar_one()
        return "send" if state == "closed" else "skip"

    # PostgreSQL atomic claim
    claimed = await db.execute(
        text("""
            UPDATE endpoints SET circuit_state = 'half_open', probe_started_at = now()
            WHERE id = :id AND (
                  (circuit_state = 'open' AND circuit_open_until <= now())
               OR (circuit_state = 'half_open'
                   AND probe_started_at < now() - make_interval(secs => :ttl)))
            RETURNING id"""),
        dict(id=str(endpoint_id), ttl=P["ttl"]),
    )
    if claimed.first():
        await _log(db, endpoint_id, "open", "half_open", "cooldown_elapsed")
        return "probe"
    state = (
        await db.execute(
            text("SELECT circuit_state FROM endpoints WHERE id = :id"),
            dict(id=str(endpoint_id)),
        )
    ).scalar_one()
    return "send" if state == "closed" else "skip"


async def record_result(db, endpoint_id: str, failed: bool, is_probe: bool) -> Optional[str]:
    """Returns the new circuit_state if it changed, else None (use it to push a WebSocket update)."""
    if _is_sqlite(db):
        now_dt = datetime.now(timezone.utc)
        if is_probe:
            if failed:
                ep_row = (
                    await db.execute(
                        text("SELECT open_count FROM endpoints WHERE id = :id AND circuit_state = 'half_open'"),
                        dict(id=str(endpoint_id)),
                    )
                ).first()
                if not ep_row:
                    return None
                open_cnt = ep_row[0]
                cooldown_sec = min(float(P["base"]) * (2 ** open_cnt), float(P["cap"])) * (0.8 + random.random() * 0.4)
                open_until = now_dt + timedelta(seconds=cooldown_sec)
                r = await db.execute(
                    text("""
                        UPDATE endpoints SET circuit_state = 'open', probe_started_at = NULL,
                               circuit_open_until = :until,
                               open_count = open_count + 1
                        WHERE id = :id AND circuit_state = 'half_open' RETURNING id"""),
                    dict(id=str(endpoint_id), until=open_until),
                )
                if r.first():
                    await _log(db, endpoint_id, "half_open", "open", "probe_failed")
                    return "open"
            else:
                r = await db.execute(
                    text("""
                        UPDATE endpoints SET circuit_state = 'closed', consecutive_failures = 0, open_count = 0,
                               circuit_open_until = NULL, probe_started_at = NULL
                        WHERE id = :id AND circuit_state = 'half_open' RETURNING id"""),
                    dict(id=str(endpoint_id)),
                )
                if r.first():
                    await _log(db, endpoint_id, "half_open", "closed", "probe_succeeded")
                    return "closed"
            return None

        if failed:
            ep_row = (
                await db.execute(
                    text("SELECT consecutive_failures, open_count FROM endpoints WHERE id = :id AND circuit_state = 'closed'"),
                    dict(id=str(endpoint_id)),
                )
            ).first()
            if not ep_row:
                return None
            streak, open_cnt = ep_row[0], ep_row[1]
            if streak + 1 >= P["thr"]:
                cooldown_sec = min(float(P["base"]) * (2 ** open_cnt), float(P["cap"])) * (0.8 + random.random() * 0.4)
                open_until = now_dt + timedelta(seconds=cooldown_sec)
                r = await db.execute(
                    text("""
                        UPDATE endpoints SET
                          consecutive_failures = consecutive_failures + 1,
                          circuit_state = 'open',
                          circuit_open_until = :until,
                          open_count = open_count + 1
                        WHERE id = :id AND circuit_state = 'closed' RETURNING circuit_state"""),
                    dict(id=str(endpoint_id), until=open_until),
                )
                row = r.first()
                if row and row[0] == "open":
                    await _log(db, endpoint_id, "closed", "open", "threshold_reached")
                    return "open"
            else:
                await db.execute(
                    text("""
                        UPDATE endpoints SET consecutive_failures = consecutive_failures + 1
                        WHERE id = :id AND circuit_state = 'closed'"""),
                    dict(id=str(endpoint_id)),
                )
        else:
            await db.execute(
                text("""UPDATE endpoints SET consecutive_failures = 0
                        WHERE id = :id AND circuit_state = 'closed' AND consecutive_failures > 0"""),
                dict(id=str(endpoint_id)),
            )
        return None

    # PostgreSQL implementation
    if is_probe:
        if failed:
            r = await db.execute(
                text(f"""
                    UPDATE endpoints SET circuit_state = 'open', probe_started_at = NULL,
                           circuit_open_until = now() + make_interval(secs => {COOLDOWN_PG}),
                           open_count = open_count + 1
                    WHERE id = :id AND circuit_state = 'half_open' RETURNING id"""),
                dict(id=str(endpoint_id), **P),
            )
            if r.first():
                await _log(db, endpoint_id, "half_open", "open", "probe_failed")
                return "open"
        else:
            r = await db.execute(
                text("""
                    UPDATE endpoints SET circuit_state = 'closed', consecutive_failures = 0, open_count = 0,
                           circuit_open_until = NULL, probe_started_at = NULL
                    WHERE id = :id AND circuit_state = 'half_open' RETURNING id"""),
                dict(id=str(endpoint_id)),
            )
            if r.first():
                await _log(db, endpoint_id, "half_open", "closed", "probe_succeeded")
                return "closed"
        return None

    if failed:  # normal delivery: only counts while circuit is closed
        r = await db.execute(
            text(f"""
                UPDATE endpoints SET
                  consecutive_failures = consecutive_failures + 1,
                  circuit_state = CASE WHEN consecutive_failures + 1 >= :thr THEN 'open' ELSE 'closed' END,
                  circuit_open_until = CASE WHEN consecutive_failures + 1 >= :thr
                                       THEN now() + make_interval(secs => {COOLDOWN_PG}) END,
                  open_count = CASE WHEN consecutive_failures + 1 >= :thr THEN open_count + 1 ELSE open_count END
                WHERE id = :id AND circuit_state = 'closed' RETURNING circuit_state"""),
            dict(id=str(endpoint_id), **P),
        )
        row = r.first()
        if row and row[0] == "open":
            await _log(db, endpoint_id, "closed", "open", "threshold_reached")
            return "open"
    else:  # success: reset the streak (skip write when nothing changes)
        await db.execute(
            text("""UPDATE endpoints SET consecutive_failures = 0
                    WHERE id = :id AND circuit_state = 'closed' AND consecutive_failures > 0"""),
            dict(id=str(endpoint_id)),
        )
    return None


async def reset(db, endpoint_id: str, reason: str = "manual_reset"):
    await db.execute(
        text("""UPDATE endpoints SET circuit_state = 'closed', consecutive_failures = 0,
                open_count = 0, circuit_open_until = NULL, probe_started_at = NULL
                WHERE id = :id"""),
        dict(id=str(endpoint_id)),
    )
    await _log(db, endpoint_id, "any", "closed", reason)
