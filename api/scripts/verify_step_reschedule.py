"""Verify that completing a step rebases remaining steps onto the completion time.

Builds a throwaway sequence (steps at Day 0 / Day 3 / Day 7), enrolls it into a
chain, then exercises ``_reschedule_remaining_steps`` for a late completion and a
cascade. Runs entirely inside one transaction that is rolled back at the end, so it
leaves no data behind and is re-runnable.

    docker compose run --rm api python scripts/verify_step_reschedule.py
"""

from datetime import datetime, timedelta, timezone

from sqlalchemy import select

from app.db import SessionLocal
from app.models.activity_type import ActivityType
from app.models.sequence import Sequence
from app.models.sequence_step import SequenceStep
from app.models.user import User
from app.routers.chains import _reschedule_remaining_steps
from app.services.enrollment import build_chain_from_sequence

DAY = timedelta(days=1)


def _check(label: str, actual: datetime, expected: datetime) -> bool:
    ok = actual == expected
    mark = "OK " if ok else "FAIL"
    print(f"  [{mark}] {label}: {actual.isoformat()} (expected {expected.isoformat()})")
    return ok


def main() -> None:
    with SessionLocal() as db:
        owner = db.scalar(select(User))
        activity_type = db.scalar(select(ActivityType))
        if owner is None or activity_type is None:
            print("Need at least one user and one activity_type; run the seed first.")
            return

        # delay_days are relative to the previous step: 0, 3, 4 -> cumulative 0/3/7.
        seq = Sequence(name="__verify_step_reschedule__", owner_id=owner.id)
        for order, delay in enumerate((0, 3, 4)):
            seq.steps.append(
                SequenceStep(
                    step_order=order,
                    activity_type_id=activity_type.id,
                    title=f"Day {[0, 3, 7][order]} step",
                    delay_days=delay,
                )
            )
        db.add(seq)
        db.flush()  # assign ids; never committed

        base = datetime(2026, 1, 1, tzinfo=timezone.utc)
        chain = build_chain_from_sequence(
            seq, contact=None, company_id=None, owner_id=owner.id, base_date=base
        )
        step0, step3, step7 = chain.steps
        ok = True

        print("Initial due dates (base = 2026-01-01):")
        ok &= _check("Day 0", step0.due_date, base)
        ok &= _check("Day 3", step3.due_date, base + 3 * DAY)
        ok &= _check("Day 7", step7.due_date, base + 7 * DAY)

        # Complete the Day 0 step 5 days late.
        now_late = base + 5 * DAY
        step0.completed = True
        step0.completed_at = now_late
        _reschedule_remaining_steps(chain, step0, now_late)

        print("\nAfter completing Day 0 step 5 days late (now = base + 5d):")
        ok &= _check("Day 0 (unchanged)", step0.due_date, base)
        ok &= _check("Day 3 -> now+3d", step3.due_date, now_late + 3 * DAY)
        ok &= _check("Day 7 -> now+7d", step7.due_date, now_late + 7 * DAY)

        # Cascade: complete the (rescheduled) Day 3 step 2 days after the first.
        now_late2 = now_late + 2 * DAY
        day3_due_before = step3.due_date
        step3.completed = True
        step3.completed_at = now_late2
        _reschedule_remaining_steps(chain, step3, now_late2)

        print("\nAfter completing Day 3 step (cascade, now = prev + 2d):")
        ok &= _check("Day 0 (unchanged)", step0.due_date, base)
        ok &= _check("Day 3 (unchanged)", step3.due_date, day3_due_before)
        # Original 3->7 spacing is 4 days, preserved relative to the completion.
        ok &= _check("Day 7 -> now+4d", step7.due_date, now_late2 + 4 * DAY)

        db.rollback()  # discard the throwaway sequence/chain

        print("\nRESULT:", "ALL CHECKS PASSED" if ok else "SOME CHECKS FAILED")


if __name__ == "__main__":
    main()
