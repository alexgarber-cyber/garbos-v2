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
)


def create_app() -> FastAPI:
    app = FastAPI(title="garbos-api", version="0.1.0")

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

    return app


app = create_app()
