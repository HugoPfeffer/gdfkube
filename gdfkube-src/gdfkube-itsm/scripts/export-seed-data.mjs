#!/usr/bin/env node
/**
 * Exports SPA seed data into MongoDB-importable JSON files.
 * Run via: npx tsx scripts/export-seed-data.mjs
 */

import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir = resolve(__dirname, '../../gdfkube-infra/mongodb/seed-data');

async function main() {
  const { REQUESTS } = await import('../src/data/seeds.ts');
  const { FORMS, FIELDS, USERS, GROUPS, GITEA_SETTINGS } = await import('../src/data/adminSeeds.ts');
  const { DEFAULT_TEMPLATES } = await import('../src/data/defaultTemplates.ts');

  await mkdir(outDir, { recursive: true });

  const requests = REQUESTS.map((r) => ({
    _id: r.id,
    ...r,
    meta: {
      ...r.meta,
      correlationId: r.requestId ?? r.id,
    },
  }));

  const forms = FORMS.map((form) => ({
    _id: form.id,
    ...form,
    fields: FIELDS[form.id] ?? [],
    templates: DEFAULT_TEMPLATES[form.id] ?? [],
  }));

  const users = USERS.map((user) => ({
    _id: user.username ?? user.id,
    name: user.name,
    fullName: user.fullName,
    email: user.email,
    role: user.role,
    group: user.group,
    status: user.status,
    mfa: user.mfa ?? null,
    last: user.last ?? null,
  }));

  const groups = GROUPS.map((group) => ({
    _id: group.id,
    name: group.name,
    fullName: group.fullName,
    users: [],
    forms: [],
    repo: group.repo,
    clusters: typeof group.clusters === 'number' || group.clusters == null ? [] : group.clusters,
  }));

  await Promise.all([
    writeFile(resolve(outDir, 'requests.json'), JSON.stringify(requests, null, 2)),
    writeFile(resolve(outDir, 'forms.json'), JSON.stringify(forms, null, 2)),
    writeFile(resolve(outDir, 'users.json'), JSON.stringify(users, null, 2)),
    writeFile(resolve(outDir, 'groups.json'), JSON.stringify(groups, null, 2)),
    writeFile(resolve(outDir, 'settings.json'), JSON.stringify(GITEA_SETTINGS, null, 2)),
  ]);

  console.log(`Exported seed data to ${outDir}`);
  console.log(`  requests: ${requests.length} docs`);
  console.log(`  forms:    ${forms.length} docs`);
  console.log(`  users:    ${users.length} docs`);
  console.log(`  groups:   ${groups.length} docs`);
  console.log(`  settings: 1 doc (singleton)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
