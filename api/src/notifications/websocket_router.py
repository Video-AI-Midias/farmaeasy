"""WebSocket API for real-time notifications.

Provides:
- WS /ws/notifications - Real-time notification stream
"""

import asyncio
import contextlib
import json
from uuid import UUID

from fastapi import APIRouter, Query, WebSocket, WebSocketDisconnect
from jose import JWTError

from src.auth.security import decode_access_token
from src.core.logging import get_logger
from src.core.redis import get_redis, notification_channel


logger = get_logger(__name__)

router = APIRouter(tags=["notifications-ws"])


# Connection manager for active WebSocket connections
class ConnectionManager:
    """Manage WebSocket connections by user."""

    def __init__(self) -> None:
        # user_id -> list of active connections
        self.active_connections: dict[str, list[WebSocket]] = {}

    async def connect(self, user_id: str, websocket: WebSocket) -> None:
        """Accept and register a WebSocket connection."""
        await websocket.accept()
        if user_id not in self.active_connections:
            self.active_connections[user_id] = []
        self.active_connections[user_id].append(websocket)
        logger.info("websocket_connected", user_id=user_id)

    def disconnect(self, user_id: str, websocket: WebSocket) -> None:
        """Remove a WebSocket connection."""
        if user_id in self.active_connections:
            if websocket in self.active_connections[user_id]:
                self.active_connections[user_id].remove(websocket)
            if not self.active_connections[user_id]:
                del self.active_connections[user_id]
        logger.info("websocket_disconnected", user_id=user_id)

    async def send_to_user(self, user_id: str, message: dict) -> None:
        """Send message to all connections for a user."""
        if user_id in self.active_connections:
            disconnected = []
            for connection in self.active_connections[user_id]:
                try:
                    await connection.send_json(message)
                except Exception:
                    disconnected.append(connection)

            # Clean up disconnected connections
            for conn in disconnected:
                self.disconnect(user_id, conn)

    def get_connected_users(self) -> list[str]:
        """Get list of currently connected user IDs."""
        return list(self.active_connections.keys())


# Global connection manager instance
manager = ConnectionManager()


def get_connection_manager() -> ConnectionManager:
    """Get the connection manager instance."""
    return manager


def authenticate_websocket(token: str) -> UUID | None:
    """Authenticate WebSocket connection using JWT token.

    Returns user_id if valid, None otherwise.
    """
    try:
        payload = decode_access_token(token)
        user_id_str = payload.get("sub")
        if user_id_str:
            return UUID(user_id_str)
    except JWTError as e:
        logger.warning("websocket_auth_failed", error=str(e))
    except ValueError as e:
        logger.warning("websocket_auth_invalid_uuid", error=str(e))
    return None


async def redis_subscriber(user_id: str, websocket: WebSocket) -> None:
    """Subscribe to Redis channel and forward messages to WebSocket."""
    redis_client = get_redis()
    if not redis_client:
        logger.warning("redis_not_available_for_pubsub", user_id=user_id)
        return

    pubsub = redis_client.pubsub()
    channel = notification_channel(user_id)

    try:
        await pubsub.subscribe(channel)
        logger.info("subscribed_to_channel", user_id=user_id, channel=channel)

        while True:
            message = await pubsub.get_message(
                ignore_subscribe_messages=True, timeout=1.0
            )
            if message and message["type"] == "message":
                try:
                    data = json.loads(message["data"])
                    await websocket.send_json(data)
                except json.JSONDecodeError:
                    await websocket.send_text(message["data"])
                except WebSocketDisconnect:
                    break

            # Small delay to prevent busy loop
            await asyncio.sleep(0.1)

    except WebSocketDisconnect:
        pass
    except Exception as e:
        logger.warning("redis_subscriber_error", user_id=user_id, error=str(e))
    finally:
        await pubsub.unsubscribe(channel)
        await pubsub.close()
        logger.info("unsubscribed_from_channel", user_id=user_id, channel=channel)


@router.websocket("/ws/notifications")
async def notifications_websocket(
    websocket: WebSocket,
    token: str = Query(..., description="JWT access token"),
) -> None:
    """WebSocket endpoint for real-time notifications.

    Connect with: ws://host/ws/notifications?token=<jwt_token>

    Messages received:
    - {"type": "notification", "data": {...}} - New notification
    - {"type": "unread_count", "count": N} - Updated unread count
    - {"type": "ping"} - Keep-alive ping (every 30s)

    Messages you can send:
    - {"type": "pong"} - Response to ping
    """
    # Authenticate
    user_id = authenticate_websocket(token)
    if not user_id:
        await websocket.close(code=4001, reason="Authentication failed")
        return

    user_id_str = str(user_id)

    # Connect
    await manager.connect(user_id_str, websocket)

    # Start Redis subscriber task
    redis_client = get_redis()
    subscriber_task = None
    if redis_client:
        subscriber_task = asyncio.create_task(redis_subscriber(user_id_str, websocket))

    try:
        # Send initial connection success message
        await websocket.send_json(
            {
                "type": "connected",
                "user_id": user_id_str,
                "message": "Connected to notifications stream",
            }
        )

        # Keep-alive ping loop
        ping_interval = 30
        last_ping = asyncio.get_event_loop().time()

        while True:
            try:
                # Non-blocking receive with timeout for ping
                message = await asyncio.wait_for(
                    websocket.receive_json(),
                    timeout=ping_interval,
                )

                # Handle client messages
                if message.get("type") == "pong":
                    pass  # Client responded to ping
                elif message.get("type") == "ping":
                    await websocket.send_json({"type": "pong"})

            except TimeoutError:
                # Send ping
                current_time = asyncio.get_event_loop().time()
                if current_time - last_ping >= ping_interval:
                    await websocket.send_json({"type": "ping"})
                    last_ping = current_time

    except WebSocketDisconnect:
        pass
    except Exception as e:
        logger.warning("websocket_error", user_id=user_id_str, error=str(e))
    finally:
        # Cleanup
        if subscriber_task and not subscriber_task.done():
            subscriber_task.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await subscriber_task

        manager.disconnect(user_id_str, websocket)
