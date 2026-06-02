"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { api } from "@/lib/api/client";
import type { components } from "@/lib/api/schema";
import { StatusBadge, btnPrimary, btnSecondary, inputClass } from "@/components/ui";

type Sequence = components["schemas"]["SequenceResponse"];
type Chain = components["schemas"]["ChainResponse"];

const REMOVAL_REASONS = [
  "Asked to be removed",
  "Moving to deal stage",
  "Other",
] as const;

/**
 * "Enroll in Sequence" section for a contact detail page.
 *
 * Lists active sequences in a picker, blocks re-enrolling a contact already in
 * an active enrollment for that sequence, and shows the contact's existing
 * sequence-generated chains.
 */
export function EnrollmentSection({
  contactId,
  onChange,
}: {
  contactId: number;
  // Called after an enroll/removal so the parent can refresh its activity feed.
  onChange?: () => void;
}) {
  const [sequences, setSequences] = useState<Sequence[]>([]);
  const [chains, setChains] = useState<Chain[]>([]);
  const [selected, setSelected] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Chain pending removal (drives the "remove from sequence" modal).
  const [removing, setRemoving] = useState<Chain | null>(null);

  const load = useCallback(async () => {
    const { data: seqs } = await api.GET("/sequences", {
      params: { query: { status: "active" } },
    });
    setSequences(seqs ?? []);
    const { data: cs } = await api.GET("/chains", {
      params: { query: { contact_id: contactId } },
    });
    setChains((cs ?? []).filter((c) => c.sequence_id != null));
  }, [contactId]);

  useEffect(() => {
    load();
  }, [load]);

  // Sequences with an active enrollment for this contact (block re-enroll).
  const activeSequenceIds = new Set(
    chains.filter((c) => c.status === "active").map((c) => c.sequence_id),
  );

  async function enroll() {
    if (!selected) return;
    setBusy(true);
    setError(null);
    const res = await api.POST("/sequences/{sequence_id}/enroll", {
      params: { path: { sequence_id: Number(selected) } },
      body: { contact_id: contactId },
    });
    setBusy(false);
    if (res.error) {
      // 409 = already enrolled; surface a friendly message.
      setError(
        res.response?.status === 409
          ? "Already enrolled in this sequence."
          : "Could not enroll.",
      );
      return;
    }
    setSelected("");
    load();
    onChange?.();
  }

  return (
    <div>
      <h2 className="mb-3 text-lg font-semibold tracking-tight">Sequences</h2>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <select
          className={inputClass}
          value={selected}
          onChange={(e) => setSelected(e.target.value)}
        >
          <option value="">— Select a sequence —</option>
          {sequences.map((s) => {
            const enrolled = activeSequenceIds.has(s.id);
            return (
              <option key={s.id} value={s.id} disabled={enrolled}>
                {s.name}
                {enrolled ? " (enrolled)" : ""}
              </option>
            );
          })}
        </select>
        <button
          type="button"
          className={btnPrimary}
          disabled={!selected || busy}
          onClick={enroll}
        >
          {busy ? "Enrolling…" : "Enroll"}
        </button>
        {error && <span className="text-sm text-red-600">{error}</span>}
      </div>

      {chains.length > 0 && (
        <div className="overflow-hidden rounded-[var(--radius-base)] border border-[var(--color-border)]">
          <table className="w-full text-sm">
            <thead className="bg-[var(--color-surface)] text-left text-[var(--color-muted)]">
              <tr>
                <th className="px-4 py-2 font-medium">Sequence</th>
                <th className="px-4 py-2 font-medium">Progress</th>
                <th className="px-4 py-2 font-medium">Status</th>
                <th className="px-4 py-2 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {chains.map((c) => {
                const done = c.steps.filter((s) => s.completed).length;
                return (
                  <tr
                    key={c.id}
                    className="border-t border-[var(--color-border)] hover:bg-[var(--color-surface)]"
                  >
                    <td className="px-4 py-2">
                      <Link
                        href={`/chains/${c.id}`}
                        className="font-medium text-[var(--color-accent)]"
                      >
                        {c.title}
                      </Link>
                    </td>
                    <td className="px-4 py-2 text-[var(--color-muted)]">
                      {done}/{c.steps.length}
                    </td>
                    <td className="px-4 py-2">
                      <StatusBadge status={c.status} />
                    </td>
                    <td className="px-4 py-2 text-right">
                      {c.status === "active" && (
                        <button
                          type="button"
                          className="text-xs text-red-600 hover:underline"
                          onClick={() => setRemoving(c)}
                        >
                          Remove from sequence
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {removing && (
        <RemoveFromSequenceModal
          chain={removing}
          onClose={() => setRemoving(null)}
          onDone={() => {
            setRemoving(null);
            load();
            onChange?.();
          }}
        />
      )}
    </div>
  );
}

/** Confirm removing a contact from a sequence, capturing the reason. */
function RemoveFromSequenceModal({
  chain,
  onClose,
  onDone,
}: {
  chain: Chain;
  onClose: () => void;
  onDone: () => void;
}) {
  const [reason, setReason] = useState<string>(REMOVAL_REASONS[0]);
  const [otherText, setOtherText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    const resolved = reason === "Other" ? otherText.trim() || "Other" : reason;
    setBusy(true);
    setError(null);
    const res = await api.POST("/chains/{chain_id}/cancel", {
      params: { path: { chain_id: chain.id } },
      body: { reason: resolved },
    });
    setBusy(false);
    if (res.error) {
      setError("Could not remove from sequence.");
      return;
    }
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
        <h2 className="text-lg font-semibold tracking-tight">Remove from sequence</h2>
        <p className="mt-1 text-sm text-[var(--color-muted)]">{chain.title}</p>
        <label className="mt-4 block">
          <span className="mb-1 block text-xs font-medium text-[var(--color-muted)]">
            Reason
          </span>
          <select
            className={`${inputClass} w-full`}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            autoFocus
          >
            {REMOVAL_REASONS.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </label>
        {reason === "Other" && (
          <textarea
            className={`${inputClass} mt-3 w-full`}
            rows={3}
            value={otherText}
            onChange={(e) => setOtherText(e.target.value)}
            placeholder="Add a note (optional)…"
          />
        )}
        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
        <div className="mt-4 flex items-center justify-end gap-3">
          <button type="button" className={btnSecondary} disabled={busy} onClick={onClose}>
            Cancel
          </button>
          <button type="button" className={btnPrimary} disabled={busy} onClick={submit}>
            {busy ? "Removing…" : "Remove"}
          </button>
        </div>
      </div>
    </div>
  );
}
