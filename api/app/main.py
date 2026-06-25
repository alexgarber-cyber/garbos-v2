import logging
from contextlib import asynccontextmanager

from apscheduler.schedulers.background import BackgroundScheduler
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.routers import (
    activities,
    activity_types,
    auth,
    chains,
    close_reasons,
    companies,
    contacts,
    dashboard,
    deals,
    health,
    imports,
    leads,
    pipeline_stages,
    sequences,
    tasks,
    unmatched_emails,
)
from app.services.imap_poller import run_poll

logger = logging.getLogger("app.main")


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Start the IMAP poller on an interval (only when IMAP is enabled)."""
    scheduler = BackgroundScheduler(timezone="UTC")
    if settings.imap_enabled:
        scheduler.add_job(
            run_poll,
            "interval",
            minutes=settings.imap_poll_interval_minutes,
            id="imap_poll",
            max_instances=1,
            coalesce=True,
        )
        scheduler.start()
        logger.info(
            "IMAP poller started: every %s min on %s/%s",
            settings.imap_poll_interval_minutes,
            settings.imap_host,
            settings.imap_mailbox,
        )
    else:
        logger.info("IMAP poller disabled (IMAP_ENABLED=false)")
    try:
        yield
    finally:
        if scheduler.running:
            scheduler.shutdown(wait=False)


def create_app() -> FastAPI:
    app = FastAPI(title="garbos-api", version="0.1.0", lifespan=lifespan)

    # Explicit origin + credentials so the browser sends/receives the session cookie.
    app.add_middleware(
        CORSMiddleware,
        allow_origins=[settings.web_origin],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    app.include_router(health.router)
    app.include_router(auth.router, prefix="/auth", tags=["auth"])
    app.include_router(companies.router, prefix="/companies", tags=["companies"])
    app.include_router(leads.router, prefix="/leads", tags=["leads"])
    app.include_router(contacts.router, prefix="/contacts", tags=["contacts"])
    app.include_router(
        activity_types.router, prefix="/activity-types", tags=["activity-types"]
    )
    app.include_router(activities.router, prefix="/activities", tags=["activities"])
    app.include_router(chains.router, prefix="/chains", tags=["chains"])
    app.include_router(sequences.router, prefix="/sequences", tags=["sequences"])
    app.include_router(tasks.router, prefix="/tasks", tags=["tasks"])
    app.include_router(
        pipeline_stages.router, prefix="/pipeline-stages", tags=["pipeline-stages"]
    )
    app.include_router(
        close_reasons.router, prefix="/close-reasons", tags=["close-reasons"]
    )
    app.include_router(deals.router, prefix="/deals", tags=["deals"])
    app.include_router(dashboard.router, prefix="/dashboard", tags=["dashboard"])
    app.include_router(imports.router, prefix="/import", tags=["import"])
    app.include_router(
        unmatched_emails.router, prefix="/unmatched-emails", tags=["unmatched-emails"]
    )

    return app


app = create_app()
