"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

import { api } from "@/lib/api/client";
import type { components } from "@/lib/api/schema";
import { ContactForm } from "@/components/ContactForm";
import { PageHeader } from "@/components/ui";

type Contact = components["schemas"]["ContactResponse"];

export default function EditContactPage() {
  const params = useParams();
  const id = Number(params.id);
  const [contact, setContact] = useState<Contact | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .GET("/contacts/{contact_id}", { params: { path: { contact_id: id } } })
      .then(({ data }) => {
        setContact(data ?? null);
        setLoading(false);
      });
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

  return (
    <div>
      <PageHeader title={`Edit ${fullName}`} />
      <ContactForm initial={contact} />
    </div>
  );
}
