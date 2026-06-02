from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import or_, select
from sqlalchemy.orm import Session, selectinload

from app.core.deps import get_current_user
from app.db import get_db
from app.models.company import Company
from app.models.contact import Contact
from app.models.user import User
from app.routers.companies import LifecycleStatus

router = APIRouter()


class ContactCreate(BaseModel):
    first_name: str
    last_name: str | None = None
    email: str | None = None
    phone: str | None = None
    mobile: str | None = None
    title: str | None = None
    linkedin_url: str | None = None
    lifecycle_status: LifecycleStatus | None = None
    company_id: int | None = None
    notes: str | None = None


class ContactUpdate(BaseModel):
    first_name: str | None = None
    last_name: str | None = None
    email: str | None = None
    phone: str | None = None
    mobile: str | None = None
    title: str | None = None
    linkedin_url: str | None = None
    lifecycle_status: LifecycleStatus | None = None
    company_id: int | None = None
    notes: str | None = None


class ContactResponse(BaseModel):
    id: int
    first_name: str
    last_name: str | None
    email: str | None
    phone: str | None
    mobile: str | None
    title: str | None
    linkedin_url: str | None
    lifecycle_status: str | None
    company_id: int | None
    company_name: str | None
    notes: str | None
    owner_id: int | None
    created_at: datetime
    updated_at: datetime


class OkResponse(BaseModel):
    ok: bool


def _to_response(contact: Contact) -> ContactResponse:
    return ContactResponse(
        id=contact.id,
        first_name=contact.first_name,
        last_name=contact.last_name,
        email=contact.email,
        phone=contact.phone,
        mobile=contact.mobile,
        title=contact.title,
        linkedin_url=contact.linkedin_url,
        lifecycle_status=contact.lifecycle_status,
        company_id=contact.company_id,
        company_name=contact.company.name if contact.company else None,
        notes=contact.notes,
        owner_id=contact.owner_id,
        created_at=contact.created_at,
        updated_at=contact.updated_at,
    )


def _get_or_404(db: Session, contact_id: int) -> Contact:
    contact = db.get(Contact, contact_id)
    if contact is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Contact not found")
    return contact


@router.get("", response_model=list[ContactResponse])
def list_contacts(
    name: str | None = None,
    email: str | None = None,
    company: str | None = None,
    title: str | None = None,
    company_id: int | None = None,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> list[ContactResponse]:
    stmt = select(Contact).options(selectinload(Contact.company))
    if name:
        stmt = stmt.where(
            or_(
                Contact.first_name.ilike(f"%{name}%"),
                Contact.last_name.ilike(f"%{name}%"),
            )
        )
    if email:
        stmt = stmt.where(Contact.email.ilike(f"%{email}%"))
    if title:
        stmt = stmt.where(Contact.title.ilike(f"%{title}%"))
    if company:
        stmt = stmt.join(Contact.company).where(Company.name.ilike(f"%{company}%"))
    if company_id is not None:
        stmt = stmt.where(Contact.company_id == company_id)
    stmt = stmt.order_by(Contact.first_name, Contact.last_name)
    return [_to_response(c) for c in db.scalars(stmt).all()]


@router.post("", response_model=ContactResponse, status_code=status.HTTP_201_CREATED)
def create_contact(
    body: ContactCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> ContactResponse:
    if body.company_id is not None and db.get(Company, body.company_id) is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Company not found")
    contact = Contact(**body.model_dump(), owner_id=user.id)
    db.add(contact)
    db.commit()
    db.refresh(contact)
    return _to_response(contact)


@router.get("/{contact_id}", response_model=ContactResponse)
def get_contact(
    contact_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> ContactResponse:
    return _to_response(_get_or_404(db, contact_id))


@router.put("/{contact_id}", response_model=ContactResponse)
def update_contact(
    contact_id: int,
    body: ContactUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> ContactResponse:
    contact = _get_or_404(db, contact_id)
    data = body.model_dump(exclude_unset=True)
    if "company_id" in data and data["company_id"] is not None:
        if db.get(Company, data["company_id"]) is None:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Company not found")
    for field, value in data.items():
        setattr(contact, field, value)
    db.commit()
    db.refresh(contact)
    return _to_response(contact)


@router.patch("/{contact_id}/convert-to-lead", response_model=ContactResponse)
def convert_to_lead(
    contact_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> ContactResponse:
    contact = _get_or_404(db, contact_id)
    contact.lifecycle_status = "Lead"
    db.commit()
    db.refresh(contact)
    return _to_response(contact)


@router.delete("/{contact_id}", response_model=OkResponse)
def delete_contact(
    contact_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> OkResponse:
    contact = _get_or_404(db, contact_id)
    db.delete(contact)
    db.commit()
    return OkResponse(ok=True)
