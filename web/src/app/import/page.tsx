"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { apiBaseUrl } from "@/lib/api/client";
import type { components } from "@/lib/api/schema";
import { Field, PageHeader, btnPrimary, btnSecondary, inputClass } from "@/components/ui";

type Tab = "excel" | "pitchbook";

export default function ImportPage() {
  const [tab, setTab] = useState<Tab>("excel");

  return (
    <div>
      <PageHeader title="Import" />

      <div className="mb-6 flex gap-1 border-b border-[var(--color-border)]">
        <TabButton active={tab === "excel"} onClick={() => setTab("excel")}>
          Excel import
        </TabButton>
        <TabButton active={tab === "pitchbook"} onClick={() => setTab("pitchbook")}>
          PitchBook
        </TabButton>
      </div>

      {tab === "excel" ? <ExcelImport /> : <PitchbookImport />}
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`-mb-px border-b-2 px-4 py-2 text-sm transition-colors ${
        active
          ? "border-[var(--color-accent)] font-medium text-[var(--color-accent)]"
          : "border-transparent text-[var(--color-muted)] hover:text-[var(--color-fg)]"
      }`}
    >
      {children}
    </button>
  );
}

/* ------------------------------------------------------------------ Excel */

type PreviewResult = components["schemas"]["ExcelPreviewResponse"];
type ExcelResult = components["schemas"]["ExcelImportResponse"];

// Target field -> friendly label + header keywords used to auto-guess the mapping.
const TARGETS: { key: string; label: string; keywords: string[] }[] = [
  { key: "company_name", label: "Company Name", keywords: ["company"] },
  { key: "deal_date", label: "Deal Date", keywords: ["date"] },
  { key: "deal_amount", label: "Deal $", keywords: ["amount", "deal $", "$"] },
  { key: "name", label: "Name", keywords: ["name"] },
  { key: "title", label: "Title", keywords: ["title", "role"] },
  { key: "email", label: "Email", keywords: ["email", "e-mail"] },
  { key: "phone", label: "Phone", keywords: ["phone", "tel", "mobile"] },
  { key: "linkedin", label: "LinkedIn", keywords: ["linkedin"] },
];

// Preview table columns (keys returned in each ExcelPreviewResponse.sample row).
const PREVIEW_COLS: { key: string; label: string }[] = [
  { key: "company_name", label: "Company" },
  { key: "first_name", label: "First" },
  { key: "last_name", label: "Last" },
  { key: "title", label: "Title" },
  { key: "email", label: "Email" },
  { key: "phone", label: "Phone" },
  { key: "linkedin", label: "LinkedIn" },
  { key: "deal_date", label: "Deal Date" },
  { key: "deal_amount", label: "Deal $" },
];

function autoGuess(columns: string[]): Record<string, string> {
  const mapping: Record<string, string> = {};
  const used = new Set<string>();
  for (const t of TARGETS) {
    const found = columns.find(
      (c) =>
        !used.has(c) &&
        !/^unnamed:/i.test(c) && // pandas placeholder for empty-header columns
        t.keywords.some((k) => c.toLowerCase().includes(k)),
    );
    if (found) {
      mapping[t.key] = found;
      used.add(found);
    }
  }
  return mapping;
}

function ExcelImport() {
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [columns, setColumns] = useState<string[]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [sample, setSample] = useState<PreviewResult["sample"]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ExcelResult | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Clear the upload inputs (file, columns, mapping, preview) without touching
  // a just-set import result.
  function clearInputs() {
    setColumns([]);
    setMapping({});
    setSample([]);
    setFile(null);
    if (inputRef.current) inputRef.current.value = "";
  }

  function reset() {
    clearInputs();
    setResult(null);
    setError(null);
  }

  // Build the multipart body, optionally attaching the current mapping as JSON.
  function formData(withMapping: boolean): FormData {
    const fd = new FormData();
    fd.append("file", file as File);
    if (withMapping) {
      const m: Record<string, string> = {};
      for (const [k, v] of Object.entries(mapping)) if (v) m[k] = v;
      fd.append("column_mapping", JSON.stringify(m));
    }
    return fd;
  }

  async function pick(f: File | null) {
    if (!f) return;
    if (!f.name.toLowerCase().endsWith(".xlsx")) {
      setError("Please choose an .xlsx file.");
      return;
    }
    reset();
    setFile(f);
    setBusy(true);
    const fd = new FormData();
    fd.append("file", f);
    try {
      const res = await fetch(`${apiBaseUrl()}/import/excel/preview`, {
        method: "POST",
        body: fd,
        credentials: "include",
      });
      if (!res.ok) {
        setError(await errorDetail(res));
        setBusy(false);
        return;
      }
      const data: PreviewResult = await res.json();
      setColumns(data.columns);
      setMapping(autoGuess(data.columns));
    } catch {
      setError("Could not reach the server. Is the API running?");
    }
    setBusy(false);
  }

  // Re-fetch the cleaned preview whenever the mapping changes (company required).
  useEffect(() => {
    if (!file || !mapping.company_name) {
      setSample([]);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${apiBaseUrl()}/import/excel/preview`, {
          method: "POST",
          body: formData(true),
          credentials: "include",
        });
        if (!cancelled && res.ok) {
          const data: PreviewResult = await res.json();
          setSample(data.sample);
        }
      } catch {
        /* preview is best-effort; import surfaces real errors */
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapping, file]);

  async function doImport() {
    if (!file || !mapping.company_name) return;
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch(`${apiBaseUrl()}/import/excel`, {
        method: "POST",
        body: formData(true),
        credentials: "include",
      });
      if (!res.ok) {
        setError(await errorDetail(res));
        setBusy(false);
        return;
      }
      const data: ExcelResult = await res.json();
      setResult(data);
      clearInputs();
    } catch {
      setError("Could not reach the server. Is the API running?");
    }
    setBusy(false);
  }

  return (
    <div>
      <p className="mb-5 max-w-2xl text-sm text-[var(--color-muted)]">
        Upload any spreadsheet (<code>.xlsx</code>), map its columns to the fields below, preview
        the cleaned data, then import. Companies are matched by name (existing ones are reused);
        contacts are skipped when their email already exists.
      </p>

      <div
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          pick(e.dataTransfer.files?.[0] ?? null);
        }}
        className={`flex cursor-pointer flex-col items-center justify-center rounded-[var(--radius-base)] border-2 border-dashed p-10 text-center text-sm transition-colors ${
          dragging
            ? "border-[var(--color-accent)] bg-[var(--color-surface)]"
            : "border-[var(--color-border)] hover:border-[var(--color-accent)]"
        }`}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".xlsx"
          className="hidden"
          onChange={(e) => pick(e.currentTarget.files?.[0] ?? null)}
        />
        {file ? (
          <span className="font-medium text-[var(--color-fg)]">{file.name}</span>
        ) : (
          <span className="text-[var(--color-muted)]">Drag a .xlsx here, or click to browse</span>
        )}
      </div>

      {columns.length > 0 && (
        <div className="mt-6">
          <h2 className="mb-3 text-sm font-medium">Map columns</h2>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            {TARGETS.map((t) => (
              <Field key={t.key} label={t.label}>
                <select
                  className={`${inputClass} w-full`}
                  value={mapping[t.key] ?? ""}
                  onChange={(e) =>
                    setMapping((m) => ({ ...m, [t.key]: e.target.value }))
                  }
                >
                  <option value="">— none —</option>
                  {columns.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </Field>
            ))}
          </div>
          {!mapping.company_name && (
            <p className="mt-2 text-sm text-red-600">Map a Company Name column to continue.</p>
          )}
        </div>
      )}

      {sample.length > 0 && (
        <div className="mt-6">
          <h2 className="mb-3 text-sm font-medium">Preview (first {sample.length} rows)</h2>
          <div className="overflow-x-auto rounded-[var(--radius-base)] border border-[var(--color-border)]">
            <table className="w-full text-sm">
              <thead className="bg-[var(--color-surface)] text-left text-[var(--color-muted)]">
                <tr>
                  {PREVIEW_COLS.map((c) => (
                    <th key={c.key} className="whitespace-nowrap px-3 py-2 font-medium">
                      {c.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sample.map((row, i) => (
                  <tr key={i} className="border-t border-[var(--color-border)]">
                    {PREVIEW_COLS.map((c) => (
                      <td key={c.key} className="whitespace-nowrap px-3 py-2 text-[var(--color-fg)]">
                        {row[c.key] ?? "—"}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {file && (
        <div className="mt-4 flex items-center gap-3">
          <button
            type="button"
            className={btnPrimary}
            disabled={!mapping.company_name || busy}
            onClick={doImport}
          >
            {busy ? "Importing…" : "Import"}
          </button>
          <button
            type="button"
            className={btnSecondary}
            disabled={busy}
            onClick={reset}
          >
            Clear
          </button>
        </div>
      )}

      {error && <p className="mt-4 text-sm text-red-600">{error}</p>}

      {result && (
        <div className="mt-6 flex flex-col gap-4">
          <div className="rounded-[var(--radius-base)] border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
            <p className="text-sm font-medium">
              Imported {result.companies_created}{" "}
              {result.companies_created === 1 ? "company" : "companies"} and{" "}
              {result.contacts_created}{" "}
              {result.contacts_created === 1 ? "contact" : "contacts"}, skipped{" "}
              {result.skipped_duplicates}{" "}
              {result.skipped_duplicates === 1 ? "duplicate" : "duplicates"}.
            </p>
            <Link href="/companies" className="mt-2 inline-block text-sm text-[var(--color-accent)]">
              View companies →
            </Link>
          </div>
          {result.duplicates.length > 0 && (
            <ResultList
              title={`Skipped duplicates (${result.duplicates.length})`}
              items={result.duplicates}
            />
          )}
          {result.errors.length > 0 && (
            <ResultList title={`Errors (${result.errors.length})`} items={result.errors} />
          )}
        </div>
      )}
    </div>
  );
}

/* -------------------------------------------------------------- PitchBook */

type PitchbookResult = components["schemas"]["PitchbookImportResponse"];

function PitchbookImport() {
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<PitchbookResult | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  function pick(f: File | null) {
    if (!f) return;
    if (!f.name.toLowerCase().endsWith(".xlsx")) {
      setError("Please choose a PitchBook .xlsx export.");
      return;
    }
    setError(null);
    setResult(null);
    setFile(f);
  }

  async function upload() {
    if (!file) return;
    setBusy(true);
    setError(null);
    setResult(null);
    const fd = new FormData();
    fd.append("file", file);
    // Use fetch directly (not the openapi-fetch client) so credentials are
    // explicit: the multipart upload must carry the httpOnly session cookie,
    // and a plain credentialed fetch leaves no ambiguity. Browser sets the
    // multipart Content-Type + boundary automatically for FormData.
    let res: Response;
    try {
      res = await fetch(`${apiBaseUrl()}/import/pitchbook`, {
        method: "POST",
        body: fd,
        credentials: "include",
      });
    } catch {
      setBusy(false);
      setError("Could not reach the server. Is the API running?");
      return;
    }
    setBusy(false);
    if (!res.ok) {
      setError(await errorDetail(res));
      return;
    }
    const data: PitchbookResult = await res.json();
    setResult(data);
    setFile(null);
    if (inputRef.current) inputRef.current.value = "";
  }

  return (
    <div>
      <p className="mb-5 max-w-2xl text-sm text-[var(--color-muted)]">
        Upload a PitchBook company export (<code>.xlsx</code>). Companies are created as Leads;
        rows whose name already exists — or repeat within the file — are skipped and listed below.
      </p>

      <div
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          pick(e.dataTransfer.files?.[0] ?? null);
        }}
        className={`flex cursor-pointer flex-col items-center justify-center rounded-[var(--radius-base)] border-2 border-dashed p-10 text-center text-sm transition-colors ${
          dragging
            ? "border-[var(--color-accent)] bg-[var(--color-surface)]"
            : "border-[var(--color-border)] hover:border-[var(--color-accent)]"
        }`}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".xlsx"
          className="hidden"
          onChange={(e) => pick(e.currentTarget.files?.[0] ?? null)}
        />
        {file ? (
          <span className="font-medium text-[var(--color-fg)]">{file.name}</span>
        ) : (
          <span className="text-[var(--color-muted)]">Drag a .xlsx here, or click to browse</span>
        )}
      </div>

      <div className="mt-4 flex items-center gap-3">
        <button type="button" className={btnPrimary} disabled={!file || busy} onClick={upload}>
          {busy ? "Importing…" : "Import"}
        </button>
        {file && !busy && (
          <button
            type="button"
            className={btnSecondary}
            onClick={() => {
              setFile(null);
              if (inputRef.current) inputRef.current.value = "";
            }}
          >
            Clear
          </button>
        )}
      </div>

      {error && <p className="mt-4 text-sm text-red-600">{error}</p>}

      {result && (
        <div className="mt-6 flex flex-col gap-4">
          <div className="rounded-[var(--radius-base)] border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
            <p className="text-sm font-medium">
              Imported {result.imported}{" "}
              {result.imported === 1 ? "company" : "companies"}, skipped{" "}
              {result.skipped_duplicates}{" "}
              {result.skipped_duplicates === 1 ? "duplicate" : "duplicates"}.
            </p>
            <Link href="/companies" className="mt-2 inline-block text-sm text-[var(--color-accent)]">
              View companies →
            </Link>
          </div>

          {result.duplicates.length > 0 && (
            <ResultList
              title={`Skipped duplicates (${result.duplicates.length})`}
              items={result.duplicates}
            />
          )}
          {result.errors.length > 0 && (
            <ResultList title={`Errors (${result.errors.length})`} items={result.errors} />
          )}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ shared */

async function errorDetail(res: Response): Promise<string> {
  if (res.status === 401) {
    return "Your session has expired — please log in again, then retry the import.";
  }
  const detail = await res
    .json()
    .then((b) => (b && typeof b.detail === "string" ? b.detail : null))
    .catch(() => null);
  return detail ?? `Import failed (HTTP ${res.status})`;
}

function ResultList({
  title,
  items,
}: {
  title: string;
  items: components["schemas"]["ImportItem"][];
}) {
  return (
    <div className="overflow-hidden rounded-[var(--radius-base)] border border-[var(--color-border)]">
      <div className="border-b border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-2 text-xs font-medium text-[var(--color-muted)]">
        {title}
      </div>
      <ul className="divide-y divide-[var(--color-border)]">
        {items.map((item, i) => (
          <li key={`${item.name}-${i}`} className="flex justify-between gap-4 px-4 py-2 text-sm">
            <span className="text-[var(--color-fg)]">{item.name}</span>
            <span className="text-[var(--color-muted)]">{item.reason}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
