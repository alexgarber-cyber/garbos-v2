"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

import { api } from "@/lib/api/client";
import type { components } from "@/lib/api/schema";
import { PageHeader } from "@/components/ui";
import { SequenceForm } from "@/components/SequenceForm";

type Sequence = components["schemas"]["SequenceResponse"];

export default function EditSequencePage() {
  const id = Number(useParams().id);
  const [sequence, setSequence] = useState<Sequence | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .GET("/sequences/{sequence_id}", { params: { path: { sequence_id: id } } })
      .then(({ data }) => {
        setSequence(data ?? null);
        setLoading(false);
      });
  }, [id]);

  if (loading) return <p className="text-[var(--color-muted)]">Loading…</p>;
  if (!sequence)
    return (
      <div>
        <p className="text-[var(--color-muted)]">Sequence not found.</p>
        <Link href="/sequences" className="text-sm text-[var(--color-accent)]">
          ← Back to sequences
        </Link>
      </div>
    );

  return (
    <div className="max-w-2xl">
      <PageHeader title={`Edit ${sequence.name}`} />
      <SequenceForm initial={sequence} />
    </div>
  );
}
