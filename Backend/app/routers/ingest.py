from fastapi import APIRouter, Depends, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.schemas.event import IngestResponse
from app.services.event_service import ingest_webhook_event

router = APIRouter(prefix="/h", tags=["Ingest"])


@router.post(
    "/{slug}",
    response_model=IngestResponse,
    status_code=status.HTTP_202_ACCEPTED,
    summary="Public webhook ingestion mailbox endpoint",
)
async def ingest_webhook(
    slug: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """
    Public webhook receiver endpoint for external providers (Razorpay, GitHub, Stripe, Custom).
    Captures full headers and raw payload body, stores the event in PostgreSQL,
    and returns 202 Accepted immediately.
    """
    body_bytes = await request.body()
    # Convert header items to a standard case-preserved dictionary
    headers = {k: v for k, v in request.headers.items()}

    event = await ingest_webhook_event(
        db=db,
        slug=slug,
        headers=headers,
        body_bytes=body_bytes,
    )

    return IngestResponse(
        status="accepted",
        event_id=event.id,
        received_at=event.received_at,
    )
