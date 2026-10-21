import json
import logging
from typing import Optional
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Query
from app.core.security import decode_token
from app.services.websocket_manager import ws_manager

logger = logging.getLogger("hookrelay.websocket")
router = APIRouter(tags=["WebSockets"])


@router.websocket("/ws/events")
async def websocket_events_endpoint(
    websocket: WebSocket,
    token: Optional[str] = Query(None),
):
    """
    WebSocket endpoint for real-time live webhook events and delivery updates.
    Supports authentication via query param `?token=<JWT>` or initial `{"type": "auth", "token": "..."}` frame.
    """
    user_id: Optional[str] = None

    # 1. Attempt authentication via query param if provided
    if token:
        payload = decode_token(token)
        if payload and "sub" in payload:
            user_id = str(payload["sub"])
            logger.info(f"WebSocket client authenticated via query token for user {user_id}")

    # 2. Register connection
    await ws_manager.connect(websocket, user_id=user_id)

    # Send initial welcome / connected status
    try:
        await websocket.send_json({
            "type": "connection.established",
            "authenticated": bool(user_id),
            "user_id": user_id,
            "message": "Connected to HookRelay real-time event feed",
        })
    except Exception:
        ws_manager.disconnect(websocket, user_id=user_id)
        return

    try:
        while True:
            text = await websocket.receive_text()
            # Handle heartbeat pings
            if text == "ping":
                await websocket.send_text("pong")
                continue

            try:
                msg = json.loads(text)
                msg_type = msg.get("type")

                if msg_type == "ping":
                    await websocket.send_json({"type": "pong"})
                elif msg_type == "auth" and "token" in msg:
                    # Authenticate mid-session
                    payload = decode_token(msg["token"])
                    if payload and "sub" in payload:
                        new_user_id = str(payload["sub"])
                        # Move from anonymous to user-bound
                        ws_manager.disconnect(websocket, user_id)
                        user_id = new_user_id
                        await ws_manager.connect(websocket, user_id)
                        await websocket.send_json({
                            "type": "auth.success",
                            "user_id": user_id,
                        })
                    else:
                        await websocket.send_json({
                            "type": "auth.failed",
                            "error": "Invalid token",
                        })
            except json.JSONDecodeError:
                pass

    except WebSocketDisconnect:
        ws_manager.disconnect(websocket, user_id=user_id)
    except Exception as exc:
        logger.warning(f"Unexpected WebSocket error: {exc}")
        ws_manager.disconnect(websocket, user_id=user_id)
