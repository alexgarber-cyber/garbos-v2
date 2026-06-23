from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from app.core.dates import roll_to_weekday
from app.core.deps import get_current_user
from app.db import get_db
from app.models.action_chain import ActionChain
from app.models.activity import Activity
from app.models.activity_type import ActivityType
from app.models.chain_step import ChainStep
from app.models.company import Company
from app.models.contact import Contact
from app.models.deal import Deal
from app.models.pipeline_stage import PipelineStage
from app.models.sequence import Sequence
from app.models.user import User

router = APIRouter()


class ChainStepCreate(BaseModel):
    activity_type_id: int
    title: str | None = None
    due_date: datetime
    note: str | None = None
    responsible_party: str = "me"
    advances_stage_to: str | None = None
    step_order: int | None = None


class ChainStepResponse(BaseModel):
    id: int
    chain_id: int
    step_order: int
    activity_type_id: int
    activity_type_name: str
    title: str | None
    due_date: datetime
    note: str | None
    completed: bool
    completed_at: datetime | None
    responsible_party: str
    advances_stage_to: str | None
    created_at: datetime
    updated_at: datetime


class ChainCreate(BaseModel):
    title: str
    contact_id: int | None = None
    company_id: int | None = None
    deal_id: int | None = None
    steps: list[ChainStepCreate] = []


class ChainUpdate(BaseModel):
    title: str | None = None
    status: str | None = None
    close_reason: str | None = None
    contact_id: int | None = None
    company_id: int | None = None
    deal_id: int | None = None


class ChainResponse(BaseModel):
    id: int
    title: str
    status: str
    contact_id: int | None
    contact_name: str | None
    company_id: int | None
    company_name: str | None
    deal_id: int | None
    sequence_id: int | None
    close_reason: str | None
    owner_id: int | None
    created_at: datetime
    updated_at: datetime
    steps: list[ChainStepResponse]


class OkResponse(BaseModel):
    ok: bool


class CompleteStep(BaseModel):
    message_sent: str | None = None


class CancelChain(BaseModel):
    reason: str | None = None


def _contact_name(contact: Contact | None) -> str | None:
    if contact is None:
        return None
    return f"{contact.first_name} {contact.last_name or ''}".strip()


def _step_to_response(step: ChainStep) -> ChainStepResponse:
    return ChainStepResponse(
        id=step.id,
        chain_id=step.chain_id,
        step_order=step.step_order,
        activity_type_id=step.activity_type_id,
        activity_type_name=step.activity_type.name,
        title=step.title,
        due_date=step.due_date,
        note=step.note,
        completed=step.completed,
        completed_at=step.completed_at,
        responsible_party=step.responsible_party,
        advances_stage_to=step.advances_stage_to,
        created_at=step.created_at,
        updated_at=step.updated_at,
    )


def _to_response(chain: ActionChain) -> ChainResponse:
    return ChainResponse(
        id=chain.id,
        title=chain.title,
        status=chain.status,
        contact_id=chain.contact_id,
        contact_name=_contact_name(chain.contact),
        company_id=chain.company_id,
        company_name=chain.company.name if chain.company else None,
        deal_id=chain.deal_id,
        sequence_id=chain.sequence_id,
        close_reason=chain.close_reason,
        owner_id=chain.owner_id,
        created_at=chain.created_at,
        updated_at=chain.updated_at,
        steps=[_step_to_response(s) for s in chain.steps],
    )


_EAGER = (
    selectinload(ActionChain.contact),
    selectinload(ActionChain.company),
    selectinload(ActionChain.steps).selectinload(ChainStep.activity_type),
)


def _get_or_404(db: Session, chain_id: int) -> ActionChain:
    stmt = select(ActionChain).where(ActionChain.id == chain_id).options(*_EAGER)
    chain = db.scalars(stmt).first()
    if chain is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Chain not found")
    return chain


def _validate_chain_fks(
    db: Session,
    *,
    contact_id: int | None,
    company_id: int | None,
    deal_id: int | None = None,
) -> None:
    if contact_id is not None and db.get(Contact, contact_id) is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Contact not found")
    if company_id is not None and db.get(Company, company_id) is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Company not found")
    if deal_id is not None and db.get(Deal, deal_id) is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Deal not found")


def _validate_activity_type(db: Session, activity_type_id: int) -> None:
    if db.get(ActivityType, activity_type_id) is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Activity type not found"
        )


def _resolve_company_id(
    db: Session, contact_id: int | None, company_id: int | None
) -> int | None:
    """Auto-populate company from the contact's company when not given explicitly."""
    if company_id is None and contact_id is not None:
        contact = db.get(Contact, contact_id)
        if contact is not None:
            return contact.company_id
    return company_id


@router.get("", response_model=list[ChainResponse])
def list_chains(
    status: str | None = None,
    contact_id: int | None = None,
    company_id: int | None = None,
    deal_id: int | None = None,
    sequence_id: int | None = None,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> list[ChainResponse]:
    stmt = select(ActionChain).options(*_EAGER)
    if status is not None:
        stmt = stmt.where(ActionChain.status == status)
    if contact_id is not None:
        stmt = stmt.where(ActionChain.contact_id == contact_id)
    if company_id is not None:
        stmt = stmt.where(ActionChain.company_id == company_id)
    if deal_id is not None:
        stmt = stmt.where(ActionChain.deal_id == deal_id)
    if sequence_id is not None:
        stmt = stmt.where(ActionChain.sequence_id == sequence_id)
    stmt = stmt.order_by(ActionChain.created_at.desc())
    return [_to_response(c) for c in db.scalars(stmt).all()]


@router.post("", response_model=ChainResponse, status_code=status.HTTP_201_CREATED)
def create_chain(
    body: ChainCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> ChainResponse:
    _validate_chain_fks(
        db,
        contact_id=body.contact_id,
        company_id=body.company_id,
        deal_id=body.deal_id,
    )
    for step in body.steps:
        _validate_activity_type(db, step.activity_type_id)

    company_id = _resolve_company_id(db, body.contact_id, body.company_id)

    chain = ActionChain(
        title=body.title,
        contact_id=body.contact_id,
        company_id=company_id,
        deal_id=body.deal_id,
        owner_id=user.id,
    )
    for index, step in enumerate(body.steps, start=1):
        chain.steps.append(
            ChainStep(
                step_order=step.step_order if step.step_order is not None else index,
                activity_type_id=step.activity_type_id,
                title=step.title,
                due_date=step.due_date,
                note=step.note,
                responsible_party=step.responsible_party,
                advances_stage_to=step.advances_stage_to,
            )
        )
    db.add(chain)
    db.commit()
    return _to_response(_get_or_404(db, chain.id))


@router.get("/{chain_id}", response_model=ChainResponse)
def get_chain(
    chain_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> ChainResponse:
    return _to_response(_get_or_404(db, chain_id))


@router.put("/{chain_id}", response_model=ChainResponse)
def update_chain(
    chain_id: int,
    body: ChainUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> ChainResponse:
    chain = _get_or_404(db, chain_id)
    data = body.model_dump(exclude_unset=True)
    _validate_chain_fks(
        db,
        contact_id=data.get("contact_id"),
        company_id=data.get("company_id"),
        deal_id=data.get("deal_id"),
    )
    # Re-run company auto-populate when the contact changes without an explicit company.
    if "contact_id" in data and "company_id" not in data:
        data["company_id"] = _resolve_company_id(db, data["contact_id"], None)
    for field, value in data.items():
        setattr(chain, field, value)
    db.commit()
    return _to_response(_get_or_404(db, chain_id))


@router.delete("/{chain_id}", response_model=OkResponse)
def delete_chain(
    chain_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> OkResponse:
    chain = _get_or_404(db, chain_id)
    db.delete(chain)
    db.commit()
    return OkResponse(ok=True)


@router.post("/{chain_id}/steps", response_model=ChainResponse, status_code=status.HTTP_201_CREATED)
def add_step(
    chain_id: int,
    body: ChainStepCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> ChainResponse:
    chain = _get_or_404(db, chain_id)
    _validate_activity_type(db, body.activity_type_id)

    next_order = max((s.step_order for s in chain.steps), default=0) + 1
    chain.steps.append(
        ChainStep(
            step_order=body.step_order if body.step_order is not None else next_order,
            activity_type_id=body.activity_type_id,
            title=body.title,
            due_date=body.due_date,
            note=body.note,
            responsible_party=body.responsible_party,
            advances_stage_to=body.advances_stage_to,
        )
    )
    # Adding a step to a completed chain reopens it.
    if chain.status == "completed":
        chain.status = "active"
    db.commit()
    return _to_response(_get_or_404(db, chain_id))


@router.post("/{chain_id}/cancel", response_model=ChainResponse)
def cancel_chain(
    chain_id: int,
    body: CancelChain | None = None,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> ChainResponse:
    """Cancel a chain — used to remove a contact from a sequence enrollment.

    Records the reason on ``close_reason`` and logs an activity (the chain's
    incomplete steps simply stop appearing as open tasks once it's cancelled).
    """
    chain = _get_or_404(db, chain_id)
    if chain.status == "cancelled":
        return _to_response(chain)

    reason = body.reason if body else None
    chain.status = "cancelled"
    if reason:
        chain.close_reason = reason

    # Log the removal against the contact + company so it surfaces in their feed.
    if chain.contact_id is not None or chain.company_id is not None:
        verb = "Removed from sequence" if chain.sequence_id is not None else "Cancelled"
        note = f"{verb}: {chain.title}" + (f" — {reason}" if reason else "")
        other = db.scalar(select(ActivityType).where(ActivityType.name == "Other"))
        if other is not None:
            db.add(
                Activity(
                    activity_type_id=other.id,
                    contact_id=chain.contact_id,
                    company_id=chain.company_id,
                    note=note,
                    occurred_at=datetime.now(timezone.utc),
                    owner_id=user.id,
                )
            )

    db.commit()
    return _to_response(_get_or_404(db, chain_id))


@router.post("/{chain_id}/steps/{step_id}/complete", response_model=ChainResponse)
def complete_step(
    chain_id: int,
    step_id: int,
    body: CompleteStep | None = None,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> ChainResponse:
    chain = _get_or_404(db, chain_id)
    step = next((s for s in chain.steps if s.id == step_id), None)
    if step is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Step not found")
    if step.completed:
        return _to_response(chain)

    now = datetime.now(timezone.utc)
    step.completed = True
    step.completed_at = now
    _reschedule_remaining_steps(chain, step, now)

    # A deal-linked chain inherits the deal's contact + company so its activity
    # surfaces on every feed even when the chain itself wasn't linked to them.
    deal = db.get(Deal, chain.deal_id) if chain.deal_id is not None else None
    contact_id = chain.contact_id or (deal.primary_contact_id if deal else None)
    company_id = chain.company_id or (deal.company_id if deal else None)

    # Keystone mechanic: completing a step auto-logs an activity against the
    # chain's contact + company (+ deal, when the chain is deal-linked).
    db.add(
        Activity(
            activity_type_id=step.activity_type_id,
            contact_id=contact_id,
            company_id=company_id,
            deal_id=chain.deal_id,
            note=f"Completed: {chain.title} — {step.title or chain.title}",
            message_sent=(body.message_sent if body else None),
            occurred_at=now,
            owner_id=user.id,
        )
    )

    # Stage advancement: a completed step with ``advances_stage_to`` set, on a
    # deal-linked chain, moves the deal to the named pipeline stage (e.g. "term
    # sheet signed → Due Diligence") and logs the change on the deal.
    if step.advances_stage_to and deal is not None:
        target_stage = db.scalar(
            select(PipelineStage).where(PipelineStage.name == step.advances_stage_to)
        )
        if (
            deal is not None
            and target_stage is not None
            and deal.pipeline_stage_id != target_stage.id
        ):
            deal.pipeline_stage_id = target_stage.id
            db.add(
                Activity(
                    activity_type_id=step.activity_type_id,
                    contact_id=deal.primary_contact_id,
                    company_id=deal.company_id,
                    deal_id=deal.id,
                    note=f"Stage → {target_stage.name} (via {chain.title})",
                    occurred_at=now,
                    owner_id=user.id,
                )
            )

    if all(s.completed for s in chain.steps):
        chain.status = "completed"
        _maybe_reenroll(db, chain, now)

    db.commit()
    return _to_response(_get_or_404(db, chain_id))


def _reschedule_remaining_steps(
    chain: ActionChain, completed_step: ChainStep, now: datetime
) -> None:
    """Rebase incomplete steps after ``completed_step`` onto the completion *day*,
    preserving each step's original spacing.

    The new due dates are anchored on the completion date at the canonical due
    time (noon UTC, via :func:`~app.services.enrollment.at_due_time`) and offset
    by whole-day spacing read from each step's current ``due_date`` relative to
    the completed step (ChainStep has no ``delay_days``). Pinning the time-of-day
    keeps a due date on its intended calendar day — using ``now`` verbatim would
    bleed the completion clock-time in and drift the displayed day. Dates that
    land on a weekend then roll forward to the following Monday. Ordering is by
    ``step_order``; earlier/overdue steps are left untouched.
    """
    # Local import: the enrollment service imports this module (see _maybe_reenroll).
    from app.services.enrollment import at_due_time

    anchor = at_due_time(now)
    reference_date = completed_step.due_date.date()
    for s in chain.steps:
        if s.completed or s.step_order <= completed_step.step_order:
            continue
        s.due_date = roll_to_weekday(
            anchor + timedelta(days=(s.due_date.date() - reference_date).days)
        )


def _maybe_reenroll(db: Session, chain: ActionChain, now: datetime) -> None:
    """Auto-re-enroll a contact when they complete a recurring sequence.

    Builds the next enrollment chain immediately, with step due_dates anchored on
    the completion date plus the sequence's recurrence interval. No scheduler:
    the next cycle simply carries future due_dates. Cancelled chains never reach
    here, so manual removal stops recurrence.
    """
    # Local import avoids a circular dependency (the service imports this module).
    from app.services.enrollment import (
        advance_recurrence_date,
        build_chain_from_sequence,
    )

    if chain.sequence_id is None or chain.contact_id is None:
        return
    seq = db.scalars(
        select(Sequence)
        .where(Sequence.id == chain.sequence_id)
        .options(selectinload(Sequence.steps))
    ).first()
    if seq is None or seq.recurrence_type == "never":
        return

    next_base = advance_recurrence_date(now, seq.recurrence_type, seq.recurrence_interval)
    if seq.recurrence_end_date is not None and next_base > seq.recurrence_end_date:
        return

    # Safety: never create a second active chain for the same contact+sequence.
    # Exclude the chain we just completed — the session has autoflush off, so its
    # new "completed" status is not yet visible to this query.
    active_exists = db.scalar(
        select(func.count())
        .select_from(ActionChain)
        .where(
            ActionChain.sequence_id == seq.id,
            ActionChain.contact_id == chain.contact_id,
            ActionChain.status == "active",
            ActionChain.id != chain.id,
        )
    )
    if active_exists:
        return

    db.add(
        build_chain_from_sequence(
            seq,
            contact=chain.contact,
            company_id=chain.company_id,
            owner_id=chain.owner_id,
            base_date=next_base,
        )
    )
