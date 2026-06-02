# garbos-v2

Single-user CRM — skeleton block. Three services via Docker Compose:

| Service | Stack            | Dev URL                |
|---------|------------------|------------------------|
| `web`   | Next.js 15       | http://localhost:3000  |
| `api`   | FastAPI          | http://localhost:8000  |
| `db`    | Postgres 16      | localhost:5432         |

## Quick start

```bash
cp .env.example .env          # adjust secrets as desired
docker compose up --build     # db -> api -> web, all with healthchecks
```

Then:

1. Review & run the baseline migration (creates the `users` table only):
   ```bash
   docker compose run --rm migrate          # alembic upgrade head
   docker compose run --rm api python scripts/seed.py   # seed the single user
   ```
2. Open http://localhost:3000 — you'll be redirected to `/login`.

## Regenerate the typed API client

The TS client types are generated from FastAPI's OpenAPI spec and committed
(`web/src/lib/api/schema.d.ts`). After changing any API schema:

```bash
cd web && npm run gen:api      # requires the api running on :8000
```

## Notes

- Repo must live on the WSL **Linux** filesystem (`~/...`), not `/mnt/c`, for
  working file-watching/hot-reload and sane performance.
- Node is managed by nvm (`.nvmrc` pins 22); host Node is only needed for
  `npm run gen:api` — the containers carry their own runtimes.
