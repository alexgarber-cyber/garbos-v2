"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import { api } from "@/lib/api/client";
import type { components } from "@/lib/api/schema";
import { Field, btnPrimary, btnSecondary, inputClass } from "@/components/ui";
import { RichTextContent } from "@/components/RichTextContent";
import { RichTextEditor } from "@/components/RichTextEditor";
import { htmlToNullable } from "@/components/richText";

type Activity = components["schemas"]["ActivityResponse"];
type ActivityType = components["schemas"]["ActivityTypeResponse"];

// Truncate long captured messages in the feed; expand inline with "Read more".
const MESSAGE_LIMIT = 200;
// How many recent activities to show before "+ Show N more".
const COLLAPSED_COUNT = 3;

// datetime-local wants "YYYY-MM-DDTHH:mm" in local time.
function toLocalInput(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours(),
  )}:${pad(d.getMinutes())}`;
}

function formatWhen(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function ActivityRow({
  activity,
  onDeleted,
  hideContact,
  hideCompany,
}: {
  activity: Activity;
  onDeleted: () => void;
  hideContact?: boolean;
  hideCompany?: boolean;
}) {
  const [armed, setArmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [showFull, setShowFull] = useState(false);

  const message = activity.message_sent ?? "";
  const isLong = message.length > MESSAGE_LIMIT;
  const shownMessage = showFull || !isLong ? message : `${message.slice(0, MESSAGE_LIMIT)}…`;

  async function onDelete() {
    setBusy(true);
    const { error } = await api.DELETE("/activities/{activity_id}", {
      params: { path: { activity_id: activity.id } },
    });
    setBusy(false);
    if (!error) onDeleted();
  }

  return (
    <li className="flex items-start justify-between gap-4 border-t border-[var(--color-border)] px-4 py-3 first:border-t-0">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium">{activity.activity_type_name}</span>
          {activity.voicemail && (
            <span className="rounded-full bg-[var(--color-surface)] px-2 py-0.5 text-xs text-[var(--color-muted)]">
              Voicemail
            </span>
          )}
          <span className="text-xs text-[var(--color-muted)]">
            {formatWhen(activity.occurred_at)}
          </span>
        </div>
        <RichTextContent html={activity.note} className="mt-1" />
        {message && (
          <p className="mt-1 whitespace-pre-wrap rounded-[var(--radius-base)] bg-[var(--color-surface)] px-3 py-2 text-sm">
            {shownMessage}
            {isLong && (
              <button
                type="button"
                className="ml-1 text-xs text-[var(--color-accent)]"
                onClick={() => setShowFull((v) => !v)}
              >
                {showFull ? "Show less" : "Read more"}
              </button>
            )}
          </p>
        )}
        <div className="mt-1 flex flex-wrap gap-3 text-xs">
          {!hideContact && activity.contact_id && (
            <Link href={`/contacts/${activity.contact_id}`} className="text-[var(--color-accent)]">
              {activity.contact_name ?? "Contact"}
            </Link>
          )}
          {!hideCompany && activity.company_id && (
            <Link href={`/companies/${activity.company_id}`} className="text-[var(--color-accent)]">
              {activity.company_name ?? "Company"}
            </Link>
          )}
        </div>
      </div>
      {armed ? (
        <span className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={onDelete}
            className="rounded-[var(--radius-base)] bg-red-600 px-2 py-1 text-xs font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {busy ? "Deleting…" : "Confirm"}
          </button>
          <button
            type="button"
            className="text-xs text-[var(--color-muted)] hover:text-[var(--color-fg)]"
            onClick={() => setArmed(false)}
          >
            Cancel
          </button>
        </span>
      ) : (
        <button
          type="button"
          className="shrink-0 text-xs text-[var(--color-muted)] hover:text-[var(--color-fg)]"
          onClick={() => setArmed(true)}
        >
          Delete
        </button>
      )}
    </li>
  );
}

export function ActivityLog({
  contactId,
  companyId,
  dealId,
  refreshKey,
}: {
  contactId?: number;
  companyId?: number;
  dealId?: number;
  // Bump from a parent to force a re-fetch (e.g. after an external action that
  // logs an activity, like removing the contact from a sequence).
  refreshKey?: number;
}) {
  const [activities, setActivities] = useState<Activity[]>([]);
  const [types, setTypes] = useState<ActivityType[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const [typeId, setTypeId] = useState("");
  const [occurredAt, setOccurredAt] = useState("");
  const [note, setNote] = useState("");
  const [voicemail, setVoicemail] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const query: Record<string, number> = {};
    if (contactId) query.contact_id = contactId;
    if (companyId) query.company_id = companyId;
    if (dealId) query.deal_id = dealId;
    const { data } = await api.GET("/activities", { params: { query } });
    setActivities(data ?? []);
    setLoading(false);
  }, [contactId, companyId, dealId]);

  useEffect(() => {
    load();
  }, [load, refreshKey]);

  useEffect(() => {
    api.GET("/activity-types").then(({ data }) => {
      if (data) setTypes(data);
    });
  }, []);

  const selectedType = useMemo(
    () => types.find((t) => String(t.id) === typeId),
    [types, typeId],
  );
  const isCall = selectedType?.name === "Call";

  function openForm() {
    setTypeId(types[0] ? String(types[0].id) : "");
    setOccurredAt(toLocalInput(new Date()));
    setNote("");
    setVoicemail(false);
    setError(null);
    setShowForm(true);
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!typeId) {
      setError("Pick an activity type");
      return;
    }
    setBusy(true);
    setError(null);
    const res = await api.POST("/activities", {
      body: {
        activity_type_id: Number(typeId),
        contact_id: contactId ?? null,
        company_id: companyId ?? null,
        deal_id: dealId ?? null,
        note: htmlToNullable(note),
        voicemail: isCall ? voicemail : null,
        occurred_at: occurredAt ? new Date(occurredAt).toISOString() : null,
      },
    });
    setBusy(false);
    if (res.error) {
      setError("Could not log activity");
      return;
    }
    setShowForm(false);
    load();
  }

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-lg font-semibold tracking-tight">Activity</h2>
        {!showForm && (
          <button type="button" className={btnPrimary} onClick={openForm}>
            + Log Activity
          </button>
        )}
      </div>

      {showForm && (
        <form
          onSubmit={onSubmit}
          className="mb-4 flex flex-col gap-4 rounded-[var(--radius-base)] border border-[var(--color-border)] p-4"
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
                  <option key={t.id} value={t.id}>
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
            <RichTextEditor value={note} onChange={setNote} />
          </Field>

          {error && <p className="text-sm text-red-600">{error}</p>}

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

      <div className="overflow-hidden rounded-[var(--radius-base)] border border-[var(--color-border)]">
        {loading ? (
          <p className="px-4 py-6 text-center text-sm text-[var(--color-muted)]">Loading…</p>
        ) : activities.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-[var(--color-muted)]">
            No activity logged yet.
          </p>
        ) : (
          <ul>
            {(expanded ? activities : activities.slice(0, COLLAPSED_COUNT)).map((a) => (
              <ActivityRow
                key={a.id}
                activity={a}
                onDeleted={load}
                hideContact={contactId != null}
                hideCompany={companyId != null}
              />
            ))}
          </ul>
        )}
      </div>

      {!loading && activities.length > COLLAPSED_COUNT && (
        <button
          type="button"
          className="mt-2 text-sm text-[var(--color-accent)]"
          onClick={() => setExpanded((v) => !v)}
        >
          {expanded
            ? "Show less"
            : `+ Show ${activities.length - COLLAPSED_COUNT} more`}
        </button>
      )}
    </div>
  );
}
