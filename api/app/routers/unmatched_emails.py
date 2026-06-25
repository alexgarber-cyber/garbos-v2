"""Review queue for emails the IMAP poller could not match to a contact.

Surfaces pending emails (sender, subject, date) and lets the user one-click add
the sender as a Contact or Lead, or Ignore them (adds to ``email_ignore_list``).
Adding backfills the originating email as an activity on the new contact.
"""

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.deps import get_current_user
from app.db import get_db
from app.models.activity_type import ActivityType
from app.models.company import Company
from app.models.contact import Contact
from app.models.email_ignore_entry import EmailIgnoreEntry
from app.models.unmatched_email import UnmatchedEmail
from app.models.user import User
from app.routers.companies import get_or_create_company_by_name
from app.routers.contacts import ContactResponse
from app.routers.contacts import _to_response as _contact_to_response
from app.services.imap_poller import create_email_activity

router = APIRouter()


class UnmatchedEmailResponse(BaseModel):
    id: int
    from_address: str
    to_addresses: str | None
    subject: str | None
    body_snippet: str | None
    received_at: datetime
    direction: str | None
    status: str
    created_at: datetime


class CountResponse(BaseModel):
    pending: int


class AddContactRequest(BaseModel):
    first_name: str | None = None
    last_name: str | None = None
    email: str | None = None  # defaults to the email's sender address
    title: str | None = None
    phone: str | None = None
    linkedin_url: str | None = None
    company_id: int | None = None


class AddLeadRequest(BaseModel):
    first_name: str | None = None
    last_name: str | None = None
    email: str | None = None
    title: str | None = None
    phone: str | None = None
    linkedin_url: str | None = None
    company_name: str


class IgnoreRequest(BaseModel):
    domain: bool = False  # ignore the whole domain instead of just the address
    note: str | None = None


def _to_response(e: UnmatchedEmail) -> UnmatchedEmailResponse:
    return UnmatchedEmailResponse(
        id=e.id,
        from_address=e.from_address,
        to_addresses=e.to_addresses,
        subject=e.subject,
        body_snippet=e.body_snippet,
        received_at=e.received_at,
        direction=e.direction,
        status=e.status,
        created_at=e.created_at,
    )


def _get_pending_or_404(db: Session, email_id: int) -> UnmatchedEmail:
    e = db.get(UnmatchedEmail, email_id)
    if e is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Email not found")
    if e.status != "pending":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail=f"Email already {e.status}"
        )
    return e


def _default_first_name(address: str) -> str:
    local = address.split("@", 1)[0]
    return local.replace(".", " ").replace("_", " ").strip().title() or address


def _backfill_activity(db: Session, *, email: UnmatchedEmail, contact: Contact, owner_id: int) -> None:
    """Log the originating email as an activity on the newly created contact."""
    email_type_id = db.scalar(select(ActivityType.id).where(ActivityType.name == "Email"))
    if email_type_id is None:
        return
    create_email_activity(
        db,
        contact=contact,
        direction=email.direction or "inbound",
        subject=email.subject,
        snippet=email.body_snippet,
        occurred_at=email.received_at,
        message_id=email.message_id,
        owner_id=owner_id,
        email_type_id=email_type_id,
    )


@router.get("", response_model=list[UnmatchedEmailResponse])
def list_unmatched(
    status_filter: str = "pending",
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> list[UnmatchedEmailResponse]:
    stmt = select(UnmatchedEmail)
    if status_filter != "all":
        stmt = stmt.where(UnmatchedEmail.status == status_filter)
    stmt = stmt.order_by(UnmatchedEmail.received_at.desc())
    return [_to_response(e) for e in db.scalars(stmt).all()]


@router.get("/count", response_model=CountResponse)
def count_pending(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> CountResponse:
    pending = db.scalar(
        select(func.count())
        .select_from(UnmatchedEmail)
        .where(UnmatchedEmail.status == "pending")
    )
    return CountResponse(pending=pending or 0)


@router.post("/{email_id}/add-contact", response_model=ContactResponse)
def add_as_contact(
    email_id: int,
    body: AddContactRequest,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> ContactResponse:
    email = _get_pending_or_404(db, email_id)
    if body.company_id is not None and db.get(Company, body.company_id) is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Company not found")
    address = body.email or email.from_address
    contact = Contact(
        first_name=body.first_name or _default_first_name(address),
        last_name=body.last_name,
        email=address,
        title=body.title,
        phone=body.phone,
        linkedin_url=body.linkedin_url,
        company_id=body.company_id,
        owner_id=user.id,
    )
    db.add(contact)
    db.flush()
    _backfill_activity(db, email=email, contact=contact, owner_id=user.id)
    email.status = "added"
    db.commit()
    db.refresh(contact)
    return _contact_to_response(contact)


@router.post("/{email_id}/add-lead", response_model=ContactResponse)
def add_as_lead(
    email_id: int,
    body: AddLeadRequest,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> ContactResponse:
    email = _get_pending_or_404(db, email_id)
    address = body.email or email.from_address
    company = get_or_create_company_by_name(db, body.company_name, user.id)
    contact = Contact(
        first_name=body.first_name or _default_first_name(address),
        last_name=body.last_name,
        email=address,
        title=body.title,
        phone=body.phone,
        linkedin_url=body.linkedin_url,
        lifecycle_status="Lead",
        company_id=company.id,
        owner_id=user.id,
    )
    db.add(contact)
    db.flush()
    _backfill_activity(db, email=email, contact=contact, owner_id=user.id)
    email.status = "added"
    db.commit()
    db.refresh(contact)
    return _contact_to_response(contact)


@router.post("/{email_id}/ignore", response_model=UnmatchedEmailResponse)
def ignore_email(
    email_id: int,
    body: IgnoreRequest,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> UnmatchedEmailResponse:
    email = _get_pending_or_404(db, email_id)
    address = email.from_address.lower()
    if body.domain:
        pattern = address.split("@", 1)[-1]
        kind = "domain"
    else:
        pattern = address
        kind = "address"

    existing = db.scalar(select(EmailIgnoreEntry).where(EmailIgnoreEntry.pattern == pattern))
    if existing is None:
        db.add(
            EmailIgnoreEntry(pattern=pattern, kind=kind, note=body.note, owner_id=user.id)
        )

    # Resolve every other pending email from the same address/domain too.
    pending = db.scalars(
        select(UnmatchedEmail).where(UnmatchedEmail.status == "pending")
    ).all()
    for e in pending:
        addr = e.from_address.lower()
        if addr == pattern or addr.split("@", 1)[-1] == pattern:
            e.status = "ignored"
    db.commit()
    db.refresh(email)
    return _to_response(email)
