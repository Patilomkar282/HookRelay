import asyncio
import logging
from typing import Optional
from app.database import AsyncSessionLocal
from app.services.delivery_service import fetch_and_process_due_deliveries

logger = logging.getLogger("hookrelay.worker")


class DeliveryWorker:
    def __init__(self, poll_interval: float = 1.0):
        self.poll_interval = poll_interval
        self._task: Optional[asyncio.Task] = None
        self._stop_event = asyncio.Event()

    async def run(self) -> None:
        logger.info("HookRelay delivery worker started (poll_interval=%.1fs)...", self.poll_interval)
        while not self._stop_event.is_set():
            try:
                async with AsyncSessionLocal() as session:
                    processed = await fetch_and_process_due_deliveries(session, batch_size=10)
                    if processed > 0:
                        logger.debug("Dispatched %d due deliveries", processed)
            except asyncio.CancelledError:
                break
            except Exception as exc:
                logger.error("Unexpected error in delivery worker: %s", exc)

            try:
                await asyncio.wait_for(self._stop_event.wait(), timeout=self.poll_interval)
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
