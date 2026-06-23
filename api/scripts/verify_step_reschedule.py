"""Verify completing a step rebases remaining steps onto the completion day.

Builds a throwaway sequence (steps at Day 0 / Day 3 / Day 7), enrolls it, then
exercises ``_reschedule_remaining_steps`` for late, cascade and early
completions. Every generated/rescheduled due date must be (a) normalised to the
canonical due time (noon UTC), (b) rolled off weekends to the next Monday, and
(c) equal to the documented formula. The base uses a non-noon time of day (to
prove the normalisation) and a step that lands on a Sunday (to prove the roll).

    docker compose run --rm api python scripts/verify_step_reschedule.py
"""

from datetime import datetime, timedelta, timezone

from sqlalchemy import select

from app.core.dates import roll_to_weekday
from app.db import SessionLocal
from app.models.activity_type import ActivityType
from app.models.sequence import Sequence
from app.models.sequence_step import SequenceStep
from app.models.user import User
from app.routers.chains import _reschedule_remaining_steps
from app.services.enrollment import DUE_HOUR_UTC, at_due_time, build_chain_from_sequence

DAY = timedelta(days=1)
checks: list[bool] = []


def _check(label: str, actual: datetime, expected: datetime) -> None:
    ok = actual == expected
    checks.append(ok)
    print(f"  [{'OK ' if ok else 'FAIL'}] {label}: {actual.isoformat()} (expected {expected.isoformat()})")


def _check_invariants(label: str, dt: datetime) -> None:
    noon = (dt.hour, dt.minute, dt.second, dt.microsecond) == (DUE_HOUR_UTC, 0, 0, 0)
    weekday = dt.weekday() < 5
    checks.append(noon and weekday)
    print(f"  [{'OK ' if noon and weekday else 'FAIL'}] {label} noon+weekday: {dt:%a %Y-%m-%d %H:%M} (noon={noon}, weekday={weekday})")


def _make_seq(db) -> Sequence:
    owner = db.scalar(select(User))
    activity_type = db.scalar(select(ActivityType))
    if owner is None or activity_type is None:
        raise SystemExit("Need at least one user and one activity_type; run the seed first.")
    # delay_days relative to the previous step: 0, 3, 4 -> cumulative 0 / 3 / 7.
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
    return seq


def main() -> None:
    with SessionLocal() as db:
        seq = _make_seq(db)
        owner_id = seq.owner_id

        # Thursday base at a non-noon time. Day 3 lands on Sun 2026-01-04 -> rolls to Mon.
        base = datetime(2026, 1, 1, 9, 37, tzinfo=timezone.utc)
        noon = at_due_time(base)
        chain = build_chain_from_sequence(
            seq, contact=None, company_id=None, owner_id=owner_id, base_date=base
        )
        s0, s3, s7 = chain.steps

        print(f"Enrollment (base {base:%a %Y-%m-%d %H:%M} -> noon UTC + weekend-roll):")
        for s, cum in ((s0, 0), (s3, 3), (s7, 7)):
            _check(f"Day {cum} = roll(noon + {cum}d)", s.due_date, roll_to_weekday(noon + cum * DAY))
            _check_invariants(f"Day {cum}", s.due_date)
        # Headline: Day 3 (Sun Jan 4) must roll to Mon Jan 5 at noon.
        _check("Day 3 rolled Sun->Mon", s3.due_date, datetime(2026, 1, 5, 12, tzinfo=timezone.utc))

        # ----- Late completion of Day 0, at a non-noon time -----
        now_late = base + 5 * DAY  # Tue 2026-01-06 09:37
        pre = {s.step_order: s.due_date for s in chain.steps}
        ref = s0.due_date.date()
        s0.completed = True
        s0.completed_at = now_late
        _reschedule_remaining_steps(chain, s0, now_late)
        anchor = at_due_time(now_late)

        print(f"\nAfter completing Day 0 late (now {now_late:%a %Y-%m-%d %H:%M}):")
        _check("Day 0 unchanged", s0.due_date, pre[s0.step_order])
        for s in (s3, s7):
            exp = roll_to_weekday(anchor + (pre[s.step_order].date() - ref).days * DAY)
            _check("rebased onto completion day", s.due_date, exp)
            _check_invariants("rescheduled step", s.due_date)
        # Headline: Day 3 -> anchor(Jan 6) + 4d = Sat Jan 10 -> rolls to Mon Jan 12.
        _check("Day 3 rebased+rolled to Mon", s3.due_date, datetime(2026, 1, 12, 12, tzinfo=timezone.utc))

        # ----- Early completion (kept rebase behaviour) on a fresh chain -----
        base2 = datetime(2026, 3, 2, 15, 20, tzinfo=timezone.utc)  # Monday
        chain2 = build_chain_from_sequence(
            seq, contact=None, company_id=None, owner_id=owner_id, base_date=base2
        )
        b0, b3, b7 = chain2.steps
        now_early = base2 - 4 * DAY  # completed well before due
        pre2 = {s.step_order: s.due_date for s in chain2.steps}
        ref2 = b0.due_date.date()
        b0.completed = True
        b0.completed_at = now_early
        _reschedule_remaining_steps(chain2, b0, now_early)
        anchor2 = at_due_time(now_early)

        print(f"\nEarly completion (now {now_early:%a %Y-%m-%d}); later steps pull toward it:")
        for s in (b3, b7):
            exp = roll_to_weekday(anchor2 + (pre2[s.step_order].date() - ref2).days * DAY)
            _check("pulled toward completion day", s.due_date, exp)
            _check_invariants("rescheduled step", s.due_date)

        db.rollback()  # discard the throwaway sequence/chains

    passed = sum(checks)
    ok = passed == len(checks)
    print(f"\nRESULT: {passed}/{len(checks)} checks passed —", "ALL PASSED" if ok else "SOME FAILED")
    if not ok:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
