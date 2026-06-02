"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

import { api } from "@/lib/api/client";
import type { components } from "@/lib/api/schema";
import { DeleteButton } from "@/components/DeleteButton";
import { ActivityLog } from "@/components/ActivityLog";
import { EnrollmentSection } from "@/components/EnrollmentSection";
import {
  EmailLink,
  LinkedInLink,
  StalenessIndicator,
  StatusBadge,
  btnPrimary,
  btnSecondary,
} from "@/components/ui";

type Contact = components["schemas"]["ContactResponse"];
type Deal = components["schemas"]["DealResponse"];

const DETAIL_FIELDS: { key: keyof Contact; label: string }[] = [
  { key: "title", label: "Title" },
  { key: "email", label: "Email" },
  { key: "phone", label: "Phone" },
  { key: "mobile", label: "Mobile" },
  { key: "linkedin_url", label: "LinkedIn" },
];

export default function ContactDetailPage() {
  const params = useParams();
  const id = Number(params.id);
  const [contact, setContact] = useState<Contact | null>(null);
  const [deals, setDeals] = useState<Deal[]>([]);
  const [loading, setLoading] = useState(true);
  // Bumped after an enrollment change so the activity feed re-fetches.
  const [activityRefresh, setActivityRefresh] = useState(0);

  useEffect(() => {
    api
      .GET("/contacts/{contact_id}", { params: { path: { contact_id: id } } })
      .then(({ data }) => {
        setContact(data ?? null);
        setLoading(false);
      });
    api
      .GET("/deals", { params: { query: { primary_contact_id: id } } })
      .then(({ data }) => setDeals(data ?? []));
  }, [id]);

  if (loading) return <p className="text-[var(--color-muted)]">Loading…</p>;
  if (!contact)
    return (
      <div>
        <p className="text-[var(--color-muted)]">Contact not found.</p>
        <Link href="/contacts" className="text-sm text-[var(--color-accent)]">
          ← Back to contacts
        </Link>
      </div>
    );

  const fullName = `${contact.first_name} ${contact.last_name ?? ""}`.trim();

  async function convertToLead() {
    const { data } = await api.PATCH("/contacts/{contact_id}/convert-to-lead", {
      params: { path: { contact_id: id } },
    });
    if (data) setContact(data);
  }

  return (
    <div className="max-w-3xl">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <Link href="/contacts" className="text-sm text-[var(--color-muted)]">
            ← Contacts
          </Link>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight">{fullName}</h1>
            {contact.lifecycle_status && <StatusBadge status={contact.lifecycle_status} />}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {!contact.lifecycle_status && (
            <button type="button" className={btnSecondary} onClick={convertToLead}>
              Convert to Lead
            </button>
          )}
          <Link href={`/contacts/${contact.id}/edit`} className={btnSecondary}>
            Edit
          </Link>
          <DeleteButton resource="contact" id={contact.id} redirectTo="/contacts" />
        </div>
      </div>

      <section className="rounded-[var(--radius-base)] border border-[var(--color-border)] p-6">
        <dl className="grid grid-cols-2 gap-x-8 gap-y-4">
          <div>
            <dt className="text-xs font-medium text-[var(--color-muted)]">Company</dt>
            <dd className="text-sm">
              {contact.company_id ? (
                <Link
                  href={`/companies/${contact.company_id}`}
                  className="text-[var(--color-accent)]"
                >
                  {contact.company_name ?? "View company"}
                </Link>
              ) : (
                "—"
              )}
            </dd>
          </div>
          {DETAIL_FIELDS.map((f) => (
            <div key={f.key as string}>
              <dt className="text-xs font-medium text-[var(--color-muted)]">{f.label}</dt>
              <dd className="text-sm">
                {f.key === "email" ? (
                  <EmailLink email={contact.email} />
                ) : f.key === "linkedin_url" ? (
                  <LinkedInLink url={contact.linkedin_url} label={contact.linkedin_url ?? undefined} />
                ) : (
                  contact[f.key] ?? "—"
                )}
              </dd>
            </div>
          ))}
        </dl>
        {contact.notes && (
          <div className="mt-4">
            <dt className="text-xs font-medium text-[var(--color-muted)]">Notes</dt>
            <dd className="text-sm">{contact.notes}</dd>
          </div>
        )}
      </section>

      <section className="mt-8">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold tracking-tight">Deals</h2>
          <Link
            href={`/deals/new?primary_contact_id=${contact.id}${contact.company_id ? `&company_id=${contact.company_id}` : ""}`}
            className={btnPrimary}
          >
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
        <EnrollmentSection
          contactId={contact.id}
          onChange={() => setActivityRefresh((k) => k + 1)}
        />
      </section>

      <section className="mt-8">
        <ActivityLog contactId={contact.id} refreshKey={activityRefresh} />
      </section>
    </div>
  );
}
