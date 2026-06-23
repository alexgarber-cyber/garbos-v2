"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { api } from "@/lib/api/client";
import type { components } from "@/lib/api/schema";
import { Field, btnPrimary, btnSecondary, inputClass } from "@/components/ui";
import { RichTextEditor } from "@/components/RichTextEditor";
import { htmlToNullable } from "@/components/richText";

type Sequence = components["schemas"]["SequenceResponse"];
type ActivityType = components["schemas"]["ActivityTypeResponse"];

const RESPONSIBLE_PARTIES = ["me", "them", "internal"] as const;
const STATUSES = ["active", "inactive"] as const;
const RECURRENCE_TYPES = [
  "never",
  "daily",
  "weekly",
  "monthly",
  "quarterly",
  "yearly",
] as const;
// Plural unit label for the "every N …" interval input.
const RECURRENCE_UNITS: Record<string, string> = {
  daily: "days",
  weekly: "weeks",
  monthly: "months",
  quarterly: "quarters",
  yearly: "years",
};

type StepDraft = {
  activity_type_id: string;
  title: string;
  delay_days: string;
  message_body: string;
  responsible_party: string;
  note_template: string;
};

function blankStep(typeId: string, delayDays = "0"): StepDraft {
  return {
    activity_type_id: typeId,
    title: "",
    delay_days: delayDays,
    message_body: "",
    responsible_party: "me",
    note_template: "",
  };
}

export function SequenceForm({ initial }: { initial?: Sequence }) {
  const router = useRouter();
  const [types, setTypes] = useState<ActivityType[]>([]);

  const [name, setName] = useState(initial?.name ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [status, setStatus] = useState(initial?.status ?? "active");
  const [recurrenceType, setRecurrenceType] = useState(
    initial?.recurrence_type ?? "never",
  );
  const [recurrenceInterval, setRecurrenceInterval] = useState(
    String(initial?.recurrence_interval ?? 1),
  );
  const [recurrenceEndDate, setRecurrenceEndDate] = useState(
    initial?.recurrence_end_date ? initial.recurrence_end_date.slice(0, 10) : "",
  );
  const [steps, setSteps] = useState<StepDraft[]>(
    initial
      ? initial.steps.map((s) => ({
          activity_type_id: String(s.activity_type_id),
          title: s.title ?? "",
          delay_days: String(s.delay_days),
          message_body: s.message_body ?? "",
          responsible_party: s.responsible_party,
          note_template: s.note_template ?? "",
        }))
      : [],
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.GET("/activity-types").then(({ data }) => {
      if (data) {
        setTypes(data);
        // Seed one blank step on the create form once types are available.
        setSteps((prev) =>
          prev.length === 0 && !initial
            ? [blankStep(data[0] ? String(data[0].id) : "")]
            : prev,
        );
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function typeName(id: string): string {
    return types.find((t) => String(t.id) === id)?.name ?? "";
  }

  function updateStep(index: number, patch: Partial<StepDraft>) {
    setSteps((prev) => prev.map((s, i) => (i === index ? { ...s, ...patch } : s)));
  }

  function addStep() {
    setSteps((prev) => [...prev, blankStep(types[0] ? String(types[0].id) : "")]);
  }

  function removeStep(index: number) {
    setSteps((prev) => prev.filter((_, i) => i !== index));
  }

  function moveStep(index: number, dir: -1 | 1) {
    setSteps((prev) => {
      const target = index + dir;
      if (target < 0 || target >= prev.length) return prev;
      const next = [...prev];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  // Cumulative timeline: running sum of delay_days, matching enrollment math.
  let cumulative = 0;
  const timeline = steps.map((s) => {
    cumulative += Number(s.delay_days) || 0;
    return { day: cumulative, label: s.title.trim() || typeName(s.activity_type_id) };
  });

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (steps.length === 0) {
      setError("Add at least one step");
      return;
    }
    setBusy(true);
    setError(null);

    const recurrence = {
      recurrence_type: recurrenceType,
      recurrence_interval:
        recurrenceType === "never" ? 1 : Math.max(1, Number(recurrenceInterval) || 1),
      // Treat the end date as inclusive (end of that day).
      recurrence_end_date:
        recurrenceType !== "never" && recurrenceEndDate
          ? `${recurrenceEndDate}T23:59:59Z`
          : null,
    };

    const stepBodies = steps.map((s, i) => ({
      step_order: i + 1,
      activity_type_id: Number(s.activity_type_id),
      title: s.title.trim() || null,
      delay_days: Number(s.delay_days) || 0,
      message_body: htmlToNullable(s.message_body),
      responsible_party: s.responsible_party,
      note_template: htmlToNullable(s.note_template),
    }));

    const res = initial
      ? await api.PUT("/sequences/{sequence_id}", {
          params: { path: { sequence_id: initial.id } },
          body: {
            name: name.trim(),
            description: htmlToNullable(description),
            status,
            ...recurrence,
            steps: stepBodies,
          },
        })
      : await api.POST("/sequences", {
          body: {
            name: name.trim(),
            description: htmlToNullable(description),
            status,
            ...recurrence,
            steps: stepBodies,
          },
        });

    setBusy(false);
    if (res.error || !res.data) {
      setError("Could not save sequence");
      return;
    }
    router.push(`/sequences/${res.data.id}`);
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-5">
      <Field label="Name *">
        <input
          className={`${inputClass} w-full`}
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
        />
      </Field>

      <div className="grid grid-cols-2 gap-4">
        <Field label="Status">
          <select
            className={`${inputClass} w-full`}
            value={status}
            onChange={(e) => setStatus(e.target.value)}
          >
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {s[0].toUpperCase() + s.slice(1)}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Repeats">
          <select
            className={`${inputClass} w-full`}
            value={recurrenceType}
            onChange={(e) => setRecurrenceType(e.target.value)}
          >
            {RECURRENCE_TYPES.map((r) => (
              <option key={r} value={r}>
                {r[0].toUpperCase() + r.slice(1)}
              </option>
            ))}
          </select>
        </Field>
      </div>

      {recurrenceType !== "never" && (
        <div className="grid grid-cols-2 gap-4">
          <Field label={`Every N ${RECURRENCE_UNITS[recurrenceType]}`}>
            <input
              type="number"
              min={1}
              className={`${inputClass} w-full`}
              value={recurrenceInterval}
              onChange={(e) => setRecurrenceInterval(e.target.value)}
            />
          </Field>
          <Field label="Until (optional)">
            <input
              type="date"
              className={`${inputClass} w-full`}
              value={recurrenceEndDate}
              onChange={(e) => setRecurrenceEndDate(e.target.value)}
            />
          </Field>
        </div>
      )}

      <Field label="Description">
        <RichTextEditor value={description} onChange={setDescription} />
      </Field>

      <div>
        <div className="mb-2 flex items-center justify-between">
          <span className="text-sm font-semibold tracking-tight">Steps</span>
          <button type="button" className={btnSecondary} onClick={addStep}>
            + Add step
          </button>
        </div>

        <div className="flex flex-col gap-4">
          {steps.map((step, i) => (
            <div
              key={i}
              className="rounded-[var(--radius-base)] border border-[var(--color-border)] p-4"
            >
              <div className="mb-3 flex items-center justify-between">
                <span className="text-xs font-medium text-[var(--color-muted)]">
                  Step {i + 1}
                </span>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    disabled={i === 0}
                    className="text-xs text-[var(--color-muted)] hover:text-[var(--color-fg)] disabled:opacity-30"
                    onClick={() => moveStep(i, -1)}
                    aria-label="Move step up"
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    disabled={i === steps.length - 1}
                    className="text-xs text-[var(--color-muted)] hover:text-[var(--color-fg)] disabled:opacity-30"
                    onClick={() => moveStep(i, 1)}
                    aria-label="Move step down"
                  >
                    ↓
                  </button>
                  {steps.length > 1 && (
                    <button
                      type="button"
                      className="text-xs text-[var(--color-muted)] hover:text-red-600"
                      onClick={() => removeStep(i)}
                    >
                      Remove
                    </button>
                  )}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <Field label="Activity type *">
                  <select
                    className={`${inputClass} w-full`}
                    value={step.activity_type_id}
                    onChange={(e) => updateStep(i, { activity_type_id: e.target.value })}
                    required
                  >
                    {types.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Delay (days after previous)">
                  <input
                    type="number"
                    min={0}
                    className={`${inputClass} w-full`}
                    value={step.delay_days}
                    onChange={(e) => updateStep(i, { delay_days: e.target.value })}
                  />
                </Field>
                <Field label="Title">
                  <input
                    className={`${inputClass} w-full`}
                    value={step.title}
                    onChange={(e) => updateStep(i, { title: e.target.value })}
                  />
                </Field>
                <Field label="Responsible">
                  <select
                    className={`${inputClass} w-full`}
                    value={step.responsible_party}
                    onChange={(e) =>
                      updateStep(i, { responsible_party: e.target.value })
                    }
                  >
                    {RESPONSIBLE_PARTIES.map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>
              <div className="mt-4 flex flex-col gap-4">
                <Field label="Message body">
                  <RichTextEditor
                    value={step.message_body}
                    onChange={(html) => updateStep(i, { message_body: html })}
                  />
                </Field>
                <Field label="Note template">
                  <RichTextEditor
                    value={step.note_template}
                    onChange={(html) => updateStep(i, { note_template: html })}
                  />
                </Field>
              </div>
            </div>
          ))}
        </div>
      </div>

      {timeline.length > 0 && (
        <div className="rounded-[var(--radius-base)] border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
          <div className="mb-2 text-xs font-semibold text-[var(--color-muted)]">
            Timeline preview
          </div>
          <ol className="flex flex-col gap-1 text-sm">
            {timeline.map((t, i) => (
              <li key={i}>
                <span className="text-[var(--color-muted)]">Day {t.day}:</span>{" "}
                {t.label || <span className="text-[var(--color-muted)]">—</span>}
              </li>
            ))}
          </ol>
        </div>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex items-center gap-3">
        <button type="submit" disabled={busy} className={btnPrimary}>
          {busy ? "Saving…" : initial ? "Save sequence" : "Create sequence"}
        </button>
        <button type="button" className={btnSecondary} onClick={() => router.back()}>
          Cancel
        </button>
      </div>
    </form>
  );
}
