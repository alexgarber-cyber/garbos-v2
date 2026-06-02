from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.deps import get_current_user
from app.db import get_db
from app.models.deal import Deal
from app.models.pipeline_stage import PipelineStage
from app.models.user import User

router = APIRouter()


class PipelineStageCreate(BaseModel):
    name: str
    display_order: int | None = None
    is_terminal: bool = False


class PipelineStageUpdate(BaseModel):
    name: str | None = None
    display_order: int | None = None
    is_terminal: bool | None = None


class PipelineStageReorder(BaseModel):
    ordered_ids: list[int]


class PipelineStageResponse(BaseModel):
    id: int
    name: str
    display_order: int
    is_terminal: bool
    is_system: bool
    created_at: datetime

    model_config = {"from_attributes": True}


class OkResponse(BaseModel):
    ok: bool


def _get_or_404(db: Session, stage_id: int) -> PipelineStage:
    stage = db.get(PipelineStage, stage_id)
    if stage is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Pipeline stage not found"
        )
    return stage


@router.get("", response_model=list[PipelineStageResponse])
def list_pipeline_stages(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> list[PipelineStage]:
    stmt = select(PipelineStage).order_by(PipelineStage.display_order)
    return list(db.scalars(stmt).all())


@router.post("", response_model=PipelineStageResponse, status_code=status.HTTP_201_CREATED)
def create_pipeline_stage(
    body: PipelineStageCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> PipelineStage:
    if db.scalar(select(PipelineStage).where(PipelineStage.name == body.name)):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Stage name already exists"
        )
    display_order = body.display_order
    if display_order is None:
        current_max = db.scalar(select(func.max(PipelineStage.display_order))) or 0
        display_order = current_max + 1
    stage = PipelineStage(
        name=body.name,
        display_order=display_order,
        is_terminal=body.is_terminal,
    )
    db.add(stage)
    db.commit()
    db.refresh(stage)
    return stage


@router.put("/reorder", response_model=list[PipelineStageResponse])
def reorder_pipeline_stages(
    body: PipelineStageReorder,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> list[PipelineStage]:
    stages = {s.id: s for s in db.scalars(select(PipelineStage)).all()}
    for order, stage_id in enumerate(body.ordered_ids, start=1):
        stage = stages.get(stage_id)
        if stage is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Pipeline stage {stage_id} not found",
            )
        stage.display_order = order
    db.commit()
    stmt = select(PipelineStage).order_by(PipelineStage.display_order)
    return list(db.scalars(stmt).all())


@router.put("/{stage_id}", response_model=PipelineStageResponse)
def update_pipeline_stage(
    stage_id: int,
    body: PipelineStageUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> PipelineStage:
    stage = _get_or_404(db, stage_id)
    data = body.model_dump(exclude_unset=True)
    new_name = data.get("name")
    if new_name is not None and new_name != stage.name:
        if db.scalar(select(PipelineStage).where(PipelineStage.name == new_name)):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST, detail="Stage name already exists"
            )
    for field, value in data.items():
        setattr(stage, field, value)
    db.commit()
    db.refresh(stage)
    return stage


@router.delete("/{stage_id}", response_model=OkResponse)
def delete_pipeline_stage(
    stage_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> OkResponse:
    stage = _get_or_404(db, stage_id)
    if stage.is_system:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot delete a built-in pipeline stage",
        )
    deal_count = db.scalar(
        select(func.count()).select_from(Deal).where(Deal.pipeline_stage_id == stage_id)
    )
    if deal_count:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Cannot delete stage: {deal_count} deal(s) still in this stage",
        )
    db.delete(stage)
    db.commit()
    return OkResponse(ok=True)
