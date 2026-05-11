## ADDED Requirements

### Requirement: Stack SHALL run three mongod processes on a single bridge network

The repo-root `docker-compose.yml` MUST define services `mongo1`, `mongo2`, and `mongo3`, each running upstream `mongo:7.0` with command `mongod --replSet rs0 --bind_ip_all`. Each service MUST be attached to a single user-defined bridge network (`gdfkube-net`) so that the services can resolve each other by name. Each service MUST declare a healthcheck running `mongosh --quiet --eval "db.adminCommand('ping').ok"` and MUST mount a named Docker volume at `/data/db` (`mongo1-data`, `mongo2-data`, `mongo3-data` respectively). Only `mongo1` MAY publish port `27017` to the host, and that publish MUST bind to `127.0.0.1` only.

#### Scenario: Three mongod containers come up healthy

- **GIVEN** a clean checkout at `/workspace`
- **WHEN** `docker compose up -d mongo1 mongo2 mongo3` is run
- **THEN** within 60 seconds `docker compose ps mongo1 mongo2 mongo3` SHALL report all three services in state `healthy`
- **AND** each service SHALL be running an image whose tag is `mongo:7.0`

#### Scenario: Only mongo1 is reachable from the host

- **GIVEN** the stack is running
- **WHEN** the host attempts a TCP connection to `127.0.0.1:27017`
- **THEN** the connection SHALL succeed and respond as MongoDB on `mongo1`
- **AND** there SHALL be no `mongo2` or `mongo3` host port mapping in `docker-compose.yml`

---

### Requirement: Replica set SHALL be initiated idempotently by a one-shot init service

`docker-compose.yml` MUST define a `mongo-init` service using `mongo:7.0` with `restart: "no"` that `depends_on` `mongo1`, `mongo2`, and `mongo3` with `condition: service_healthy`. The service MUST execute `mongosh /scripts/init-rs.js` against `mongo1`. The script `gdfkube-src/gdfkube-infra/mongodb/init-rs.js` MUST be bind-mounted read-only into the init container at `/scripts/init-rs.js`. The script MUST first check `rs.status().ok`; if it is `1`, the script MUST exit 0 without invoking `rs.initiate()`. Otherwise it MUST invoke `rs.initiate({_id: "rs0", members: [{_id:0, host:"mongo1:27017"}, {_id:1, host:"mongo2:27017"}, {_id:2, host:"mongo3:27017"}]})`.

#### Scenario: Replica set is initiated on first run

- **GIVEN** a freshly created stack with no prior data volumes
- **WHEN** `docker compose up -d` is run and `mongo-init` exits
- **THEN** `mongo-init` SHALL exit with code 0
- **AND** `docker compose exec -T mongo1 mongosh --quiet --eval 'rs.status().ok'` SHALL print `1`

#### Scenario: Re-running the init service is a no-op

- **GIVEN** the replica set has already been initiated
- **WHEN** `docker compose run --rm mongo-init` is run a second time
- **THEN** the run SHALL exit with code 0
- **AND** the run SHALL NOT produce a `MongoServerError: already initialized` error

---

### Requirement: Replica set SHALL converge to one PRIMARY and two SECONDARY members

After `mongo-init` exits successfully, the cluster MUST converge to a topology with three members where exactly one reports `stateStr === "PRIMARY"` and the other two report `stateStr === "SECONDARY"`.

#### Scenario: Three members with one PRIMARY and two SECONDARY

- **GIVEN** the stack has been brought up and `mongo-init` has exited 0
- **WHEN** `docker compose exec -T mongo1 mongosh --quiet --eval 'JSON.stringify(rs.status().members.map(m => m.stateStr).sort())'` is run within 30 seconds
- **THEN** the output SHALL equal `["PRIMARY","SECONDARY","SECONDARY"]`
- **AND** `rs.status().members.length` SHALL equal `3`

---

### Requirement: Data SHALL persist across container restarts via named volumes

Each `mongod` data directory MUST be backed by a Docker-managed named volume (`mongo1-data`, `mongo2-data`, `mongo3-data`). Data written before a `docker compose restart` of any individual node MUST be readable after the node returns to a healthy state.

#### Scenario: Inserted document survives a node restart

- **GIVEN** the replica set is healthy and `mongo-init` has exited 0
- **WHEN** `docker compose exec -T mongo1 mongosh --quiet gdfkube --eval 'db.smoke.insertOne({k:1})'` is run
- **AND** then `docker compose restart mongo1`
- **AND** `mongo1` returns to state `healthy`
- **THEN** `docker compose exec -T mongo1 mongosh --quiet gdfkube --eval 'db.smoke.countDocuments({k:1})'` SHALL print `1`

#### Scenario: docker compose down -v wipes data

- **GIVEN** the stack is running with persisted data
- **WHEN** `docker compose down -v` is run, then `docker compose up -d` is re-run, then `mongo-init` exits 0
- **THEN** `docker compose exec -T mongo1 mongosh --quiet gdfkube --eval 'db.smoke.countDocuments({})'` SHALL print `0`

---

### Requirement: Stack SHALL expose only loopback host bindings

All host-published ports for the Mongo stack MUST be bound to `127.0.0.1`. No service MAY publish a port on `0.0.0.0` or any non-loopback interface. Inter-service traffic MUST use Docker DNS names (`mongo1`, `mongo2`, `mongo3`) on the internal `gdfkube-net` network.

#### Scenario: No public host port mappings

- **GIVEN** the repo-root `docker-compose.yml`
- **WHEN** the file is parsed
- **THEN** every host port mapping under the Mongo services SHALL be of the form `127.0.0.1:<port>:<container-port>`
- **AND** no entry SHALL omit the host-IP prefix (which would default to `0.0.0.0`)
