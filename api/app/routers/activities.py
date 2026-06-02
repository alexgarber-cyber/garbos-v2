from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.core.deps import get_current_user
from app.db import get_db
from app.models.activity import Activity
from app.models.activity_type import ActivityType
from app.models.company import Company
from app.models.contact import Contact
from app.models.deal import Deal
from app.models.user import User

router = APIRouter()


class ActivityCreate(BaseModel):
    activity_type_id: int
    contact_id: int | None = None
    company_id: int | None = None
    deal_id: int | None = None
    note: str | None = None
    voicemail: bool | None = None
    occurred_at: datetime | None = None


class ActivityUpdate(BaseModel):
    activity_type_id: int | None = None
    contact_id: int | None = None
    company_id: int | None = None
    deal_id: int | None = None
    note: str | None = None
    voicemail: bool | None = None
    occurred_at: datetime | None = None


class ActivityResponse(BaseModel):
    id: int
    activity_type_id: int
    activity_type_name: str
    contact_id: int | None
    contact_name: str | None
    company_id: int | None
    company_name: str | None
    deal_id: int | None
    note: str | None
    message_sent: str | None
    voicemail: bool | None
    occurred_at: datetime
    owner_id: int | None
    created_at: datetime
    updated_at: datetime


class OkResponse(BaseModel):
    ok: bool


def _contact_name(contact: Contact | None) -> str | None:
    if contact is None:
        return None
    return f"{contact.first_name} {contact.last_name or ''}".strip()


def _to_response(activity: Activity) -> ActivityResponse:
    return ActivityResponse(
        id=activity.id,
        activity_type_id=activity.activity_type_id,
        activity_type_name=activity.activity_type.name,
        contact_id=activity.contact_id,
        contact_name=_contact_name(activity.contact),
        company_id=activity.company_id,
        company_name=activity.company.name if activity.company else None,
        deal_id=activity.deal_id,
        note=activity.note,
        message_sent=activity.message_sent,
        voicemail=activity.voicemail,
        occurred_at=activity.occurred_at,
        owner_id=activity.owner_id,
        created_at=activity.created_at,
        updated_at=activity.updated_at,
    )


_EAGER = (
    selectinload(Activity.activity_type),
    selectinload(Activity.contact),
    selectinload(Activity.company),
    selectinload(Activity.deal),
)


def _get_or_404(db: Session, activity_id: int) -> Activity:
    stmt = select(Activity).where(Activity.id == activity_id).options(*_EAGER)
    activity = db.scalars(stmt).first()
    if activity is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Activity not found")
    return activity


def _validate_fks(
    db: Session,
    *,
    activity_type_id: int | None,
    contact_id: int | None,
    company_id: int | None,
    deal_id: int | None = None,
) -> None:
    if activity_type_id is not None and db.get(ActivityType, activity_type_id) is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Activity type not found"
        )
    if contact_id is not None and db.get(Contact, contact_id) is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Contact not found")
    if company_id is not None and db.get(Company, company_id) is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Company not found")
    if deal_id is not None and db.get(Deal, deal_id) is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Deal not found")


@router.get("", response_model=list[ActivityResponse])
def list_activities(
    contact_id: int | None = None,
    company_id: int | None = None,
    deal_id: int | None = None,
    activity_type_id: int | None = None,
    occurred_from: datetime | None = None,
    occurred_to: datetime | None = None,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> list[ActivityResponse]:
    stmt = select(Activity).options(*_EAGER)
    if contact_id is not None:
        stmt = stmt.where(Activity.contact_id == contact_id)
    if company_id is not None:
        stmt = stmt.where(Activity.company_id == company_id)
    if deal_id is not None:
        stmt = stmt.where(Activity.deal_id == deal_id)
    if activity_type_id is not None:
        stmt = stmt.where(Activity.activity_type_id == activity_type_id)
    if occurred_from is not None:
        stmt = stmt.where(Activity.occurred_at >= occurred_from)
    if occurred_to is not None:
        stmt = stmt.where(Activity.occurred_at <= occurred_to)
    stmt = stmt.order_by(Activity.occurred_at.desc())
    return [_to_response(a) for a in db.scalars(stmt).all()]


@router.post("", response_model=ActivityResponse, status_code=status.HTTP_201_CREATED)
def create_activity(
    body: ActivityCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> ActivityResponse:
    _validate_fks(
        db,
        activity_type_id=body.activity_type_id,
        contact_id=body.contact_id,
        company_id=body.company_id,
        deal_id=body.deal_id,
    )

    contact_id = body.contact_id
    company_id = body.company_id
    # An activity on a deal also surfaces on the deal's contact + company feeds:
    # backfill them from the deal when not given explicitly.
    if body.deal_id is not None:
        deal = db.get(Deal, body.deal_id)
        if deal is not None:
            if contact_id is None:
                contact_id = deal.primary_contact_id
            if company_id is None:
                company_id = deal.company_id
    # Auto-populate company from the contact's company when not given explicitly.
    if company_id is None and contact_id is not None:
        contact = db.get(Contact, contact_id)
        if contact is not None:
            company_id = contact.company_id

    activity = Activity(
        activity_type_id=body.activity_type_id,
        contact_id=contact_id,
        company_id=company_id,
        deal_id=body.deal_id,
        note=body.note,
        voicemail=body.voicemail,
        occurred_at=body.occurred_at or datetime.now(timezone.utc),
        owner_id=user.id,
    )
    db.add(activity)
    db.commit()
    return _to_response(_get_or_404(db, activity.id))


@router.get("/{activity_id}", response_model=ActivityResponse)
def get_activity(
    activity_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> ActivityResponse:
    return _to_response(_get_or_404(db, activity_id))


@router.put("/{activity_id}", response_model=ActivityResponse)
def update_activity(
    activity_id: int,
    body: ActivityUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> ActivityResponse:
    activity = _get_or_404(db, activity_id)
    data = body.model_dump(exclude_unset=True)
    _validate_fks(
        db,
        activity_type_id=data.get("activity_type_id"),
        contact_id=data.get("contact_id"),
        company_id=data.get("company_id"),
        deal_id=data.get("deal_id"),
    )
    for field, value in data.items():
        setattr(activity, field, value)
    db.commit()
    return _to_response(_get_or_404(db, activity_id))


@router.delete("/{activity_id}", response_model=OkResponse)
def delete_activity(
    activity_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> OkResponse:
    activity = _get_or_404(db, activity_id)
    db.delete(activity)
    db.commit()
    return OkResponse(ok=True)
