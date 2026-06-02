"use client";

import { useSearchParams } from "next/navigation";
import { Suspense } from "react";

import { DealForm } from "@/components/DealForm";
import { PageHeader } from "@/components/ui";

function NewDealInner() {
  const searchParams = useSearchParams();
  const companyParam = searchParams.get("company_id");
  const contactParam = searchParams.get("primary_contact_id");
  return (
    <DealForm
      defaultCompanyId={companyParam ? Number(companyParam) : undefined}
      defaultContactId={contactParam ? Number(contactParam) : undefined}
    />
  );
}

export default function NewDealPage() {
  return (
    <div>
      <PageHeader title="New deal" />
      <Suspense fallback={<p className="text-[var(--color-muted)]">Loading…</p>}>
        <NewDealInner />
      </Suspense>
    </div>
  );
}
