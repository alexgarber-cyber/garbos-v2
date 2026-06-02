"use client";

import { PageHeader } from "@/components/ui";
import { SequenceForm } from "@/components/SequenceForm";

export default function NewSequencePage() {
  return (
    <div className="max-w-2xl">
      <PageHeader title="New sequence" />
      <SequenceForm />
    </div>
  );
}
