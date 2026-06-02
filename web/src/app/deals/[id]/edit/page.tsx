"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

import { api } from "@/lib/api/client";
import type { components } from "@/lib/api/schema";
import { DealForm } from "@/components/DealForm";
import { PageHeader } from "@/components/ui";

type Deal = components["schemas"]["DealResponse"];

export default function EditDealPage() {
  const params = useParams();
  const id = Number(params.id);
  const [deal, setDeal] = useState<Deal | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .GET("/deals/{deal_id}", { params: { path: { deal_id: id } } })
      .then(({ data }) => {
        setDeal(data ?? null);
        setLoading(false);
      });
  }, [id]);

  if (loading) return <p className="text-[var(--color-muted)]">Loading…</p>;
  if (!deal)
    return (
      <div>
        <p className="text-[var(--color-muted)]">Deal not found.</p>
        <Link href="/deals" className="text-sm text-[var(--color-accent)]">
          ← Back to deals
        </Link>
      </div>
    );

  return (
    <div>
      <PageHeader title={`Edit ${deal.title}`} />
      <DealForm initial={deal} />
    </div>
  );
}
