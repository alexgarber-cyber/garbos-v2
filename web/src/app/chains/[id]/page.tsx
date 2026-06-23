"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import { api } from "@/lib/api/client";
import type { components } from "@/lib/api/schema";
import { DeleteButton } from "@/components/DeleteButton";
import { ResponsibleTag, TypeBadge, formatDue, isOverdue } from "@/components/chainUi";
import {
  Field,
  PageHeader,
  StatusBadge,
  btnPrimary,
  btnSecondary,
  inputClass,
} from "@/components/ui";
import { RichTextContent } from "@/components/RichTextContent";
import { RichTextEditor } from "@/components/RichTextEditor";
import { htmlToNullable } from "@/components/richText";

type Chain = components["schemas"]["ChainResponse"];
type ActivityType = components["schemas"]["ActivityTypeResponse"];

const RESPONSIBLE_PARTIES = ["me", "them", "internal"] as const;

function toLocalInput(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours(),
  )}:${pad(d.getMinutes())}`;
}

export default function ChainDetailPage() {
  const id = Number(useParams().id);
  const [chain, setChain] = useState<Chain | null>(null);
  const [loading, setLoading] = useState(true);
  const [types, setTypes] = useState<ActivityType[]>([]);
  const [busyStep, setBusyStep] = useState<number | null>(null);

  // "What did you send/say?" modal for completing a step.
  const [completingStep, setCompletingStep] = useState<number | null>(null);
  const [message, setMessage] = useState("");

  // Add-step form.
  const [showForm, setShowForm] = useState(false);
  const [typeId, setTypeId] = useState("");
  const [stepTitle, setStepTitle] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [responsible, setResponsible] = useState("me");
  const [note, setNote] = useState("");
  const [savingStep, setSavingStep] = useState(false);

  const load = useCallback(async () => {
    const { data } = await api.GET("/chains/{chain_id}", {
      params: { path: { chain_id: id } },
    });
    setChain(data ?? null);
    setLoading(false);
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    api.GET("/activity-types").then(({ data }) => data && setTypes(data));
  }, []);

  async function completeStep(stepId: number, messageSent: string) {
    setBusyStep(stepId);
    await api.POST("/chains/{chain_id}/steps/{step_id}/complete", {
      params: { path: { chain_id: id, step_id: stepId } },
      body: { message_sent: messageSent.trim() || null },
    });
    setBusyStep(null);
    setCompletingStep(null);
    setMessage("");
    load();
  }

  function openForm() {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    setTypeId(types[0] ? String(types[0].id) : "");
    setStepTitle("");
    setDueDate(toLocalInput(tomorrow));
    setResponsible("me");
    setNote("");
    setShowForm(true);
  }

  async function addStep(e: React.FormEvent) {
    e.preventDefault();
    setSavingStep(true);
    const res = await api.POST("/chains/{chain_id}/steps", {
      params: { path: { chain_id: id } },
      body: {
        activity_type_id: Number(typeId),
        title: stepTitle.trim() || null,
        due_date: new Date(dueDate).toISOString(),
        responsible_party: responsible,
        note: htmlToNullable(note),
      },
    });
    setSavingStep(false);
    if (!res.error) {
      setShowForm(false);
      load();
    }
  }

  if (loading) return <p className="text-[var(--color-muted)]">Loading…</p>;
  if (!chain)
    return (
      <div>
        <p className="text-[var(--color-muted)]">Chain not found.</p>
        <Link href="/chains" className="text-sm text-[var(--color-accent)]">
          ← Back to chains
        </Link>
      </div>
    );

  return (
    <div className="max-w-3xl">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <Link href="/chains" className="text-sm text-[var(--color-muted)]">
            ← Chains
          </Link>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold tracking-tight">{chain.title}</h1>
            <StatusBadge status={chain.status} />
          </div>
        </div>
        <DeleteButton resource="chain" id={chain.id} redirectTo="/chains" />
      </div>

      <section className="rounded-[var(--radius-base)] border border-[var(--color-border)] p-6">
        <dl className="grid grid-cols-2 gap-x-8 gap-y-4">
          <div>
            <dt className="text-xs font-medium text-[var(--color-muted)]">Contact</dt>
            <dd className="text-sm">
              {chain.contact_id ? (
                <Link
                  href={`/contacts/${chain.contact_id}`}
                  className="text-[var(--color-accent)]"
                >
                  {chain.contact_name ?? "View contact"}
                </Link>
              ) : (
                "—"
              )}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-medium text-[var(--color-muted)]">Company</dt>
            <dd className="text-sm">
              {chain.company_id ? (
                <Link
                  href={`/companies/${chain.company_id}`}
                  className="text-[var(--color-accent)]"
                >
                  {chain.company_name ?? "View company"}
                </Link>
              ) : (
                "—"
              )}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-medium text-[var(--color-muted)]">Deal</dt>
            <dd className="text-sm">
              {chain.deal_id ? (
                <Link
                  href={`/deals/${chain.deal_id}`}
                  className="text-[var(--color-accent)]"
                >
                  View deal
                </Link>
              ) : (
                "—"
              )}
            </dd>
          </div>
          {chain.close_reason && (
            <div className="col-span-2">
              <dt className="text-xs font-medium text-[var(--color-muted)]">Close reason</dt>
              <dd className="text-sm">{chain.close_reason}</dd>
            </div>
          )}
        </dl>
      </section>

      <section className="mt-8">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold tracking-tight">Steps</h2>
          {!showForm && (
            <button type="button" className={btnPrimary} onClick={openForm}>
              + Add step
            </button>
          )}
        </div>

        {showForm && (
          <form
            onSubmit={addStep}
            className="mb-4 flex flex-col gap-4 rounded-[var(--radius-base)] border border-[var(--color-border)] p-4"
          >
            <div className="grid grid-cols-2 gap-4">
              <Field label="Activity type *">
                <select
                  className={`${inputClass} w-full`}
                  value={typeId}
                  onChange={(e) => setTypeId(e.target.value)}
                  required
                >
                  {types.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Due *">
                <input
                  type="datetime-local"
                  className={`${inputClass} w-full`}
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  required
                />
              </Field>
              <Field label="Title">
                <input
                  className={`${inputClass} w-full`}
                  value={stepTitle}
                  onChange={(e) => setStepTitle(e.target.value)}
                />
              </Field>
              <Field label="Responsible">
                <select
                  className={`${inputClass} w-full`}
                  value={responsible}
                  onChange={(e) => setResponsible(e.target.value)}
                >
                  {RESPONSIBLE_PARTIES.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            <Field label="Note">
              <RichTextEditor value={note} onChange={setNote} />
            </Field>
            <div className="flex items-center gap-3">
              <button type="submit" disabled={savingStep} className={btnPrimary}>
                {savingStep ? "Saving…" : "Add step"}
              </button>
              <button
                type="button"
                className={btnSecondary}
                onClick={() => setShowForm(false)}
              >
                Cancel
              </button>
            </div>
          </form>
        )}

        <ol className="overflow-hidden rounded-[var(--radius-base)] border border-[var(--color-border)]">
          {chain.steps.map((step) => {
            const overdue = !step.completed && isOverdue(step.due_date);
            return (
              <li
                key={step.id}
                className="flex items-start justify-between gap-4 border-t border-[var(--color-border)] px-4 py-3 first:border-t-0"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm text-[var(--color-muted)]">
                      {step.step_order}.
                    </span>
                    <span
                      className={`text-sm font-medium ${
                        step.completed ? "text-[var(--color-muted)] line-through" : ""
                      }`}
                    >
                      {step.title ?? step.activity_type_name}
                    </span>
                    <TypeBadge name={step.activity_type_name} />
                    <ResponsibleTag party={step.responsible_party} />
                    <span
                      className={`text-xs ${overdue ? "font-medium text-red-600" : "text-[var(--color-muted)]"}`}
                    >
                      {step.completed
                        ? `Done ${step.completed_at ? formatDue(step.completed_at) : ""}`
                        : formatDue(step.due_date)}
                    </span>
                  </div>
                  <RichTextContent html={step.note} className="mt-1" />
                  {step.advances_stage_to && (
                    <p className="mt-1 text-xs text-[var(--color-muted)]">
                      Advances deal → {step.advances_stage_to}
                    </p>
                  )}
                </div>
                {!step.completed && (
                  <button
                    type="button"
                    disabled={busyStep === step.id}
                    onClick={() => {
                      setMessage("");
                      setCompletingStep(step.id);
                    }}
                    className={`shrink-0 ${btnPrimary}`}
                  >
                    {busyStep === step.id ? "…" : "Done"}
                  </button>
                )}
              </li>
            );
          })}
        </ol>
      </section>

      {completingStep !== null && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => completingStep !== busyStep && setCompletingStep(null)}
        >
          <div
            className="w-full max-w-md rounded-[var(--radius-base)] border border-[var(--color-border)] bg-[var(--color-bg)] p-6 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-lg font-semibold tracking-tight">What did you send/say?</h2>
            <p className="mt-1 text-sm text-[var(--color-muted)]">
              Optional — capture the message for this step’s record.
            </p>
            <textarea
              autoFocus
              className={`${inputClass} mt-3 w-full`}
              rows={5}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Paste or summarize what you sent…"
            />
            <div className="mt-4 flex items-center justify-end gap-3">
              <button
                type="button"
                className={btnSecondary}
                disabled={busyStep === completingStep}
                onClick={() => completeStep(completingStep, "")}
              >
                Skip
              </button>
              <button
                type="button"
                className={btnPrimary}
                disabled={busyStep === completingStep}
                onClick={() => completeStep(completingStep, message)}
              >
                {busyStep === completingStep ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
