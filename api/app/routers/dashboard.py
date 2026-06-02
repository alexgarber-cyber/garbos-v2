from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from app.core.deps import get_current_user
from app.db import get_db
from app.models.action_chain import ActionChain
from app.models.activity import Activity
from app.models.activity_type import ActivityType
from app.models.chain_step import ChainStep
from app.models.company import Company
from app.models.deal import Deal
from app.models.pipeline_stage import PipelineStage
from app.models.sequence import Sequence
from app.models.user import User
from app.routers.activities import _contact_name

router = APIRouter()

# Canonical lifecycle order (mirrors the literal in routers/companies.py).
_LIFECYCLE_ORDER = ["Lead", "Prospect", "Opportunity", "Customer", "Closed Lost"]
_VALID_PERIODS = {"day", "week", "month", "year"}


# ── Response schemas ──────────────────────────────────────────────────────


class TaskCounts(BaseModel):
    overdue: int
    due_today: int
    due_this_week: int


class DealStageSummary(BaseModel):
    stage_name: str
    count: int
    total_amount: float


class DealSummary(BaseModel):
    by_stage: list[DealStageSummary]
    active_count: int
    pipeline_value: float


class LifecycleBucket(BaseModel):
    status: str
    count: int


class ActivityTypeCount(BaseModel):
    type_name: str
    count: int


class ActivityTimePoint(BaseModel):
    date: str
    count: int


class ActivitySummary(BaseModel):
    by_type: list[ActivityTypeCount]
    over_time: list[ActivityTimePoint]


class RecentCompletion(BaseModel):
    id: int
    activity_type_name: str
    note: str | None
    occurred_at: datetime
    contact_id: int | None
    contact_name: str | None
    company_id: int | None
    company_name: str | None
    deal_id: int | None
    deal_title: str | None


class SequenceStats(BaseModel):
    active_sequences: int
    active_enrollments: int


class DashboardResponse(BaseModel):
    period: str
    task_counts: TaskCounts
    deal_summary: DealSummary
    lifecycle_funnel: list[LifecycleBucket]
    activity_summary: ActivitySummary
    recent_completions: list[RecentCompletion]
    sequence_stats: SequenceStats


# ── Helpers ───────────────────────────────────────────────────────────────


def _period_start(period: str, now: datetime) -> datetime:
    """Calendar-aligned start of the selected period, in UTC."""
    midnight = now.replace(hour=0, minute=0, second=0, microsecond=0)
    if period == "day":
        return midnight
    if period == "week":
        return midnight - timedelta(days=now.weekday())
    if period == "month":
        return midnight.replace(day=1)
    return midnight.replace(month=1, day=1)  # year


def _add_month(dt: datetime) -> datetime:
    if dt.month == 12:
        return dt.replace(year=dt.year + 1, month=1)
    return dt.replace(month=dt.month + 1)


def _activities_over_time(
    db: Session, period: str, period_start: datetime, now: datetime
) -> list[ActivityTimePoint]:
    """Dense (zero-filled) activity counts bucketed by hour/day/month.

    Buckets are computed in Python over UTC-normalised timestamps so the series
    aligns exactly with the UTC period boundaries regardless of the DB session
    time zone, and so the line chart is never degenerate or gappy.
    """
    unit = "hour" if period == "day" else "month" if period == "year" else "day"

    def trunc(ts: datetime) -> datetime:
        ts = ts.astimezone(timezone.utc)
        if unit == "hour":
            return ts.replace(minute=0, second=0, microsecond=0)
        if unit == "month":
            return ts.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        return ts.replace(hour=0, minute=0, second=0, microsecond=0)

    def label(dt: datetime) -> str:
        if unit == "hour":
            return dt.strftime("%Y-%m-%dT%H:00")
        if unit == "month":
            return dt.strftime("%Y-%m")
        return dt.strftime("%Y-%m-%d")

    def step(dt: datetime) -> datetime:
        if unit == "hour":
            return dt + timedelta(hours=1)
        if unit == "month":
            return _add_month(dt)
        return dt + timedelta(days=1)

    timestamps = db.scalars(
        select(Activity.occurred_at).where(Activity.occurred_at >= period_start)
    ).all()
    counts: dict[datetime, int] = {}
    for ts in timestamps:
        key = trunc(ts)
        counts[key] = counts.get(key, 0) + 1

    points: list[ActivityTimePoint] = []
    cursor = trunc(period_start)
    while cursor <= now:
        points.append(ActivityTimePoint(date=label(cursor), count=counts.get(cursor, 0)))
        cursor = step(cursor)
    return points


# ── Endpoint ──────────────────────────────────────────────────────────────


@router.get("", response_model=DashboardResponse)
def get_dashboard(
    period: str = "week",
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> DashboardResponse:
    """Single aggregation feeding the whole Dashboard. No owner filtering —
    matches the all-data view of the other list endpoints."""
    if period not in _VALID_PERIODS:
        period = "week"

    now = datetime.now(timezone.utc)
    period_start = _period_start(period, now)

    # ── task_counts (point-in-time; mirrors routers/tasks.py bucketing) ──
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    tomorrow_start = today_start + timedelta(days=1)
    week_end = today_start + timedelta(days=7)
    incomplete = (
        select(func.count())
        .select_from(ChainStep)
        .join(ActionChain, ChainStep.chain_id == ActionChain.id)
        .where(ChainStep.completed.is_(False))
        .where(ActionChain.status == "active")
    )
    task_counts = TaskCounts(
        overdue=db.scalar(incomplete.where(ChainStep.due_date < today_start)) or 0,
        due_today=db.scalar(
            incomplete.where(
                ChainStep.due_date >= today_start, ChainStep.due_date < tomorrow_start
            )
        )
        or 0,
        due_this_week=db.scalar(
            incomplete.where(
                ChainStep.due_date >= tomorrow_start, ChainStep.due_date < week_end
            )
        )
        or 0,
    )

    # ── deal_summary (point-in-time; all non-terminal stages, incl. empty) ──
    stage_rows = db.execute(
        select(
            PipelineStage.name,
            func.count(Deal.id),
            func.coalesce(func.sum(Deal.amount), 0),
        )
        .outerjoin(Deal, Deal.pipeline_stage_id == PipelineStage.id)
        .where(PipelineStage.is_terminal.is_(False))
        .group_by(PipelineStage.name, PipelineStage.display_order)
        .order_by(PipelineStage.display_order)
    ).all()
    by_stage = [
        DealStageSummary(stage_name=name, count=count, total_amount=float(amount))
        for name, count, amount in stage_rows
    ]
    deal_summary = DealSummary(
        by_stage=by_stage,
        active_count=sum(s.count for s in by_stage),
        pipeline_value=sum(s.total_amount for s in by_stage),
    )

    # ── lifecycle_funnel (point-in-time) ──
    lifecycle_rows = db.execute(
        select(Company.lifecycle_status, func.count()).group_by(Company.lifecycle_status)
    ).all()
    lifecycle_counts = {status: count for status, count in lifecycle_rows}
    lifecycle_funnel = [
        LifecycleBucket(status=s, count=lifecycle_counts.get(s, 0))
        for s in _LIFECYCLE_ORDER
    ]
    # Surface any non-canonical statuses rather than silently dropping them.
    # Companies with no status (NULL) are not in any lifecycle stage — they're
    # just in the system — so they're excluded from the funnel.
    for status, count in lifecycle_counts.items():
        if status is not None and status not in _LIFECYCLE_ORDER:
            lifecycle_funnel.append(LifecycleBucket(status=status, count=count))

    # ── activity_summary (period-scoped) ──
    type_rows = db.execute(
        select(ActivityType.name, func.count(Activity.id))
        .join(Activity, Activity.activity_type_id == ActivityType.id)
        .where(Activity.occurred_at >= period_start)
        .group_by(ActivityType.name)
        .order_by(func.count(Activity.id).desc())
    ).all()
    activity_summary = ActivitySummary(
        by_type=[ActivityTypeCount(type_name=name, count=count) for name, count in type_rows],
        over_time=_activities_over_time(db, period, period_start, now),
    )

    # ── recent_completions (period-scoped feed) ──
    activities = db.scalars(
        select(Activity)
        .where(Activity.occurred_at >= period_start)
        .order_by(Activity.occurred_at.desc())
        .limit(50)
        .options(
            selectinload(Activity.activity_type),
            selectinload(Activity.contact),
            selectinload(Activity.company),
            selectinload(Activity.deal),
        )
    ).all()
    recent_completions = [
        RecentCompletion(
            id=a.id,
            activity_type_name=a.activity_type.name,
            note=a.note,
            occurred_at=a.occurred_at,
            contact_id=a.contact_id,
            contact_name=_contact_name(a.contact),
            company_id=a.company_id,
            company_name=a.company.name if a.company else None,
            deal_id=a.deal_id,
            deal_title=a.deal.title if a.deal else None,
        )
        for a in activities
    ]

    # ── sequence_stats (point-in-time) ──
    sequence_stats = SequenceStats(
        active_sequences=db.scalar(
            select(func.count()).select_from(Sequence).where(Sequence.status == "active")
        )
        or 0,
        active_enrollments=db.scalar(
            select(func.count())
            .select_from(ActionChain)
            .where(ActionChain.status == "active", ActionChain.sequence_id.is_not(None))
        )
        or 0,
    )

    return DashboardResponse(
        period=period,
        task_counts=task_counts,
        deal_summary=deal_summary,
        lifecycle_funnel=lifecycle_funnel,
        activity_summary=activity_summary,
        recent_completions=recent_completions,
        sequence_stats=sequence_stats,
    )
