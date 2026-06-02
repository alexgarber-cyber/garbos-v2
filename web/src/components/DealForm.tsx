"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { api } from "@/lib/api/client";
import type { components } from "@/lib/api/schema";
import { Field, btnPrimary, btnSecondary, inputClass } from "@/components/ui";

type Deal = components["schemas"]["DealResponse"];
type Company = components["schemas"]["CompanyResponse"];
type Contact = components["schemas"]["ContactResponse"];
type PipelineStage = components["schemas"]["PipelineStageResponse"];

export function DealForm({
  initial,
  defaultCompanyId,
  defaultContactId,
}: {
  initial?: Deal;
  defaultCompanyId?: number;
  defaultContactId?: number;
}) {
  const router = useRouter();
  const [companies, setCompanies] = useState<Company[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [stages, setStages] = useState<PipelineStage[]>([]);
  const [values, setValues] = useState<Record<string, string>>({
    title: initial?.title ?? "",
    company_id:
      initial?.company_id?.toString() ?? defaultCompanyId?.toString() ?? "",
    primary_contact_id:
      initial?.primary_contact_id?.toString() ??
      defaultContactId?.toString() ??
      "",
    pipeline_stage_id: initial?.pipeline_stage_id?.toString() ?? "",
    amount: initial?.amount?.toString() ?? "",
    expected_close_date: initial?.expected_close_date ?? "",
    notes: initial?.notes ?? "",
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.GET("/companies").then(({ data }) => {
      if (data) setCompanies(data);
    });
    api.GET("/contacts").then(({ data }) => {
      if (data) setContacts(data);
    });
    api.GET("/pipeline-stages").then(({ data }) => {
      if (data) {
        setStages(data);
        // Default a new deal to the first (lowest-order) non-terminal stage.
        setValues((v) =>
          v.pipeline_stage_id
            ? v
            : {
                ...v,
                pipeline_stage_id:
                  data.find((s) => !s.is_terminal)?.id.toString() ??
                  data[0]?.id.toString() ??
                  "",
              },
        );
      }
    });
  }, []);

  function set(key: string, value: string) {
    setValues((v) => ({ ...v, [key]: value }));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!values.pipeline_stage_id) {
      setError("Pick a pipeline stage");
      return;
    }
    setBusy(true);
    setError(null);

    const body: components["schemas"]["DealCreate"] = {
      title: values.title.trim(),
      company_id: values.company_id ? Number(values.company_id) : null,
      primary_contact_id: values.primary_contact_id
        ? Number(values.primary_contact_id)
        : null,
      pipeline_stage_id: Number(values.pipeline_stage_id),
      amount: values.amount.trim() ? Number(values.amount) : null,
      expected_close_date: values.expected_close_date || null,
      notes: values.notes.trim() || null,
    };

    const res = initial
      ? await api.PUT("/deals/{deal_id}", {
          params: { path: { deal_id: initial.id } },
          body,
        })
      : await api.POST("/deals", { body });

    setBusy(false);
    if (res.error || !res.data) {
      setError("Could not save deal");
      return;
    }
    router.push(`/deals/${res.data.id}`);
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="flex max-w-xl flex-col gap-4">
      <Field label="Title *">
        <input
          className={`${inputClass} w-full`}
          value={values.title}
          onChange={(e) => set("title", e.target.value)}
          required
        />
      </Field>

      <div className="grid grid-cols-2 gap-4">
        <Field label="Company">
          <select
            className={`${inputClass} w-full`}
            value={values.company_id}
            onChange={(e) => set("company_id", e.target.value)}
          >
            <option value="">— None —</option>
            {companies.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Primary contact">
          <select
            className={`${inputClass} w-full`}
            value={values.primary_contact_id}
            onChange={(e) => set("primary_contact_id", e.target.value)}
          >
            <option value="">— None —</option>
            {contacts.map((c) => (
              <option key={c.id} value={c.id}>
                {c.first_name} {c.last_name ?? ""}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Stage *">
          <select
            className={`${inputClass} w-full`}
            value={values.pipeline_stage_id}
            onChange={(e) => set("pipeline_stage_id", e.target.value)}
            required
          >
            {stages.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Amount">
          <input
            type="number"
            step="0.01"
            min="0"
            className={`${inputClass} w-full`}
            value={values.amount}
            onChange={(e) => set("amount", e.target.value)}
          />
        </Field>
        <Field label="Expected close date">
          <input
            type="date"
            className={`${inputClass} w-full`}
            value={values.expected_close_date}
            onChange={(e) => set("expected_close_date", e.target.value)}
          />
        </Field>
      </div>

      <Field label="Notes">
        <textarea
          className={`${inputClass} w-full`}
          rows={4}
          value={values.notes}
          onChange={(e) => set("notes", e.target.value)}
        />
      </Field>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex items-center gap-3">
        <button type="submit" disabled={busy} className={btnPrimary}>
          {busy ? "Saving…" : initial ? "Save changes" : "Create deal"}
        </button>
        <button type="button" className={btnSecondary} onClick={() => router.back()}>
          Cancel
        </button>
      </div>
    </form>
  );
}
