"""PitchBook xlsx import.

Parses a PitchBook company/deal export (header row at index 7, metadata rows
above) and creates GarbOS companies, de-duping by name against both existing
records and other rows in the same file. Built-in because this is a daily
workflow — see garbos-v2-scope "Out of Scope" firewall, now lifted for import.
"""

import io
import json
import re
from datetime import datetime

import pandas as pd
from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.deps import get_current_user
from app.db import get_db
from app.models.company import Company
from app.models.contact import Contact
from app.models.user import User
from app.routers.companies import get_or_create_company_by_name

router = APIRouter()

# PitchBook puts a few metadata rows above the real header, which lands on the
# 8th row (zero-based index 7).
HEADER_ROW = 7

# Trailing exchange-ticker suffix, e.g. " (TSE: CWEB)" or " (NAS: APGE)".
_TICKER_RE = re.compile(r"\s*\([A-Z]+:\s*[A-Z0-9.\-]+\)\s*$")


class ImportItem(BaseModel):
    name: str
    reason: str


class PitchbookImportResponse(BaseModel):
    imported: int
    skipped_duplicates: int
    duplicates: list[ImportItem]
    errors: list[ImportItem]


class ColumnMapping(BaseModel):
    """Maps a target field to the *source column header* in the uploaded sheet.

    Every field is optional; only ``company_name`` is required at import time.
    ``deal_date`` / ``deal_amount`` are accepted (and shown in the preview) but
    not persisted — there is no Company field for them.
    """

    company_name: str | None = None
    deal_date: str | None = None
    deal_amount: str | None = None
    name: str | None = None
    title: str | None = None
    email: str | None = None
    phone: str | None = None
    linkedin: str | None = None


class ExcelPreviewResponse(BaseModel):
    columns: list[str]
    sample: list[dict[str, str | None]]


class ExcelImportResponse(BaseModel):
    imported: int  # companies + contacts created
    companies_created: int
    contacts_created: int
    skipped_duplicates: int
    duplicates: list[ImportItem]
    errors: list[ImportItem]


def clean(value: object) -> str | None:
    """Stringify a cell, returning None for NaN / blank."""
    if value is None:
        return None
    try:
        if pd.isna(value):
            return None
    except (TypeError, ValueError):
        pass  # pd.isna raises on array-likes; treat as present
    # pandas reads integer columns that contain blanks as float64, so a round
    # number like 3 arrives as 3.0 — render it as "3" to keep the block clean.
    if isinstance(value, float) and value.is_integer():
        value = int(value)
    text = str(value).strip()
    return text or None


def strip_ticker(name: str) -> str:
    return _TICKER_RE.sub("", name).strip()


def clean_email(value: object) -> str | None:
    """Strip a leading ``mailto:`` and surrounding whitespace."""
    e = clean(value)
    if e is None:
        return None
    if e.lower().startswith("mailto:"):
        e = e[len("mailto:"):].strip()
    return e or None


def clean_phone(value: object) -> str | None:
    """Drop a spreadsheet ``=`` prefix and a ``+1`` country code."""
    p = clean(value)
    if p is None:
        return None
    p = p.lstrip("=").strip()
    if p.startswith("+1"):
        p = p[2:].strip()
    return p or None


def split_name(value: object) -> tuple[str | None, str | None]:
    """"First Middle Last" -> ("First", "Middle Last"); None-safe."""
    name = clean(value)
    if not name:
        return None, None
    parts = name.split()
    return parts[0], (" ".join(parts[1:]) or None)


def parse_hq(loc: str | None) -> tuple[str | None, str | None]:
    """"San Francisco, CA" -> ("San Francisco", "CA"). Tolerates missing comma."""
    if not loc:
        return None, None
    parts = [p.strip() for p in loc.split(",")]
    city = parts[0] or None
    state = parts[1] or None if len(parts) >= 2 else None
    return city, state


def _money(value: object) -> str | None:
    """Format a millions figure, dropping a trailing ``.0`` (12.0 -> "12")."""
    text = clean(value)
    if text is None:
        return None
    try:
        num = float(text)
    except (TypeError, ValueError):
        return text
    return str(int(num)) if num == int(num) else f"{num:g}"


def _date(value: object) -> str | None:
    if value is None:
        return None
    try:
        if pd.isna(value):
            return None
    except (TypeError, ValueError):
        pass
    if isinstance(value, datetime):  # pd.Timestamp is a datetime subclass
        return value.strftime("%b %d, %Y")
    return clean(value)


def format_description(row: "pd.Series") -> str:
    """Build the PITCHBOOK DEAL INTEL block, skipping empty fields/lines."""
    lines = ["PITCHBOOK DEAL INTEL"]

    seg = []
    if v := clean(row.get("Deal Type")):
        seg.append(f"Deal Type: {v}")
    if v := clean(row.get("Series")):
        seg.append(f"Series: {v}")
    if v := clean(row.get("VC Round")):
        seg.append(f"Round: {v}")
    if seg:
        lines.append(" | ".join(seg))

    seg = []
    if v := _money(row.get("Deal Size")):
        seg.append(f"Deal Size: ${v}M")
    if v := _money(row.get("Raised to Date")):
        seg.append(f"Raised to Date: ${v}M")
    if seg:
        lines.append(" | ".join(seg))

    if v := _money(row.get("Post Valuation")):
        lines.append(f"Post Valuation: ${v}M")
    if v := _date(row.get("Deal Date")):
        lines.append(f"Deal Date: {v}")
    if v := clean(row.get("Verticals")):
        lines.append(f"Verticals: {v}")
    if v := clean(row.get("Primary PitchBook Industry Code")):
        lines.append(f"Industry Code: {v}")
    if v := clean(row.get("Investors")):
        lines.append(f"Investors: {v}")

    body = "\n".join(lines)
    if synopsis := clean(row.get("Deal Synopsis")):
        body += f"\n\n{synopsis}"
    return body


@router.post("/pitchbook", response_model=PitchbookImportResponse)
async def import_pitchbook(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> PitchbookImportResponse:
    raw = await file.read()
    try:
        df = pd.read_excel(io.BytesIO(raw), header=HEADER_ROW)
    except Exception as exc:  # noqa: BLE001 — surface any parse failure to the user
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Could not read xlsx (expected a PitchBook export): {exc}",
        )

    if "Companies" not in df.columns:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Missing 'Companies' column — is this a PitchBook export?",
        )

    existing = {n.lower() for n in db.scalars(select(Company.name)).all() if n}
    seen: set[str] = set()
    duplicates: list[ImportItem] = []
    errors: list[ImportItem] = []
    batch: list[Company] = []

    for _, row in df.iterrows():
        raw_name = clean(row.get("Companies"))
        if not raw_name:
            continue  # blank/trailing row — skip silently
        name = strip_ticker(raw_name)
        if not name:
            errors.append(ImportItem(name=raw_name, reason="Empty company name after cleanup"))
            continue
        key = name.lower()
        if key in existing:
            duplicates.append(ImportItem(name=name, reason="Already exists"))
            continue
        if key in seen:
            duplicates.append(ImportItem(name=name, reason="Duplicate within file"))
            continue
        seen.add(key)
        city, state = parse_hq(clean(row.get("HQ Location")))
        batch.append(
            Company(
                name=name,
                industry=clean(row.get("Primary PitchBook Industry Sector")),
                hq_city=city,
                hq_state=state,
                hq_country="US",
                description=format_description(row),
                lifecycle_status=None,
                lead_score=None,
                owner_id=user.id,
            )
        )

    db.add_all(batch)
    db.commit()

    return PitchbookImportResponse(
        imported=len(batch),
        skipped_duplicates=len(duplicates),
        duplicates=duplicates,
        errors=errors,
    )


def _read_generic(raw: bytes) -> "pd.DataFrame":
    """Parse a generic xlsx with string column labels.

    Spreadsheets often carry blank/title rows above the real header (e.g. the
    crm export leaves the first row empty), so we auto-detect the header as the
    first of the top rows with the most non-empty cells rather than assuming
    row 0.
    """
    try:
        probe = pd.read_excel(io.BytesIO(raw), header=None, nrows=15)
        header_row = int(probe.notna().sum(axis=1).idxmax()) if not probe.empty else 0
        df = pd.read_excel(io.BytesIO(raw), header=header_row)
    except Exception as exc:  # noqa: BLE001 — surface any parse failure to the user
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Could not read xlsx: {exc}",
        )
    df.columns = [str(c) for c in df.columns]
    return df


def _parse_mapping(column_mapping: str) -> ColumnMapping:
    try:
        return ColumnMapping(**json.loads(column_mapping))
    except (ValueError, TypeError) as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid column_mapping JSON: {exc}",
        )


def _extract(row: "pd.Series", m: ColumnMapping) -> dict[str, str | None]:
    """Pull + clean the mapped target fields out of one spreadsheet row."""

    def cell(col: str | None) -> object:
        return row.get(col) if col else None

    raw_company = clean(cell(m.company_name))
    company_name = strip_ticker(raw_company) if raw_company else None
    first, last = split_name(cell(m.name))
    return {
        "company_name": company_name,
        "deal_date": _date(cell(m.deal_date)),
        "deal_amount": _money(cell(m.deal_amount)),
        "first_name": first,
        "last_name": last,
        "title": clean(cell(m.title)),
        "email": clean_email(cell(m.email)),
        "phone": clean_phone(cell(m.phone)),
        "linkedin": clean(cell(m.linkedin)),
    }


@router.post("/excel/preview", response_model=ExcelPreviewResponse)
async def import_excel_preview(
    file: UploadFile = File(...),
    column_mapping: str | None = Form(None),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> ExcelPreviewResponse:
    """Return the sheet's column headers, plus a cleaned 5-row sample once a
    mapping is supplied — drives the column mapper + preview UI."""
    raw = await file.read()
    df = _read_generic(raw)
    columns = list(df.columns)

    sample: list[dict[str, str | None]] = []
    if column_mapping:
        mapping = _parse_mapping(column_mapping)
        for _, row in df.head(5).iterrows():
            sample.append(_extract(row, mapping))

    return ExcelPreviewResponse(columns=columns, sample=sample)


@router.post("/excel", response_model=ExcelImportResponse)
async def import_excel(
    file: UploadFile = File(...),
    column_mapping: str = Form(...),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> ExcelImportResponse:
    """Create companies (deduped by name) + contacts (deduped by email) from a
    generic xlsx, using the user-supplied column mapping."""
    raw = await file.read()
    mapping = _parse_mapping(column_mapping)
    if not mapping.company_name:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="A 'Company Name' column mapping is required.",
        )
    df = _read_generic(raw)

    # Dedupe contacts by email; for email-less rows fall back to a
    # (company, first, last) person key so re-imports stay idempotent.
    existing_contacts = db.scalars(select(Contact)).all()
    existing_emails = {c.email.lower() for c in existing_contacts if c.email}
    existing_people = {
        (c.company_id, (c.first_name or "").lower(), (c.last_name or "").lower())
        for c in existing_contacts
    }
    # Track which company names already exist so we can count fresh creations
    # (get_or_create flushes immediately, so the returned id is always set).
    company_keys = {n.lower() for n in db.scalars(select(Company.name)).all() if n}
    seen_emails: set[str] = set()
    seen_people: set[tuple[int | None, str, str]] = set()
    duplicates: list[ImportItem] = []
    errors: list[ImportItem] = []
    companies_created = 0
    contacts_created = 0

    for i, (_, row) in enumerate(df.iterrows()):
        try:
            data = _extract(row, mapping)
            company_name = data["company_name"]
            if not company_name:
                continue  # blank/trailing row — skip silently

            company = get_or_create_company_by_name(db, company_name, user.id)
            key = company_name.lower()
            if key not in company_keys:
                companies_created += 1
                company_keys.add(key)

            # Only create a contact when the row actually names a person.
            if not data["first_name"]:
                continue

            email = data["email"]
            if email:
                key = email.lower()
                if key in existing_emails or key in seen_emails:
                    duplicates.append(
                        ImportItem(name=email, reason="Email already exists")
                    )
                    continue
                seen_emails.add(key)
            else:
                person = (
                    company.id,
                    data["first_name"].lower(),
                    (data["last_name"] or "").lower(),
                )
                full_name = f"{data['first_name']} {data['last_name'] or ''}".strip()
                if person in existing_people or person in seen_people:
                    duplicates.append(
                        ImportItem(name=full_name, reason="Contact already exists")
                    )
                    continue
                seen_people.add(person)

            db.add(
                Contact(
                    first_name=data["first_name"],
                    last_name=data["last_name"],
                    title=data["title"],
                    email=email,
                    phone=data["phone"],
                    linkedin_url=data["linkedin"],
                    company_id=company.id,
                    owner_id=user.id,
                )
            )
            contacts_created += 1
        except Exception as exc:  # noqa: BLE001 — never abort the whole batch
            label = clean(row.get(mapping.company_name)) or f"row {i + 2}"
            errors.append(ImportItem(name=str(label), reason=str(exc)))

    db.commit()

    return ExcelImportResponse(
        imported=companies_created + contacts_created,
        companies_created=companies_created,
        contacts_created=contacts_created,
        skipped_duplicates=len(duplicates),
        duplicates=duplicates,
        errors=errors,
    )
