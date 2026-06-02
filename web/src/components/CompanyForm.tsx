"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { api } from "@/lib/api/client";
import type { components } from "@/lib/api/schema";
import {
  Field,
  LIFECYCLE_STATUSES,
  btnPrimary,
  btnSecondary,
  inputClass,
} from "@/components/ui";

type Company = components["schemas"]["CompanyResponse"];

const TEXT_FIELDS: { key: keyof Company; label: string }[] = [
  { key: "domain", label: "Domain (website)" },
  { key: "industry", label: "Industry" },
  { key: "revenue_range", label: "Revenue range" },
  { key: "hq_city", label: "HQ city" },
  { key: "hq_state", label: "HQ state" },
  { key: "hq_country", label: "HQ country" },
  { key: "phone", label: "Phone" },
];

export function CompanyForm({ initial }: { initial?: Company }) {
  const router = useRouter();
  const [values, setValues] = useState<Record<string, string>>({
    name: initial?.name ?? "",
    domain: initial?.domain ?? "",
    industry: initial?.industry ?? "",
    employee_count: initial?.employee_count?.toString() ?? "",
    revenue_range: initial?.revenue_range ?? "",
    hq_city: initial?.hq_city ?? "",
    hq_state: initial?.hq_state ?? "",
    hq_country: initial?.hq_country ?? "",
    description: initial?.description ?? "",
    phone: initial?.phone ?? "",
    lifecycle_status: initial?.lifecycle_status ?? "",
    lead_score: initial?.lead_score?.toString() ?? "",
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function set(key: string, value: string) {
    setValues((v) => ({ ...v, [key]: value }));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);

    const body: components["schemas"]["CompanyCreate"] = {
      name: values.name.trim(),
      domain: values.domain.trim() || null,
      industry: values.industry.trim() || null,
      employee_count: values.employee_count.trim()
        ? Number(values.employee_count)
        : null,
      revenue_range: values.revenue_range.trim() || null,
      hq_city: values.hq_city.trim() || null,
      hq_state: values.hq_state.trim() || null,
      hq_country: values.hq_country.trim() || null,
      description: values.description.trim() || null,
      phone: values.phone.trim() || null,
      lifecycle_status:
        (values.lifecycle_status || null) as components["schemas"]["CompanyCreate"]["lifecycle_status"],
      lead_score: values.lead_score.trim() ? Number(values.lead_score) : null,
    };

    const res = initial
      ? await api.PUT("/companies/{company_id}", {
          params: { path: { company_id: initial.id } },
          body,
        })
      : await api.POST("/companies", { body });

    setBusy(false);
    if (res.error || !res.data) {
      setError("Could not save company");
      return;
    }
    router.push(`/companies/${res.data.id}`);
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="flex max-w-xl flex-col gap-4">
      <Field label="Name *">
        <input
          className={`${inputClass} w-full`}
          value={values.name}
          onChange={(e) => set("name", e.target.value)}
          required
        />
      </Field>

      <div className="grid grid-cols-2 gap-4">
        <Field label="Lifecycle status">
          <select
            className={`${inputClass} w-full`}
            value={values.lifecycle_status}
            onChange={(e) => set("lifecycle_status", e.target.value)}
          >
            <option value="">— None —</option>
            {LIFECYCLE_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Lead score (0–100)">
          <input
            type="number"
            min="0"
            max="100"
            className={`${inputClass} w-full`}
            value={values.lead_score}
            onChange={(e) => set("lead_score", e.target.value)}
          />
        </Field>
        {TEXT_FIELDS.map((f) => (
          <Field key={f.key as string} label={f.label}>
            <input
              className={`${inputClass} w-full`}
              value={values[f.key as string]}
              onChange={(e) => set(f.key as string, e.target.value)}
            />
          </Field>
        ))}
        <Field label="Employee count">
          <input
            type="number"
            min="0"
            className={`${inputClass} w-full`}
            value={values.employee_count}
            onChange={(e) => set("employee_count", e.target.value)}
          />
        </Field>
      </div>

      <Field label="Description">
        <textarea
          className={`${inputClass} w-full`}
          rows={4}
          value={values.description}
          onChange={(e) => set("description", e.target.value)}
        />
      </Field>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex items-center gap-3">
        <button type="submit" disabled={busy} className={btnPrimary}>
          {busy ? "Saving…" : initial ? "Save changes" : "Create company"}
        </button>
        <button type="button" className={btnSecondary} onClick={() => router.back()}>
          Cancel
        </button>
      </div>
    </form>
  );
}
