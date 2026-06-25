"""IMAP poller — capture inbound/outbound email as contact activities.

Polls a dedicated mailbox for UNSEEN messages, matches each sender/recipient
against the contacts table, and either logs an ``Email`` activity (matched) or
queues an ``UnmatchedEmail`` for review. Addresses/domains on the ignore list are
silently skipped. Idempotent: a message is processed at most once thanks to the
RFC 5322 ``Message-ID`` dedup key plus the IMAP ``\\Seen`` flag.

``poll_once`` is pure (takes a ``Session``) so it can be unit-tested or triggered
manually; the scheduler wraps it in :func:`run_poll`.
"""

from __future__ import annotations

import email
import imaplib
import logging
import re
from dataclasses import dataclass
from datetime import datetime, timezone
from email.header import decode_header, make_header
from email.message import Message
from email.utils import getaddresses, parsedate_to_datetime

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.config import settings
from app.db import SessionLocal
from app.models.activity import Activity
from app.models.activity_type import ActivityType
from app.models.contact import Contact
from app.models.email_ignore_entry import EmailIgnoreEntry
from app.models.unmatched_email import UnmatchedEmail
from app.models.user import User

logger = logging.getLogger("app.imap_poller")

# Arbitrary but stable key so only one poll runs at a time across workers/replicas.
_ADVISORY_LOCK_KEY = 0x6761726273696D61  # "garbsima"

_SNIPPET_MAX = 1000
_EMAIL_TYPE_NAME = "Email"


@dataclass
class PollStats:
    matched: int = 0
    unmatched: int = 0
    ignored: int = 0
    skipped_duplicate: int = 0
    errors: int = 0
    enabled: bool = True


def _stats_dict(s: PollStats) -> dict[str, int | bool]:
    return {
        "matched": s.matched,
        "unmatched": s.unmatched,
        "ignored": s.ignored,
        "skipped_duplicate": s.skipped_duplicate,
        "errors": s.errors,
        "enabled": s.enabled,
    }


# ---- header / body parsing helpers ---------------------------------------


def _decode(value: str | None) -> str | None:
    if not value:
        return None
    try:
        return str(make_header(decode_header(value))).strip() or None
    except Exception:
        return value.strip() or None


def _addresses(values: list[str]) -> list[str]:
    """Lowercased email addresses parsed from one or more header values."""
    out: list[str] = []
    for _name, addr in getaddresses(values):
        addr = (addr or "").strip().lower()
        if addr and "@" in addr and addr not in out:
            out.append(addr)
    return out


def _first_address(value: str | None) -> str | None:
    addrs = _addresses([value]) if value else []
    return addrs[0] if addrs else None


def _parse_date(value: str | None) -> datetime:
    if value:
        try:
            dt = parsedate_to_datetime(value)
            if dt is not None:
                if dt.tzinfo is None:
                    dt = dt.replace(tzinfo=timezone.utc)
                return dt
        except (TypeError, ValueError):
            pass
    return datetime.now(timezone.utc)


_TAG_RE = re.compile(r"<[^>]+>")
_WS_RE = re.compile(r"\s+")


def _extract_snippet(msg: Message) -> str | None:
    """First text/plain body (falling back to stripped HTML), collapsed + truncated."""
    plain: str | None = None
    html: str | None = None
    for part in msg.walk():
        if part.is_multipart():
            continue
        ctype = part.get_content_type()
        if ctype not in ("text/plain", "text/html"):
            continue
        try:
            payload = part.get_payload(decode=True)
            if payload is None:
                continue
            charset = part.get_content_charset() or "utf-8"
            text = payload.decode(charset, errors="replace")
        except Exception:
            continue
        if ctype == "text/plain" and plain is None:
            plain = text
        elif ctype == "text/html" and html is None:
            html = _TAG_RE.sub(" ", text)
    body = plain if plain is not None else html
    if body is None:
        return None
    body = _WS_RE.sub(" ", body).strip()
    if not body:
        return None
    return body[:_SNIPPET_MAX]


def _synth_message_id(uid: bytes, from_addr: str | None, received_at: datetime) -> str:
    """Stable fallback when an email has no Message-ID header."""
    return f"<synth-{from_addr or 'unknown'}-{received_at.isoformat()}@imap-poller>"


# ---- matching / ignore helpers (also used by the router) ------------------


def find_contact_by_email(db: Session, address: str | None) -> Contact | None:
    if not address:
        return None
    return db.scalars(select(Contact).where(Contact.email.ilike(address))).first()


def load_ignore_sets(db: Session) -> tuple[set[str], set[str]]:
    """Return (ignored_addresses, ignored_domains), both lowercased."""
    addresses: set[str] = set()
    domains: set[str] = set()
    for entry in db.scalars(select(EmailIgnoreEntry)).all():
        pattern = (entry.pattern or "").strip().lower()
        if not pattern:
            continue
        if entry.kind == "domain" or "@" not in pattern:
            domains.add(pattern.lstrip("@"))
        else:
            addresses.add(pattern)
    return addresses, domains


def is_ignored(address: str | None, addresses: set[str], domains: set[str]) -> bool:
    if not address:
        return False
    address = address.lower()
    if address in addresses:
        return True
    domain = address.split("@", 1)[-1]
    return domain in domains


def create_email_activity(
    db: Session,
    *,
    contact: Contact,
    direction: str,
    subject: str | None,
    snippet: str | None,
    occurred_at: datetime,
    message_id: str,
    owner_id: int | None,
    email_type_id: int,
) -> Activity:
    """Create an Email activity linked to a contact. Caller commits."""
    note_parts = [p for p in (subject, snippet) if p]
    activity = Activity(
        activity_type_id=email_type_id,
        contact_id=contact.id,
        company_id=contact.company_id,
        note="\n\n".join(note_parts) or None,
        direction=direction,
        message_id=message_id,
        occurred_at=occurred_at,
        owner_id=owner_id,
    )
    db.add(activity)
    return activity


def _email_type_id(db: Session) -> int | None:
    return db.scalar(select(ActivityType.id).where(ActivityType.name == _EMAIL_TYPE_NAME))


def _already_processed(db: Session, message_id: str) -> bool:
    if db.scalar(select(Activity.id).where(Activity.message_id == message_id)):
        return True
    if db.scalar(select(UnmatchedEmail.id).where(UnmatchedEmail.message_id == message_id)):
        return True
    return False


# ---- the poll itself ------------------------------------------------------


def _mark_seen(conn: imaplib.IMAP4, uid: bytes) -> None:
    try:
        conn.store(uid, "+FLAGS", "\\Seen")
    except Exception:
        logger.warning("failed to mark message %r as seen", uid, exc_info=True)


def _process_message(
    db: Session,
    conn: imaplib.IMAP4,
    uid: bytes,
    *,
    owner: User | None,
    email_type_id: int,
    mailbox_user: str,
    ignore_addresses: set[str],
    ignore_domains: set[str],
    stats: PollStats,
) -> None:
    typ, msg_data = conn.fetch(uid, "(RFC822)")
    if typ != "OK" or not msg_data or not isinstance(msg_data[0], tuple):
        stats.errors += 1
        return
    msg = email.message_from_bytes(msg_data[0][1])

    from_addr = _first_address(msg.get("From"))
    recipients = _addresses(msg.get_all("To", []) + msg.get_all("Cc", []))
    subject = _decode(msg.get("Subject"))
    received_at = _parse_date(msg.get("Date"))
    snippet = _extract_snippet(msg)

    message_id = (msg.get("Message-ID") or "").strip()
    if not message_id:
        message_id = _synth_message_id(uid, from_addr, received_at)

    if _already_processed(db, message_id):
        stats.skipped_duplicate += 1
        _mark_seen(conn, uid)
        return

    # Direction: the mailbox sending = outbound, otherwise inbound. The
    # "counterparty" is the contact-side address we match and would add.
    if from_addr == mailbox_user:
        direction = "outbound"
        contact = None
        counterparty: str | None = None
        for addr in recipients:
            if addr == mailbox_user:
                continue
            match = find_contact_by_email(db, addr)
            if match is not None:
                contact, counterparty = match, addr
                break
            if counterparty is None:
                counterparty = addr
    else:
        direction = "inbound"
        counterparty = from_addr
        contact = find_contact_by_email(db, from_addr)

    if is_ignored(counterparty, ignore_addresses, ignore_domains):
        stats.ignored += 1
        _mark_seen(conn, uid)
        return

    if contact is not None:
        create_email_activity(
            db,
            contact=contact,
            direction=direction,
            subject=subject,
            snippet=snippet,
            occurred_at=received_at,
            message_id=message_id,
            owner_id=owner.id if owner else None,
            email_type_id=email_type_id,
        )
        stats.matched += 1
    else:
        db.add(
            UnmatchedEmail(
                message_id=message_id,
                from_address=counterparty or from_addr or "",
                to_addresses=", ".join(recipients) or None,
                subject=subject,
                body_snippet=snippet,
                received_at=received_at,
                direction=direction,
                status="pending",
                owner_id=owner.id if owner else None,
            )
        )
        stats.unmatched += 1

    # Commit per-message so a crash mid-batch never loses progress, then mark
    # \Seen only after the row is durable.
    db.commit()
    _mark_seen(conn, uid)


def poll_once(db: Session) -> dict[str, int | bool]:
    """Run one polling pass. Safe to call repeatedly; returns counts."""
    stats = PollStats()
    if not (settings.imap_enabled and settings.imap_host and settings.imap_user):
        stats.enabled = False
        return _stats_dict(stats)

    # Only one poll at a time, even across processes.
    locked = db.scalar(select(func.pg_try_advisory_lock(_ADVISORY_LOCK_KEY)))
    if not locked:
        logger.info("imap poll skipped: another poll holds the advisory lock")
        return _stats_dict(stats)

    try:
        owner = db.scalars(select(User).order_by(User.id)).first()
        email_type_id = _email_type_id(db)
        if email_type_id is None:
            logger.error("imap poll aborted: no 'Email' activity type found")
            stats.errors += 1
            return _stats_dict(stats)
        ignore_addresses, ignore_domains = load_ignore_sets(db)
        mailbox_user = settings.imap_user.lower()

        conn = imaplib.IMAP4_SSL(settings.imap_host, settings.imap_port)
        try:
            conn.login(settings.imap_user, settings.imap_password)
            conn.select(settings.imap_mailbox)
            typ, data = conn.search(None, "UNSEEN")
            if typ != "OK":
                logger.warning("imap search failed: %s", typ)
                return _stats_dict(stats)
            for uid in data[0].split():
                try:
                    _process_message(
                        db,
                        conn,
                        uid,
                        owner=owner,
                        email_type_id=email_type_id,
                        mailbox_user=mailbox_user,
                        ignore_addresses=ignore_addresses,
                        ignore_domains=ignore_domains,
                        stats=stats,
                    )
                except Exception:
                    logger.exception("error processing message uid=%r", uid)
                    db.rollback()
                    stats.errors += 1
        finally:
            try:
                conn.close()
            except Exception:
                pass
            try:
                conn.logout()
            except Exception:
                pass
    finally:
        db.scalar(select(func.pg_advisory_unlock(_ADVISORY_LOCK_KEY)))
        db.commit()

    logger.info("imap poll complete: %s", _stats_dict(stats))
    return _stats_dict(stats)


def run_poll() -> None:
    """Scheduler entrypoint: own session, never raise out of the job."""
    try:
        with SessionLocal() as db:
            poll_once(db)
    except Exception:
        logger.exception("imap poll job failed")
