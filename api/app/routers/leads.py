"""The /leads prospecting command center.

An enriched, actionable VIEW over existing data. Leads are primarily PEOPLE:
the primary group is contacts with ``lifecycle_status == "Lead"``, enriched with
company context, their latest activity, and sequence-enrollment state. The
secondary group is companies that are Leads but have no contact-lead yet
("target identified, person not found"). Plus status-change + add-lead endpoints
for the inline UX.
"""

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.core.deps import get_current_user
from app.db import get_db
from app.models.action_chain import ActionChain
from app.models.activity import Activity
from app.models.company import Company
from app.models.contact import Contact
from app.models.user import User
from app.routers.companies import (
    CompanyResponse,
    LifecycleStatus,
    get_or_create_company_by_name,
)
from app.routers.contacts import ContactResponse, _to_response

router = APIRouter()


class LeadEnrollment(BaseModel):
    sequence_id: int
    sequence_name: str
    chain_id: int
    current_step: int
    total_steps: int
    next_due_date: datetime | None


class ContactLeadResponse(BaseModel):
    # Contact identity.
    id: int
    first_name: str
    last_name: str | None
    email: str | None
    title: str | None
    phone: str | None
    linkedin_url: str | None
    lifecycle_status: str | None
    # Company context.
    company_id: int | None
    company_name: str | None
    industry: str | None
    hq_city: str | None
    hq_state: str | None
    lead_score: int | None  # from the contact's company
    # Enrichment.
    last_activity_at: datetime | None
    last_activity_type: str | None
    days_since_last_activity: int
    active_enrollment: LeadEnrollment | None  # keyed on contact


class CompanyLeadResponse(BaseModel):
    id: int
    name: str
    industry: str | None
    hq_city: str | None
    hq_state: str | None
    lead_score: int | None
    lifecycle_status: str | None
    contact_count: int
    last_activity_at: datetime | None
    last_activity_type: str | None
    days_since_last_activity: int


class LeadsResponse(BaseModel):
    contact_leads: list[ContactLeadResponse]
    company_leads: list[CompanyLeadResponse]


class ContactStatusUpdate(BaseModel):
    lifecycle_status: LifecycleStatus | None


class CompanyStatusUpdate(BaseModel):
    lifecycle_status: LifecycleStatus | None


class AddLead(BaseModel):
    first_name: str
    last_name: str | None = None
    email: str | None = None
    title: str | None = None
    phone: str | None = None
    linkedin_url: str | None = None
    company_name: str


def _days_since(reference: datetime) -> int:
    now = datetime.now(timezone.utc)
    if reference.tzinfo is None:
        reference = reference.replace(tzinfo=timezone.utc)
    return max((now - reference).days, 0)


def _contact_name(c: Contact | None) -> str:
    if c is None:
        return ""
    return f"{c.first_name} {c.last_name or ''}".strip()


def _last_activity_by_contact(
    db: Session, contact_ids: list[int]
) -> dict[int, tuple[datetime, str]]:
    """contact_id -> (occurred_at, activity_type_name) of its most recent activity."""
    if not contact_ids:
        return {}
    rows = db.scalars(
        select(Activity)
        .where(Activity.contact_id.in_(contact_ids))
        .order_by(Activity.occurred_at.desc())
        .options(selectinload(Activity.activity_type))
    ).all()
    out: dict[int, tuple[datetime, str]] = {}
    for a in rows:  # newest-first; keep the first seen per contact
        if a.contact_id is not None and a.contact_id not in out:
            out[a.contact_id] = (a.occurred_at, a.activity_type.name)
    return out


def _last_activity_by_company(
    db: Session, company_ids: list[int]
) -> dict[int, tuple[datetime, str]]:
    """company_id -> (occurred_at, activity_type_name) of its most recent activity."""
    if not company_ids:
        return {}
    rows = db.scalars(
        select(Activity)
        .where(Activity.company_id.in_(company_ids))
        .order_by(Activity.occurred_at.desc())
        .options(selectinload(Activity.activity_type))
    ).all()
    out: dict[int, tuple[datetime, str]] = {}
    for a in rows:  # newest-first; keep the first seen per company
        if a.company_id is not None and a.company_id not in out:
            out[a.company_id] = (a.occurred_at, a.activity_type.name)
    return out


def _next_due(chain: ActionChain) -> datetime | None:
    dues = [s.due_date for s in chain.steps if not s.completed]
    return min(dues) if dues else None


def _enrollment_by_contact(
    db: Session, contact_ids: list[int]
) -> dict[int, LeadEnrollment]:
    """contact_id -> its primary (earliest next-due) active sequence enrollment."""
    if not contact_ids:
        return {}
    chains = db.scalars(
        select(ActionChain)
        .where(
            ActionChain.contact_id.in_(contact_ids),
            ActionChain.status == "active",
            ActionChain.sequence_id.is_not(None),
        )
        .options(
            selectinload(ActionChain.sequence),
            selectinload(ActionChain.steps),
        )
    ).all()

    # Group by contact, then pick the chain with the earliest next-due date.
    by_contact: dict[int, list[ActionChain]] = {}
    for c in chains:
        by_contact.setdefault(c.contact_id, []).append(c)

    out: dict[int, LeadEnrollment] = {}
    far_future = datetime.max.replace(tzinfo=timezone.utc)
    for contact_id, cs in by_contact.items():
        primary = min(cs, key=lambda c: _next_due(c) or far_future)
        completed = sum(1 for s in primary.steps if s.completed)
        out[contact_id] = LeadEnrollment(
            sequence_id=primary.sequence_id,
            sequence_name=primary.sequence.name if primary.sequence else "Sequence",
            chain_id=primary.id,
            current_step=min(completed + 1, len(primary.steps)) if primary.steps else 0,
            total_steps=len(primary.steps),
            next_due_date=_next_due(primary),
        )
    return out


def _contact_count_map(db: Session, company_ids: list[int]) -> dict[int, int]:
    if not company_ids:
        return {}
    rows = db.scalars(
        select(Contact.company_id).where(Contact.company_id.in_(company_ids))
    ).all()
    out: dict[int, int] = {}
    for cid in rows:
        if cid is not None:
            out[cid] = out.get(cid, 0) + 1
    return out


@router.get("", response_model=LeadsResponse)
def list_leads(
    industry: str | None = None,
    lead_score_min: int | None = None,
    lead_score_max: int | None = None,
    has_enrollment: bool | None = None,
    stale_days: int | None = None,
    sort: str = "lead_score",
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> LeadsResponse:
    # ---- Contact leads (primary) ----
    contacts = list(
        db.scalars(
            select(Contact)
            .where(Contact.lifecycle_status == "Lead")
            .options(selectinload(Contact.company))
        ).all()
    )
    if industry:
        needle = industry.lower()
        contacts = [
            c for c in contacts
            if c.company and c.company.industry
            and needle in c.company.industry.lower()
        ]
    if lead_score_min is not None:
        contacts = [
            c for c in contacts
            if c.company and c.company.lead_score is not None
            and c.company.lead_score >= lead_score_min
        ]
    if lead_score_max is not None:
        contacts = [
            c for c in contacts
            if c.company and c.company.lead_score is not None
            and c.company.lead_score <= lead_score_max
        ]

    contact_ids = [c.id for c in contacts]
    c_last_map = _last_activity_by_contact(db, contact_ids)
    c_enroll_map = _enrollment_by_contact(db, contact_ids)

    contact_leads: list[ContactLeadResponse] = []
    for c in contacts:
        last = c_last_map.get(c.id)
        reference = last[0] if last else c.created_at
        company = c.company
        contact_leads.append(
            ContactLeadResponse(
                id=c.id,
                first_name=c.first_name,
                last_name=c.last_name,
                email=c.email,
                title=c.title,
                phone=c.phone,
                linkedin_url=c.linkedin_url,
                lifecycle_status=c.lifecycle_status,
                company_id=c.company_id,
                company_name=company.name if company else None,
                industry=company.industry if company else None,
                hq_city=company.hq_city if company else None,
                hq_state=company.hq_state if company else None,
                lead_score=company.lead_score if company else None,
                last_activity_at=last[0] if last else None,
                last_activity_type=last[1] if last else None,
                days_since_last_activity=_days_since(reference),
                active_enrollment=c_enroll_map.get(c.id),
            )
        )

    if has_enrollment is not None:
        contact_leads = [
            l for l in contact_leads
            if (l.active_enrollment is not None) == has_enrollment
        ]
    if stale_days is not None:
        contact_leads = [
            l for l in contact_leads if l.days_since_last_activity >= stale_days
        ]

    far = datetime.max.replace(tzinfo=timezone.utc)
    if sort == "name":
        contact_leads.sort(key=lambda l: _contact_sort_name(l))
    elif sort == "staleness":
        contact_leads.sort(key=lambda l: l.days_since_last_activity, reverse=True)
    elif sort == "next_due":
        contact_leads.sort(
            key=lambda l: (l.active_enrollment.next_due_date or far)
            if l.active_enrollment
            else far
        )
    else:  # lead_score desc, None last
        contact_leads.sort(key=lambda l: (l.lead_score is None, -(l.lead_score or 0)))

    # ---- Company leads (secondary): Lead companies with no contact-lead yet ----
    lead_companies = list(
        db.scalars(
            select(Company).where(Company.lifecycle_status == "Lead")
        ).all()
    )
    contact_lead_company_ids = set(
        db.scalars(
            select(Contact.company_id).where(
                Contact.lifecycle_status == "Lead",
                Contact.company_id.is_not(None),
            )
        ).all()
    )
    lead_companies = [
        c for c in lead_companies if c.id not in contact_lead_company_ids
    ]
    if industry:
        needle = industry.lower()
        lead_companies = [
            c for c in lead_companies
            if c.industry and needle in c.industry.lower()
        ]

    company_ids = [c.id for c in lead_companies]
    co_last_map = _last_activity_by_company(db, company_ids)
    count_map = _contact_count_map(db, company_ids)

    company_leads: list[CompanyLeadResponse] = []
    for c in lead_companies:
        last = co_last_map.get(c.id)
        reference = last[0] if last else c.created_at
        company_leads.append(
            CompanyLeadResponse(
                id=c.id,
                name=c.name,
                industry=c.industry,
                hq_city=c.hq_city,
                hq_state=c.hq_state,
                lead_score=c.lead_score,
                lifecycle_status=c.lifecycle_status,
                contact_count=count_map.get(c.id, 0),
                last_activity_at=last[0] if last else None,
                last_activity_type=last[1] if last else None,
                days_since_last_activity=_days_since(reference),
            )
        )
    company_leads.sort(key=lambda l: (l.lead_score is None, -(l.lead_score or 0)))

    return LeadsResponse(contact_leads=contact_leads, company_leads=company_leads)


def _contact_sort_name(l: ContactLeadResponse) -> str:
    return f"{l.first_name} {l.last_name or ''}".strip().lower()


@router.patch("/contact/{contact_id}/status", response_model=ContactResponse)
def update_contact_lead_status(
    contact_id: int,
    body: ContactStatusUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> ContactResponse:
    contact = db.get(Contact, contact_id)
    if contact is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Contact not found"
        )
    contact.lifecycle_status = body.lifecycle_status
    db.commit()
    db.refresh(contact)
    return _to_response(contact)


@router.patch("/company/{company_id}/status", response_model=CompanyResponse)
def update_company_lead_status(
    company_id: int,
    body: CompanyStatusUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> Company:
    company = db.get(Company, company_id)
    if company is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Company not found"
        )
    company.lifecycle_status = body.lifecycle_status
    db.commit()
    db.refresh(company)
    return company


@router.post("", response_model=ContactResponse, status_code=status.HTTP_201_CREATED)
def add_lead(
    body: AddLead,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> ContactResponse:
    company = get_or_create_company_by_name(db, body.company_name, user.id)
    contact = Contact(
        first_name=body.first_name,
        last_name=body.last_name,
        email=body.email,
        title=body.title,
        phone=body.phone,
        linkedin_url=body.linkedin_url,
        lifecycle_status="Lead",
        company_id=company.id,
        owner_id=user.id,
    )
    db.add(contact)
    db.commit()
    db.refresh(contact)
    return _to_response(contact)
