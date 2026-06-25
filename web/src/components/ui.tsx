import Link from "next/link";

// Shared Scandinavian-token class strings (Block 0 design system).
export const inputClass =
  "rounded-[var(--radius-base)] border border-[var(--color-border)] px-3 py-2 text-sm outline-none focus:border-[var(--color-accent)]";

export const labelClass = "mb-1 block text-xs font-medium text-[var(--color-muted)]";

export const btnPrimary =
  "rounded-[var(--radius-base)] bg-[var(--color-accent)] px-3 py-2 text-sm font-medium text-[var(--color-accent-fg)] transition-opacity hover:opacity-90 disabled:opacity-50";

export const btnSecondary =
  "rounded-[var(--radius-base)] border border-[var(--color-border)] px-3 py-1.5 text-sm text-[var(--color-muted)] transition-colors hover:text-[var(--color-fg)] disabled:opacity-50";

export const LIFECYCLE_STATUSES = [
  "Lead",
  "Prospect",
  "Opportunity",
  "Customer",
  "Closed Lost",
] as const;

const STATUS_STYLES: Record<string, string> = {
  Lead: "bg-gray-100 text-gray-700",
  Prospect: "bg-blue-100 text-blue-700",
  Opportunity: "bg-green-100 text-green-700",
  Customer: "bg-green-100 text-green-700",
  "Closed Lost": "bg-red-100 text-red-700",
  // Chain statuses.
  active: "bg-blue-100 text-blue-700",
  completed: "bg-green-100 text-green-700",
  cancelled: "bg-gray-100 text-gray-700",
  // Sequence statuses.
  inactive: "bg-gray-100 text-gray-700",
  // Deal pipeline stages (default seed). Terminal stages mirror lifecycle colors.
  Qualifying: "bg-gray-100 text-gray-700",
  NDA: "bg-blue-100 text-blue-700",
  "Financial Review": "bg-blue-100 text-blue-700",
  "Term Sheet": "bg-indigo-100 text-indigo-700",
  "Due Diligence": "bg-amber-100 text-amber-700",
  Funding: "bg-purple-100 text-purple-700",
  "Closed Won": "bg-green-100 text-green-700",
};

export function StatusBadge({ status }: { status: string | null | undefined }) {
  if (!status) return null;
  const style = STATUS_STYLES[status] ?? "bg-gray-100 text-gray-700";
  return (
    <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${style}`}>
      {status}
    </span>
  );
}

// Days since last activity on a deal: neutral < 7, yellow ≥ 7, red ≥ 14
// (GarbOS staleness standard).
export function StalenessIndicator({ days }: { days: number }) {
  const style =
    days >= 14
      ? "bg-red-100 text-red-700"
      : days >= 7
        ? "bg-yellow-100 text-yellow-700"
        : "bg-gray-100 text-gray-600";
  const label = days === 0 ? "today" : days === 1 ? "1 day" : `${days} days`;
  return (
    <span
      className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${style}`}
      title="Days since last activity"
    >
      {label}
    </span>
  );
}

// Accent-styled link with a subtle hover underline (Scandinavian).
const linkClass = "text-[var(--color-accent)] hover:underline";

// Clickable mailto link; renders an em-dash when there's no email.
export function EmailLink({ email }: { email: string | null | undefined }) {
  if (!email) return <span className="text-[var(--color-muted)]">—</span>;
  return (
    <a href={`mailto:${email}`} className={linkClass}>
      {email}
    </a>
  );
}

// Coerce a user/import-supplied URL into a safe http(s) href, or null if it
// can't be (blocks javascript:/data: and other dangerous schemes). URLs without
// a scheme are assumed https.
function safeHttpHref(raw: string): string | null {
  try {
    const parsed = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`);
    return parsed.protocol === "http:" || parsed.protocol === "https:" ? parsed.href : null;
  } catch {
    return null;
  }
}

// Clickable LinkedIn link opening in a new tab; renders an em-dash when absent
// or when the stored URL isn't a safe http(s) link.
export function LinkedInLink({
  url,
  label = "LinkedIn",
}: {
  url: string | null | undefined;
  label?: string;
}) {
  const href = url ? safeHttpHref(url) : null;
  if (!href) return <span className="text-[var(--color-muted)]">—</span>;
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className={linkClass}>
      {label}
    </a>
  );
}

export function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className={labelClass}>{label}</span>
      {children}
    </label>
  );
}

export function PageHeader({
  title,
  action,
  secondaryAction,
}: {
  title: string;
  action?: { href: string; label: string };
  secondaryAction?: { href: string; label: string };
}) {
  return (
    <div className="mb-6 flex items-center justify-between">
      <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
      {(action || secondaryAction) && (
        <div className="flex items-center gap-2">
          {secondaryAction && (
            <Link href={secondaryAction.href} className={btnSecondary}>
              {secondaryAction.label}
            </Link>
          )}
          {action && (
            <Link href={action.href} className={btnPrimary}>
              {action.label}
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
