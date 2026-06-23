"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import { api } from "@/lib/api/client";
import type { components } from "@/lib/api/schema";
import { ActivityLog } from "@/components/ActivityLog";
import { DeleteButton } from "@/components/DeleteButton";
import {
  StalenessIndicator,
  StatusBadge,
  btnPrimary,
  btnSecondary,
  inputClass,
} from "@/components/ui";
import { RichTextContent } from "@/components/RichTextContent";

type Deal = components["schemas"]["DealResponse"];
type PipelineStage = components["schemas"]["PipelineStageResponse"];
type CloseReason = components["schemas"]["CloseReasonResponse"];
type Chain = components["schemas"]["ChainResponse"];

function formatAmount(amount: number | null): string {
  if (amount == null) return "—";
  return amount.toLocaleString(undefined, {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  });
}

export default function DealDetailPage() {
  const params = useParams();
  const id = Number(params.id);
  const [deal, setDeal] = useState<Deal | null>(null);
  const [stages, setStages] = useState<PipelineStage[]>([]);
  const [reasons, setReasons] = useState<CloseReason[]>([]);
  const [chains, setChains] = useState<Chain[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [showClose, setShowClose] = useState(false);
  const [closeStageId, setCloseStageId] = useState("");
  const [closeReasonId, setCloseReasonId] = useState("");
  const [busy, setBusy] = useState(false);

  const loadDeal = useCallback(async () => {
    const { data, error } = await api.GET("/deals/{deal_id}", {
      params: { path: { deal_id: id } },
    });
    if (error || !data) {
      setNotFound(true);
      setLoading(false);
      return;
    }
    setDeal(data);
    setLoading(false);
  }, [id]);

  const loadChains = useCallback(async () => {
    const { data } = await api.GET("/chains", {
      params: { query: { deal_id: id } },
    });
    setChains(data ?? []);
  }, [id]);

  useEffect(() => {
    loadDeal();
    loadChains();
    api.GET("/pipeline-stages").then(({ data }) => {
      if (data) setStages(data);
    });
    api.GET("/close-reasons").then(({ data }) => {
      if (data) setReasons(data);
    });
  }, [loadDeal, loadChains]);

  if (loading) return <p className="text-[var(--color-muted)]">Loading…</p>;
  if (notFound || !deal)
    return (
      <div>
        <p className="text-[var(--color-muted)]">Deal not found.</p>
        <Link href="/deals" className="text-sm text-[var(--color-accent)]">
          ← Back to deals
        </Link>
      </div>
    );

  const sorted = [...stages].sort((a, b) => a.display_order - b.display_order);
  const currentStage = sorted.find((s) => s.id === deal.pipeline_stage_id);
  const nextStage = sorted.find(
    (s) =>
      !s.is_terminal &&
      currentStage != null &&
      s.display_order > currentStage.display_order,
  );

  async function advance() {
    if (!nextStage) return;
    setBusy(true);
    await api.PUT("/deals/{deal_id}", {
      params: { path: { deal_id: id } },
      body: { pipeline_stage_id: nextStage.id },
    });
    setBusy(false);
    loadDeal();
  }

  async function closeDeal() {
    if (!closeStageId) return;
    setBusy(true);
    await api.POST("/deals/{deal_id}/close", {
      params: { path: { deal_id: id } },
      body: {
        pipeline_stage_id: Number(closeStageId),
        close_reason_id: closeReasonId ? Number(closeReasonId) : null,
      },
    });
    setBusy(false);
    setShowClose(false);
    loadDeal();
  }

  const terminalStages = sorted.filter((s) => s.is_terminal);

  return (
    <div className="max-w-3xl">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <Link href="/deals" className="text-sm text-[var(--color-muted)]">
            ← Deals
          </Link>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold tracking-tight">{deal.title}</h1>
            <StatusBadge status={deal.pipeline_stage_name} />
            <StalenessIndicator days={deal.days_since_last_activity} />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Link href={`/deals/${deal.id}/edit`} className={btnSecondary}>
            Edit
          </Link>
          <DeleteButton resource="deal" id={deal.id} redirectTo="/deals" />
        </div>
      </div>

      <section className="mb-6 rounded-[var(--radius-base)] border border-[var(--color-border)] p-6">
        <dl className="grid grid-cols-2 gap-x-8 gap-y-4">
          <div>
            <dt className="text-xs font-medium text-[var(--color-muted)]">Company</dt>
            <dd className="text-sm">
              {deal.company_id ? (
                <Link
                  href={`/companies/${deal.company_id}`}
                  className="text-[var(--color-accent)]"
                >
                  {deal.company_name ?? "View company"}
                </Link>
              ) : (
                "—"
              )}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-medium text-[var(--color-muted)]">Primary contact</dt>
            <dd className="text-sm">
              {deal.primary_contact_id ? (
                <Link
                  href={`/contacts/${deal.primary_contact_id}`}
                  className="text-[var(--color-accent)]"
                >
                  {deal.primary_contact_name ?? "View contact"}
                </Link>
              ) : (
                "—"
              )}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-medium text-[var(--color-muted)]">Amount</dt>
            <dd className="text-sm">{formatAmount(deal.amount)}</dd>
          </div>
          <div>
            <dt className="text-xs font-medium text-[var(--color-muted)]">Expected close</dt>
            <dd className="text-sm">{deal.expected_close_date ?? "—"}</dd>
          </div>
          {deal.close_reason_name && (
            <div>
              <dt className="text-xs font-medium text-[var(--color-muted)]">Close reason</dt>
              <dd className="text-sm">{deal.close_reason_name}</dd>
            </div>
          )}
        </dl>
        {deal.notes && (
          <div className="mt-4">
            <dt className="text-xs font-medium text-[var(--color-muted)]">Notes</dt>
            <dd className="text-sm">
              <RichTextContent html={deal.notes} />
            </dd>
          </div>
        )}

        <div className="mt-6 flex flex-wrap items-center gap-3 border-t border-[var(--color-border)] pt-4">
          {nextStage && !deal.is_terminal && (
            <button
              type="button"
              className={btnPrimary}
              disabled={busy}
              onClick={advance}
            >
              Advance to {nextStage.name}
            </button>
          )}
          {!deal.is_terminal && (
            <button
              type="button"
              className={btnSecondary}
              onClick={() => {
                setShowClose((s) => !s);
                setCloseStageId(terminalStages[0]?.id.toString() ?? "");
              }}
            >
              Close deal
            </button>
          )}
        </div>

        {showClose && !deal.is_terminal && (
          <div className="mt-4 flex flex-col gap-3 rounded-[var(--radius-base)] border border-[var(--color-border)] p-4">
            <div className="grid grid-cols-2 gap-4">
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-[var(--color-muted)]">
                  Outcome
                </span>
                <select
                  className={`${inputClass} w-full`}
                  value={closeStageId}
                  onChange={(e) => setCloseStageId(e.target.value)}
                >
                  {terminalStages.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-[var(--color-muted)]">
                  Reason
                </span>
                <select
                  className={`${inputClass} w-full`}
                  value={closeReasonId}
                  onChange={(e) => setCloseReasonId(e.target.value)}
                >
                  <option value="">— None —</option>
                  {reasons.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="flex items-center gap-3">
              <button
                type="button"
                className={btnPrimary}
                disabled={busy}
                onClick={closeDeal}
              >
                {busy ? "Closing…" : "Confirm close"}
              </button>
              <button
                type="button"
                className={btnSecondary}
                onClick={() => setShowClose(false)}
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </section>

      <section className="mb-8">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold tracking-tight">Linked chains</h2>
          <Link href={`/chains/new?deal_id=${deal.id}`} className={btnPrimary}>
            + New chain
          </Link>
        </div>
        <div className="overflow-hidden rounded-[var(--radius-base)] border border-[var(--color-border)]">
          <table className="w-full text-sm">
            <thead className="bg-[var(--color-surface)] text-left text-[var(--color-muted)]">
              <tr>
                <th className="px-4 py-2 font-medium">Title</th>
                <th className="px-4 py-2 font-medium">Progress</th>
                <th className="px-4 py-2 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {chains.length === 0 ? (
                <tr>
                  <td colSpan={3} className="px-4 py-6 text-center text-[var(--color-muted)]">
                    No linked chains.
                  </td>
                </tr>
              ) : (
                chains.map((c) => {
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
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mt-8">
        <ActivityLog dealId={deal.id} />
      </section>
    </div>
  );
}
