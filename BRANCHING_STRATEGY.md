# Branching Strategy and CI/CD Documentation

**Version:** 1.0.0  
**Last Updated:** 27 January 2026  
**Repository:** MicroServices_AI_Interviewer

---

## Table of Contents

1. [Overview](#overview)
2. [Repository Structure](#repository-structure)
3. [Remote Configuration](#remote-configuration)
4. [Branch Architecture](#branch-architecture)
5. [Workflow Automation](#workflow-automation)
6. [Push Commands Reference](#push-commands-reference)
7. [File Distribution](#file-distribution)
8. [Troubleshooting](#troubleshooting)

---

## Overview

This document describes the branching strategy and automated CI/CD workflow for the AI Interviewer SaaS platform. The repository uses a monolith-to-microservices branching pattern where a single source branch (`monolith`) automatically synchronizes to service-specific branches.

### Purpose

- Maintain a single source of truth in the `monolith` branch
- Automatically distribute code to service-specific branches
- Enable independent deployment of each service
- Preserve shared configuration files across all branches

---

## Repository Structure

The monolith branch contains the complete application with the following structure:

```
AI_Interviewer/
├── .github/
│   └── workflows/
│       └── split-services.yml      # Automated sync workflow
├── backend/                         # FastAPI backend service
│   ├── app/
│   ├── alembic/
│   ├── tests/
│   ├── Dockerfile
│   └── requirements.txt
├── frontend/                        # Next.js frontend service
│   ├── src/
│   ├── public/
│   ├── Dockerfile
│   └── package.json
├── AI/                              # AI/ML service
│   └── Aigenthix_AI_Interviewer/
│       ├── src/
│       ├── data/
│       ├── Dockerfile
│       └── requirements.txt
├── docker-compose.yml               # Shared: Local development
├── docker-compose.prod.yml          # Shared: Production compose
├── Dockerfile.backend               # Shared: Backend container
├── Dockerfile.frontend              # Shared: Frontend container
├── Dockerfile.ai-service            # Shared: AI service container
├── Dockerfile.celery                # Shared: Celery worker container
├── README.md                        # Shared: Documentation
├── PRD.md                           # Shared: Product requirements
├── TRD.md                           # Shared: Technical requirements
├── railway.json                     # Shared: Railway deployment
├── railway.frontend.json            # Shared: Railway frontend config
├── railway.ai-service.json          # Shared: Railway AI config
├── railway.celery.json              # Shared: Railway Celery config
├── railway.ws-proxy.json            # Shared: Railway WebSocket config
├── render.yaml                      # Shared: Render deployment
└── integration_test.sh              # Shared: Integration tests
```

---

## Remote Configuration

The repository is configured with two remotes:

| Remote | Owner | Repository URL | Purpose |
|--------|-------|----------------|---------|
| `origin` | Aigenthix | https://github.com/Aigenthix/MicroServices_AI_Interviewer.git | Organization repository |
| `personal` | MeghVyas3132 | https://github.com/MeghVyas3132/AI-Interviewer-Saas.git | Personal development |

### Verify Remote Configuration

```bash
git remote -v
```

Expected output:
```
origin    https://github.com/Aigenthix/MicroServices_AI_Interviewer.git (fetch)
origin    https://github.com/Aigenthix/MicroServices_AI_Interviewer.git (push)
personal  https://github.com/MeghVyas3132/AI-Interviewer-Saas.git (fetch)
personal  https://github.com/MeghVyas3132/AI-Interviewer-Saas.git (push)
```

---

## Branch Architecture

### Branch Overview

| Branch | Contents | Deployment Target |
|--------|----------|-------------------|
| `monolith` | Complete application (all services + shared files) | Source branch (no direct deployment) |
| `main` | Backend service + shared files | Backend API server |
| `frontend` | Frontend service + shared files | Frontend web application |
| `ai` | AI/ML service + shared files | AI processing service |

### Branch Flow Diagram

```
                    ┌─────────────────────────────────────────────┐
                    │              monolith branch                │
                    │  (Complete application - source of truth)   │
                    └─────────────────────────────────────────────┘
                                         │
                                         │ GitHub Actions
                                         │ (on push)
                                         ▼
              ┌──────────────────────────┼──────────────────────────┐
              │                          │                          │
              ▼                          ▼                          ▼
    ┌─────────────────┐        ┌─────────────────┐        ┌─────────────────┐
    │   main branch   │        │ frontend branch │        │    ai branch    │
    │                 │        │                 │        │                 │
    │  - backend/     │        │  - frontend/    │        │  - AI/          │
    │  - shared files │        │  - shared files │        │  - shared files │
    └─────────────────┘        └─────────────────┘        └─────────────────┘
              │                          │                          │
              ▼                          ▼                          ▼
    ┌─────────────────┐        ┌─────────────────┐        ┌─────────────────┐
    │ Backend Deploy  │        │ Frontend Deploy │        │   AI Deploy     │
    │ (Railway/Render)│        │ (Railway/Render)│        │ (Railway/Render)│
    └─────────────────┘        └─────────────────┘        └─────────────────┘
```

---

## Workflow Automation

### GitHub Actions Workflow

The workflow is defined in `.github/workflows/split-services.yml` and triggers automatically on every push to the `monolith` branch.

### Workflow Jobs

The workflow runs three parallel jobs:

#### 1. sync-main (Backend)

- Checks out the `main` branch
- Removes all existing files
- Copies `backend/` directory and shared files from `monolith`
- Commits and pushes changes (if any)

#### 2. sync-frontend (Frontend)

- Checks out the `frontend` branch
- Removes all existing files
- Copies `frontend/` directory and shared files from `monolith`
- Commits and pushes changes (if any)

#### 3. sync-ai (AI Service)

- Checks out the `ai` branch
- Removes all existing files
- Copies `AI/` directory and shared files from `monolith`
- Commits and pushes changes (if any)

### Workflow Features

- **Parallel Execution:** All three sync jobs run simultaneously
- **Safe Operations:** No force push, no history rewrite
- **Idempotent:** Handles "no changes" gracefully without failing
- **Automatic Branch Creation:** Creates target branches if they do not exist

### Workflow Configuration

```yaml
name: Split Services to Branches

on:
  push:
    branches:
      - monolith

jobs:
  sync-main:
    # Syncs backend + shared files to main branch
    
  sync-frontend:
    # Syncs frontend + shared files to frontend branch
    
  sync-ai:
    # Syncs AI + shared files to ai branch
```

---

## Push Commands Reference

### Development Workflow

1. Make changes locally on your `main` branch
2. Commit your changes
3. Push to `monolith` branch on desired remote

### Push Commands

| Action | Command |
|--------|---------|
| Push to personal repo | `git push personal main:monolith` |
| Push to organization repo | `git push origin main:monolith` |
| Push to both repos | `git push personal main:monolith && git push origin main:monolith` |

### Command Breakdown

```bash
git push <remote> <local-branch>:<remote-branch>
```

- `personal` / `origin` - Target remote
- `main` - Your local branch name
- `monolith` - Remote branch that triggers the workflow

### Quick Aliases (Optional)

Add to your `~/.zshrc` or `~/.bashrc`:

```bash
# Push to personal monolith
alias push-personal="git push personal main:monolith"

# Push to origin monolith
alias push-origin="git push origin main:monolith"

# Push to both
alias push-all="git push personal main:monolith && git push origin main:monolith"
```

---

## File Distribution

### Shared Files

These files are copied to ALL service branches:

| File | Purpose |
|------|---------|
| `docker-compose.yml` | Local development orchestration |
| `docker-compose.prod.yml` | Production orchestration |
| `Dockerfile.backend` | Backend container definition |
| `Dockerfile.frontend` | Frontend container definition |
| `Dockerfile.ai-service` | AI service container definition |
| `Dockerfile.celery` | Celery worker container definition |
| `README.md` | Project documentation |
| `PRD.md` | Product requirements document |
| `TRD.md` | Technical requirements document |
| `railway.json` | Railway deployment config |
| `railway.frontend.json` | Railway frontend config |
| `railway.ai-service.json` | Railway AI config |
| `railway.celery.json` | Railway Celery config |
| `railway.ws-proxy.json` | Railway WebSocket config |
| `render.yaml` | Render deployment config |
| `integration_test.sh` | Integration test script |
| `.github/` | GitHub Actions workflows |

### Service-Specific Files

| Branch | Service Directory |
|--------|-------------------|
| `main` | `backend/` |
| `frontend` | `frontend/` |
| `ai` | `AI/` |

---

## Troubleshooting

### Common Issues

#### Workflow Not Triggering

**Cause:** Push was made to wrong branch or remote.

**Solution:** Ensure you push to `monolith` branch:
```bash
git push origin main:monolith
```

#### Permission Denied on Push

**Cause:** GitHub token lacks write permissions.

**Solution:** Ensure repository settings allow GitHub Actions to push:
1. Go to repository Settings
2. Navigate to Actions > General
3. Under "Workflow permissions", select "Read and write permissions"

#### Branch Does Not Exist

**Cause:** Target branch was not created yet.

**Solution:** The workflow creates branches automatically. If issues persist, create manually:
```bash
git checkout -b frontend
git push origin frontend
```

#### No Changes Detected

**Cause:** Files in monolith match files in target branch.

**Solution:** This is expected behavior. The workflow skips commits when no changes exist.

### Viewing Workflow Runs

1. Go to repository on GitHub
2. Click "Actions" tab
3. Select "Split Services to Branches" workflow
4. View individual job logs

### Manual Sync (Emergency)

If the workflow fails, manually sync branches:

```bash
# Sync main branch
git checkout main
git checkout monolith -- backend/
git checkout monolith -- docker-compose.yml docker-compose.prod.yml README.md PRD.md TRD.md
git commit -m "Manual sync from monolith"
git push origin main
```

---

## Appendix

### Git Configuration

Current git configuration used by the workflow:

```
user.name: MeghVyas3132
user.email: megh.vyas@yahoo.com
```

### Related Documents

| Document | Description |
|----------|-------------|
| `README.md` | Project overview and quick start |
| `PRD.md` | Product requirements and features |
| `TRD.md` | Technical architecture and specifications |

---

**Document maintained by:** MeghVyas3132  
**Last review date:** 27 January 2026
