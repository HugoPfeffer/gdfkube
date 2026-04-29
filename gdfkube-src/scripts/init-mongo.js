// init-mongo.js — runs once on first boot of the mongo service.
// Initializes a single-node replica set so Debezium can tail the oplog.
// Idempotent: re-running on an already-initialized replset is a no-op.

try {
  const status = rs.status();
  print("init-mongo: replica set already initialized, state=" + status.myState);
} catch (e) {
  if (e.codeName === "NotYetInitialized" || /no replset config/i.test(e.message)) {
    print("init-mongo: initiating replica set rs0");
    rs.initiate({
      _id: "rs0",
      members: [{ _id: 0, host: "mongo:27017" }]
    });
  } else {
    throw e;
  }
}
