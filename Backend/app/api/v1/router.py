from fastapi import APIRouter
from app.config import settings
from app.schemas import HealthResponse
from app.routers.websocket import router as websocket_router

api_router = APIRouter()

# Include WebSocket router in api_router as well
api_router.include_router(websocket_router)


@api_router.get("/health", response_model=HealthResponse, tags=["Health"])
async def health_check():
    """Service health status endpoint."""
    return HealthResponse(
        status="healthy",
        project=settings.PROJECT_NAME,
        environment=settings.ENVIRONMENT,
    )
