# Verification: add-itsm-express-api

## Unit tests

### Backend (server/)

36 tests pass without a running MongoDB instance (Mongoose models are tested
with in-memory stubs via `supertest`).

```
npm test --prefix gdfkube-src/gdfkube-itsm/server
# ✓ 36 tests passed
```

### SPA (src/)

366 tests pass covering all components, pages, API client, Bootstrap, reducers,
and admin CRUD flows.

```
npm test --prefix gdfkube-src/gdfkube-itsm
# ✓ 366 tests passed
```

## Docker-based verification

> Requires Docker and docker-compose. Populate when Docker is available.

### Compose stack health

```bash
docker compose up -d --build
# TODO: paste output showing all containers healthy
```

Expected containers:
- `mongo` — healthy
- `mongo-init` — exited 0
- `mongo-seed` — exited 0
- `gdfkube-itsm-api` — healthy
- `itsm` (nginx + SPA) — healthy

### curl checks

```bash
# Health
curl -s http://127.0.0.1:8080/api/itsm/healthz
# TODO: paste {"status":"ok"}

# Forms (operator)
curl -s -H 'X-Demo-User: joao.silva' http://127.0.0.1:8080/api/itsm/forms | jq length
# TODO: paste count (expect 3 active forms)

# Forms (admin, include disabled)
curl -s -H 'X-Demo-User: maria.costa' 'http://127.0.0.1:8080/api/itsm/forms?include=disabled' | jq length
# TODO: paste count (expect >= 3)

# Requests
curl -s -H 'X-Demo-User: joao.silva' http://127.0.0.1:8080/api/itsm/requests | jq length
# TODO: paste count

# Users (admin only)
curl -s -H 'X-Demo-User: maria.costa' http://127.0.0.1:8080/api/itsm/users | jq length
# TODO: paste count

# Users (operator → 403)
curl -s -o /dev/null -w '%{http_code}' -H 'X-Demo-User: joao.silva' http://127.0.0.1:8080/api/itsm/users
# TODO: expect 403

# Groups (admin)
curl -s -H 'X-Demo-User: maria.costa' http://127.0.0.1:8080/api/itsm/groups | jq length
# TODO: paste count
```

### mongosh counts

```bash
docker exec -it <mongo-container> mongosh gdfkube --eval '
  print("requests:", db.requests.countDocuments());
  print("forms:", db.forms.countDocuments());
  print("users:", db.users.countDocuments());
  print("groups:", db.groups.countDocuments());
'
# TODO: paste output
```

## End-to-end tests (Playwright)

> Requires a running compose stack. Populate when Docker is available.

### e2e/approval-flow.spec.ts

```bash
npx playwright test e2e/approval-flow.spec.ts
# TODO: paste result
```

### e2e/persistence.spec.ts

```bash
npx playwright test e2e/persistence.spec.ts
# TODO: paste result
```

### e2e/admin-crud.spec.ts

```bash
npx playwright test e2e/admin-crud.spec.ts
# TODO: paste result
```

## Pre-commit

```bash
pre-commit run --all-files
# TODO: paste result
```
