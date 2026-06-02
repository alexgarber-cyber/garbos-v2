"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { api } from "@/lib/api/client";
import type { components } from "@/lib/api/schema";
import { formatDue } from "@/components/chainUi";
import { CompanyComboBox } from "@/components/CompanyComboBox";
import {
  EmailLink,
  Field,
  LIFECYCLE_STATUSES,
  LinkedInLink,
  PageHeader,
  StalenessIndicator,
  btnPrimary,
  btnSecondary,
  inputClass,
} from "@/components/ui";

type ContactLead = components["schemas"]["ContactLeadResponse"];
type CompanyLead = components["schemas"]["CompanyLeadResponse"];
type Sequence = components["schemas"]["SequenceResponse"];
type StatusValue = components["schemas"]["ContactStatusUpdate"]["lifecycle_status"];

type Filters = {
  industry: string;
  score_min: string;
  score_max: string;
  has_enrollment: string; // "" | "true" | "false"
  stale_days: string;
  sort: string;
};

const EMPTY: Filters = {
  industry: "",
  score_min: "",
  score_max: "",
  has_enrollment: "",
  stale_days: "",
  sort: "lead_score",
};

// Advancing a lead to one of these prompts for a follow-up task first.
const PROMPT_STATUSES = ["Prospect", "Opportunity"];

// A status change held pending the "Next step?" prompt.
type PendingStatus = {
  kind: "contact" | "company";
  id: number;
  status: string;
  name: string;
};

function toLocalInput(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours(),
  )}:${pad(d.getMinutes())}`;
}

export default function LeadsPage() {
  const [contactLeads, setContactLeads] = useState<ContactLead[]>([]);
  const [companyLeads, setCompanyLeads] = useState<CompanyLead[]>([]);
  const [sequences, setSequences] = useState<Sequence[]>([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState<Filters>(EMPTY);
  const [enrollFor, setEnrollFor] = useState<number | null>(null);
  const [addContactFor, setAddContactFor] = useState<number | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  // "Other" activity type id — used for the next-step task + status-change log.
  const [otherTypeId, setOtherTypeId] = useState<number | null>(null);
  // Status change awaiting the "Next step?" prompt.
  const [pending, setPending] = useState<PendingStatus | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const query: Record<string, string | number | boolean> = { sort: filters.sort };
    if (filters.industry) query.industry = filters.industry;
    if (filters.score_min) query.lead_score_min = Number(filters.score_min);
    if (filters.score_max) query.lead_score_max = Number(filters.score_max);
    if (filters.has_enrollment) query.has_enrollment = filters.has_enrollment === "true";
    if (filters.stale_days) query.stale_days = Number(filters.stale_days);
    const { data } = await api.GET("/leads", { params: { query } });
    setContactLeads(data?.contact_leads ?? []);
    setCompanyLeads(data?.company_leads ?? []);
    setLoading(false);
  }, [filters]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    api.GET("/sequences", { params: { query: { status: "active" } } }).then(({ data }) => {
      if (data) setSequences(data);
    });
    api.GET("/activity-types").then(({ data }) => {
      if (data) setOtherTypeId((data.find((t) => t.name === "Other") ?? data[0])?.id ?? null);
    });
  }, []);

  // Apply the contact status change (after any next-step prompt is resolved).
  async function applyContactStatus(id: number, status: string): Promise<boolean> {
    const lifecycle_status = (status === "" ? null : status) as StatusValue;
    const { error } = await api.PATCH("/leads/contact/{contact_id}/status", {
      params: { path: { contact_id: id } },
      body: { lifecycle_status },
    });
    if (error) return false;
    // Anything other than "Lead" drops it from the contact-leads view.
    setContactLeads((prev) =>
      lifecycle_status === "Lead"
        ? prev.map((l) => (l.id === id ? { ...l, lifecycle_status } : l))
        : prev.filter((l) => l.id !== id),
    );
    return true;
  }

  async function applyCompanyStatus(id: number, status: string): Promise<boolean> {
    const lifecycle_status = (status === "" ? null : status) as StatusValue;
    const { error } = await api.PATCH("/leads/company/{company_id}/status", {
      params: { path: { company_id: id } },
      body: { lifecycle_status },
    });
    if (error) return false;
    setCompanyLeads((prev) =>
      lifecycle_status === "Lead"
        ? prev.map((l) => (l.id === id ? { ...l, lifecycle_status } : l))
        : prev.filter((l) => l.id !== id),
    );
    return true;
  }

  // Log the status change (and whether a follow-up task was created) on the feed.
  async function logStatusActivity(
    p: PendingStatus,
    taskCreated: boolean,
  ): Promise<void> {
    if (!otherTypeId) return;
    await api.POST("/activities", {
      body: {
        activity_type_id: otherTypeId,
        contact_id: p.kind === "contact" ? p.id : null,
        company_id: p.kind === "company" ? p.id : null,
        note: `Status changed to ${p.status}${taskCreated ? ", next task created" : ""}`,
      },
    });
  }

  function updateContactStatus(id: number, value: string) {
    if (PROMPT_STATUSES.includes(value)) {
      const lead = contactLeads.find((l) => l.id === id);
      setPending({ kind: "contact", id, status: value, name: lead ? contactName(lead) : "lead" });
      return;
    }
    applyContactStatus(id, value);
  }

  function updateCompanyStatus(id: number, value: string) {
    if (PROMPT_STATUSES.includes(value)) {
      const lead = companyLeads.find((l) => l.id === id);
      setPending({ kind: "company", id, status: value, name: lead?.name ?? "lead" });
      return;
    }
    applyCompanyStatus(id, value);
  }

  // Resolve the pending status change: optionally create a follow-up task, then
  // apply the status change and log the activity.
  async function resolvePending(task: { title: string; dueDate: string } | null) {
    const p = pending;
    if (!p) return;
    let taskCreated = false;
    if (task && otherTypeId) {
      const res = await api.POST("/tasks/quick", {
        body: {
          title: task.title.trim(),
          due_date: new Date(task.dueDate).toISOString(),
          activity_type_id: otherTypeId,
          contact_id: p.kind === "contact" ? p.id : null,
          company_id: p.kind === "company" ? p.id : null,
          responsible_party: "me",
        },
      });
      taskCreated = !res.error;
    }
    const ok =
      p.kind === "contact"
        ? await applyContactStatus(p.id, p.status)
        : await applyCompanyStatus(p.id, p.status);
    if (ok) await logStatusActivity(p, taskCreated);
    setPending(null);
  }

  function set<K extends keyof Filters>(key: K, value: Filters[K]) {
    setFilters((f) => ({ ...f, [key]: value }));
  }

  return (
    <div>
      <PageHeader title="Leads" />

      <div className="mb-4 flex justify-end">
        <button type="button" className={btnPrimary} onClick={() => setShowAdd((s) => !s)}>
          {showAdd ? "Cancel" : "+ Add Lead"}
        </button>
      </div>

      {showAdd && (
        <AddLeadForm
          onDone={() => {
            setShowAdd(false);
            load();
          }}
        />
      )}

      <div className="mb-5 flex flex-wrap items-end gap-2">
        <input
          className={inputClass}
          placeholder="Industry"
          value={filters.industry}
          onChange={(e) => set("industry", e.target.value)}
        />
        <input
          className={`${inputClass} w-24`}
          placeholder="Min score"
          type="number"
          value={filters.score_min}
          onChange={(e) => set("score_min", e.target.value)}
        />
        <input
          className={`${inputClass} w-24`}
          placeholder="Max score"
          type="number"
          value={filters.score_max}
          onChange={(e) => set("score_max", e.target.value)}
        />
        <select
          className={inputClass}
          value={filters.has_enrollment}
          onChange={(e) => set("has_enrollment", e.target.value)}
        >
          <option value="">Any enrollment</option>
          <option value="true">Enrolled</option>
          <option value="false">Not enrolled</option>
        </select>
        <input
          className={`${inputClass} w-32`}
          placeholder="Stale ≥ days"
          type="number"
          value={filters.stale_days}
          onChange={(e) => set("stale_days", e.target.value)}
        />
        <select
          className={inputClass}
          value={filters.sort}
          onChange={(e) => set("sort", e.target.value)}
          aria-label="Sort by"
        >
          <option value="lead_score">Sort: Lead score</option>
          <option value="staleness">Sort: Staleness</option>
          <option value="name">Sort: Name</option>
          <option value="next_due">Sort: Next due</option>
        </select>
        {filters !== EMPTY && (
          <button type="button" className={btnSecondary} onClick={() => setFilters(EMPTY)}>
            Reset
          </button>
        )}
      </div>

      {/* ---- Contact Leads (primary) ---- */}
      <div className="overflow-hidden rounded-[var(--radius-base)] border border-[var(--color-border)]">
        <table className="w-full text-sm">
          <thead className="bg-[var(--color-surface)] text-left text-[var(--color-muted)]">
            <tr>
              <th className="px-4 py-2 font-medium">Name</th>
              <th className="px-4 py-2 font-medium">Company</th>
              <th className="px-4 py-2 font-medium">Title</th>
              <th className="px-4 py-2 font-medium">Score</th>
              <th className="px-4 py-2 font-medium">Sequence</th>
              <th className="px-4 py-2 font-medium">Last activity</th>
              <th className="px-4 py-2 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={7} className="px-4 py-6 text-center text-[var(--color-muted)]">
                  Loading…
                </td>
              </tr>
            ) : contactLeads.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-6 text-center text-[var(--color-muted)]">
                  No contact leads yet. Use “+ Add Lead”, or convert a contact to a lead.
                </td>
              </tr>
            ) : (
              contactLeads.map((l) => (
                <ContactLeadRow
                  key={l.id}
                  lead={l}
                  sequences={sequences}
                  expanded={enrollFor === l.id}
                  onToggleEnroll={() => setEnrollFor((id) => (id === l.id ? null : l.id))}
                  onChanged={load}
                  onStatus={updateContactStatus}
                />
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* ---- Company Leads (secondary) ---- */}
      {!loading && companyLeads.length > 0 && (
        <div className="mt-10">
          <h2 className="mb-1 text-lg font-semibold tracking-tight">
            Company Leads — needs a contact
          </h2>
          <p className="mb-3 text-sm text-[var(--color-muted)]">
            Target identified, no person yet. Add a contact to start pursuing.
          </p>
          <div className="overflow-hidden rounded-[var(--radius-base)] border border-[var(--color-border)]">
            <table className="w-full text-sm">
              <thead className="bg-[var(--color-surface)] text-left text-[var(--color-muted)]">
                <tr>
                  <th className="px-4 py-2 font-medium">Company</th>
                  <th className="px-4 py-2 font-medium">Industry</th>
                  <th className="px-4 py-2 font-medium">Location</th>
                  <th className="px-4 py-2 font-medium">Score</th>
                  <th className="px-4 py-2 font-medium">Last activity</th>
                  <th className="px-4 py-2 font-medium">Status</th>
                  <th className="px-4 py-2 font-medium"></th>
                </tr>
              </thead>
              <tbody>
                {companyLeads.map((c) => (
                  <CompanyLeadRow
                    key={c.id}
                    lead={c}
                    expanded={addContactFor === c.id}
                    onToggleAdd={() =>
                      setAddContactFor((id) => (id === c.id ? null : c.id))
                    }
                    onChanged={load}
                    onStatus={updateCompanyStatus}
                  />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {pending && (
        <NextStepModal
          pending={pending}
          onSkip={() => resolvePending(null)}
          onCreate={(title, dueDate) => resolvePending({ title, dueDate })}
          onCancel={() => setPending(null)}
        />
      )}
    </div>
  );
}

// "Next step?" prompt shown when a lead advances to Prospect/Opportunity.
function NextStepModal({
  pending,
  onSkip,
  onCreate,
  onCancel,
}: {
  pending: PendingStatus;
  onSkip: () => void;
  onCreate: (title: string, dueDate: string) => void;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState("");
  const [dueDate, setDueDate] = useState(() => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    return toLocalInput(tomorrow);
  });
  const [busy, setBusy] = useState(false);

  async function run(fn: () => void | Promise<void>) {
    setBusy(true);
    await fn();
    // The parent unmounts this modal on completion; no need to reset busy.
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={() => !busy && onCancel()}
    >
      <div
        className="w-full max-w-md rounded-[var(--radius-base)] border border-[var(--color-border)] bg-[var(--color-bg)] p-6 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-semibold tracking-tight">Next step?</h2>
        <p className="mt-1 text-sm text-[var(--color-muted)]">
          {pending.name} → {pending.status}. Create a follow-up task, or skip.
        </p>
        <div className="mt-4 flex flex-col gap-4">
          <Field label="Task">
            <input
              autoFocus
              className={`${inputClass} w-full`}
              placeholder="e.g. Send proposal"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </Field>
          <Field label="Due">
            <input
              type="datetime-local"
              className={`${inputClass} w-full`}
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
            />
          </Field>
        </div>
        <div className="mt-5 flex items-center justify-end gap-3">
          <button type="button" className={btnSecondary} disabled={busy} onClick={() => run(onSkip)}>
            Skip
          </button>
          <button
            type="button"
            className={btnPrimary}
            disabled={busy || !title.trim()}
            onClick={() => run(() => onCreate(title, dueDate))}
          >
            {busy ? "Saving…" : "Create task"}
          </button>
        </div>
      </div>
    </div>
  );
}

function locationStr(city: string | null, state: string | null): string {
  return [city, state].filter(Boolean).join(", ") || "—";
}

function scoreColor(score: number | null): string {
  if (score == null) return "text-[var(--color-muted)]";
  if (score >= 70) return "text-green-700";
  if (score >= 40) return "text-amber-700";
  return "text-[var(--color-fg)]";
}

function contactName(l: ContactLead): string {
  return `${l.first_name} ${l.last_name ?? ""}`.trim();
}

const STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: "", label: "— Not a lead —" },
  ...LIFECYCLE_STATUSES.map((s) => ({ value: s, label: s })),
];

function ContactLeadRow({
  lead,
  sequences,
  expanded,
  onToggleEnroll,
  onChanged,
  onStatus,
}: {
  lead: ContactLead;
  sequences: Sequence[];
  expanded: boolean;
  onToggleEnroll: () => void;
  onChanged: () => void;
  onStatus: (id: number, status: string) => void;
}) {
  const e = lead.active_enrollment;
  return (
    <>
      <tr className="border-t border-[var(--color-border)] align-top hover:bg-[var(--color-surface)]">
        <td className="px-4 py-2">
          <Link href={`/contacts/${lead.id}`} className="font-medium text-[var(--color-accent)]">
            {contactName(lead)}
          </Link>
          {(lead.email || lead.linkedin_url) && (
            <div className="mt-0.5 flex gap-2 text-xs">
              {lead.email && <EmailLink email={lead.email} />}
              {lead.linkedin_url && <LinkedInLink url={lead.linkedin_url} />}
            </div>
          )}
        </td>
        <td className="px-4 py-2">
          {lead.company_id ? (
            <Link
              href={`/companies/${lead.company_id}`}
              className="text-[var(--color-accent)]"
            >
              {lead.company_name ?? "—"}
            </Link>
          ) : (
            <span className="text-[var(--color-muted)]">—</span>
          )}
        </td>
        <td className="px-4 py-2 text-[var(--color-muted)]">{lead.title ?? "—"}</td>
        <td className={`px-4 py-2 font-medium ${scoreColor(lead.lead_score)}`}>
          {lead.lead_score ?? "—"}
        </td>
        <td className="px-4 py-2">
          {e ? (
            <div className="flex flex-col gap-0.5">
              <Link
                href={`/sequences/${e.sequence_id}`}
                className="font-medium text-[var(--color-accent)]"
              >
                {e.sequence_name}
              </Link>
              <span className="text-xs text-[var(--color-muted)]">
                Step {e.current_step}/{e.total_steps}
                {e.next_due_date ? ` · due ${formatDue(e.next_due_date)}` : ""}
              </span>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <span className="text-[var(--color-muted)]">Not enrolled</span>
              <button
                type="button"
                className="text-xs text-[var(--color-accent)] hover:underline"
                onClick={onToggleEnroll}
              >
                {expanded ? "Cancel" : "Enroll"}
              </button>
            </div>
          )}
        </td>
        <td className="px-4 py-2">
          {lead.last_activity_type ? (
            <div className="flex items-center gap-2">
              <span className="text-[var(--color-muted)]">{lead.last_activity_type}</span>
              <StalenessIndicator days={lead.days_since_last_activity} />
            </div>
          ) : (
            <span className="text-[var(--color-muted)]">—</span>
          )}
        </td>
        <td className="px-4 py-2">
          <select
            className={inputClass}
            value={lead.lifecycle_status ?? ""}
            onChange={(ev) => onStatus(lead.id, ev.target.value)}
            aria-label="Lifecycle status"
          >
            {STATUS_OPTIONS.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </td>
      </tr>
      {expanded && !e && (
        <tr className="border-t border-[var(--color-border)] bg-[var(--color-surface)]">
          <td colSpan={7} className="px-4 py-3">
            <EnrollPicker
              lead={lead}
              sequences={sequences}
              onDone={() => {
                onToggleEnroll();
                onChanged();
              }}
            />
          </td>
        </tr>
      )}
    </>
  );
}

function EnrollPicker({
  lead,
  sequences,
  onDone,
}: {
  lead: ContactLead;
  sequences: Sequence[];
  onDone: () => void;
}) {
  const [sequenceId, setSequenceId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function enroll() {
    if (!sequenceId) return;
    setBusy(true);
    setError(null);
    const res = await api.POST("/sequences/{sequence_id}/enroll", {
      params: { path: { sequence_id: Number(sequenceId) } },
      body: { contact_id: lead.id, company_id: lead.company_id ?? undefined },
    });
    setBusy(false);
    if (res.error) {
      setError(
        res.response?.status === 409 ? "Already enrolled in this sequence." : "Could not enroll.",
      );
      return;
    }
    onDone();
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <select
        className={inputClass}
        value={sequenceId}
        onChange={(e) => setSequenceId(e.target.value)}
        aria-label="Sequence"
      >
        <option value="">— Select a sequence —</option>
        {sequences.map((s) => (
          <option key={s.id} value={String(s.id)}>
            {s.name}
          </option>
        ))}
      </select>
      <button
        type="button"
        className={btnPrimary}
        disabled={!sequenceId || busy}
        onClick={enroll}
      >
        {busy ? "Enrolling…" : "Enroll"}
      </button>
      {error && <span className="text-sm text-red-600">{error}</span>}
    </div>
  );
}

function CompanyLeadRow({
  lead,
  expanded,
  onToggleAdd,
  onChanged,
  onStatus,
}: {
  lead: CompanyLead;
  expanded: boolean;
  onToggleAdd: () => void;
  onChanged: () => void;
  onStatus: (id: number, status: string) => void;
}) {
  return (
    <>
      <tr className="border-t border-[var(--color-border)] align-top hover:bg-[var(--color-surface)]">
        <td className="px-4 py-2">
          <Link href={`/companies/${lead.id}`} className="font-medium text-[var(--color-accent)]">
            {lead.name}
          </Link>
        </td>
        <td className="px-4 py-2 text-[var(--color-muted)]">{lead.industry ?? "—"}</td>
        <td className="px-4 py-2 text-[var(--color-muted)]">
          {locationStr(lead.hq_city, lead.hq_state)}
        </td>
        <td className={`px-4 py-2 font-medium ${scoreColor(lead.lead_score)}`}>
          {lead.lead_score ?? "—"}
        </td>
        <td className="px-4 py-2">
          {lead.last_activity_type ? (
            <div className="flex items-center gap-2">
              <span className="text-[var(--color-muted)]">{lead.last_activity_type}</span>
              <StalenessIndicator days={lead.days_since_last_activity} />
            </div>
          ) : (
            <span className="text-[var(--color-muted)]">—</span>
          )}
        </td>
        <td className="px-4 py-2">
          <select
            className={inputClass}
            value={lead.lifecycle_status ?? ""}
            onChange={(ev) => onStatus(lead.id, ev.target.value)}
            aria-label="Lifecycle status"
          >
            {STATUS_OPTIONS.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </td>
        <td className="px-4 py-2 text-right">
          <button
            type="button"
            className="text-xs text-[var(--color-accent)] hover:underline"
            onClick={onToggleAdd}
          >
            {expanded ? "Cancel" : "Add a contact"}
          </button>
        </td>
      </tr>
      {expanded && (
        <tr className="border-t border-[var(--color-border)] bg-[var(--color-surface)]">
          <td colSpan={7} className="px-4 py-3">
            <AddContactInline companyName={lead.name} onDone={onChanged} />
          </td>
        </tr>
      )}
    </>
  );
}

function AddContactInline({
  companyName,
  onDone,
}: {
  companyName: string;
  onDone: () => void;
}) {
  const [first, setFirst] = useState("");
  const [last, setLast] = useState("");
  const [title, setTitle] = useState("");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!first.trim()) return;
    setBusy(true);
    setError(null);
    const res = await api.POST("/leads", {
      body: {
        first_name: first.trim(),
        last_name: last.trim() || null,
        title: title.trim() || null,
        email: email.trim() || null,
        company_name: companyName,
      },
    });
    setBusy(false);
    if (res.error || !res.data) {
      setError("Could not add contact.");
      return;
    }
    onDone();
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <input
        className={`${inputClass} w-36`}
        placeholder="First name *"
        value={first}
        onChange={(e) => setFirst(e.target.value)}
      />
      <input
        className={`${inputClass} w-36`}
        placeholder="Last name"
        value={last}
        onChange={(e) => setLast(e.target.value)}
      />
      <input
        className={`${inputClass} w-40`}
        placeholder="Title"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
      />
      <input
        className={`${inputClass} w-48`}
        placeholder="Email"
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
      />
      <button type="button" className={btnPrimary} disabled={!first.trim() || busy} onClick={submit}>
        {busy ? "Adding…" : "Add as lead"}
      </button>
      {error && <span className="text-sm text-red-600">{error}</span>}
    </div>
  );
}

function AddLeadForm({ onDone }: { onDone: () => void }) {
  const [values, setValues] = useState({
    first_name: "",
    last_name: "",
    email: "",
    title: "",
    phone: "",
    linkedin_url: "",
    company_name: "",
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function set(key: keyof typeof values, value: string) {
    setValues((v) => ({ ...v, [key]: value }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!values.first_name.trim() || !values.company_name.trim()) {
      setError("First name and company are required.");
      return;
    }
    setBusy(true);
    setError(null);
    const res = await api.POST("/leads", {
      body: {
        first_name: values.first_name.trim(),
        last_name: values.last_name.trim() || null,
        email: values.email.trim() || null,
        title: values.title.trim() || null,
        phone: values.phone.trim() || null,
        linkedin_url: values.linkedin_url.trim() || null,
        company_name: values.company_name.trim(),
      },
    });
    setBusy(false);
    if (res.error || !res.data) {
      setError("Could not add lead.");
      return;
    }
    onDone();
  }

  return (
    <form
      onSubmit={submit}
      className="mb-6 rounded-[var(--radius-base)] border border-[var(--color-border)] bg-[var(--color-surface)] p-4"
    >
      <div className="flex flex-wrap gap-2">
        <input
          className={`${inputClass} w-40`}
          placeholder="First name *"
          value={values.first_name}
          onChange={(e) => set("first_name", e.target.value)}
        />
        <input
          className={`${inputClass} w-40`}
          placeholder="Last name"
          value={values.last_name}
          onChange={(e) => set("last_name", e.target.value)}
        />
        <input
          className={`${inputClass} w-40`}
          placeholder="Title"
          value={values.title}
          onChange={(e) => set("title", e.target.value)}
        />
        <input
          className={`${inputClass} w-52`}
          placeholder="Email"
          type="email"
          value={values.email}
          onChange={(e) => set("email", e.target.value)}
        />
        <input
          className={`${inputClass} w-40`}
          placeholder="Phone"
          value={values.phone}
          onChange={(e) => set("phone", e.target.value)}
        />
        <input
          className={`${inputClass} w-52`}
          placeholder="LinkedIn URL"
          value={values.linkedin_url}
          onChange={(e) => set("linkedin_url", e.target.value)}
        />
        <CompanyComboBox
          className="w-52"
          value={values.company_name}
          onChange={(name) => set("company_name", name)}
        />
        <button type="submit" className={btnPrimary} disabled={busy}>
          {busy ? "Adding…" : "Add lead"}
        </button>
      </div>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </form>
  );
}
