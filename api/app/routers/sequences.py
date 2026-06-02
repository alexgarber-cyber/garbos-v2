from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from app.core.deps import get_current_user
from app.db import get_db
from app.models.action_chain import ActionChain
from app.models.contact import Contact
from app.models.sequence import Sequence
from app.models.sequence_step import SequenceStep
from app.models.user import User
from app.routers.chains import (
    ChainResponse,
    OkResponse,
    _resolve_company_id,
    _validate_activity_type,
    _validate_chain_fks,
)
from app.routers.chains import _get_or_404 as _get_chain_or_404
from app.routers.chains import _to_response as _chain_to_response
from app.services.enrollment import (
    RECURRENCE_TYPES,
    build_chain_from_sequence,
)

router = APIRouter()


class SequenceStepCreate(BaseModel):
    activity_type_id: int
    title: str | None = None
    delay_days: int = 0
    message_body: str | None = None
    responsible_party: str = "me"
    note_template: str | None = None
    step_order: int | None = None


class SequenceStepResponse(BaseModel):
    id: int
    sequence_id: int
    step_order: int
    activity_type_id: int
    activity_type_name: str
    title: str | None
    delay_days: int
    message_body: str | None
    responsible_party: str
    note_template: str | None
    created_at: datetime
    updated_at: datetime


class SequenceCreate(BaseModel):
    name: str
    description: str | None = None
    status: str = "active"
    recurrence_type: str = "never"
    recurrence_interval: int = 1
    recurrence_end_date: datetime | None = None
    steps: list[SequenceStepCreate] = []


class SequenceUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    status: str | None = None
    recurrence_type: str | None = None
    recurrence_interval: int | None = None
    recurrence_end_date: datetime | None = None
    steps: list[SequenceStepCreate] | None = None


class SequenceResponse(BaseModel):
    id: int
    name: str
    description: str | None
    status: str
    recurrence_type: str
    recurrence_interval: int
    recurrence_end_date: datetime | None
    owner_id: int | None
    created_at: datetime
    updated_at: datetime
    steps: list[SequenceStepResponse]
    active_enrollment_count: int


class EnrollRequest(BaseModel):
    contact_id: int
    company_id: int | None = None


_EAGER_SEQ = (selectinload(Sequence.steps).selectinload(SequenceStep.activity_type),)


def _get_seq_or_404(db: Session, sequence_id: int) -> Sequence:
    stmt = select(Sequence).where(Sequence.id == sequence_id).options(*_EAGER_SEQ)
    seq = db.scalars(stmt).first()
    if seq is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Sequence not found"
        )
    return seq


def _active_enrollment_count(db: Session, sequence_id: int) -> int:
    return db.scalar(
        select(func.count())
        .select_from(ActionChain)
        .where(
            ActionChain.sequence_id == sequence_id,
            ActionChain.status == "active",
        )
    ) or 0


def _step_to_response(step: SequenceStep) -> SequenceStepResponse:
    return SequenceStepResponse(
        id=step.id,
        sequence_id=step.sequence_id,
        step_order=step.step_order,
        activity_type_id=step.activity_type_id,
        activity_type_name=step.activity_type.name,
        title=step.title,
        delay_days=step.delay_days,
        message_body=step.message_body,
        responsible_party=step.responsible_party,
        note_template=step.note_template,
        created_at=step.created_at,
        updated_at=step.updated_at,
    )


def _to_response(seq: Sequence, enrollment_count: int) -> SequenceResponse:
    return SequenceResponse(
        id=seq.id,
        name=seq.name,
        description=seq.description,
        status=seq.status,
        recurrence_type=seq.recurrence_type,
        recurrence_interval=seq.recurrence_interval,
        recurrence_end_date=seq.recurrence_end_date,
        owner_id=seq.owner_id,
        created_at=seq.created_at,
        updated_at=seq.updated_at,
        steps=[_step_to_response(s) for s in seq.steps],
        active_enrollment_count=enrollment_count,
    )


def _validate_recurrence(recurrence_type: str, recurrence_interval: int) -> None:
    if recurrence_type not in RECURRENCE_TYPES:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Invalid recurrence_type: {recurrence_type!r}",
        )
    if recurrence_interval < 1:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="recurrence_interval must be >= 1",
        )


@router.get("", response_model=list[SequenceResponse])
def list_sequences(
    status: str | None = None,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> list[SequenceResponse]:
    stmt = select(Sequence).options(*_EAGER_SEQ)
    if status is not None:
        stmt = stmt.where(Sequence.status == status)
    stmt = stmt.order_by(Sequence.created_at.desc())
    sequences = db.scalars(stmt).all()

    # One grouped query for active enrollment counts across the whole page.
    count_rows = db.execute(
        select(ActionChain.sequence_id, func.count())
        .where(
            ActionChain.sequence_id.is_not(None),
            ActionChain.status == "active",
        )
        .group_by(ActionChain.sequence_id)
    ).all()
    counts = {seq_id: n for seq_id, n in count_rows}

    return [_to_response(s, counts.get(s.id, 0)) for s in sequences]


@router.post("", response_model=SequenceResponse, status_code=status.HTTP_201_CREATED)
def create_sequence(
    body: SequenceCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> SequenceResponse:
    for step in body.steps:
        _validate_activity_type(db, step.activity_type_id)
    _validate_recurrence(body.recurrence_type, body.recurrence_interval)

    seq = Sequence(
        name=body.name,
        description=body.description,
        status=body.status,
        recurrence_type=body.recurrence_type,
        recurrence_interval=body.recurrence_interval,
        recurrence_end_date=body.recurrence_end_date,
        owner_id=user.id,
    )
    for index, step in enumerate(body.steps, start=1):
        seq.steps.append(
            SequenceStep(
                step_order=step.step_order if step.step_order is not None else index,
                activity_type_id=step.activity_type_id,
                title=step.title,
                delay_days=step.delay_days,
                message_body=step.message_body,
                responsible_party=step.responsible_party,
                note_template=step.note_template,
            )
        )
    db.add(seq)
    db.commit()
    return _to_response(_get_seq_or_404(db, seq.id), 0)


@router.get("/{sequence_id}", response_model=SequenceResponse)
def get_sequence(
    sequence_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> SequenceResponse:
    seq = _get_seq_or_404(db, sequence_id)
    return _to_response(seq, _active_enrollment_count(db, sequence_id))


@router.put("/{sequence_id}", response_model=SequenceResponse)
def update_sequence(
    sequence_id: int,
    body: SequenceUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> SequenceResponse:
    seq = _get_seq_or_404(db, sequence_id)
    data = body.model_dump(exclude_unset=True)

    if "steps" in data:
        steps = body.steps or []
        for step in steps:
            _validate_activity_type(db, step.activity_type_id)
        seq.steps.clear()
        for index, step in enumerate(steps, start=1):
            seq.steps.append(
                SequenceStep(
                    step_order=step.step_order if step.step_order is not None else index,
                    activity_type_id=step.activity_type_id,
                    title=step.title,
                    delay_days=step.delay_days,
                    message_body=step.message_body,
                    responsible_party=step.responsible_party,
                    note_template=step.note_template,
                )
            )
        del data["steps"]

    if "recurrence_type" in data or "recurrence_interval" in data:
        _validate_recurrence(
            data.get("recurrence_type", seq.recurrence_type),
            data.get("recurrence_interval", seq.recurrence_interval),
        )

    for field, value in data.items():
        setattr(seq, field, value)
    db.commit()
    return _to_response(
        _get_seq_or_404(db, sequence_id), _active_enrollment_count(db, sequence_id)
    )


@router.delete("/{sequence_id}", response_model=OkResponse)
def delete_sequence(
    sequence_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> OkResponse:
    """Soft-deactivate — never hard-delete, to preserve enrollment history."""
    seq = _get_seq_or_404(db, sequence_id)
    seq.status = "inactive"
    db.commit()
    return OkResponse(ok=True)


@router.post(
    "/{sequence_id}/enroll",
    response_model=ChainResponse,
    status_code=status.HTTP_201_CREATED,
)
def enroll(
    sequence_id: int,
    body: EnrollRequest,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> ChainResponse:
    seq = _get_seq_or_404(db, sequence_id)
    if seq.status != "active":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Sequence is not active"
        )
    _validate_chain_fks(db, contact_id=body.contact_id, company_id=body.company_id)

    # Prevent double-enrollment: one active chain per contact+sequence.
    existing = db.scalar(
        select(func.count())
        .select_from(ActionChain)
        .where(
            ActionChain.sequence_id == sequence_id,
            ActionChain.contact_id == body.contact_id,
            ActionChain.status == "active",
        )
    )
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Contact already enrolled in this sequence",
        )

    company_id = _resolve_company_id(db, body.contact_id, body.company_id)
    contact = db.get(Contact, body.contact_id)

    chain = build_chain_from_sequence(
        seq,
        contact=contact,
        company_id=company_id,
        owner_id=user.id,
        base_date=datetime.now(timezone.utc),
    )
    db.add(chain)
    db.commit()
    return _chain_to_response(_get_chain_or_404(db, chain.id))
