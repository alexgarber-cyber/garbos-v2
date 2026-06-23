"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { api } from "@/lib/api/client";
import type { components } from "@/lib/api/schema";
import { PageHeader } from "@/components/ui";
import { TypeBadge, formatDue } from "@/components/chainUi";
import { RichTextContent } from "@/components/RichTextContent";
import { htmlIsBlank } from "@/components/richText";

type Dashboard = components["schemas"]["DashboardResponse"];
type Period = "day" | "week" | "month" | "year";

// Concrete token hexes (mirror web/src/app/globals.css) — recharts draws into an
// SVG and is happiest with literal colors for axes, grids, bars and lines.
const ACCENT = "#3b5fe5";
const MUTED = "#6b7280";
const BORDER = "#e5e7eb";

const PERIODS: { value: Period; label: string }[] = [
  { value: "day", label: "Today" },
  { value: "week", label: "This Week" },
  { value: "month", label: "This Month" },
  { value: "year", label: "This Year" },
];

const cardClass =
  "rounded-[var(--radius-base)] border border-[var(--color-border)] p-6";

function formatAmount(amount: number): string {
  return amount.toLocaleString(undefined, {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
}

// Shorten an over-time bucket label ("2026-05-30", "2026-05-30T13:00", "2026-05").
function formatTick(date: string): string {
  if (date.includes("T")) return date.split("T")[1];
  const parts = date.split("-");
  if (parts.length === 2) return `${parts[0]}-${parts[1]}`;
  return `${parts[1]}/${parts[2]}`;
}

function SummaryCard({
  label,
  value,
  sub,
  href,
  alert,
}: {
  label: string;
  value: string;
  sub?: string;
  href: string;
  alert?: boolean;
}) {
  return (
    <Link
      href={href}
      className={`${cardClass} block transition-colors hover:bg-[var(--color-surface)]`}
    >
      <div className="text-xs font-medium text-[var(--color-muted)]">{label}</div>
      <div
        className={`mt-2 text-3xl font-semibold tracking-tight ${
          alert ? "text-red-600" : ""
        }`}
      >
        {value}
      </div>
      {sub && <div className="mt-1 text-sm text-[var(--color-muted)]">{sub}</div>}
    </Link>
  );
}

function ChartCard({
  title,
  hasData,
  children,
}: {
  title: string;
  hasData: boolean;
  children: React.ReactElement;
}) {
  return (
    <div className={cardClass}>
      <h2 className="mb-4 text-sm font-medium text-[var(--color-muted)]">{title}</h2>
      {hasData ? (
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            {children}
          </ResponsiveContainer>
        </div>
      ) : (
        <div className="flex h-64 items-center justify-center text-sm text-[var(--color-muted)]">
          No activity in this period.
        </div>
      )}
    </div>
  );
}

export default function DashboardPage() {
  const [period, setPeriod] = useState<Period>("week");
  const [data, setData] = useState<Dashboard | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await api.GET("/dashboard", { params: { query: { period } } });
    setData(data ?? null);
    setLoading(false);
  }, [period]);

  useEffect(() => {
    load();
  }, [load]);

  const tickStyle = { fill: MUTED, fontSize: 12 };

  return (
    <div className="max-w-6xl">
      <PageHeader title="Dashboard" />

      {!data ? (
        <p className="text-[var(--color-muted)]">Loading…</p>
      ) : (
        <div className="flex flex-col gap-8">
          {/* Summary cards */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <SummaryCard
              label="Tasks due today"
              value={String(data.task_counts.due_today)}
              sub={`${data.task_counts.due_this_week} due this week`}
              href="/tasks"
            />
            <SummaryCard
              label="Active deals"
              value={String(data.deal_summary.active_count)}
              sub={`${formatAmount(data.deal_summary.pipeline_value)} pipeline`}
              href="/deals"
            />
            <SummaryCard
              label="Active sequences"
              value={String(data.sequence_stats.active_sequences)}
              sub={`${data.sequence_stats.active_enrollments} active enrollments`}
              href="/sequences"
            />
            <SummaryCard
              label="Overdue tasks"
              value={String(data.task_counts.overdue)}
              href="/tasks"
              alert={data.task_counts.overdue > 0}
            />
          </div>

          {/* Period selector */}
          <div className="inline-flex w-fit overflow-hidden rounded-[var(--radius-base)] border border-[var(--color-border)]">
            {PERIODS.map((p) => (
              <button
                key={p.value}
                type="button"
                onClick={() => setPeriod(p.value)}
                className={`px-3 py-1.5 text-sm transition-colors ${
                  period === p.value
                    ? "bg-[var(--color-accent)] text-[var(--color-accent-fg)]"
                    : "text-[var(--color-muted)] hover:text-[var(--color-fg)]"
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>

          {loading && <p className="text-sm text-[var(--color-muted)]">Updating…</p>}

          {/* Completed activity feed — the main report */}
          <section className={cardClass}>
            <h2 className="mb-4 text-sm font-medium text-[var(--color-muted)]">
              Completed activity
            </h2>
            {data.recent_completions.length === 0 ? (
              <p className="text-sm text-[var(--color-muted)]">
                No activity in this period.
              </p>
            ) : (
              <ul className="flex flex-col divide-y divide-[var(--color-border)]">
                {data.recent_completions.map((a) => (
                  <li
                    key={a.id}
                    className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5 text-sm"
                  >
                    <TypeBadge name={a.activity_type_name} />
                    <div className="flex-1 min-w-[12rem]">
                      {htmlIsBlank(a.note) ? (
                        <span className="text-[var(--color-muted)]">—</span>
                      ) : (
                        <RichTextContent html={a.note} />
                      )}
                    </div>
                    <span className="flex items-center gap-2 text-xs text-[var(--color-muted)]">
                      {a.contact_id && a.contact_name && (
                        <Link
                          href={`/contacts/${a.contact_id}`}
                          className="text-[var(--color-accent)]"
                        >
                          {a.contact_name}
                        </Link>
                      )}
                      {a.company_id && a.company_name && (
                        <Link
                          href={`/companies/${a.company_id}`}
                          className="text-[var(--color-accent)]"
                        >
                          {a.company_name}
                        </Link>
                      )}
                      {a.deal_id && a.deal_title && (
                        <Link
                          href={`/deals/${a.deal_id}`}
                          className="text-[var(--color-accent)]"
                        >
                          {a.deal_title}
                        </Link>
                      )}
                      <span>{formatDue(a.occurred_at)}</span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* Charts */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <ChartCard
              title="Activities by type"
              hasData={data.activity_summary.by_type.some((d) => d.count > 0)}
            >
              <BarChart data={data.activity_summary.by_type}>
                <CartesianGrid strokeDasharray="3 3" stroke={BORDER} vertical={false} />
                <XAxis dataKey="type_name" tick={tickStyle} stroke={BORDER} />
                <YAxis allowDecimals={false} tick={tickStyle} stroke={BORDER} />
                <Tooltip cursor={{ fill: "rgba(0,0,0,0.03)" }} />
                <Bar dataKey="count" fill={ACCENT} radius={[3, 3, 0, 0]} />
              </BarChart>
            </ChartCard>

            <ChartCard
              title="Lifecycle funnel"
              hasData={data.lifecycle_funnel.some((d) => d.count > 0)}
            >
              <BarChart
                layout="vertical"
                data={data.lifecycle_funnel}
                margin={{ left: 24 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke={BORDER} horizontal={false} />
                <XAxis type="number" allowDecimals={false} tick={tickStyle} stroke={BORDER} />
                <YAxis
                  type="category"
                  dataKey="status"
                  width={80}
                  tick={tickStyle}
                  stroke={BORDER}
                />
                <Tooltip cursor={{ fill: "rgba(0,0,0,0.03)" }} />
                <Bar dataKey="count" fill={ACCENT} radius={[0, 3, 3, 0]} />
              </BarChart>
            </ChartCard>

            <ChartCard
              title="Activities over time"
              hasData={data.activity_summary.over_time.some((d) => d.count > 0)}
            >
              <LineChart data={data.activity_summary.over_time}>
                <CartesianGrid strokeDasharray="3 3" stroke={BORDER} vertical={false} />
                <XAxis
                  dataKey="date"
                  tickFormatter={formatTick}
                  tick={tickStyle}
                  stroke={BORDER}
                  minTickGap={24}
                />
                <YAxis allowDecimals={false} tick={tickStyle} stroke={BORDER} />
                <Tooltip />
                <Line
                  type="monotone"
                  dataKey="count"
                  stroke={ACCENT}
                  strokeWidth={2}
                  dot={false}
                />
              </LineChart>
            </ChartCard>

            {/* Deal pipeline mini-view */}
            <div className={cardClass}>
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-sm font-medium text-[var(--color-muted)]">
                  Deal pipeline
                </h2>
                <Link href="/deals" className="text-sm text-[var(--color-accent)]">
                  View pipeline →
                </Link>
              </div>
              {data.deal_summary.by_stage.length === 0 ? (
                <p className="text-sm text-[var(--color-muted)]">No active stages.</p>
              ) : (
                <ul className="flex flex-col divide-y divide-[var(--color-border)]">
                  {data.deal_summary.by_stage.map((s) => (
                    <li
                      key={s.stage_name}
                      className="flex items-center justify-between py-2 text-sm"
                    >
                      <span>
                        {s.stage_name}{" "}
                        <span className="text-[var(--color-muted)]">({s.count})</span>
                      </span>
                      <span className="text-[var(--color-muted)]">
                        {formatAmount(s.total_amount)}
                      </span>
                    </li>
                  ))}
                  <li className="flex items-center justify-between py-2 text-sm font-medium">
                    <span>Total pipeline</span>
                    <span>{formatAmount(data.deal_summary.pipeline_value)}</span>
                  </li>
                </ul>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
