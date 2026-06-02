"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { api } from "@/lib/api/client";
import { btnSecondary } from "@/components/ui";

type DeletePath =
  | "/companies/{company_id}"
  | "/contacts/{contact_id}"
  | "/chains/{chain_id}"
  | "/sequences/{sequence_id}"
  | "/deals/{deal_id}";

// Inline confirm (no dialog library): first click arms, second click deletes.
export function DeleteButton({
  resource,
  id,
  redirectTo,
  label = "Delete",
  confirmLabel = "Confirm delete",
  armingLabel = "Are you sure?",
}: {
  resource: "company" | "contact" | "chain" | "sequence" | "deal";
  id: number;
  redirectTo: string;
  label?: string;
  confirmLabel?: string;
  armingLabel?: string;
}) {
  const router = useRouter();
  const [armed, setArmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onDelete() {
    setBusy(true);
    setError(null);
    const path: DeletePath =
      resource === "company"
        ? "/companies/{company_id}"
        : resource === "chain"
          ? "/chains/{chain_id}"
          : resource === "sequence"
            ? "/sequences/{sequence_id}"
            : resource === "deal"
              ? "/deals/{deal_id}"
              : "/contacts/{contact_id}";
    const params =
      resource === "company"
        ? { path: { company_id: id } }
        : resource === "chain"
          ? { path: { chain_id: id } }
          : resource === "sequence"
            ? { path: { sequence_id: id } }
            : resource === "deal"
              ? { path: { deal_id: id } }
              : { path: { contact_id: id } };
    // @ts-expect-error path/params union is resolved at runtime by resource.
    const { error } = await api.DELETE(path, { params });
    setBusy(false);
    if (error) {
      setError("Delete failed");
      return;
    }
    router.push(redirectTo);
    router.refresh();
  }

  if (!armed) {
    return (
      <button type="button" className={btnSecondary} onClick={() => setArmed(true)}>
        {label}
      </button>
    );
  }

  return (
    <span className="flex items-center gap-2">
      <span className="text-sm text-[var(--color-muted)]">{armingLabel}</span>
      <button
        type="button"
        disabled={busy}
        onClick={onDelete}
        className="rounded-[var(--radius-base)] bg-red-600 px-3 py-1.5 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
      >
        {busy ? "Working…" : confirmLabel}
      </button>
      <button type="button" className={btnSecondary} onClick={() => setArmed(false)}>
        Cancel
      </button>
      {error && <span className="text-sm text-red-600">{error}</span>}
    </span>
  );
}
