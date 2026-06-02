"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { api } from "@/lib/api/client";

export function LogoutButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function onLogout() {
    setBusy(true);
    // Best-effort: even if the call fails, still send the user to /login so the
    // button can never get wedged on "Signing out…".
    try {
      await api.POST("/auth/logout");
    } catch {
      // ignore — navigate regardless
    } finally {
      setBusy(false);
    }
    router.push("/login");
    router.refresh();
  }

  return (
    <button
      onClick={onLogout}
      disabled={busy}
      className="rounded-[var(--radius-base)] border border-[var(--color-border)] px-3 py-1.5 text-sm text-[var(--color-muted)] transition-colors hover:text-[var(--color-fg)] disabled:opacity-50"
    >
      {busy ? "Signing out…" : "Sign out"}
    </button>
  );
}
