"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { api } from "@/lib/api/client";
import type { components } from "@/lib/api/schema";
import { Field, btnPrimary, btnSecondary, inputClass } from "@/components/ui";
import { RichTextEditor } from "@/components/RichTextEditor";
import { htmlToNullable } from "@/components/richText";

type Contact = components["schemas"]["ContactResponse"];
type Company = components["schemas"]["CompanyResponse"];

const TEXT_FIELDS: { key: string; label: string; type?: string }[] = [
  { key: "last_name", label: "Last name" },
  { key: "email", label: "Email", type: "email" },
  { key: "title", label: "Title" },
  { key: "phone", label: "Phone" },
  { key: "mobile", label: "Mobile" },
  { key: "linkedin_url", label: "LinkedIn URL" },
];

export function ContactForm({
  initial,
  defaultCompanyId,
}: {
  initial?: Contact;
  defaultCompanyId?: number;
}) {
  const router = useRouter();
  const [companies, setCompanies] = useState<Company[]>([]);
  const [newCompanyName, setNewCompanyName] = useState("");
  const [values, setValues] = useState<Record<string, string>>({
    first_name: initial?.first_name ?? "",
    last_name: initial?.last_name ?? "",
    email: initial?.email ?? "",
    title: initial?.title ?? "",
    phone: initial?.phone ?? "",
    mobile: initial?.mobile ?? "",
    linkedin_url: initial?.linkedin_url ?? "",
    notes: initial?.notes ?? "",
    company_id:
      initial?.company_id?.toString() ?? defaultCompanyId?.toString() ?? "",
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.GET("/companies").then(({ data }) => {
      if (data) setCompanies(data);
    });
  }, []);

  function set(key: string, value: string) {
    setValues((v) => ({ ...v, [key]: value }));
  }

  // Resolve the chosen company to an id, creating it (de-duped, case-insensitive)
  // when "+ New company" is selected. Returns undefined on failure.
  async function resolveCompanyId(): Promise<number | null | undefined> {
    if (values.company_id !== "__new__") {
      return values.company_id ? Number(values.company_id) : null;
    }
    const name = newCompanyName.trim();
    if (!name) return null;
    const match = companies.find((c) => c.name.toLowerCase() === name.toLowerCase());
    if (match) return match.id;
    const res = await api.POST("/companies", { body: { name } });
    if (res.error || !res.data) return undefined;
    return res.data.id;
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);

    const companyId = await resolveCompanyId();
    if (companyId === undefined) {
      setBusy(false);
      setError("Could not create company");
      return;
    }

    const body: components["schemas"]["ContactCreate"] = {
      first_name: values.first_name.trim(),
      last_name: values.last_name.trim() || null,
      email: values.email.trim() || null,
      title: values.title.trim() || null,
      phone: values.phone.trim() || null,
      mobile: values.mobile.trim() || null,
      linkedin_url: values.linkedin_url.trim() || null,
      notes: htmlToNullable(values.notes),
      company_id: companyId,
    };

    const res = initial
      ? await api.PUT("/contacts/{contact_id}", {
          params: { path: { contact_id: initial.id } },
          body,
        })
      : await api.POST("/contacts", { body });

    setBusy(false);
    if (res.error || !res.data) {
      setError("Could not save contact");
      return;
    }
    router.push(`/contacts/${res.data.id}`);
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="flex max-w-xl flex-col gap-4">
      <div className="grid grid-cols-2 gap-4">
        <Field label="First name *">
          <input
            className={`${inputClass} w-full`}
            value={values.first_name}
            onChange={(e) => set("first_name", e.target.value)}
            required
          />
        </Field>
        {TEXT_FIELDS.map((f) => (
          <Field key={f.key} label={f.label}>
            <input
              type={f.type ?? "text"}
              className={`${inputClass} w-full`}
              value={values[f.key]}
              onChange={(e) => set(f.key, e.target.value)}
            />
          </Field>
        ))}
        <Field label="Company">
          <select
            className={`${inputClass} w-full`}
            value={values.company_id}
            onChange={(e) => set("company_id", e.target.value)}
          >
            <option value="">— None —</option>
            <option value="__new__">+ New company</option>
            {companies.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </Field>
        {values.company_id === "__new__" && (
          <Field label="New company name">
            <input
              className={`${inputClass} w-full`}
              value={newCompanyName}
              onChange={(e) => setNewCompanyName(e.target.value)}
              placeholder="Company name"
            />
          </Field>
        )}
      </div>

      <Field label="Notes">
        <RichTextEditor value={values.notes} onChange={(html) => set("notes", html)} />
      </Field>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex items-center gap-3">
        <button type="submit" disabled={busy} className={btnPrimary}>
          {busy ? "Saving…" : initial ? "Save changes" : "Create contact"}
        </button>
        <button type="button" className={btnSecondary} onClick={() => router.back()}>
          Cancel
        </button>
      </div>
    </form>
  );
}
