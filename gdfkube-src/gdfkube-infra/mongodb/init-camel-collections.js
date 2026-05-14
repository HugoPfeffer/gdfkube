const db = db.getSiblingDB('gdfkube');

function ensureCollection(name, options) {
  if (!db.getCollectionNames().includes(name)) {
    db.createCollection(name, options || {});
    print(`created collection ${name}`);
  } else {
    print(`collection ${name} already exists`);
  }
}

function ensurePreImage(name) {
  try {
    db.runCommand({ collMod: name, changeStreamPreAndPostImages: { enabled: true } });
    print(`preImages enabled on ${name}`);
  } catch (e) {
    print(`preImages collMod on ${name} skipped: ${e.message}`);
  }
}

ensureCollection('audit_log');
ensureCollection('dlq_log');
ensurePreImage('requests');
ensurePreImage('forms');
ensurePreImage('groups');

db.audit_log.createIndex({ at: 1 }, { expireAfterSeconds: 2592000 });
db.audit_log.createIndex({ requestId: 1, at: -1 });
db.dlq_log.createIndex({ topic: 1, firstSeenAt: -1 });
db.dlq_log.createIndex({ requestId: 1 });

print('ok');
