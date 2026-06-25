"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import { api } from "@/lib/api/client";
import type { components } from "@/lib/api/schema";
import { Field, btnPrimary, btnSecondary, inputClass } from "@/components/ui";

type UnmatchedEmail = components["schemas"]["UnmatchedEmailResponse"];

const cardClass =
  "rounded-[var(--radius-base)] border border-[var(--color-border)] p-6";

// Broadcast so the nav badge refreshes immediately after an action.
export const UNMATCHED_CHANGED_EVENT = "unmatched-emails-changed";
function broadcastChange() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(UNMATCHED_CHANGED_EVENT));
  }
}

function defaultFirstName(address: string): string {
  const local = address.split("@")[0] ?? address;
  const cleaned = local.replace(/[._]+/g, " ").trim();
  return cleaned ? cleaned.replace(/\b\w/g, (c) => c.toUpperCase()) : address;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

type Mode = "contact" | "lead";

function AddModal({
  email,
  mode,
  onClose,
  onDone,
}: {
  email: UnmatchedEmail;
  mode: Mode;
  onClose: () => void;
  onDone: () => void;
}) {
  const [firstName, setFirstName] = useState(defaultFirstName(email.from_address));
  const [lastName, setLastName] = useState("");
  const [title, setTitle] = useState("");
  const [phone, setPhone] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (mode === "lead" && !companyName.trim()) {
      toast.error("Company name is required for a lead");
      return;
    }
    setBusy(true);
    const shared = {
      first_name: firstName.trim() || undefined,
      last_name: lastName.trim() || undefined,
      title: title.trim() || undefined,
      phone: phone.trim() || undefined,
    };
    const res =
      mode === "contact"
        ? await api.POST("/unmatched-emails/{email_id}/add-contact", {
            params: { path: { email_id: email.id } },
            body: shared,
          })
        : await api.POST("/unmatched-emails/{email_id}/add-lead", {
            params: { path: { email_id: email.id } },
            body: { ...shared, company_name: companyName.trim() },
          });
    setBusy(false);
    if (res.error) {
      toast.error(`Could not add ${mode}`);
      return;
    }
    toast.success(mode === "contact" ? "Contact added" : "Lead added");
    onDone();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={() => !busy && onClose()}
    >
      <div
        className="w-full max-w-md rounded-[var(--radius-base)] border border-[var(--color-border)] bg-[var(--color-bg)] p-6 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="mb-1 text-lg font-semibold tracking-tight">
          {mode === "contact" ? "Add as Contact" : "Add as Lead"}
        </h2>
        <p className="mb-4 text-sm text-[var(--color-muted)]">{email.from_address}</p>
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-3">
            <Field label="First name">
              <input
                className={`${inputClass} w-full`}
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
              />
            </Field>
            <Field label="Last name">
              <input
                className={`${inputClass} w-full`}
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
              />
            </Field>
          </div>
          {mode === "lead" && (
            <Field label="Company name">
              <input
                className={`${inputClass} w-full`}
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                placeholder="Required"
              />
            </Field>
          )}
          <div className="grid grid-cols-2 gap-3">
            <Field label="Title">
              <input
                className={`${inputClass} w-full`}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </Field>
            <Field label="Phone">
              <input
                className={`${inputClass} w-full`}
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
            </Field>
          </div>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" className={btnSecondary} disabled={busy} onClick={onClose}>
            Cancel
          </button>
          <button type="button" className={btnPrimary} disabled={busy} onClick={submit}>
            {busy ? "Adding…" : mode === "contact" ? "Add Contact" : "Add Lead"}
          </button>
        </div>
      </div>
    </div>
  );
}

export function UnmatchedEmailsCard() {
  const [emails, setEmails] = useState<UnmatchedEmail[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [modal, setModal] = useState<{ email: UnmatchedEmail; mode: Mode } | null>(null);

  const load = useCallback(async () => {
    const { data } = await api.GET("/unmatched-emails", {
      params: { query: { status_filter: "pending" } },
    });
    setEmails(data ?? []);
    setLoaded(true);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function ignore(email: UnmatchedEmail, domain: boolean) {
    // Optimistically drop every pending row from the same address/domain.
    const target = email.from_address.toLowerCase();
    const targetDomain = target.split("@")[1] ?? target;
    setEmails((prev) =>
      prev.filter((e) => {
        const addr = e.from_address.toLowerCase();
        return domain ? (addr.split("@")[1] ?? addr) !== targetDomain : addr !== target;
      }),
    );
    const res = await api.POST("/unmatched-emails/{email_id}/ignore", {
      params: { path: { email_id: email.id } },
      body: { domain },
    });
    if (res.error) {
      toast.error("Could not ignore sender");
      load();
      return;
    }
    toast.success(domain ? "Domain ignored" : "Sender ignored");
    broadcastChange();
  }

  // Hide the card entirely when there's nothing pending.
  if (loaded && emails.length === 0) return null;

  return (
    <section className={cardClass}>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-sm font-medium text-[var(--color-muted)]">
          Unmatched emails to review
        </h2>
        {emails.length > 0 && (
          <span className="rounded-full bg-[var(--color-accent)] px-2 py-0.5 text-xs font-medium text-[var(--color-accent-fg)]">
            {emails.length}
          </span>
        )}
      </div>

      {!loaded ? (
        <p className="text-sm text-[var(--color-muted)]">Loading…</p>
      ) : (
        <ul className="flex flex-col divide-y divide-[var(--color-border)]">
          {emails.map((e) => (
            <li
              key={e.id}
              className="flex flex-wrap items-center gap-x-3 gap-y-2 py-3 text-sm"
            >
              <div className="min-w-[14rem] flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-medium">{e.from_address}</span>
                  {e.direction && (
                    <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600">
                      {e.direction}
                    </span>
                  )}
                </div>
                <div className="text-[var(--color-muted)]">
                  {e.subject || <span className="italic">(no subject)</span>}
                </div>
              </div>
              <span className="text-xs text-[var(--color-muted)]">
                {formatDate(e.received_at)}
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  className={btnSecondary}
                  onClick={() => setModal({ email: e, mode: "contact" })}
                >
                  Add as Contact
                </button>
                <button
                  type="button"
                  className={btnSecondary}
                  onClick={() => setModal({ email: e, mode: "lead" })}
                >
                  Add as Lead
                </button>
                <button
                  type="button"
                  className={btnSecondary}
                  title="Ignore this sender (shift-click to ignore the whole domain)"
                  onClick={(ev) => ignore(e, ev.shiftKey)}
                >
                  Ignore
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {modal && (
        <AddModal
          email={modal.email}
          mode={modal.mode}
          onClose={() => setModal(null)}
          onDone={() => {
            setModal(null);
            // Drop the resolved row; refresh the badge.
            setEmails((prev) => prev.filter((e) => e.id !== modal.email.id));
            broadcastChange();
          }}
        />
      )}
    </section>
  );
}
