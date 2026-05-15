## 1. Component doc badge & Specs section sweep

For each task below, edit the named doc to: (a) replace the `Implementation Status:` line with the value from design.md §D3, (b) insert a `## Specs` section per design.md §D4 / §D5, and (c) set `Last validated: 2026-05-14`. No body or diagram edits.

- [x] 1.1 `docs/00-architecture-overview.md` → status `Reference`, no `## Specs` (overview points to the index), refresh date.
- [x] 1.2 `docs/01-itsm-portal.md` → status `Implemented`, list 11 ITSM specs (`itsm-admin-forms`, `itsm-admin-settings`, `itsm-admin-users`, `itsm-approvals-queue`, `itsm-container-image`, `itsm-dashboard`, `itsm-portal-shell`, `itsm-request-detail`, `itsm-request-submission`, `itsm-requests-list`, `itsm-service-catalog`) alphabetised, refresh date.
- [x] 1.3 `docs/02-express-api.md` → status `Implemented`, list `itsm-express-api`, refresh date.
- [x] 1.4 `docs/03-mongodb.md` → status `Implemented`, list `gdfkube-audit-log-collection`, `gdfkube-dlq-log-collection`, `itsm-forms-collection`, `itsm-groups-collection`, `itsm-requests-collection`, `itsm-settings-collection`, `itsm-users-collection`, `mongodb-replica-set-stack`, refresh date.
- [x] 1.5 `docs/04-debezium.md` → status `Partially implemented`, list `debezium-connect-stack`, refresh date.
- [x] 1.6 `docs/05-kafka.md` → status `Implemented`, list `kafka-broker-stack`, refresh date.
- [x] 1.7 `docs/06-camel.md` → status `Partially implemented`, list `camel-orchestrator-stack`, refresh date.
- [x] 1.8 `docs/07-helm.md` → status `Partially implemented`, `## Specs` body `_No specs yet — this component is not contracted._`, refresh date.
- [x] 1.9 `docs/08-git.md` → status `Implemented`, list `gitea-stack`, refresh date.
- [x] 1.10 `docs/09-argocd.md` → status `Planned`, `## Specs` body `_No specs yet — this component is not contracted._`, refresh date.
- [x] 1.11 `docs/10-rhacm.md` → status `Planned`, `## Specs` body `_No specs yet — this component is not contracted._`, refresh date.
- [x] 1.12 `docs/11-hypershift.md` → status `Planned`, `## Specs` body `_No specs yet — this component is not contracted._`, refresh date.
- [x] 1.13 `docs/12-security-rbac.md` → status `Planned`, `## Specs` body `_No specs yet — this component is not contracted._`, refresh date.
- [x] 1.14 `docs/13-observability.md` → status `Deferred`, `## Specs` body `_No specs yet — this component is not contracted._`, leave `Last validated:` empty or omit.

## 2. Update docs/README.md index

- [x] 2.1 Rewrite the `Status` column for each row in the index table to match the new per-doc badge values (verbatim from tasks 1.1–1.14).
- [x] 2.2 Add a bullet in the "Conventions" section defining `Partially implemented` — *"`Partially implemented` — code or configuration exists but not yet end-to-end; see the doc for what is and isn't shipped."*. Keep the existing three definitions in place.
- [x] 2.3 Leave the rest of `docs/README.md` (intro paragraph, "Authoring Rules", links) untouched.

## 3. Cross-link sanity check

- [x] 3.1 Run `for s in $(grep -hoE 'openspec/specs/[a-z0-9-]+/spec\.md' docs/*.md); do test -f "$s" || echo "MISSING: $s"; done` from the repository root and confirm zero output.
- [x] 3.2 Run `grep -hE '^\*\*?Implementation Status' docs/*.md | sort -u` and confirm every value is one of `Implemented`, `Partially implemented`, `Planned`, `Deferred`, `Reference`.
- [x] 3.3 Run `grep -hE '^> \*\*Last validated' docs/*.md` and confirm every populated date reads `2026-05-14`.

## 4. Commit and PR

- [ ] 4.1 Run `pre-commit run --all-files` and confirm green (per CLAUDE.md `## Git`).
- [ ] 4.2 Stage only `docs/*.md` plus the change directory `openspec/changes/fix-spec-doc-drift/`. Do not stage anything under `gdfkube-src/`, `openspec/specs/`, or `openspec/changes/archive/`.
- [ ] 4.3 Commit with imperative subject, e.g. `docs: refresh status badges and add spec backlinks`.
- [ ] 4.4 Open PR; reviewer checks the diff against `design.md` §D3 and §D4 tables.
