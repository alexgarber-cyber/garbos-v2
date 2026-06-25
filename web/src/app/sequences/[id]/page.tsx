"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import { api } from "@/lib/api/client";
import type { components } from "@/lib/api/schema";
import { DeleteButton } from "@/components/DeleteButton";
import { ResponsibleTag, TypeBadge } from "@/components/chainUi";
import { StatusBadge, btnSecondary } from "@/components/ui";
import { RichTextContent } from "@/components/RichTextContent";

type Sequence = components["schemas"]["SequenceResponse"];
type Chain = components["schemas"]["ChainResponse"];

const RECURRENCE_UNITS: Record<string, string> = {
  daily: "day",
  weekly: "week",
  monthly: "month",
  quarterly: "quarter",
  yearly: "year",
};

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

/** Human-readable recurrence rule, e.g. "Repeats every 2 weeks until Jun 30, 2027". */
function recurrenceRule(seq: Sequence): string {
  const { recurrence_type: type, recurrence_interval: n } = seq;
  const unit = RECURRENCE_UNITS[type] ?? type;
  const cadence = n === 1 ? `Repeats ${type}` : `Repeats every ${n} ${unit}s`;
  const end = seq.recurrence_end_date
    ? `until ${fmtDate(seq.recurrence_end_date)}`
    : "with no end date";
  return `${cadence} ${end}`;
}

/** Project the next auto-re-enroll date: last step due date + one interval. */
function nextReenroll(seq: Sequence, chain: Chain): string | null {
  if (seq.recurrence_type === "never" || chain.steps.length === 0) return null;
  const last = chain.steps.reduce((max, s) =>
    new Date(s.due_date) > new Date(max.due_date) ? s : max,
  );
  const d = new Date(last.due_date);
  const n = Math.max(1, seq.recurrence_interval);
  switch (seq.recurrence_type) {
    case "daily":
      d.setDate(d.getDate() + n);
      break;
    case "weekly":
      d.setDate(d.getDate() + 7 * n);
      break;
    case "monthly":
      d.setMonth(d.getMonth() + n);
      break;
    case "quarterly":
      d.setMonth(d.getMonth() + 3 * n);
      break;
    case "yearly":
      d.setMonth(d.getMonth() + 12 * n);
      break;
    default:
      return null;
  }
  if (seq.recurrence_end_date && d > new Date(seq.recurrence_end_date)) return null;
  return fmtDate(d.toISOString());
}

export default function SequenceDetailPage() {
  const id = Number(useParams().id);
  const [sequence, setSequence] = useState<Sequence | null>(null);
  const [enrollments, setEnrollments] = useState<Chain[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const { data } = await api.GET("/sequences/{sequence_id}", {
      params: { path: { sequence_id: id } },
    });
    setSequence(data ?? null);
    const { data: chains } = await api.GET("/chains", {
      params: { query: { sequence_id: id } },
    });
    setEnrollments(chains ?? []);
    setLoading(false);
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) return <p className="text-[var(--color-muted)]">Loading…</p>;
  if (!sequence)
    return (
      <div>
        <p className="text-[var(--color-muted)]">Sequence not found.</p>
        <Link href="/sequences" className="text-sm text-[var(--color-accent)]">
          ← Back to sequences
        </Link>
      </div>
    );

  // Cumulative timeline for display, matching enrollment math.
  let cumulative = 0;
  const stepDays = sequence.steps.map((s) => {
    cumulative += s.delay_days;
    return cumulative;
  });

  return (
    <div className="max-w-3xl">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <Link href="/sequences" className="text-sm text-[var(--color-muted)]">
            ← Sequences
          </Link>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold tracking-tight">{sequence.name}</h1>
            <StatusBadge status={sequence.status} />
          </div>
          {sequence.recurrence_type !== "never" && (
            <p className="mt-1 text-sm text-[var(--color-muted)]">
              🔁 {recurrenceRule(sequence)}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Link href={`/sequences/${sequence.id}/edit`} className={btnSecondary}>
            Edit
          </Link>
          <DeleteButton
            resource="sequence"
            id={sequence.id}
            redirectTo="/sequences"
            label="Deactivate"
            confirmLabel="Confirm deactivate"
            armingLabel="Deactivate this sequence?"
          />
        </div>
      </div>

      {sequence.description && (
        <section className="mb-8 rounded-[var(--radius-base)] border border-[var(--color-border)] p-6">
          <dt className="text-xs font-medium text-[var(--color-muted)]">Description</dt>
          <dd className="text-sm">
            <RichTextContent html={sequence.description} />
          </dd>
        </section>
      )}

      <section className="mb-8">
        <h2 className="mb-3 text-lg font-semibold tracking-tight">Steps</h2>
        <ol className="overflow-hidden rounded-[var(--radius-base)] border border-[var(--color-border)]">
          {sequence.steps.map((step, i) => (
            <li
              key={step.id}
              className="flex flex-col gap-1 border-t border-[var(--color-border)] px-4 py-3 first:border-t-0"
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm text-[var(--color-muted)]">{step.step_order}.</span>
                <span className="text-sm font-medium">
                  {step.title ?? step.activity_type_name}
                </span>
                <TypeBadge name={step.activity_type_name} />
                <ResponsibleTag party={step.responsible_party} />
                <span className="text-xs text-[var(--color-muted)]">Day {stepDays[i]}</span>
              </div>
              <RichTextContent html={step.message_body} className="mt-1" />
              <RichTextContent
                html={step.note_template}
                className="mt-1 text-[var(--color-muted)]"
              />
            </li>
          ))}
        </ol>
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold tracking-tight">
          Enrollments{" "}
          <span className="text-sm font-normal text-[var(--color-muted)]">
            ({sequence.active_enrollment_count} active)
          </span>
        </h2>
        <div className="overflow-hidden rounded-[var(--radius-base)] border border-[var(--color-border)]">
          <table className="w-full text-sm">
            <thead className="bg-[var(--color-surface)] text-left text-[var(--color-muted)]">
              <tr>
                <th className="px-4 py-2 font-medium">Contact</th>
                <th className="px-4 py-2 font-medium">Company</th>
                <th className="px-4 py-2 font-medium">Progress</th>
                <th className="px-4 py-2 font-medium">Status</th>
                {sequence.recurrence_type !== "never" && (
                  <th className="px-4 py-2 font-medium">Next re-enroll</th>
                )}
              </tr>
            </thead>
            <tbody>
              {enrollments.length === 0 ? (
                <tr>
                  <td
                    colSpan={sequence.recurrence_type !== "never" ? 5 : 4}
                    className="px-4 py-6 text-center text-[var(--color-muted)]"
                  >
                    No enrollments yet.
                  </td>
                </tr>
              ) : (
                enrollments.map((c) => {
                  const done = c.steps.filter((s) => s.completed).length;
                  return (
                    <tr
                      key={c.id}
                      className="border-t border-[var(--color-border)] hover:bg-[var(--color-surface)]"
                    >
                      <td className="px-4 py-2">
                        <Link
                          href={`/chains/${c.id}`}
                          className="font-medium text-[var(--color-accent)]"
                        >
                          {c.contact_name ?? c.title}
                        </Link>
                      </td>
                      <td className="px-4 py-2 text-[var(--color-muted)]">
                        {c.company_name ?? "—"}
                      </td>
                      <td className="px-4 py-2 text-[var(--color-muted)]">
                        {done}/{c.steps.length}
                      </td>
                      <td className="px-4 py-2">
                        <StatusBadge status={c.status} />
                      </td>
                      {sequence.recurrence_type !== "never" && (
                        <td className="px-4 py-2 text-[var(--color-muted)]">
                          {c.status === "active"
                            ? (nextReenroll(sequence, c) ?? "—")
                            : "—"}
                        </td>
                      )}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
