// Small shared bits for the Chains + Tasks surfaces.

const RESPONSIBLE_STYLES: Record<string, string> = {
  me: "bg-blue-100 text-blue-700",
  them: "bg-amber-100 text-amber-700",
  internal: "bg-purple-100 text-purple-700",
};

export function ResponsibleTag({ party }: { party: string }) {
  const style = RESPONSIBLE_STYLES[party] ?? "bg-gray-100 text-gray-700";
  return (
    <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${style}`}>
      {party}
    </span>
  );
}

export function TypeBadge({ name }: { name: string }) {
  return (
    <span className="inline-block rounded-full bg-[var(--color-surface)] px-2 py-0.5 text-xs text-[var(--color-muted)]">
      {name}
    </span>
  );
}

export function formatDue(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// Compare a due timestamp against "now" by calendar day (local time).
export function isOverdue(iso: string): boolean {
  return new Date(iso).getTime() < Date.now();
}
