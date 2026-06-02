"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";

import { api } from "@/lib/api/client";
import type { components } from "@/lib/api/schema";
import { Field, PageHeader, btnPrimary, btnSecondary, inputClass } from "@/components/ui";

type Contact = components["schemas"]["ContactResponse"];
type Company = components["schemas"]["CompanyResponse"];
type ActivityType = components["schemas"]["ActivityTypeResponse"];
type Deal = components["schemas"]["DealResponse"];
type PipelineStage = components["schemas"]["PipelineStageResponse"];

const RESPONSIBLE_PARTIES = ["me", "them", "internal"] as const;

// datetime-local wants "YYYY-MM-DDTHH:mm" in local time.
function toLocalInput(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours(),
  )}:${pad(d.getMinutes())}`;
}

type StepDraft = {
  activity_type_id: string;
  title: string;
  due_date: string;
  responsible_party: string;
  note: string;
  advances_stage_to: string;
};

function blankStep(typeId: string): StepDraft {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  return {
    activity_type_id: typeId,
    title: "",
    due_date: toLocalInput(tomorrow),
    responsible_party: "me",
    note: "",
    advances_stage_to: "",
  };
}

function NewChainInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [types, setTypes] = useState<ActivityType[]>([]);
  const [deals, setDeals] = useState<Deal[]>([]);
  const [stages, setStages] = useState<PipelineStage[]>([]);

  const [title, setTitle] = useState("");
  const [contactId, setContactId] = useState("");
  const [companyId, setCompanyId] = useState("");
  const [dealId, setDealId] = useState(searchParams.get("deal_id") ?? "");
  const [steps, setSteps] = useState<StepDraft[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.GET("/contacts").then(({ data }) => data && setContacts(data));
    api.GET("/companies").then(({ data }) => data && setCompanies(data));
    api.GET("/deals").then(({ data }) => data && setDeals(data));
    api.GET("/pipeline-stages").then(({ data }) => data && setStages(data));
    api.GET("/activity-types").then(({ data }) => {
      if (data) {
        setTypes(data);
        setSteps([blankStep(data[0] ? String(data[0].id) : "")]);
      }
    });
  }, []);

  function updateStep(index: number, patch: Partial<StepDraft>) {
    setSteps((prev) => prev.map((s, i) => (i === index ? { ...s, ...patch } : s)));
  }

  function addStep() {
    setSteps((prev) => [...prev, blankStep(types[0] ? String(types[0].id) : "")]);
  }

  function removeStep(index: number) {
    setSteps((prev) => prev.filter((_, i) => i !== index));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (steps.length === 0) {
      setError("Add at least one step");
      return;
    }
    setBusy(true);
    setError(null);

    const body: components["schemas"]["ChainCreate"] = {
      title: title.trim(),
      contact_id: contactId ? Number(contactId) : null,
      company_id: companyId ? Number(companyId) : null,
      deal_id: dealId ? Number(dealId) : null,
      steps: steps.map((s, i) => ({
        step_order: i + 1,
        activity_type_id: Number(s.activity_type_id),
        title: s.title.trim() || null,
        due_date: new Date(s.due_date).toISOString(),
        responsible_party: s.responsible_party,
        note: s.note.trim() || null,
        advances_stage_to: s.advances_stage_to || null,
      })),
    };

    const res = await api.POST("/chains", { body });
    setBusy(false);
    if (res.error || !res.data) {
      setError("Could not create chain");
      return;
    }
    router.push(`/chains/${res.data.id}`);
    router.refresh();
  }

  return (
    <div className="max-w-2xl">
      <PageHeader title="New chain" />

      <form onSubmit={onSubmit} className="flex flex-col gap-5">
        <Field label="Title *">
          <input
            className={`${inputClass} w-full`}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
          />
        </Field>

        <div className="grid grid-cols-2 gap-4">
          <Field label="Contact">
            <select
              className={`${inputClass} w-full`}
              value={contactId}
              onChange={(e) => setContactId(e.target.value)}
            >
              <option value="">— None —</option>
              {contacts.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.first_name} {c.last_name ?? ""}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Company">
            <select
              className={`${inputClass} w-full`}
              value={companyId}
              onChange={(e) => setCompanyId(e.target.value)}
            >
              <option value="">— None (auto from contact) —</option>
              {companies.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Deal">
            <select
              className={`${inputClass} w-full`}
              value={dealId}
              onChange={(e) => setDealId(e.target.value)}
            >
              <option value="">— None —</option>
              {deals.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.title}
                </option>
              ))}
            </select>
          </Field>
        </div>

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
                  <Field label="Due *">
                    <input
                      type="datetime-local"
                      className={`${inputClass} w-full`}
                      value={step.due_date}
                      onChange={(e) => updateStep(i, { due_date: e.target.value })}
                      required
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
                <div className="mt-4 grid grid-cols-2 gap-4">
                  <Field label="Note">
                    <textarea
                      className={`${inputClass} w-full`}
                      rows={2}
                      value={step.note}
                      onChange={(e) => updateStep(i, { note: e.target.value })}
                    />
                  </Field>
                  {dealId && (
                    <Field label="Advances deal to stage">
                      <select
                        className={`${inputClass} w-full`}
                        value={step.advances_stage_to}
                        onChange={(e) =>
                          updateStep(i, { advances_stage_to: e.target.value })
                        }
                      >
                        <option value="">— No change —</option>
                        {stages.map((s) => (
                          <option key={s.id} value={s.name}>
                            {s.name}
                          </option>
                        ))}
                      </select>
                    </Field>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <div className="flex items-center gap-3">
          <button type="submit" disabled={busy} className={btnPrimary}>
            {busy ? "Creating…" : "Create chain"}
          </button>
          <button type="button" className={btnSecondary} onClick={() => router.back()}>
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}

export default function NewChainPage() {
  return (
    <Suspense fallback={<p className="text-[var(--color-muted)]">Loading…</p>}>
      <NewChainInner />
    </Suspense>
  );
}
