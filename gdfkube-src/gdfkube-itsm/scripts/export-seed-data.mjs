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
  const { FORMS, FIELDS, USERS, GROUPS, GITEA_SETTINGS } = await import('../src/data/adminSeeds.ts');
  const { DEFAULT_TEMPLATES } = await import('../src/data/defaultTemplates.ts');

  await mkdir(outDir, { recursive: true });

  const forms = FORMS.map((form) => ({
    _id: form.id,
    ...form,
    fields: FIELDS[form.id] ?? [],
    templates: DEFAULT_TEMPLATES[form.id] ?? [],
  }));

  const users = USERS.map((user) => ({
    _id: user.username ?? user.id,
    username: user.username,
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
    users: group.users,
    forms: group.forms,
    repo: group.repo,
    clusters: group.clusters,
  }));

  await Promise.all([
    writeFile(resolve(outDir, 'forms.json'), JSON.stringify(forms, null, 2) + '\n'),
    writeFile(resolve(outDir, 'users.json'), JSON.stringify(users, null, 2) + '\n'),
    writeFile(resolve(outDir, 'groups.json'), JSON.stringify(groups, null, 2) + '\n'),
    writeFile(resolve(outDir, 'settings.json'), JSON.stringify(GITEA_SETTINGS, null, 2) + '\n'),
  ]);

  console.log(`Exported seed data to ${outDir}`);
  console.log(`  forms:    ${forms.length} docs`);
  console.log(`  users:    ${users.length} docs`);
  console.log(`  groups:   ${groups.length} docs`);
  console.log(`  settings: 1 doc (singleton)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
