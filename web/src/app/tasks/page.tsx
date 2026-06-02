"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import { api } from "@/lib/api/client";
import type { components } from "@/lib/api/schema";
import { ResponsibleTag, TypeBadge, formatDue } from "@/components/chainUi";
import { Field, PageHeader, btnPrimary, btnSecondary, inputClass } from "@/components/ui";

type Task = components["schemas"]["TaskResponse"];
type Contact = components["schemas"]["ContactResponse"];
type Company = components["schemas"]["CompanyResponse"];
type ActivityType = components["schemas"]["ActivityTypeResponse"];

const RESPONSIBLE_PARTIES = ["me", "them", "internal"] as const;

function toLocalInput(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours(),
  )}:${pad(d.getMinutes())}`;
}

// Mirror the backend /tasks `due` buckets (local calendar days).
function bucketOf(iso: string): "overdue" | "today" | "this_week" | "later" {
  const due = new Date(iso);
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const tomorrowStart = new Date(todayStart);
  tomorrowStart.setDate(tomorrowStart.getDate() + 1);
  const weekEnd = new Date(todayStart);
  weekEnd.setDate(weekEnd.getDate() + 7);
  if (due < todayStart) return "overdue";
  if (due < tomorrowStart) return "today";
  if (due < weekEnd) return "this_week";
  return "later";
}

export default function TasksPage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyStep, setBusyStep] = useState<number | null>(null);

  const [contacts, setContacts] = useState<Contact[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [types, setTypes] = useState<ActivityType[]>([]);

  // Quick-add form.
  const [title, setTitle] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [typeId, setTypeId] = useState("");
  const [contactId, setContactId] = useState("");
  const [companyId, setCompanyId] = useState("");
  const [responsible, setResponsible] = useState("me");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data } = await api.GET("/tasks", { params: { query: {} } });
    setTasks(data ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    setDueDate(toLocalInput(new Date()));
    api.GET("/contacts").then(({ data }) => data && setContacts(data));
    api.GET("/companies").then(({ data }) => data && setCompanies(data));
    api.GET("/activity-types").then(({ data }) => {
      if (data) {
        setTypes(data);
        setTypeId(data[0] ? String(data[0].id) : "");
      }
    });
  }, []);

  const buckets = useMemo(() => {
    const groups = {
      overdue: [] as Task[],
      today: [] as Task[],
      this_week: [] as Task[],
      later: [] as Task[],
    };
    for (const t of tasks) groups[bucketOf(t.due_date)].push(t);
    return groups;
  }, [tasks]);

  async function quickAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!typeId) {
      setError("Pick an activity type");
      return;
    }
    setBusy(true);
    setError(null);
    const res = await api.POST("/tasks/quick", {
      body: {
        title: title.trim(),
        due_date: new Date(dueDate).toISOString(),
        activity_type_id: Number(typeId),
        contact_id: contactId ? Number(contactId) : null,
        company_id: companyId ? Number(companyId) : null,
        responsible_party: responsible,
        note: note.trim() || null,
      },
    });
    setBusy(false);
    if (res.error) {
      setError("Could not add task");
      return;
    }
    setTitle("");
    setContactId("");
    setCompanyId("");
    setResponsible("me");
    setNote("");
    setDueDate(toLocalInput(new Date()));
    load();
  }

  async function complete(task: Task) {
    setBusyStep(task.step_id);
    await api.POST("/chains/{chain_id}/steps/{step_id}/complete", {
      params: { path: { chain_id: task.chain_id, step_id: task.step_id } },
    });
    setBusyStep(null);
    load();
  }

  function Section({
    title,
    tasks,
    tone,
  }: {
    title: string;
    tasks: Task[];
    tone?: "overdue";
  }) {
    if (tasks.length === 0) return null;
    return (
      <section className="mb-6">
        <h2
          className={`mb-2 text-sm font-semibold tracking-tight ${
            tone === "overdue" ? "text-red-600" : ""
          }`}
        >
          {title} ({tasks.length})
        </h2>
        <ul
          className={`overflow-hidden rounded-[var(--radius-base)] border ${
            tone === "overdue"
              ? "border-red-300"
              : "border-[var(--color-border)]"
          }`}
        >
          {tasks.map((t) => (
            <li
              key={t.step_id}
              className="flex items-start justify-between gap-4 border-t border-[var(--color-border)] px-4 py-3 first:border-t-0"
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium">{t.title ?? t.chain_title}</span>
                  <TypeBadge name={t.activity_type_name} />
                  <ResponsibleTag party={t.responsible_party} />
                  <span
                    className={`text-xs ${tone === "overdue" ? "font-medium text-red-600" : "text-[var(--color-muted)]"}`}
                  >
                    {formatDue(t.due_date)}
                  </span>
                </div>
                <div className="mt-1 flex flex-wrap gap-3 text-xs">
                  <Link href={`/chains/${t.chain_id}`} className="text-[var(--color-muted)]">
                    {t.chain_title}
                  </Link>
                  {t.contact_id && (
                    <Link
                      href={`/contacts/${t.contact_id}`}
                      className="text-[var(--color-accent)]"
                    >
                      {t.contact_name ?? "Contact"}
                    </Link>
                  )}
                  {t.company_id && (
                    <Link
                      href={`/companies/${t.company_id}`}
                      className="text-[var(--color-accent)]"
                    >
                      {t.company_name ?? "Company"}
                    </Link>
                  )}
                </div>
                {t.note && (
                  <p className="mt-1 text-xs text-[var(--color-muted)]">{t.note}</p>
                )}
              </div>
              <button
                type="button"
                disabled={busyStep === t.step_id}
                onClick={() => complete(t)}
                className={`shrink-0 ${btnPrimary}`}
              >
                {busyStep === t.step_id ? "…" : "Done"}
              </button>
            </li>
          ))}
        </ul>
      </section>
    );
  }

  return (
    <div className="max-w-3xl">
      <PageHeader title="Tasks" />

      <form
        onSubmit={quickAdd}
        className="mb-8 flex flex-col gap-4 rounded-[var(--radius-base)] border border-[var(--color-border)] p-4"
      >
        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold tracking-tight">Quick add task</span>
        </div>
        <Field label="What needs doing? *">
          <input
            className={`${inputClass} w-full`}
            placeholder="Call Aaron re: NDA"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
          />
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Due *">
            <input
              type="datetime-local"
              className={`${inputClass} w-full`}
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              required
            />
          </Field>
          <Field label="Type *">
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
        <Field label="Notes">
          <textarea
            className={`${inputClass} w-full`}
            rows={2}
            placeholder="Optional context for this task…"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </Field>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div>
          <button type="submit" disabled={busy} className={btnPrimary}>
            {busy ? "Adding…" : "Add task"}
          </button>
        </div>
      </form>

      {loading ? (
        <p className="text-[var(--color-muted)]">Loading…</p>
      ) : tasks.length === 0 ? (
        <p className="rounded-[var(--radius-base)] border border-[var(--color-border)] px-4 py-6 text-center text-sm text-[var(--color-muted)]">
          No open tasks. 🎉
        </p>
      ) : (
        <>
          <Section title="Overdue" tasks={buckets.overdue} tone="overdue" />
          <Section title="Due Today" tasks={buckets.today} />
          <Section title="Due This Week" tasks={buckets.this_week} />
          <Section title="Later" tasks={buckets.later} />
        </>
      )}
    </div>
  );
}
