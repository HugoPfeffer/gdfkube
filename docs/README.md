# gdfkube Architecture Docs

Per-pipeline-component architecture reference for the gdfkube demo platform.

These docs capture the **intended** architecture extracted from the design
handoff at `.tmp/handoff/gdfkube-remix/project/backend-architecture/app.jsx`.
Today only the ITSM React frontend is implemented; everything else is
documented here as the target so future PRDs can lift the relevant sections
directly.

## Index

| # | Doc | Status |
|---|---|---|
| — | [README](./README.md) | — |
| 00 | [Architecture Overview](./00-architecture-overview.md) | Reference |
| 01 | [ITSM Portal](./01-itsm-portal.md) | Implemented |
| 02 | [Express API](./02-express-api.md) | Implemented |
| 03 | [MongoDB](./03-mongodb.md) | Implemented |
| 04 | [Debezium](./04-debezium.md) | Partially implemented |
| 05 | [Kafka](./05-kafka.md) | Implemented |
| 06 | [Camel](./06-camel.md) | Partially implemented |
| 07 | [Helm](./07-helm.md) | Partially implemented |
| 08 | [Git](./08-git.md) | Implemented |
| 09 | [ArgoCD](./09-argocd.md) | Partially implemented |
| 10 | [RHACM](./10-rhacm.md) | Partially implemented |
| 11 | [HyperShift](./11-hypershift.md) | Partially implemented |
| 12 | [Security & RBAC](./12-security-rbac.md) | Planned |
| 13 | [Observability](./13-observability.md) | Deferred |

## Conventions

**Status badges** appear at the top of every doc:

- `Implemented` — code exists in the repo today.
- `Partially implemented` — code or configuration exists but not yet end-to-end; see the doc for what is and isn't shipped.
- `Planned` — designed in the handoff, no code yet. Future PRD will turn it into an implementation plan.
- `Deferred` — out of scope for the current iteration; placeholder only.

**Decisions Resolved** sections in each doc list the canonical answers from
the handoff-clarification sessions. They are the inputs for that component's
future PRD. If the design changes, update the doc *first*, then the PRD.

**Open Questions** sections record anything the handoff under-specified that
hasn't been answered yet. They block PRD writing for that component.

**Embedded YAML/JSON** is illustrative, not deployable. Concrete manifests
live in `gdfkube-src/gdfkube-infra/` (when that exists).

## Authoring Rules

- Be concise. Audience is the solo developer's future-self.
- Quote handoff text verbatim only when the wording matters (design principles,
  rejected claims). Otherwise rewrite for clarity.
- Don't repeat content across docs — link instead. The overview owns the
  pipeline narrative; component docs own component detail.
- When the handoff and a resolved decision conflict, the resolved decision
  wins and the doc says so explicitly.
