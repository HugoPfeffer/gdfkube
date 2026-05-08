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

## Further reading

See [`docs/03-mongodb.md`](../../../docs/03-mongodb.md) for the project-wide
MongoDB architecture and CDC design decisions.
