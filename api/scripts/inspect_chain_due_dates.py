"""Read-only inspection: surface due-date time-of-day drift on chains.

For every chain that has at least one completed step, prints each step's
``due_date`` (with its time-of-day) alongside ``completed_at``. The pre-fix
runtime rescheduler rebased incomplete steps onto ``datetime.now(timezone.utc)``
at the moment of completion, so a step's ``due_date`` inherited the completion
*time of day* — which can shove the due date across a local-midnight boundary
(the Tasks UI buckets by local calendar day) and re-drift on each cascade.

A chain whose steps show more than one distinct due-date time-of-day is evidence
of that drift. This script NEVER writes (it rolls back), so it is safe to run on
production data to confirm the diagnosis before applying any fix.

    docker compose run --rm api python scripts/inspect_chain_due_dates.py
"""

from collections import Counter
from datetime import datetime

from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.db import SessionLocal
from app.models.action_chain import ActionChain


def _hhmm(dt: datetime | None) -> str:
    return dt.strftime("%H:%M:%S") if dt is not None else "—"


def main() -> None:
    print("=== Chain due-date drift inspection (READ-ONLY, no writes) ===\n")
    with SessionLocal() as db:
        chains = (
            db.scalars(
                select(ActionChain)
                .options(selectinload(ActionChain.steps))
                .order_by(ActionChain.id)
            )
            .unique()
            .all()
        )

        inspected = 0
        drifted = 0
        for chain in chains:
            if not any(s.completed for s in chain.steps):
                continue
            inspected += 1
            steps = sorted(chain.steps, key=lambda s: s.step_order)
            distinct_times = Counter(_hhmm(s.due_date) for s in steps)
            has_drift = len(distinct_times) > 1
            drifted += has_drift
            flag = "  ⚠ DRIFT (>1 distinct due time-of-day)" if has_drift else ""
            print(f"chain {chain.id} [{chain.status}] ({chain.title!r}){flag}")
            for s in steps:
                mark = "✓" if s.completed else " "
                print(
                    f"  [{mark}] step #{s.step_order:>2}  "
                    f"due {s.due_date.isoformat()} (t={_hhmm(s.due_date)})  "
                    f"completed_at={s.completed_at.isoformat() if s.completed_at else '—'}"
                )
            print()

        print(
            f"Inspected {inspected} chain(s) with ≥1 completed step; "
            f"{drifted} show due-date time-of-day drift."
        )
        db.rollback()  # never write


if __name__ == "__main__":
    main()
