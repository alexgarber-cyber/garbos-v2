"""One-time backfill: recompute incomplete step due_dates for active chains.

New completions already rebase remaining steps at runtime, but chains that existed
before that change still hold their original enrollment-time due_dates. This script
rebases their incomplete steps onto a real anchor, preserving each step's original
spacing (spacing is read from the difference between step due_dates, since
ChainStep has no delay_days):

  * If the chain has completed steps, anchor on the *last* completed step (highest
    ``step_order``): each incomplete step after it becomes
    ``last.completed_at + (step.due_date - last.due_date)``.
  * If no steps are completed yet, anchor on ``chain.created_at``: every step
    becomes ``created_at + (step.due_date - earliest_step.due_date)``.

Only ``status == "active"`` chains are touched. Incomplete steps *before* the last
completed step (out-of-order / overdue) are left as-is.

Self-contained: does not import runtime helpers, so it runs against any deployed
code version.

SAFETY: defaults to a DRY RUN that prints what would change and commits nothing.
Pass ``--apply`` to actually write. Take a database backup before applying.

    # preview (read-only):
    python scripts/backfill_step_due_dates.py
    # apply:
    python scripts/backfill_step_due_dates.py --apply
"""

import sys

from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.db import SessionLocal
from app.models.action_chain import ActionChain


def main() -> None:
    apply = "--apply" in sys.argv[1:]
    mode = "APPLY" if apply else "DRY RUN"
    print(f"=== Backfill incomplete step due_dates ({mode}) ===\n")

    with SessionLocal() as db:
        chains = (
            db.scalars(
                select(ActionChain)
                .where(ActionChain.status == "active")
                .options(selectinload(ActionChain.steps))
            )
            .unique()
            .all()
        )

        chains_changed = 0
        steps_changed = 0

        for chain in chains:
            completed = [s for s in chain.steps if s.completed]
            incomplete = [s for s in chain.steps if not s.completed]
            if not incomplete:
                continue

            before = {s.id: s.due_date for s in chain.steps}

            if completed:
                last = max(completed, key=lambda s: s.step_order)
                if last.completed_at is None:
                    # Defensive: a "completed" step with no timestamp can't anchor.
                    print(f"  [skip] chain {chain.id}: completed step {last.id} has no completed_at")
                    continue
                anchor = last.completed_at
                reference_due = last.due_date
                targets = [s for s in incomplete if s.step_order > last.step_order]
                anchor_desc = f"last completed step #{last.step_order} @ {anchor.isoformat()}"
            else:
                anchor = chain.created_at
                reference_due = min(chain.steps, key=lambda s: s.step_order).due_date
                targets = incomplete
                anchor_desc = f"created_at @ {anchor.isoformat()}"

            for s in targets:
                s.due_date = anchor + (s.due_date - reference_due)

            changed = [s for s in chain.steps if s.due_date != before[s.id]]
            if not changed:
                continue

            chains_changed += 1
            steps_changed += len(changed)
            print(f"chain {chain.id} ({chain.title!r}) — anchor: {anchor_desc}")
            for s in sorted(changed, key=lambda s: s.step_order):
                print(
                    f"    step #{s.step_order} (id={s.id}): "
                    f"{before[s.id].isoformat()} -> {s.due_date.isoformat()}"
                )

        summary = f"{steps_changed} step(s) across {chains_changed} chain(s)"
        if apply:
            db.commit()
            print(f"\n{summary} updated. Committed.")
        else:
            db.rollback()
            print(f"\n{summary} would be updated. Dry run — nothing written. Re-run with --apply.")


if __name__ == "__main__":
    main()
