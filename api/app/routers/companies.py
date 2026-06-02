from datetime import datetime
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.deps import get_current_user
from app.db import get_db
from app.models.company import Company
from app.models.user import User

router = APIRouter()

LifecycleStatus = Literal["Lead", "Prospect", "Opportunity", "Customer", "Closed Lost"]


class CompanyCreate(BaseModel):
    name: str
    domain: str | None = None
    industry: str | None = None
    employee_count: int | None = None
    revenue_range: str | None = None
    hq_city: str | None = None
    hq_state: str | None = None
    hq_country: str | None = None
    description: str | None = None
    phone: str | None = None
    lifecycle_status: LifecycleStatus | None = None
    lead_score: int | None = Field(default=None, ge=0, le=100)


class CompanyUpdate(BaseModel):
    name: str | None = None
    domain: str | None = None
    industry: str | None = None
    employee_count: int | None = None
    revenue_range: str | None = None
    hq_city: str | None = None
    hq_state: str | None = None
    hq_country: str | None = None
    description: str | None = None
    phone: str | None = None
    lifecycle_status: LifecycleStatus | None = None
    lead_score: int | None = Field(default=None, ge=0, le=100)


class CompanyResponse(BaseModel):
    id: int
    name: str
    domain: str | None
    industry: str | None
    employee_count: int | None
    revenue_range: str | None
    hq_city: str | None
    hq_state: str | None
    hq_country: str | None
    description: str | None
    phone: str | None
    lifecycle_status: str | None
    lead_score: int | None
    owner_id: int | None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class OkResponse(BaseModel):
    ok: bool


def _get_or_404(db: Session, company_id: int) -> Company:
    company = db.get(Company, company_id)
    if company is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Company not found")
    return company


def get_or_create_company_by_name(
    db: Session, name: str, owner_id: int | None
) -> Company:
    """Find a company by case-insensitive name, or create a bare one (no status).

    Flushes (not commits) so the caller controls the transaction.
    """
    cleaned = name.strip()
    existing = db.scalars(
        select(Company).where(func.lower(Company.name) == cleaned.lower())
    ).first()
    if existing is not None:
        return existing
    company = Company(name=cleaned, lifecycle_status=None, owner_id=owner_id)
    db.add(company)
    db.flush()
    return company


@router.get("", response_model=list[CompanyResponse])
def list_companies(
    name: str | None = None,
    domain: str | None = None,
    industry: str | None = None,
    lifecycle_status: str | None = None,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> list[Company]:
    stmt = select(Company)
    if name:
        stmt = stmt.where(Company.name.ilike(f"%{name}%"))
    if domain:
        stmt = stmt.where(Company.domain.ilike(f"%{domain}%"))
    if industry:
        stmt = stmt.where(Company.industry.ilike(f"%{industry}%"))
    if lifecycle_status:
        stmt = stmt.where(Company.lifecycle_status == lifecycle_status)
    stmt = stmt.order_by(Company.name)
    return list(db.scalars(stmt).all())


@router.post("", response_model=CompanyResponse, status_code=status.HTTP_201_CREATED)
def create_company(
    body: CompanyCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> Company:
    company = Company(**body.model_dump(), owner_id=user.id)
    db.add(company)
    db.commit()
    db.refresh(company)
    return company


@router.get("/{company_id}", response_model=CompanyResponse)
def get_company(
    company_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> Company:
    return _get_or_404(db, company_id)


@router.put("/{company_id}", response_model=CompanyResponse)
def update_company(
    company_id: int,
    body: CompanyUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> Company:
    company = _get_or_404(db, company_id)
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(company, field, value)
    db.commit()
    db.refresh(company)
    return company


@router.delete("/{company_id}", response_model=OkResponse)
def delete_company(
    company_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> OkResponse:
    company = _get_or_404(db, company_id)
    db.delete(company)
    db.commit()
    return OkResponse(ok=True)
