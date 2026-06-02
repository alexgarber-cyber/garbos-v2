from datetime import date, datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from app.core.deps import get_current_user
from app.db import get_db
from app.models.activity import Activity
from app.models.close_reason import CloseReason
from app.models.company import Company
from app.models.contact import Contact
from app.models.deal import Deal
from app.models.pipeline_stage import PipelineStage
from app.models.user import User

router = APIRouter()


class DealCreate(BaseModel):
    title: str
    company_id: int | None = None
    primary_contact_id: int | None = None
    pipeline_stage_id: int
    amount: float | None = None
    expected_close_date: date | None = None
    close_reason_id: int | None = None
    notes: str | None = None


class DealUpdate(BaseModel):
    title: str | None = None
    company_id: int | None = None
    primary_contact_id: int | None = None
    pipeline_stage_id: int | None = None
    amount: float | None = None
    expected_close_date: date | None = None
    close_reason_id: int | None = None
    notes: str | None = None


class DealClose(BaseModel):
    pipeline_stage_id: int
    close_reason_id: int | None = None


class DealResponse(BaseModel):
    id: int
    title: str
    company_id: int | None
    company_name: str | None
    primary_contact_id: int | None
    primary_contact_name: str | None
    pipeline_stage_id: int
    pipeline_stage_name: str
    is_terminal: bool
    amount: float | None
    expected_close_date: date | None
    close_reason_id: int | None
    close_reason_name: str | None
    notes: str | None
    days_since_last_activity: int
    owner_id: int | None
    created_at: datetime
    updated_at: datetime


class OkResponse(BaseModel):
    ok: bool


def _contact_name(contact: Contact | None) -> str | None:
    if contact is None:
        return None
    return f"{contact.first_name} {contact.last_name or ''}".strip()


_EAGER = (
    selectinload(Deal.company),
    selectinload(Deal.primary_contact),
    selectinload(Deal.pipeline_stage),
    selectinload(Deal.close_reason),
)


def _staleness_map(db: Session, deal_ids: list[int]) -> dict[int, datetime]:
    """Map deal_id -> most recent activity ``occurred_at`` for the given deals."""
    if not deal_ids:
        return {}
    rows = db.execute(
        select(Activity.deal_id, func.max(Activity.occurred_at))
        .where(Activity.deal_id.in_(deal_ids))
        .group_by(Activity.deal_id)
    ).all()
    return {deal_id: last for deal_id, last in rows if deal_id is not None}


def _days_since(reference: datetime) -> int:
    now = datetime.now(timezone.utc)
    if reference.tzinfo is None:
        reference = reference.replace(tzinfo=timezone.utc)
    return max((now - reference).days, 0)


def _to_response(deal: Deal, last_activity_at: datetime | None) -> DealResponse:
    # Staleness is days since the last activity on the deal; with no activity yet
    # we fall back to how long the deal itself has existed.
    reference = last_activity_at or deal.created_at
    return DealResponse(
        id=deal.id,
        title=deal.title,
        company_id=deal.company_id,
        company_name=deal.company.name if deal.company else None,
        primary_contact_id=deal.primary_contact_id,
        primary_contact_name=_contact_name(deal.primary_contact),
        pipeline_stage_id=deal.pipeline_stage_id,
        pipeline_stage_name=deal.pipeline_stage.name,
        is_terminal=deal.pipeline_stage.is_terminal,
        amount=float(deal.amount) if deal.amount is not None else None,
        expected_close_date=deal.expected_close_date,
        close_reason_id=deal.close_reason_id,
        close_reason_name=deal.close_reason.name if deal.close_reason else None,
        notes=deal.notes,
        days_since_last_activity=_days_since(reference),
        owner_id=deal.owner_id,
        created_at=deal.created_at,
        updated_at=deal.updated_at,
    )


def _get_or_404(db: Session, deal_id: int) -> Deal:
    stmt = select(Deal).where(Deal.id == deal_id).options(*_EAGER)
    deal = db.scalars(stmt).first()
    if deal is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Deal not found")
    return deal


def _validate_fks(
    db: Session,
    *,
    company_id: int | None,
    primary_contact_id: int | None,
    pipeline_stage_id: int | None,
    close_reason_id: int | None,
) -> None:
    if company_id is not None and db.get(Company, company_id) is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Company not found")
    if primary_contact_id is not None and db.get(Contact, primary_contact_id) is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Contact not found")
    if pipeline_stage_id is not None and db.get(PipelineStage, pipeline_stage_id) is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Pipeline stage not found"
        )
    if close_reason_id is not None and db.get(CloseReason, close_reason_id) is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Close reason not found"
        )


@router.get("", response_model=list[DealResponse])
def list_deals(
    pipeline_stage_id: int | None = None,
    company_id: int | None = None,
    primary_contact_id: int | None = None,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> list[DealResponse]:
    stmt = select(Deal).options(*_EAGER)
    if pipeline_stage_id is not None:
        stmt = stmt.where(Deal.pipeline_stage_id == pipeline_stage_id)
    if company_id is not None:
        stmt = stmt.where(Deal.company_id == company_id)
    if primary_contact_id is not None:
        stmt = stmt.where(Deal.primary_contact_id == primary_contact_id)
    stmt = stmt.order_by(Deal.created_at.desc())
    deals = list(db.scalars(stmt).all())
    last_map = _staleness_map(db, [d.id for d in deals])
    return [_to_response(d, last_map.get(d.id)) for d in deals]


@router.post("", response_model=DealResponse, status_code=status.HTTP_201_CREATED)
def create_deal(
    body: DealCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> DealResponse:
    _validate_fks(
        db,
        company_id=body.company_id,
        primary_contact_id=body.primary_contact_id,
        pipeline_stage_id=body.pipeline_stage_id,
        close_reason_id=body.close_reason_id,
    )
    deal = Deal(**body.model_dump(), owner_id=user.id)
    db.add(deal)
    db.commit()
    return _to_response(_get_or_404(db, deal.id), None)


@router.get("/{deal_id}", response_model=DealResponse)
def get_deal(
    deal_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> DealResponse:
    deal = _get_or_404(db, deal_id)
    return _to_response(deal, _staleness_map(db, [deal.id]).get(deal.id))


@router.put("/{deal_id}", response_model=DealResponse)
def update_deal(
    deal_id: int,
    body: DealUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> DealResponse:
    deal = _get_or_404(db, deal_id)
    data = body.model_dump(exclude_unset=True)
    _validate_fks(
        db,
        company_id=data.get("company_id"),
        primary_contact_id=data.get("primary_contact_id"),
        pipeline_stage_id=data.get("pipeline_stage_id"),
        close_reason_id=data.get("close_reason_id"),
    )
    for field, value in data.items():
        setattr(deal, field, value)
    db.commit()
    deal = _get_or_404(db, deal_id)
    return _to_response(deal, _staleness_map(db, [deal.id]).get(deal.id))


@router.post("/{deal_id}/close", response_model=DealResponse)
def close_deal(
    deal_id: int,
    body: DealClose,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> DealResponse:
    deal = _get_or_404(db, deal_id)
    stage = db.get(PipelineStage, body.pipeline_stage_id)
    if stage is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Pipeline stage not found"
        )
    if not stage.is_terminal:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Closing a deal requires a terminal stage (e.g. Closed Won/Lost)",
        )
    if body.close_reason_id is not None and db.get(CloseReason, body.close_reason_id) is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Close reason not found"
        )
    deal.pipeline_stage_id = body.pipeline_stage_id
    deal.close_reason_id = body.close_reason_id
    db.commit()
    deal = _get_or_404(db, deal_id)
    return _to_response(deal, _staleness_map(db, [deal.id]).get(deal.id))


@router.delete("/{deal_id}", response_model=OkResponse)
def delete_deal(
    deal_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> OkResponse:
    deal = _get_or_404(db, deal_id)
    db.delete(deal)
    db.commit()
    return OkResponse(ok=True)
