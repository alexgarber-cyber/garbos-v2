from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.deps import get_current_user
from app.db import get_db
from app.models.activity_type import ActivityType
from app.models.user import User

router = APIRouter()


class ActivityTypeResponse(BaseModel):
    id: int
    name: str
    is_system: bool

    model_config = {"from_attributes": True}


@router.get("", response_model=list[ActivityTypeResponse])
def list_activity_types(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> list[ActivityType]:
    stmt = select(ActivityType).order_by(ActivityType.name)
    return list(db.scalars(stmt).all())
