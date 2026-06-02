"""Shared enrollment helpers.

Lives outside the routers so both ``sequences`` (initial enrollment) and
``chains`` (auto-re-enrollment of recurring sequences) can reuse the chain
builder and recurrence date math without a circular import.
"""

from datetime import datetime, timedelta

from app.models.action_chain import ActionChain
from app.models.chain_step import ChainStep
from app.models.contact import Contact
from app.models.sequence import Sequence
from app.models.sequence_step import SequenceStep
from app.routers.chains import _contact_name

RECURRENCE_TYPES = (
    "never",
    "daily",
    "weekly",
    "monthly",
    "quarterly",
    "yearly",
)

# How many months each non-day-based cadence advances per interval unit.
_MONTHS_PER_UNIT = {"monthly": 1, "quarterly": 3, "yearly": 12}


def build_note(step: SequenceStep) -> str | None:
    """Concatenate the non-empty of note_template and message_body."""
    parts = [p for p in (step.note_template, step.message_body) if p]
    return "\n\n".join(parts) if parts else None


def build_chain_from_sequence(
    seq: Sequence,
    *,
    contact: Contact | None,
    company_id: int | None,
    owner_id: int | None,
    base_date: datetime,
) -> ActionChain:
    """Build (but do not persist) an ActionChain enrollment from a sequence.

    Step ``due_date``s are ``base_date`` plus the cumulative ``delay_days`` of
    each sequence step (day 0 = ``base_date``).
    """
    chain = ActionChain(
        title=f"{seq.name} — {_contact_name(contact)}",
        sequence_id=seq.id,
        contact_id=contact.id if contact else None,
        company_id=company_id,
        owner_id=owner_id,
    )
    cumulative = 0
    for step in seq.steps:
        cumulative += step.delay_days
        chain.steps.append(
            ChainStep(
                step_order=step.step_order,
                activity_type_id=step.activity_type_id,
                title=step.title,
                due_date=base_date + timedelta(days=cumulative),
                note=build_note(step),
                responsible_party=step.responsible_party,
            )
        )
    return chain


def _add_months(base: datetime, months: int) -> datetime:
    """Add ``months`` to ``base``, clamping the day on month overflow.

    e.g. Jan 31 + 1 month -> Feb 28 (or 29 in a leap year).
    """
    month_index = base.month - 1 + months
    year = base.year + month_index // 12
    month = month_index % 12 + 1
    # Last day of the target month.
    if month == 12:
        next_month_first = base.replace(year=year + 1, month=1, day=1)
    else:
        next_month_first = base.replace(year=year, month=month + 1, day=1)
    last_day = (next_month_first - timedelta(days=1)).day
    return base.replace(year=year, month=month, day=min(base.day, last_day))


def advance_recurrence_date(
    base: datetime, recurrence_type: str, interval: int
) -> datetime:
    """Return the next enrollment date for a recurring sequence."""
    interval = max(1, interval)
    if recurrence_type == "daily":
        return base + timedelta(days=interval)
    if recurrence_type == "weekly":
        return base + timedelta(weeks=interval)
    months = _MONTHS_PER_UNIT.get(recurrence_type)
    if months is not None:
        return _add_months(base, months * interval)
    raise ValueError(f"Cannot advance non-recurring type: {recurrence_type!r}")
