# Backend Development Scripts

Utility scripts for development, testing, and debugging.

## Database & Seed Scripts

| Script | Purpose | Safe? |
|--------|---------|-------|
| `seed_demo.py` | Create demo company + HR user | Yes - checks existence |
| `seed_more_data.py` | Add additional demo companies | Yes - additive only |
| `reset_and_seed.py` | **WIPE DB** and create fresh data | **NO** - Destructive |
| `reset_admin.py` | Reset admin password | Yes |

## Debug Scripts

| Script | Purpose |
|--------|---------|
| `display_roles.py` | Display all users by role |
| `print_all_tables.py` | Dump all database tables |

## Testing Scripts

| Script | Purpose |
|--------|---------|
| `api_tests.py` | API endpoint tests (RBAC validation) |
| `ws_test.py` | WebSocket connection test |
| `smoke_test.sh` | End-to-end smoke test |

## Usage

### Inside Docker Container
```bash
docker compose exec backend python scripts/seed_demo.py
docker compose exec backend python scripts/api_tests.py
```

### Local Development
```bash
cd backend
python scripts/display_roles.py
./scripts/smoke_test.sh
```

## Default Credentials

| Script | Email | Password |
|--------|-------|----------|
| `seed_demo.py` | demo@demo.com | DemoPassword123! |
| `reset_admin.py` | admin@aigenthix.com | qwerty123? |
| `reset_and_seed.py` | admin@aiinterviewer.com | AdminPass123!@ |
