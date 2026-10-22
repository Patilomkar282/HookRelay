import secrets
from typing import List, Optional
from fastapi import HTTPException, status
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.endpoint import Endpoint
from app.models.event import Event
from app.schemas.endpoint import EndpointCreate, EndpointUpdate
from app.services.security_service import validate_target_url


def generate_endpoint_slug() -> str:
    """Generate a 22-char random URL-safe slug."""
    return secrets.token_urlsafe(16)


def generate_signing_secret() -> str:
    """Generate a secure signing secret prefixed with whsec_."""
    return f"whsec_{secrets.token_hex(24)}"


async def create_endpoint(
    db: AsyncSession,
    user_id: str,
    endpoint_in: EndpointCreate,
) -> Endpoint:
    """Create a new webhook mailbox endpoint owned by user_id."""
    clean_target_url = validate_target_url(str(endpoint_in.target_url))
    slug = generate_endpoint_slug()
    secret = generate_signing_secret()

    endpoint = Endpoint(
        user_id=user_id,
        slug=slug,
        target_url=clean_target_url,
        signing_secret=secret,
        provider_type=endpoint_in.provider_type,
        is_active=True,
    )
    db.add(endpoint)
    await db.commit()
    await db.refresh(endpoint)
    endpoint.events_count = 0
    return endpoint


async def get_user_endpoints(
    db: AsyncSession,
    user_id: str,
) -> List[Endpoint]:
    """List all endpoints owned by user_id with event counts."""
    stmt = (
        select(Endpoint, func.count(Event.id).label("events_count"))
        .outerjoin(Event, Event.endpoint_id == Endpoint.id)
        .where(Endpoint.user_id == user_id)
        .group_by(Endpoint.id)
        .order_by(Endpoint.created_at.desc())
    )
    result = await db.execute(stmt)
    endpoints = []
    for ep, count in result.all():
        ep.events_count = count
        endpoints.append(ep)
    return endpoints


async def get_user_endpoint_by_id(
    db: AsyncSession,
    user_id: str,
    endpoint_id: str,
) -> Endpoint:
    """
    Get endpoint by id ensuring ownership.
    Returns 404 if endpoint does not exist or belongs to another user.
    """
    stmt = (
        select(Endpoint, func.count(Event.id).label("events_count"))
        .outerjoin(Event, Event.endpoint_id == Endpoint.id)
        .where(
            Endpoint.id == endpoint_id,
            Endpoint.user_id == user_id,
        )
        .group_by(Endpoint.id)
    )
    result = await db.execute(stmt)
    row = result.first()

    if not row:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Endpoint not found",
        )
    ep, count = row
    ep.events_count = count
    return ep


async def update_endpoint(
    db: AsyncSession,
    user_id: str,
    endpoint_id: str,
    update_in: EndpointUpdate,
) -> Endpoint:
    """Update endpoint properties with ownership check."""
    endpoint = await get_user_endpoint_by_id(db, user_id, endpoint_id)

    if update_in.target_url is not None:
        endpoint.target_url = validate_target_url(str(update_in.target_url))
    if update_in.provider_type is not None:
        endpoint.provider_type = update_in.provider_type
    if update_in.is_active is not None:
        endpoint.is_active = update_in.is_active

    await db.commit()
    await db.refresh(endpoint)
    return endpoint


async def delete_endpoint(
    db: AsyncSession,
    user_id: str,
    endpoint_id: str,
) -> None:
    """Delete an endpoint with ownership check."""
    endpoint = await get_user_endpoint_by_id(db, user_id, endpoint_id)
    await db.delete(endpoint)
    await db.commit()


async def rotate_signing_secret(
    db: AsyncSession,
    user_id: str,
    endpoint_id: str,
) -> Endpoint:
    """Generate a new signing secret for the endpoint."""
    endpoint = await get_user_endpoint_by_id(db, user_id, endpoint_id)
    endpoint.signing_secret = generate_signing_secret()
    await db.commit()
    await db.refresh(endpoint)
    return endpoint


async def get_endpoint_by_slug(
    db: AsyncSession,
    slug: str,
) -> Optional[Endpoint]:
    """Retrieve endpoint by public slug for ingestion."""
    stmt = select(Endpoint).where(Endpoint.slug == slug)
    result = await db.execute(stmt)
    return result.scalar_one_or_none()
