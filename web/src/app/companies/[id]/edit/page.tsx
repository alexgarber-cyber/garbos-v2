"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

import { api } from "@/lib/api/client";
import type { components } from "@/lib/api/schema";
import { CompanyForm } from "@/components/CompanyForm";
import { PageHeader } from "@/components/ui";

type Company = components["schemas"]["CompanyResponse"];

export default function EditCompanyPage() {
  const params = useParams();
  const id = Number(params.id);
  const [company, setCompany] = useState<Company | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .GET("/companies/{company_id}", { params: { path: { company_id: id } } })
      .then(({ data }) => {
        setCompany(data ?? null);
        setLoading(false);
      });
  }, [id]);

  if (loading) return <p className="text-[var(--color-muted)]">Loading…</p>;
  if (!company)
    return (
      <div>
        <p className="text-[var(--color-muted)]">Company not found.</p>
        <Link href="/companies" className="text-sm text-[var(--color-accent)]">
          ← Back to companies
        </Link>
      </div>
    );

  return (
    <div>
      <PageHeader title={`Edit ${company.name}`} />
      <CompanyForm initial={company} />
    </div>
  );
}
