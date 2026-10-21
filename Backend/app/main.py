from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.config import settings
from app.api.v1.router import api_router
from app.routers.auth import router as auth_router
from app.routers.endpoints import router as endpoints_router
from app.routers.events import router as events_router
from app.routers.ingest import router as ingest_router
from app.database import init_db
from app.services.worker import worker


@asynccontextmanager
async def lifespan(app: FastAPI):
    print(f"Starting {settings.PROJECT_NAME} backend in {settings.ENVIRONMENT} mode...")
    try:
        await init_db()
        print("Database tables initialized successfully.")
    except Exception as exc:
        print(f"Warning: Database initialization skipped: {exc}")

    # Start background delivery worker loop (SELECT ... FOR UPDATE SKIP LOCKED)
    worker.start()

    yield

    # Gracefully stop delivery worker
    await worker.stop()
    print(f"Stopping {settings.PROJECT_NAME} backend...")


app = FastAPI(
    title=settings.PROJECT_NAME,
    description="High Reliability Webhook Ingestion, Forwarding & Replay API",
    version="1.0.0",
    lifespan=lifespan,
    docs_url="/docs",
    redoc_url="/redoc",
)

# Set up CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.BACKEND_CORS_ORIGINS or ["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Public Ingest Route: POST /h/{slug} and /api/v1/h/{slug}
app.include_router(ingest_router)
app.include_router(ingest_router, prefix=settings.API_V1_STR)

# Mount Auth router directly at /auth and at /api/v1/auth
app.include_router(auth_router)
app.include_router(auth_router, prefix=settings.API_V1_STR)

# Mount Endpoints router at /endpoints and at /api/v1/endpoints
app.include_router(endpoints_router)
app.include_router(endpoints_router, prefix=settings.API_V1_STR)

from app.routers.websocket import router as websocket_router

# Mount Events router at /events and at /api/v1/events
app.include_router(events_router)
app.include_router(events_router, prefix=settings.API_V1_STR)

# Mount WebSocket router directly at /ws/events and at /api/v1/ws/events
app.include_router(websocket_router)
app.include_router(websocket_router, prefix=settings.API_V1_STR)

# Include API v1 Router
app.include_router(api_router, prefix=settings.API_V1_STR)


@app.get("/", tags=["Root"])
async def root():
    return {
        "message": f"Welcome to {settings.PROJECT_NAME} API",
        "docs": "/docs",
        "health": f"{settings.API_V1_STR}/health",
        "endpoints": "/endpoints",
        "ingest_prefix": "/h/{slug}",
    }


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "app.main:app",
        host=settings.HOST,
        port=settings.PORT,
        reload=settings.DEBUG,
    )
