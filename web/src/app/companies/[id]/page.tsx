"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

import { api } from "@/lib/api/client";
import type { components } from "@/lib/api/schema";
import { DeleteButton } from "@/components/DeleteButton";
import { ActivityLog } from "@/components/ActivityLog";
import {
  EmailLink,
  StalenessIndicator,
  StatusBadge,
  btnPrimary,
  btnSecondary,
} from "@/components/ui";
import { RichTextContent } from "@/components/RichTextContent";

type Company = components["schemas"]["CompanyResponse"];
type Contact = components["schemas"]["ContactResponse"];
type Chain = components["schemas"]["ChainResponse"];
type Deal = components["schemas"]["DealResponse"];

const DETAIL_FIELDS: { key: keyof Company; label: string }[] = [
  { key: "domain", label: "Domain" },
  { key: "industry", label: "Industry" },
  { key: "employee_count", label: "Employees" },
  { key: "revenue_range", label: "Revenue range" },
  { key: "hq_city", label: "HQ city" },
  { key: "hq_state", label: "HQ state" },
  { key: "hq_country", label: "HQ country" },
  { key: "phone", label: "Phone" },
  { key: "lead_score", label: "Lead score" },
];

export default function CompanyDetailPage() {
  const params = useParams();
  const id = Number(params.id);
  const [company, setCompany] = useState<Company | null>(null);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [enrollments, setEnrollments] = useState<Chain[]>([]);
  const [deals, setDeals] = useState<Deal[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    async function load() {
      const { data, error } = await api.GET("/companies/{company_id}", {
        params: { path: { company_id: id } },
      });
      if (error || !data) {
        setNotFound(true);
        setLoading(false);
        return;
      }
      setCompany(data);
      const { data: cs } = await api.GET("/contacts", {
        params: { query: { company_id: id } },
      });
      setContacts(cs ?? []);
      const { data: chains } = await api.GET("/chains", {
        params: { query: { company_id: id } },
      });
      setEnrollments(
        (chains ?? []).filter((c) => c.sequence_id != null && c.status === "active"),
      );
      const { data: ds } = await api.GET("/deals", {
        params: { query: { company_id: id } },
      });
      setDeals(ds ?? []);
      setLoading(false);
    }
    load();
  }, [id]);

  if (loading) return <p className="text-[var(--color-muted)]">Loading…</p>;
  if (notFound || !company)
    return (
      <div>
        <p className="text-[var(--color-muted)]">Company not found.</p>
        <Link href="/companies" className="text-sm text-[var(--color-accent)]">
          ← Back to companies
        </Link>
      </div>
    );

  return (
    <div className="max-w-3xl">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <Link href="/companies" className="text-sm text-[var(--color-muted)]">
            ← Companies
          </Link>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold tracking-tight">{company.name}</h1>
            <StatusBadge status={company.lifecycle_status} />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Link href={`/companies/${company.id}/edit`} className={btnSecondary}>
            Edit
          </Link>
          <DeleteButton resource="company" id={company.id} redirectTo="/companies" />
        </div>
      </div>

      <section className="mb-8 rounded-[var(--radius-base)] border border-[var(--color-border)] p-6">
        <dl className="grid grid-cols-2 gap-x-8 gap-y-4">
          {DETAIL_FIELDS.map((f) => (
            <div key={f.key as string}>
              <dt className="text-xs font-medium text-[var(--color-muted)]">{f.label}</dt>
              <dd className="text-sm">{company[f.key] ?? "—"}</dd>
            </div>
          ))}
        </dl>
        {company.description && (
          <div className="mt-4">
            <dt className="text-xs font-medium text-[var(--color-muted)]">Description</dt>
            <dd className="text-sm">
              <RichTextContent html={company.description} />
            </dd>
          </div>
        )}
      </section>

      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-lg font-semibold tracking-tight">Contacts</h2>
        <Link href={`/contacts/new?company_id=${company.id}`} className={btnPrimary}>
          + New contact
        </Link>
      </div>

      <div className="overflow-hidden rounded-[var(--radius-base)] border border-[var(--color-border)]">
        <table className="w-full text-sm">
          <thead className="bg-[var(--color-surface)] text-left text-[var(--color-muted)]">
            <tr>
              <th className="px-4 py-2 font-medium">Name</th>
              <th className="px-4 py-2 font-medium">Title</th>
              <th className="px-4 py-2 font-medium">Email</th>
            </tr>
          </thead>
          <tbody>
            {contacts.length === 0 ? (
              <tr>
                <td colSpan={3} className="px-4 py-6 text-center text-[var(--color-muted)]">
                  No contacts yet.
                </td>
              </tr>
            ) : (
              contacts.map((c) => (
                <tr
                  key={c.id}
                  className="border-t border-[var(--color-border)] hover:bg-[var(--color-surface)]"
                >
                  <td className="px-4 py-2">
                    <Link href={`/contacts/${c.id}`} className="font-medium text-[var(--color-accent)]">
                      {c.first_name} {c.last_name ?? ""}
                    </Link>
                  </td>
                  <td className="px-4 py-2 text-[var(--color-muted)]">{c.title ?? "—"}</td>
                  <td className="px-4 py-2"><EmailLink email={c.email} /></td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <section className="mt-8">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold tracking-tight">Deals</h2>
          <Link href={`/deals/new?company_id=${company.id}`} className={btnPrimary}>
            + New deal
          </Link>
        </div>
        <div className="overflow-hidden rounded-[var(--radius-base)] border border-[var(--color-border)]">
          <table className="w-full text-sm">
            <thead className="bg-[var(--color-surface)] text-left text-[var(--color-muted)]">
              <tr>
                <th className="px-4 py-2 font-medium">Title</th>
                <th className="px-4 py-2 font-medium">Stage</th>
                <th className="px-4 py-2 font-medium">Last activity</th>
              </tr>
            </thead>
            <tbody>
              {deals.length === 0 ? (
                <tr>
                  <td colSpan={3} className="px-4 py-6 text-center text-[var(--color-muted)]">
                    No deals yet.
                  </td>
                </tr>
              ) : (
                deals.map((d) => (
                  <tr
                    key={d.id}
                    className="border-t border-[var(--color-border)] hover:bg-[var(--color-surface)]"
                  >
                    <td className="px-4 py-2">
                      <Link
                        href={`/deals/${d.id}`}
                        className="font-medium text-[var(--color-accent)]"
                      >
                        {d.title}
                      </Link>
                    </td>
                    <td className="px-4 py-2">
                      <StatusBadge status={d.pipeline_stage_name} />
                    </td>
                    <td className="px-4 py-2">
                      <StalenessIndicator days={d.days_since_last_activity} />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mt-8">
        <h2 className="mb-3 text-lg font-semibold tracking-tight">Sequence enrollments</h2>
        <div className="overflow-hidden rounded-[var(--radius-base)] border border-[var(--color-border)]">
          <table className="w-full text-sm">
            <thead className="bg-[var(--color-surface)] text-left text-[var(--color-muted)]">
              <tr>
                <th className="px-4 py-2 font-medium">Contact</th>
                <th className="px-4 py-2 font-medium">Sequence</th>
                <th className="px-4 py-2 font-medium">Progress</th>
                <th className="px-4 py-2 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {enrollments.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-6 text-center text-[var(--color-muted)]">
                    No active enrollments.
                  </td>
                </tr>
              ) : (
                enrollments.map((c) => {
                  const done = c.steps.filter((s) => s.completed).length;
                  return (
                    <tr
                      key={c.id}
                      className="border-t border-[var(--color-border)] hover:bg-[var(--color-surface)]"
                    >
                      <td className="px-4 py-2 text-[var(--color-muted)]">
                        {c.contact_id ? (
                          <Link
                            href={`/contacts/${c.contact_id}`}
                            className="text-[var(--color-accent)]"
                          >
                            {c.contact_name ?? "View contact"}
                          </Link>
                        ) : (
                          "—"
                        )}
                      </td>
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
        <ActivityLog companyId={company.id} />
      </section>
    </div>
  );
}
