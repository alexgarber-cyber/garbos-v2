"use client";

import Link from "next/link";

import { api } from "@/lib/api/client";
import type { components } from "@/lib/api/schema";
import { StalenessIndicator } from "@/components/ui";

type Deal = components["schemas"]["DealResponse"];
type PipelineStage = components["schemas"]["PipelineStageResponse"];

function formatAmount(amount: number | null): string {
  if (amount == null) return "—";
  return amount.toLocaleString(undefined, {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
}

// Click-to-move board: each card carries a stage <select> that moves the deal.
export function DealKanban({
  deals,
  stages,
  onMoved,
}: {
  deals: Deal[];
  stages: PipelineStage[];
  onMoved: () => void;
}) {
  async function move(deal: Deal, stageId: number) {
    if (stageId === deal.pipeline_stage_id) return;
    await api.PUT("/deals/{deal_id}", {
      params: { path: { deal_id: deal.id } },
      body: { pipeline_stage_id: stageId },
    });
    onMoved();
  }

  return (
    <div className="flex gap-4 overflow-x-auto pb-4">
      {stages.map((stage) => {
        const stageDeals = deals.filter((d) => d.pipeline_stage_id === stage.id);
        return (
          <div key={stage.id} className="w-64 shrink-0">
            <div className="mb-2 flex items-center justify-between px-1">
              <h3 className="text-sm font-medium">{stage.name}</h3>
              <span className="text-xs text-[var(--color-muted)]">
                {stageDeals.length}
              </span>
            </div>
            <div className="flex min-h-[4rem] flex-col gap-2 rounded-[var(--radius-base)] bg-[var(--color-surface)] p-2">
              {stageDeals.map((deal) => (
                <div
                  key={deal.id}
                  className="rounded-[var(--radius-base)] border border-[var(--color-border)] bg-white p-3"
                >
                  <div className="flex items-start justify-between gap-2">
                    <Link
                      href={`/deals/${deal.id}`}
                      className="text-sm font-medium text-[var(--color-accent)]"
                    >
                      {deal.title}
                    </Link>
                    <StalenessIndicator days={deal.days_since_last_activity} />
                  </div>
                  <p className="mt-1 text-xs text-[var(--color-muted)]">
                    {deal.company_name ?? "—"}
                  </p>
                  <p className="mt-1 text-sm">{formatAmount(deal.amount)}</p>
                  <select
                    className="mt-2 w-full rounded-[var(--radius-base)] border border-[var(--color-border)] px-2 py-1 text-xs outline-none focus:border-[var(--color-accent)]"
                    value={deal.pipeline_stage_id}
                    onChange={(e) => move(deal, Number(e.target.value))}
                    aria-label="Move to stage"
                  >
                    {stages.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
