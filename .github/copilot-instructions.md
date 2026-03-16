# Copilot instructions for `MicroServices_AI_Interviewer`

## Architecture map (read this first)
- This repo is a **multi-service interview platform**: `frontend/` (HR/admin UI), `backend/` (FastAPI API), `AI/Aigenthix_AI_Interviewer/` (candidate-facing AI interview app + WS proxy), plus `postgres`, `redis`, and `celery_worker`.
- Primary local wiring is in `docker-compose.yml` (dev) and `docker-compose.prod.yml` (prod-optimized).
- Core data/API boundary is `backend/app/`: routes in `routes/`, domain logic in `services/`, async jobs in `tasks/`, SQLAlchemy models in `models/`.
- Candidate interview flow crosses services: browser -> AI app (`AI/...`) -> WS proxy (`ws-proxy-server.js`, port 9003) for AssemblyAI streaming -> backend callback/update APIs.

## Service boundaries and ports
- `frontend` (Next.js, port `3000`) calls backend via `NEXT_PUBLIC_API_URL` (typically `http://localhost:8000/api/v1`).
- `backend` (FastAPI, port `8000`) owns auth, RBAC, candidate/job/interview APIs, health checks (`/health`), and DB access.
- `ai-service` container (`ai-interviewer-coach`, Next.js app on internal `3000`) is the interview runtime; routed by compose, not the same as `frontend/`.
- `ai-ws-proxy` (port `9003`) handles low-latency audio transcription streaming.
- `celery_worker` consumes queues `default,email_default,email_high,bulk_import` (see compose command).

## High-signal workflows
- Preferred full-stack local run: `docker-compose up -d` from repo root.
- Integration smoke path is scripted in `integration_test.sh` (it resets containers, seeds DB, and validates auth/company/users/candidates/interviews).
- Backend test runner config is in `backend/pytest.ini`; tests live under `backend/tests/`.
- Backend health depends on both Postgres + Redis (`backend/app/main.py` lifespan + `/health` behavior).

## Backend conventions (project-specific)
- App factory/lifespan in `backend/app/main.py`: startup must initialize DB + Redis; shutdown must close AI HTTP client, Redis, and DB.
- Middleware order is intentional (reverse execution): GZip -> request logging -> security headers -> CORS; preserve order when editing.
- OpenAPI auth docs are custom-generated in `main.py`; public endpoints are explicitly carved out. Update both route and OpenAPI security mapping together.
- CORS origins are normalized with trailing-dot variants; avoid “simplifying” this unless fixing a verified bug.

## Frontend and AI app conventions
- There are **two Next.js codebases**: `frontend/` (management UI) and `AI/Aigenthix_AI_Interviewer/` (interview coach). Confirm target before editing.
- API base URLs are environment-driven; prefer env config changes over hardcoded URLs.
- For cross-service features (interview completion/status), verify both backend route contract and AI app callback usage.

## Data, async, and integration points
- Postgres is the source of truth; Redis is used for cache/broker; Celery handles background processing.
- External AI dependencies are provider-switchable via env (`OPENAI_*`, `GROQ_*`, `GOOGLE_API_KEY`, provider selectors in compose).
- Speech streaming depends on `ASSEMBLYAI_API_KEY` and WS proxy env settings.

## Safe change playbook for agents
- For API changes: update `backend/app/routes/*` + related schemas/services + tests in `backend/tests/*` in the same PR.
- For queue/task changes: update Celery config/queue usage and confirm compose queue list still matches expected routing.
- For interview-flow changes: validate touchpoints across `frontend/`, `backend/`, and `AI/Aigenthix_AI_Interviewer/` (including WS proxy when audio/transcription is involved).
- Prefer running targeted backend tests first, then broader integration checks when touching cross-service behavior.
