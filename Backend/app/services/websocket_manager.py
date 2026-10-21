import logging
from typing import Dict, Set, Optional, Any
from collections import defaultdict
from fastapi import WebSocket

logger = logging.getLogger("hookrelay.websocket")


class WebSocketManager:
    """Manages WebSocket connections and scoped real-time event broadcasting."""

    def __init__(self):
        # Maps user_id -> Set of active WebSockets for that user
        self.user_connections: Dict[str, Set[WebSocket]] = defaultdict(set)
        # Any connections without user_id
        self.anonymous_connections: Set[WebSocket] = set()

    async def connect(self, websocket: WebSocket, user_id: Optional[str] = None) -> None:
        """Accept and register an active WebSocket connection."""
        await websocket.accept()
        if user_id:
            self.user_connections[user_id].add(websocket)
            logger.info(f"WebSocket connected for user {user_id}. Active: {len(self.user_connections[user_id])}")
        else:
            self.anonymous_connections.add(websocket)
            logger.info("Anonymous WebSocket connected.")

    def disconnect(self, websocket: WebSocket, user_id: Optional[str] = None) -> None:
        """Unregister a disconnected WebSocket connection."""
        if user_id and user_id in self.user_connections:
            self.user_connections[user_id].discard(websocket)
            if not self.user_connections[user_id]:
                del self.user_connections[user_id]
            logger.info(f"WebSocket disconnected for user {user_id}.")
        else:
            self.anonymous_connections.discard(websocket)
            # Also clean up if user_id was unknown
            for uid, conns in list(self.user_connections.items()):
                if websocket in conns:
                    conns.discard(websocket)
                    if not conns:
                        del self.user_connections[uid]

    async def send_to_user(self, user_id: str, message: Dict[str, Any]) -> None:
        """Broadcast a JSON message to all active WebSocket connections of a specific user."""
        conns = list(self.user_connections.get(user_id, set()))
        if not conns:
            return

        dead_connections = []
        for connection in conns:
            try:
                await connection.send_json(message)
            except Exception as exc:
                logger.warning(f"Error sending WebSocket message to user {user_id}: {exc}")
                dead_connections.append(connection)

        for dead in dead_connections:
            self.disconnect(dead, user_id)

    async def broadcast(self, message: Dict[str, Any]) -> None:
        """Broadcast a JSON message to all active connections (all users + anonymous)."""
        all_conns: Set[WebSocket] = set(self.anonymous_connections)
        for conns in self.user_connections.values():
            all_conns.update(conns)

        for connection in list(all_conns):
            try:
                await connection.send_json(message)
            except Exception:
                pass

    async def notify_event_created(self, user_id: str, event_data: Dict[str, Any]) -> None:
        """Convenience method to dispatch 'event.created' payload."""
        message = {
            "type": "event.created",
            "data": event_data,
        }
        await self.send_to_user(user_id, message)

    async def notify_delivery_updated(self, user_id: str, delivery_data: Dict[str, Any]) -> None:
        """Convenience method to dispatch 'delivery.updated' payload."""
        message = {
            "type": "delivery.updated",
            "data": delivery_data,
        }
        await self.send_to_user(user_id, message)


# Global singleton instance
ws_manager = WebSocketManager()
