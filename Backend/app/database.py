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
    """Create all registered tables in the database if they do not exist."""
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        # Ensure migration columns exist on endpoints table
        await conn.execute(text("ALTER TABLE endpoints ADD COLUMN IF NOT EXISTS name VARCHAR(128);"))
        await conn.execute(text("ALTER TABLE endpoints ADD COLUMN IF NOT EXISTS description TEXT;"))
        await conn.execute(text("ALTER TABLE endpoints ADD COLUMN IF NOT EXISTS custom_signature_header VARCHAR(128);"))
        # Ensure migration columns exist on users table
        await conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS full_name VARCHAR(128);"))
        await conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS retry_attempts INTEGER DEFAULT 3;"))
        await conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS delivery_timeout INTEGER DEFAULT 15;"))
        await conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS email_alerts BOOLEAN DEFAULT TRUE;"))
