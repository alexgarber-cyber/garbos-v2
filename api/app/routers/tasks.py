from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.core.deps import get_current_user
from app.db import get_db
from app.models.action_chain import ActionChain
from app.models.chain_step import ChainStep
from app.models.user import User
from app.routers.chains import (
    ChainResponse,
    _contact_name,
    _get_or_404,
    _resolve_company_id,
    _to_response,
    _validate_activity_type,
    _validate_chain_fks,
)

router = APIRouter()


class QuickTaskCreate(BaseModel):
    title: str
    due_date: datetime
    activity_type_id: int
    contact_id: int | None = None
    company_id: int | None = None
    note: str | None = None
    responsible_party: str = "me"


class TaskResponse(BaseModel):
    step_id: int
    chain_id: int
    chain_title: str
    step_order: int
    title: str | None
    due_date: datetime
    note: str | None
    responsible_party: str
    activity_type_id: int
    activity_type_name: str
    contact_id: int | None
    contact_name: str | None
    company_id: int | None
    company_name: str | None


def _task_to_response(step: ChainStep) -> TaskResponse:
    chain = step.chain
    return TaskResponse(
        step_id=step.id,
        chain_id=chain.id,
        chain_title=chain.title,
        step_order=step.step_order,
        title=step.title,
        due_date=step.due_date,
        note=step.note,
        responsible_party=step.responsible_party,
        activity_type_id=step.activity_type_id,
        activity_type_name=step.activity_type.name,
        contact_id=chain.contact_id,
        contact_name=_contact_name(chain.contact),
        company_id=chain.company_id,
        company_name=chain.company.name if chain.company else None,
    )


@router.post("/quick", response_model=ChainResponse, status_code=status.HTTP_201_CREATED)
def quick_add_task(
    body: QuickTaskCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> ChainResponse:
    """Create a one-step chain — the convenience path for simple tasks."""
    _validate_chain_fks(db, contact_id=body.contact_id, company_id=body.company_id)
    _validate_activity_type(db, body.activity_type_id)

    company_id = _resolve_company_id(db, body.contact_id, body.company_id)

    chain = ActionChain(
        title=body.title,
        contact_id=body.contact_id,
        company_id=company_id,
        owner_id=user.id,
    )
    chain.steps.append(
        ChainStep(
            step_order=1,
            activity_type_id=body.activity_type_id,
            title=body.title,
            due_date=body.due_date,
            note=body.note,
            responsible_party=body.responsible_party,
        )
    )
    db.add(chain)
    db.commit()
    return _to_response(_get_or_404(db, chain.id))


@router.get("", response_model=list[TaskResponse])
def list_tasks(
    due: str | None = None,
    contact_id: int | None = None,
    company_id: int | None = None,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> list[TaskResponse]:
    """All incomplete steps across active chains, ordered by due date."""
    stmt = (
        select(ChainStep)
        .join(ActionChain, ChainStep.chain_id == ActionChain.id)
        .where(ChainStep.completed.is_(False))
        .where(ActionChain.status == "active")
        .options(
            selectinload(ChainStep.activity_type),
            selectinload(ChainStep.chain).selectinload(ActionChain.contact),
            selectinload(ChainStep.chain).selectinload(ActionChain.company),
        )
    )

    if due is not None:
        today_start = datetime.now(timezone.utc).replace(
            hour=0, minute=0, second=0, microsecond=0
        )
        tomorrow_start = today_start + timedelta(days=1)
        week_end = today_start + timedelta(days=7)
        if due == "overdue":
            stmt = stmt.where(ChainStep.due_date < today_start)
        elif due == "today":
            stmt = stmt.where(ChainStep.due_date >= today_start).where(
                ChainStep.due_date < tomorrow_start
            )
        elif due == "this_week":
            stmt = stmt.where(ChainStep.due_date >= tomorrow_start).where(
                ChainStep.due_date < week_end
            )

    if contact_id is not None:
        stmt = stmt.where(ActionChain.contact_id == contact_id)
    if company_id is not None:
        stmt = stmt.where(ActionChain.company_id == company_id)

    stmt = stmt.order_by(ChainStep.due_date.asc())
    return [_task_to_response(s) for s in db.scalars(stmt).all()]
