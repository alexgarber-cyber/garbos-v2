#!/usr/bin/env python3
"""One-time batch import of companies + contacts into GarbOS via the API.

Dedupes companies by name (case-insensitive, ticker suffixes stripped) against
both the existing DB and earlier rows in this run; creates a contact per row
that has a Name. Stdlib only (urllib) so it runs anywhere with python3.

Run from anywhere:  python3 scripts/import_contacts_batch.py
"""

import csv
import io
import json
import os
import re
import urllib.error
import urllib.request
from http.cookiejar import CookieJar

# Config + credentials come from the environment so nothing sensitive is
# committed. Defaults match the local dev seed (see .env.example).
BASE = os.environ.get("GARBOS_BASE_URL", "http://localhost:8000")
EMAIL = os.environ.get("GARBOS_EMAIL", "alex@garbos.app")
PASSWORD = os.environ.get("GARBOS_PASSWORD", "changeme-please")

# Real import rows are PII (names, work emails, phone numbers) and MUST NOT be
# committed. Put them in this gitignored CSV — columns, in order, are:
#   company, date, amount, name, title, email, phone, linkedin   (no header row)
# If the file is absent we fall back to a tiny, obviously-fake sample so the
# script still runs end-to-end.
DATA_FILE = os.path.join(os.path.dirname(__file__), "contacts_import_data.csv")

_EXAMPLE_DATA = """\
Example Labs,2026-01-02,10,Jane Doe,CEO,jane@example.com,(555) 010-0001,https://www.linkedin.com/in/example-jane-doe/
Sample Corp,2026-01-03,25,John Roe,CTO,john@sample.test,,https://www.linkedin.com/in/example-john-roe/
"""


def load_data() -> str:
    """Read the gitignored import CSV, or fall back to the bundled example."""
    if os.path.exists(DATA_FILE):
        with open(DATA_FILE, encoding="utf-8") as fh:
            return fh.read()
    print(f"No {DATA_FILE} found — using built-in example rows.\n")
    return _EXAMPLE_DATA

_TICKER_RE = re.compile(r"\s*\([A-Z]+:\s*[A-Z0-9.\-]+\)\s*$")

# urllib opener with a cookie jar so the session cookie persists across calls.
_opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(CookieJar()))


def call(method: str, path: str, body: dict | None = None):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(f"{BASE}{path}", data=data, method=method)
    if data is not None:
        req.add_header("Content-Type", "application/json")
    with _opener.open(req) as resp:
        raw = resp.read()
        return json.loads(raw) if raw else None


def strip_ticker(name: str) -> str:
    return _TICKER_RE.sub("", name).strip()


def clean_email(raw: str) -> str | None:
    e = raw.strip()
    if e.lower().startswith("mailto:"):
        e = e[len("mailto:"):]
    return e.strip() or None


def clean_phone(raw: str) -> str | None:
    p = raw.strip().lstrip("=").strip()
    if p.startswith("+1"):
        p = p[2:].strip()
    return p or None


def split_name(name: str) -> tuple[str, str | None]:
    parts = name.split()
    if not parts:
        return "", None
    return parts[0], (" ".join(parts[1:]) or None)


def main() -> None:
    call("POST", "/auth/login", {"email": EMAIL, "password": PASSWORD})
    print(f"Logged in as {EMAIL}\n")

    # Map of existing companies: stripped-lowercase name -> id.
    existing = {
        strip_ticker(c["name"]).lower(): c["id"] for c in call("GET", "/companies")
    }

    company_status: dict[str, str] = {}  # key -> "created" | "existed"
    name_to_id: dict[str, int] = dict(existing)
    contacts_created = 0
    errors: list[str] = []
    company_contact_counts: dict[str, int] = {}

    for row in csv.reader(io.StringIO(load_data())):
        if not row or not row[0].strip():
            continue
        raw_company = row[0].strip()
        name_field = row[3].strip() if len(row) > 3 else ""
        title = row[4].strip() if len(row) > 4 else ""
        email = clean_email(row[5]) if len(row) > 5 else None
        phone = clean_phone(row[6]) if len(row) > 6 else None
        linkedin = (row[7].strip() or None) if len(row) > 7 else None

        company_name = strip_ticker(raw_company)
        key = company_name.lower()

        # Resolve / create the company once per unique name.
        if key not in company_status:
            if key in name_to_id:
                company_status[key] = "existed"
            else:
                try:
                    created = call(
                        "POST",
                        "/companies",
                        {"name": company_name, "lifecycle_status": "Lead"},
                    )
                    name_to_id[key] = created["id"]
                    company_status[key] = "created"
                except urllib.error.HTTPError as exc:
                    errors.append(f"company '{company_name}': {exc.code} {exc.read().decode()[:120]}")
                    continue
        company_id = name_to_id[key]

        # Skip rows with no contact info at all.
        if not name_field and not email and not phone and not linkedin:
            continue
        # Only create a contact when there is a name (per spec).
        if not name_field:
            continue

        first, last = split_name(name_field)
        payload: dict = {"first_name": first, "company_id": company_id}
        if last:
            payload["last_name"] = last
        if title:
            payload["title"] = title
        if email:
            payload["email"] = email
        if phone:
            payload["phone"] = phone
        if linkedin:
            payload["linkedin_url"] = linkedin

        try:
            call("POST", "/contacts", payload)
            contacts_created += 1
            company_contact_counts[company_name] = company_contact_counts.get(company_name, 0) + 1
        except urllib.error.HTTPError as exc:
            errors.append(f"contact '{name_field}' @ {company_name}: {exc.code} {exc.read().decode()[:120]}")

    created = [k for k, v in company_status.items() if v == "created"]
    existed = [k for k, v in company_status.items() if v == "existed"]

    print("=== Import report ===")
    print(f"Companies created:       {len(created)}")
    print(f"Companies already exist: {len(existed)}")
    print(f"Contacts created:        {contacts_created}")
    print(f"Errors:                  {len(errors)}")
    for e in errors:
        print(f"  - {e}")
    print("\nSpot-check (contacts created this run per company):")
    for c in ("Positron", "Scout Space", "RadixArk", "Starcloud", "Lunar Outpost"):
        print(f"  {c}: {company_contact_counts.get(c, 0)}")
    print("\nCompanies that already existed:")
    for k in sorted(existed):
        print(f"  - {k}")


if __name__ == "__main__":
    main()
