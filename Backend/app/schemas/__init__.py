# Pydantic Schemas
from pydantic import BaseModel


class HealthResponse(BaseModel):
    status: str
    project: str
    environment: str
