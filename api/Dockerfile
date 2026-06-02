FROM python:3.12-slim

# uv: fast, reproducible Python dependency management
COPY --from=ghcr.io/astral-sh/uv:0.5.11 /uv /uvx /bin/

ENV UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    UV_PROJECT_ENVIRONMENT=/app/.venv \
    PYTHONPATH=/app \
    PATH="/app/.venv/bin:$PATH"

WORKDIR /app

# Dependency layer — cached unless pyproject/lock change.
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-install-project

# App source is bind-mounted in dev; copied here for prod/standalone builds.
COPY . .

EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
