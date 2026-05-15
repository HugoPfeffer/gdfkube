# MongoDB Replica-Set Stack (rs0)

Local 3-node MongoDB replica set for development. The replica-set topology
(`rs0`) is **mandatory** — CDC via Debezium reads the oplog, which is only
available on replica-set or sharded deployments.

## What `mongo-init` does

The `mongo-init` container runs `init-rs.js` once against `mongo1`. The script
is idempotent: it checks `rs.status().ok` first and exits cleanly if the set is
already initialized. On a fresh start it calls `rs.initiate()` to form `rs0`
across `mongo1`, `mongo2`, and `mongo3`.

## Tearing down

| Command                    | Effect                                       |
|----------------------------|----------------------------------------------|
| `docker compose down`      | Stops containers; **data volumes survive**.   |
| `docker compose down -v`   | Stops containers **and deletes data volumes**.|

Use `down -v` only when you want a fully clean slate (the replica set must be
re-initialized on the next `up`).

## Seed script (`seed-collections.js`)

The `mongo-seed` container runs `seed-collections.js` once after the replica
set is initialized. It loads JSON files from `/seed-data/` and performs
idempotent `bulkWrite` upserts (replaceOne with upsert:true) for each
document.

### Regenerating seed data

From `gdfkube-src/gdfkube-itsm/`:

```bash
npm run seed:export
```

This runs `scripts/export-seed-data.mjs` which imports the SPA's TypeScript
seed files and writes four JSON files to
`gdfkube-src/gdfkube-infra/mongodb/seed-data/`.

### Collections

| Collection | Purpose | CDC-watched |
|------------|---------|:-----------:|
| `requests` | Cluster/namespace/scale provisioning requests | Yes |
| `forms`    | Form definitions with fields and templates | Yes |
| `users`    | Demo user identities (operator, admin, approver, service) | No |
| `groups`   | Department/org groups | Yes |

**CDC-watched** collections (`requests`, `forms`, `groups`) have their changes captured
by Debezium and published to Kafka topics. The admin-only collection (`users`)
is managed exclusively through the Express API and is not part of
the CDC pipeline.

### Indexes

The seed script creates the following indexes idempotently:

- **requests**: `idx_formId_status`, `idx_org_env`, `idx_status`, `idx_createdAt`, `idx_correlationId`
- **forms**: `idx_form_status`
- **users**: `idx_user_group`, `idx_user_role`
- **groups**: `idx_group_name`

## Tearing down

| Command                    | Effect                                       |
|----------------------------|----------------------------------------------|
| `docker compose down`      | Stops containers; **data volumes survive**.   |
| `docker compose down -v`   | Stops containers **and deletes data volumes**.|

Use `down -v` only when you want a fully clean slate (the replica set must be
re-initialized on the next `up`).

## Further reading

See [`docs/03-mongodb.md`](../../../docs/03-mongodb.md) for the project-wide
MongoDB architecture and CDC design decisions.
