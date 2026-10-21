from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from typing import List
from app.config import settings
from app.schemas import HealthResponse

api_router = APIRouter()


@api_router.get("/health", response_model=HealthResponse, tags=["Health"])
async def health_check():
    """Service health status endpoint."""
    return HealthResponse(
        status="healthy",
        project=settings.PROJECT_NAME,
        environment=settings.ENVIRONMENT,
    )


# WebSocket Connection Manager for Real-Time Event Feed
class ConnectionManager:
    def __init__(self):
        self.active_connections: List[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)

    def disconnect(self, websocket: WebSocket):
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)

    async def broadcast(self, message: dict):
        for connection in self.active_connections:
            try:
                await connection.send_json(message)
            except Exception:
                pass


ws_manager = ConnectionManager()


@api_router.websocket("/ws/events")
async def websocket_events_endpoint(websocket: WebSocket):
    """FastAPI WebSocket endpoint for real-time live webhook events."""
    await ws_manager.connect(websocket)
    try:
        while True:
            # Keep connection alive, listen for client pings
            data = await websocket.receive_text()
            if data == "ping":
                await websocket.send_text("pong")
    except WebSocketDisconnect:
        ws_manager.disconnect(websocket)
