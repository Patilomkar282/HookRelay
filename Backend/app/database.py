from typing import AsyncGenerator
from sqlalchemy import text
from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.orm import declarative_base
from app.config import settings

# SQLAlchemy 2.0 Async Engine
engine = create_async_engine(
    settings.DATABASE_URL,
    echo=settings.DEBUG,
    future=True,
)

# Async Session Factory
AsyncSessionLocal = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autoflush=False,
)

Base = declarative_base()


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """Dependency for obtaining database sessions in API endpoints."""
    async with AsyncSessionLocal() as session:
        try:
            yield session
        finally:
            await session.close()


async def init_db() -> None:
    """Create all registered tables and apply non-destructive schema migrations."""
    import app.models  # Ensure all SQLAlchemy models are registered on Base.metadata

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

        is_postgres = (conn.dialect.name == "postgresql")
        if is_postgres:
            # Endpoints table migrations
            await conn.execute(text("ALTER TABLE endpoints ADD COLUMN IF NOT EXISTS name VARCHAR(128);"))
            await conn.execute(text("ALTER TABLE endpoints ADD COLUMN IF NOT EXISTS description TEXT;"))
            await conn.execute(text("ALTER TABLE endpoints ADD COLUMN IF NOT EXISTS custom_signature_header VARCHAR(128);"))
            await conn.execute(text("ALTER TABLE endpoints ADD COLUMN IF NOT EXISTS circuit_state VARCHAR(10) DEFAULT 'closed';"))
            await conn.execute(text("ALTER TABLE endpoints ADD COLUMN IF NOT EXISTS consecutive_failures INTEGER DEFAULT 0;"))
            await conn.execute(text("ALTER TABLE endpoints ADD COLUMN IF NOT EXISTS open_count INTEGER DEFAULT 0;"))
            await conn.execute(text("ALTER TABLE endpoints ADD COLUMN IF NOT EXISTS circuit_open_until TIMESTAMP WITH TIME ZONE;"))
            await conn.execute(text("ALTER TABLE endpoints ADD COLUMN IF NOT EXISTS probe_started_at TIMESTAMP WITH TIME ZONE;"))
            await conn.execute(text("UPDATE endpoints SET circuit_state = 'closed' WHERE circuit_state IS NULL;"))

            # Users table migrations
            await conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS full_name VARCHAR(128);"))
            await conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS retry_attempts INTEGER DEFAULT 3;"))
            await conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS delivery_timeout INTEGER DEFAULT 15;"))
            await conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS email_alerts BOOLEAN DEFAULT TRUE;"))

            # Deliveries table migrations
            await conn.execute(text("ALTER TABLE deliveries ADD COLUMN IF NOT EXISTS error_kind VARCHAR(64);"))
