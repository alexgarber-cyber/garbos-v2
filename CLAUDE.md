# CLAUDE.md

Guidance for working in this repo. See [README.md](README.md) for first-run setup.

## Overview

**garbos-v2** is a single-user CRM. Three services orchestrated via Docker Compose:

| Service | Stack       | Dev URL                | Build context |
|---------|-------------|------------------------|---------------|
| `web`   | Next.js 15  | http://localhost:3000  | `./web`       |
| `api`   | FastAPI     | http://localhost:8000  | `./api`       |
| `db`    | Postgres 16 | localhost:5432         | image         |

## Architecture

- **`api/`** — FastAPI + SQLAlchemy 2.0 + Alembic. Settings via pydantic `BaseSettings` ([api/app/config.py](api/app/config.py)), engine in [api/app/db.py](api/app/db.py), CORS/`WEB_ORIGIN` wired in [api/app/main.py](api/app/main.py). Routes live in [api/app/routers/](api/app/routers/) (auth, leads, contacts, companies, deals, sequences, chains, tasks, activities, imports, dashboard, pipeline_stages, health). Models in `api/app/models/`, migrations in `api/alembic/versions/`.
- **`web/`** — Next.js (App Router) under [web/src/app/](web/src/app/). API access via a typed client ([web/src/lib/api/client.ts](web/src/lib/api/client.ts)) whose `apiBaseUrl()` picks `NEXT_PUBLIC_API_BASE_URL` in the browser and `API_BASE_URL_INTERNAL` server-side. Generated types in `web/src/lib/api/schema.d.ts`.
- **Auth** — httpOnly session cookie; client uses `credentials: "include"`.

## Common commands

```bash
docker compose up --build                  # bring up db -> api -> web (healthchecked)
docker compose run --rm migrate            # alembic upgrade head (profile "tools")
docker compose run --rm api python scripts/seed.py   # idempotent single-user seed
docker compose ps                          # service health
docker compose exec -T api alembic current # show applied migration
cd web && npm run gen:api                  # regenerate typed API client (api must be on :8000)
```

- New migration: `docker compose run --rm api alembic revision --autogenerate -m "..."`, review, then `docker compose run --rm migrate`.
- Repo must live on the WSL **Linux** filesystem (`~/...`), not `/mnt/c`, for hot-reload/perf.

## Environment

All services read the root `.env` (`env_file`); `.env` is gitignored — see [.env.example](.env.example). Key vars: `DATABASE_URL`, `WEB_ORIGIN` (CORS origin), `NEXT_PUBLIC_API_BASE_URL` (browser→api), `API_BASE_URL_INTERNAL` (server→api, compose DNS `http://api:8000`), `SEED_USER_EMAIL`/`SEED_USER_PASSWORD`, `COOKIE_SECURE`.

---

## Project state

**Current migration level:** `0010` (`sequence_recurrence`).

### Features shipped (as of 2026-06-01)

- Leads rework: contact-centric leads page, Add Lead with company dropdown
- Dashboard fix: null `lifecycle_status` handling
- Clickable email (`mailto:`) + LinkedIn links everywhere
- Sequence step completion: captures message sent; ActivityLog truncation/expand
- Generic Excel importer on `/import` page (column mapping, preview, dedup)
- Remove from sequence with reason (`chains.py` cancel endpoint)
- Lead→deal status change: auto-prompt for next task + due date
- Task creation: notes field
- PitchBook importer moved to `/import` page (tabs)

### In progress / next session

- **Sequence recurrence** — migration `0010` applied, plan approved, **execution NOT YET started**. Resume after deployment.

### Deployment plan (PAUSED — security audit required first)

- **Target:** Linux media server at `192.168.0.45`
- Docker + SSH configured
- **Plan:** security audit → push to public GitHub → clone on server → `.env` with LAN IPs → `docker compose up`
- **CRITICAL:** Run security audit (Claude Code + Codex) **before any GitHub push** (repo will be public).

### Pending improvements

- Activity logging: combine multiple activity types
- Quick-add task from Leads/Contacts/Company pages
- Contact detail: remove from sequence with reason ✅
- Sequences: recurring/recurrence options (in progress)
