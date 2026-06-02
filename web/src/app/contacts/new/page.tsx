"use client";

import { useSearchParams } from "next/navigation";
import { Suspense } from "react";

import { ContactForm } from "@/components/ContactForm";
import { PageHeader } from "@/components/ui";

function NewContactInner() {
  const searchParams = useSearchParams();
  const companyParam = searchParams.get("company_id");
  const defaultCompanyId = companyParam ? Number(companyParam) : undefined;

  return <ContactForm defaultCompanyId={defaultCompanyId} />;
}

export default function NewContactPage() {
  return (
    <div>
      <PageHeader title="New contact" />
      <Suspense fallback={<p className="text-[var(--color-muted)]">Loading…</p>}>
        <NewContactInner />
      </Suspense>
    </div>
  );
}
