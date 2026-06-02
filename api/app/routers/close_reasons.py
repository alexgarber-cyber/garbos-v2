from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.deps import get_current_user
from app.db import get_db
from app.models.close_reason import CloseReason
from app.models.user import User

router = APIRouter()


class CloseReasonCreate(BaseModel):
    name: str


class CloseReasonResponse(BaseModel):
    id: int
    name: str
    is_system: bool
    created_at: datetime

    model_config = {"from_attributes": True}


@router.get("", response_model=list[CloseReasonResponse])
def list_close_reasons(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> list[CloseReason]:
    stmt = select(CloseReason).order_by(CloseReason.id)
    return list(db.scalars(stmt).all())


@router.post("", response_model=CloseReasonResponse, status_code=status.HTTP_201_CREATED)
def create_close_reason(
    body: CloseReasonCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> CloseReason:
    if db.scalar(select(CloseReason).where(CloseReason.name == body.name)):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Close reason already exists"
        )
    reason = CloseReason(name=body.name)
    db.add(reason)
    db.commit()
    db.refresh(reason)
    return reason
