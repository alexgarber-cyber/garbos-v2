"use client";

import { useCallback, useEffect, useState } from "react";

import { api } from "@/lib/api/client";
import type { components } from "@/lib/api/schema";
import { PageHeader, btnPrimary, btnSecondary, inputClass } from "@/components/ui";

type PipelineStage = components["schemas"]["PipelineStageResponse"];
type CloseReason = components["schemas"]["CloseReasonResponse"];

export default function PipelineSettingsPage() {
  const [stages, setStages] = useState<PipelineStage[]>([]);
  const [reasons, setReasons] = useState<CloseReason[]>([]);
  const [newStage, setNewStage] = useState("");
  const [newReason, setNewReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const loadStages = useCallback(async () => {
    const { data } = await api.GET("/pipeline-stages");
    setStages(data ?? []);
  }, []);

  const loadReasons = useCallback(async () => {
    const { data } = await api.GET("/close-reasons");
    setReasons(data ?? []);
  }, []);

  useEffect(() => {
    loadStages();
    loadReasons();
  }, [loadStages, loadReasons]);

  async function addStage(e: React.FormEvent) {
    e.preventDefault();
    if (!newStage.trim()) return;
    setBusy(true);
    setError(null);
    const { error } = await api.POST("/pipeline-stages", {
      body: { name: newStage.trim(), is_terminal: false },
    });
    setBusy(false);
    if (error) {
      setError("Could not add stage (name may already exist)");
      return;
    }
    setNewStage("");
    loadStages();
  }

  async function rename(stage: PipelineStage) {
    const name = window.prompt("Rename stage", stage.name);
    if (!name || name === stage.name) return;
    setError(null);
    const { error } = await api.PUT("/pipeline-stages/{stage_id}", {
      params: { path: { stage_id: stage.id } },
      body: { name },
    });
    if (error) {
      setError("Could not rename stage");
      return;
    }
    loadStages();
  }

  async function reorder(index: number, dir: -1 | 1) {
    const target = index + dir;
    if (target < 0 || target >= stages.length) return;
    const ordered = [...stages];
    [ordered[index], ordered[target]] = [ordered[target], ordered[index]];
    setStages(ordered); // optimistic
    await api.PUT("/pipeline-stages/reorder", {
      body: { ordered_ids: ordered.map((s) => s.id) },
    });
    loadStages();
  }

  async function removeStage(stage: PipelineStage) {
    setError(null);
    const { error } = await api.DELETE("/pipeline-stages/{stage_id}", {
      params: { path: { stage_id: stage.id } },
    });
    if (error) {
      setError(
        `Could not delete "${stage.name}" — it is built-in or still has deals.`,
      );
      return;
    }
    loadStages();
  }

  async function addReason(e: React.FormEvent) {
    e.preventDefault();
    if (!newReason.trim()) return;
    setBusy(true);
    setError(null);
    const { error } = await api.POST("/close-reasons", {
      body: { name: newReason.trim() },
    });
    setBusy(false);
    if (error) {
      setError("Could not add close reason (name may already exist)");
      return;
    }
    setNewReason("");
    loadReasons();
  }

  return (
    <div className="max-w-2xl">
      <PageHeader title="Pipeline settings" />

      {error && <p className="mb-4 text-sm text-red-600">{error}</p>}

      <section className="mb-10">
        <h2 className="mb-3 text-lg font-semibold tracking-tight">Pipeline stages</h2>
        <div className="overflow-hidden rounded-[var(--radius-base)] border border-[var(--color-border)]">
          <ul>
            {stages.map((stage, index) => (
              <li
                key={stage.id}
                className="flex items-center justify-between gap-3 border-t border-[var(--color-border)] px-4 py-3 first:border-t-0"
              >
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">{stage.name}</span>
                  {stage.is_terminal && (
                    <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600">
                      terminal
                    </span>
                  )}
                  {stage.is_system && (
                    <span className="rounded-full bg-blue-50 px-2 py-0.5 text-xs text-blue-600">
                      built-in
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2 text-xs">
                  <button
                    type="button"
                    className="text-[var(--color-muted)] hover:text-[var(--color-fg)] disabled:opacity-30"
                    disabled={index === 0}
                    onClick={() => reorder(index, -1)}
                    aria-label="Move up"
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    className="text-[var(--color-muted)] hover:text-[var(--color-fg)] disabled:opacity-30"
                    disabled={index === stages.length - 1}
                    onClick={() => reorder(index, 1)}
                    aria-label="Move down"
                  >
                    ↓
                  </button>
                  <button
                    type="button"
                    className="text-[var(--color-muted)] hover:text-[var(--color-fg)]"
                    onClick={() => rename(stage)}
                  >
                    Rename
                  </button>
                  {!stage.is_system && (
                    <button
                      type="button"
                      className="text-red-600 hover:opacity-80"
                      onClick={() => removeStage(stage)}
                    >
                      Delete
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </div>
        <form onSubmit={addStage} className="mt-3 flex gap-2">
          <input
            className={`${inputClass} flex-1`}
            placeholder="New stage name"
            value={newStage}
            onChange={(e) => setNewStage(e.target.value)}
          />
          <button type="submit" className={btnPrimary} disabled={busy}>
            Add stage
          </button>
        </form>
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold tracking-tight">Close reasons</h2>
        <div className="overflow-hidden rounded-[var(--radius-base)] border border-[var(--color-border)]">
          <ul>
            {reasons.map((reason) => (
              <li
                key={reason.id}
                className="border-t border-[var(--color-border)] px-4 py-3 text-sm first:border-t-0"
              >
                {reason.name}
              </li>
            ))}
          </ul>
        </div>
        <form onSubmit={addReason} className="mt-3 flex gap-2">
          <input
            className={`${inputClass} flex-1`}
            placeholder="New close reason"
            value={newReason}
            onChange={(e) => setNewReason(e.target.value)}
          />
          <button type="submit" className={btnSecondary} disabled={busy}>
            Add reason
          </button>
        </form>
      </section>
    </div>
  );
}
