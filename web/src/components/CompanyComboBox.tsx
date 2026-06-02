"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { api } from "@/lib/api/client";
import type { components } from "@/lib/api/schema";
import { inputClass } from "@/components/ui";

type Company = components["schemas"]["CompanyResponse"];

/**
 * Searchable single-select for companies that emits a company *name* string.
 *
 * Selecting an existing company sets `value` to its name; typing a name that
 * matches none lets you keep it as a new company (created server-side on submit
 * via `get_or_create_company_by_name`).
 */
export function CompanyComboBox({
  value,
  onChange,
  placeholder = "Company *",
  className,
}: {
  value: string;
  onChange: (name: string) => void;
  placeholder?: string;
  className?: string;
}) {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    api.GET("/companies").then(({ data }) => {
      if (data) {
        setCompanies([...data].sort((a, b) => a.name.localeCompare(b.name)));
      }
    });
  }, []);

  // Close the dropdown when clicking outside.
  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const query = value.trim().toLowerCase();
  const matches = useMemo(
    () => companies.filter((c) => c.name.toLowerCase().includes(query)),
    [companies, query],
  );
  // Offer "+ New" when the typed text isn't an exact (case-insensitive) match.
  const exact = companies.some((c) => c.name.toLowerCase() === query);
  const showNew = value.trim().length > 0 && !exact;

  return (
    <div ref={wrapRef} className={`relative ${className ?? ""}`}>
      <input
        className={`${inputClass} w-full`}
        placeholder={placeholder}
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
      />
      {open && (matches.length > 0 || showNew) && (
        <ul className="absolute z-10 mt-1 max-h-60 w-full overflow-auto rounded-[var(--radius-base)] border border-[var(--color-border)] bg-[var(--color-bg)] py-1 shadow-lg">
          {showNew && (
            <li>
              <button
                type="button"
                className="block w-full px-3 py-2 text-left text-sm text-[var(--color-accent)] hover:bg-[var(--color-surface)]"
                onClick={() => setOpen(false)}
              >
                + New “{value.trim()}”
              </button>
            </li>
          )}
          {matches.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                className="block w-full px-3 py-2 text-left text-sm hover:bg-[var(--color-surface)]"
                onClick={() => {
                  onChange(c.name);
                  setOpen(false);
                }}
              >
                {c.name}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
