/**
 * Idempotent mongosh seed script.
 * Loads JSON seed files and upserts documents + creates indexes.
 *
 * Usage (inside container with files mounted at /seed-data/):
 *   mongosh --host mongo1:27017 /scripts/seed-collections.js
 *
 * The database name can be overridden via environment variable SEED_DB (default: gdfkube).
 */

const dbName = process.env.SEED_DB || 'gdfkube';
const seedPath = process.env.SEED_PATH || '/seed-data';

let ready = false;
for (let i = 0; i < 30; i++) {
  try {
    const status = rs.status();
    if (status.members && status.members.some(m => m.stateStr === 'PRIMARY')) {
      ready = true;
      break;
    }
  } catch (_) {}
  print('Waiting for primary election...');
  sleep(1000);
}
if (!ready) {
  print('ERROR: no PRIMARY elected within 30s');
  quit(1);
}

const database = db.getSiblingDB(dbName);

function loadSeedFile(filename) {
  const raw = fs.readFileSync(`${seedPath}/${filename}`, 'utf8');
  return JSON.parse(raw);
}

function upsertCollection(collectionName, docs) {
  if (!docs || docs.length === 0) {
    print(`  ${collectionName}: no documents to seed`);
    return;
  }

  const ops = docs.map((doc) => ({
    replaceOne: {
      filter: { _id: doc._id },
      replacement: doc,
      upsert: true,
    },
  }));

  const result = database.getCollection(collectionName).bulkWrite(ops);
  print(
    `  ${collectionName}: matched=${result.matchedCount} ` +
      `modified=${result.modifiedCount} upserted=${result.upsertedCount}`
  );
}

print(`\n=== Seeding database: ${dbName} ===\n`);

const requests = loadSeedFile('requests.json');
const forms = loadSeedFile('forms.json');
const users = loadSeedFile('users.json');
const groups = loadSeedFile('groups.json');

upsertCollection('requests', requests);
upsertCollection('forms', forms);
upsertCollection('users', users);
upsertCollection('groups', groups);

print('\n--- Creating indexes ---\n');

database.requests.createIndex({ formId: 1, status: 1 }, { name: 'idx_formId_status' });
database.requests.createIndex({ requesterGroupName: 1, env: 1 }, { name: 'idx_org_env' });
database.requests.createIndex({ status: 1 }, { name: 'idx_status' });
database.requests.createIndex({ submittedAt: 1 }, { name: 'idx_createdAt' });
database.requests.createIndex({ 'meta.correlationId': 1 }, { name: 'idx_correlationId' });

database.forms.createIndex({ status: 1 }, { name: 'idx_form_status' });

database.users.createIndex({ group: 1 }, { name: 'idx_user_group' });
database.users.createIndex({ role: 1 }, { name: 'idx_user_role' });

database.groups.createIndex({ name: 1 }, { name: 'idx_group_name' });

print('\n=== Seed complete ===\n');
