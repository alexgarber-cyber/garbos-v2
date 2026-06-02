"use client";

import { useEffect, useMemo, useState } from "react";

import { api } from "@/lib/api/client";
import type { components } from "@/lib/api/schema";
import { ActivityRow } from "@/components/ActivityLog";
import { Field, btnPrimary, btnSecondary, inputClass } from "@/components/ui";

type Activity = components["schemas"]["ActivityResponse"];
type ActivityType = components["schemas"]["ActivityTypeResponse"];
type Contact = components["schemas"]["ContactResponse"];
type Company = components["schemas"]["CompanyResponse"];

// datetime-local wants "YYYY-MM-DDTHH:mm" in local time.
function toLocalInput(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours(),
  )}:${pad(d.getMinutes())}`;
}

function contactName(c: Contact): string {
  return `${c.first_name} ${c.last_name ?? ""}`.trim();
}

export default function ActivitiesPage() {
  const [activities, setActivities] = useState<Activity[]>([]);
  const [types, setTypes] = useState<ActivityType[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({
    activity_type_id: "",
    occurred_from: "",
    occurred_to: "",
  });

  // ── Log Activity form state ──
  const [showForm, setShowForm] = useState(false);
  const [typeId, setTypeId] = useState("");
  const [contactId, setContactId] = useState("");
  const [companyId, setCompanyId] = useState("");
  const [occurredAt, setOccurredAt] = useState("");
  const [note, setNote] = useState("");
  const [voicemail, setVoicemail] = useState(false);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    api.GET("/activity-types").then(({ data }) => {
      if (data) setTypes(data);
    });
    api.GET("/contacts").then(({ data }) => {
      if (data) setContacts(data);
    });
    api.GET("/companies").then(({ data }) => {
      if (data) setCompanies(data);
    });
  }, []);

  async function load() {
    setLoading(true);
    const query: Record<string, string | number> = {};
    if (filters.activity_type_id) query.activity_type_id = Number(filters.activity_type_id);
    if (filters.occurred_from) query.occurred_from = new Date(filters.occurred_from).toISOString();
    if (filters.occurred_to) {
      const to = new Date(filters.occurred_to);
      to.setHours(23, 59, 59, 999); // inclusive through end of the selected day
      query.occurred_to = to.toISOString();
    }
    const { data } = await api.GET("/activities", { params: { query } });
    setActivities(data ?? []);
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep the controlled select in sync with its visually-selected first option:
  // if the form is opened before /activity-types resolves, seed the default once
  // types arrive (otherwise the browser shows the first option but typeId is "").
  useEffect(() => {
    if (showForm && !typeId && types[0]) setTypeId(String(types[0].id));
  }, [showForm, typeId, types]);

  function onSearch(e: React.FormEvent) {
    e.preventDefault();
    load();
  }

  const selectedType = useMemo(
    () => types.find((t) => String(t.id) === typeId),
    [types, typeId],
  );
  const isCall = selectedType?.name === "Call";

  function openForm() {
    setTypeId(types[0] ? String(types[0].id) : "");
    setContactId("");
    setCompanyId("");
    setOccurredAt(toLocalInput(new Date()));
    setNote("");
    setVoicemail(false);
    setFormError(null);
    setShowForm(true);
  }

  // Selecting a contact auto-populates the company from that contact's company
  // (the same dual-link pattern used elsewhere). User may still override below.
  function onContactChange(value: string) {
    setContactId(value);
    const contact = contacts.find((c) => String(c.id) === value);
    if (contact?.company_id != null) setCompanyId(String(contact.company_id));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!typeId) {
      setFormError("Pick an activity type");
      return;
    }
    setBusy(true);
    setFormError(null);
    const res = await api.POST("/activities", {
      body: {
        activity_type_id: Number(typeId),
        contact_id: contactId ? Number(contactId) : null,
        company_id: companyId ? Number(companyId) : null,
        deal_id: null,
        note: note.trim() || null,
        voicemail: isCall ? voicemail : null,
        occurred_at: occurredAt ? new Date(occurredAt).toISOString() : null,
      },
    });
    setBusy(false);
    if (res.error) {
      setFormError("Could not log activity");
      return;
    }
    setShowForm(false);
    load();
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Activities</h1>
        {!showForm && (
          <button type="button" className={btnPrimary} onClick={openForm}>
            + Log Activity
          </button>
        )}
      </div>

      {showForm && (
        <form
          onSubmit={onSubmit}
          className="mb-6 flex flex-col gap-4 rounded-[var(--radius-base)] border border-[var(--color-border)] p-4"
        >
          <div className="grid grid-cols-2 gap-4">
            <Field label="Type *">
              <select
                className={`${inputClass} w-full`}
                value={typeId}
                onChange={(e) => setTypeId(e.target.value)}
                required
              >
                {types.map((t) => (
                  <option key={t.id} value={String(t.id)}>
                    {t.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="When">
              <input
                type="datetime-local"
                className={`${inputClass} w-full`}
                value={occurredAt}
                onChange={(e) => setOccurredAt(e.target.value)}
              />
            </Field>
            <Field label="Contact">
              <select
                className={`${inputClass} w-full`}
                value={contactId}
                onChange={(e) => onContactChange(e.target.value)}
              >
                <option value="">— None —</option>
                {contacts.map((c) => (
                  <option key={c.id} value={c.id}>
                    {contactName(c)}
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
                <option value="">— None —</option>
                {companies.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          {isCall && (
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={voicemail}
                onChange={(e) => setVoicemail(e.target.checked)}
              />
              Left voicemail
            </label>
          )}

          <Field label="Note">
            <textarea
              className={`${inputClass} w-full`}
              rows={3}
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </Field>

          {formError && <p className="text-sm text-red-600">{formError}</p>}

          <div className="flex items-center gap-3">
            <button type="submit" disabled={busy} className={btnPrimary}>
              {busy ? "Saving…" : "Save"}
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

      <form onSubmit={onSearch} className="mb-5 flex flex-wrap items-end gap-2">
        <select
          className={inputClass}
          value={filters.activity_type_id}
          onChange={(e) => setFilters((f) => ({ ...f, activity_type_id: e.target.value }))}
        >
          <option value="">All types</option>
          {types.map((t) => (
            <option key={t.id} value={String(t.id)}>
              {t.name}
            </option>
          ))}
        </select>
        <label className="flex flex-col text-xs text-[var(--color-muted)]">
          From
          <input
            type="date"
            className={inputClass}
            value={filters.occurred_from}
            onChange={(e) => setFilters((f) => ({ ...f, occurred_from: e.target.value }))}
          />
        </label>
        <label className="flex flex-col text-xs text-[var(--color-muted)]">
          To
          <input
            type="date"
            className={inputClass}
            value={filters.occurred_to}
            onChange={(e) => setFilters((f) => ({ ...f, occurred_to: e.target.value }))}
          />
        </label>
        <button type="submit" className={btnSecondary}>
          Search
        </button>
      </form>

      <div className="overflow-hidden rounded-[var(--radius-base)] border border-[var(--color-border)]">
        {loading ? (
          <p className="px-4 py-6 text-center text-sm text-[var(--color-muted)]">Loading…</p>
        ) : activities.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-[var(--color-muted)]">
            No activities found.
          </p>
        ) : (
          <ul>
            {activities.map((a) => (
              <ActivityRow key={a.id} activity={a} onDeleted={load} />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
