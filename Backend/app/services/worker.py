import asyncio
import logging
from typing import Optional
import time
from app.database import AsyncSessionLocal
from app.services.delivery_service import fetch_and_process_due_deliveries
from app.services.retention_service import purge_expired_events

logger = logging.getLogger("hookrelay.worker")


class DeliveryWorker:
    def __init__(self, poll_interval: float = 1.0):
        self.poll_interval = poll_interval
        self._task: Optional[asyncio.Task] = None
        self._stop_event = asyncio.Event()
        self._last_retention_run = 0.0
        self._last_alert_eval_run = 0.0
        self._consecutive_errors = 0

    async def run(self) -> None:
        logger.info("HookRelay delivery worker started (poll_interval=%.1fs)...", self.poll_interval)
        while not self._stop_event.is_set():
            delay = self.poll_interval
            try:
                async with AsyncSessionLocal() as session:
                    processed = await fetch_and_process_due_deliveries(session, batch_size=10)
                    if processed > 0:
                        logger.debug("Dispatched %d due deliveries", processed)

                    now_ts = time.time()

                    # Periodically evaluate firing alert rules (once every 60s)
                    if now_ts - self._last_alert_eval_run > 60:
                        self._last_alert_eval_run = now_ts
                        try:
                            from app.services.alert_evaluator import check_firing_rules_periodic
                            await check_firing_rules_periodic(session)
                        except Exception as e:
                            logger.warning("Periodic alert evaluation error: %s", e)

                    # Periodically run retention cleanup (once every hour)
                    if now_ts - self._last_retention_run > 3600:
                        self._last_retention_run = now_ts
                        await purge_expired_events(session)

                # Reset consecutive error count on clean run
                if self._consecutive_errors > 0:
                    logger.info("Delivery worker recovered successfully after %d errors.", self._consecutive_errors)
                    self._consecutive_errors = 0

            except asyncio.CancelledError:
                break
            except Exception as exc:
                self._consecutive_errors += 1
                # Exponential backoff on errors: 2s, 4s, 8s, up to 15s max
                delay = min(15.0, 1.0 + (2.0 ** min(self._consecutive_errors, 4)))
                # Throttle log spam: log on 1st error, then every 10th error or every 30s
                if self._consecutive_errors == 1 or self._consecutive_errors % 10 == 0:
                    logger.error(
                        "Delivery worker error (consecutive errors: %d, backoff: %.1fs): %s",
                        self._consecutive_errors,
                        delay,
                        exc,
                    )
                else:
                    logger.debug("Delivery worker error suppressed (consecutive errors: %d): %s", self._consecutive_errors, exc)

            try:
                await asyncio.wait_for(self._stop_event.wait(), timeout=delay)
            except asyncio.TimeoutError:
                pass

        logger.info("HookRelay delivery worker stopped.")

    def start(self) -> None:
        """Start the background worker loop as an asyncio Task."""
        if not self._task or self._task.done():
            self._stop_event.clear()
            self._task = asyncio.create_task(self.run())

    async def stop(self) -> None:
        """Gracefully stop and wait for the background worker loop to terminate."""
        if self._task and not self._task.done():
            self._stop_event.set()
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass


worker = DeliveryWorker(poll_interval=1.0)
