# SonarQube Community Edition

Local/devcontainer code-quality and coverage analysis for all three test suites
(camel, itsm SPA, itsm server).

## Bring-up

```bash
docker compose up -d sonarqube sonar-db sonar-bootstrap
```

Wait for SonarQube to become healthy (~60–120 s cold start):

```bash
until curl -sf http://127.0.0.1:9000/api/system/status | grep -q '"status":"UP"'; do
  sleep 5
done
echo "SonarQube is UP"
```

Verify `sonar-bootstrap` exited successfully:

```bash
docker wait gdfkube-sonar-bootstrap   # should print 0
docker logs gdfkube-sonar-bootstrap   # non-secret summary only
```

The analysis token lives in the `sonar-init` named volume at `/sonar/token`
(mode `600`). It is never written to the repo or environment. The volume
survives `stop`/`up` and is intentionally wiped by `docker compose down -v`.

SonarQube UI: <http://127.0.0.1:9000> (admin credentials are set via
`SONAR_ADMIN_PASSWORD`, default `gdfkube-sonar-admin`).

## `vm.max_map_count` (Elasticsearch requirement)

Embedded Elasticsearch wants `vm.max_map_count >= 524288`. Because the
devcontainer uses Docker-in-Docker (bind-mounted socket), this is a **host**
sysctl that cannot be set from within compose.

### Default mitigation (enabled)

```yaml
SONAR_ES_BOOTSTRAP_CHECKS_DISABLE: "true"
```

This allows single-node Community Edition to start on hosts with the default
kernel value (~65536). Suitable for local development.

### Proper host fix

```bash
sudo sysctl -w vm.max_map_count=524288
```

To persist across reboots:

```bash
echo "vm.max_map_count=524288" | sudo tee /etc/sysctl.d/99-sonarqube.conf
sudo sysctl --system
```

### Opt-in privileged helper (last resort)

A privileged one-shot container could set the sysctl, but this is a
security-posture change versus the all-unprivileged init services in the stack.
It is **off by default** and not included in `docker-compose.yml`. If needed,
run manually:

```bash
docker run --rm --privileged alpine sysctl -w vm.max_map_count=524288
```

## Memory expectations

| Component | Approximate RAM |
| --------- | --------------- |
| ES search | ~512 MB (capped `-Xms512m -Xmx512m`) |
| Web       | ~768 MB (capped `-Xms512m -Xmx768m`) |
| CE        | ~768 MB (capped `-Xms512m -Xmx768m`) |
| **Total** | **≈ 2–2.5 GB** |

The devcontainer host needs **≥ 4 GB free** when running SonarQube alongside
the app stack. SonarQube is opt-in — it is not in any app service's
`depends_on` and is not part of the default `docker compose up -d`.

## Community Edition limitations

- **No PR / branch decoration** — analysis is mainline only; no PR comments
  or branch-level quality gates.
- **No portfolio rollup** — the three projects (`gdfkube-camel`,
  `gdfkube-itsm-web`, `gdfkube-itsm-server`) are independent.
- These are inherent CE constraints, documented here rather than worked around.

## Per-module sonar commands

### Orchestrator (recommended)

```bash
scripts/sonar.sh camel          # Java only
scripts/sonar.sh web            # SPA only
scripts/sonar.sh server         # Express server only
scripts/sonar.sh all            # all three modules
```

The orchestrator reads the analysis token from the `sonar-init` volume,
runs each module's coverage, then invokes the scanner. A failing quality
gate causes a non-zero exit naming the failing module.

### Underlying commands

**Java (camel)**

```bash
cd gdfkube-src/gdfkube-camel
./mvnw -B -DskipITs=false -Psonar verify sonar:sonar \
  -Dsonar.token="$SONAR_TOKEN"
```

The `sonar` Maven profile activates `sonar-maven-plugin:5.1.0.4751` with
`sonar.qualitygate.wait=true`. JaCoCo coverage report is at
`build/jacoco-report/jacoco.xml`. The profile is inactive by default — the
fast inner loop (`./mvnw verify`) is unaffected.

**Node (SPA / server)**

```bash
cd gdfkube-src/gdfkube-itsm && npm run sonar        # produces coverage/lcov.info
cd gdfkube-src/gdfkube-itsm/server && npm run sonar  # produces coverage/lcov.info
```

Analysis upload uses the pinned `sonarsource/sonar-scanner-cli:11.1` Docker
image on `gdfkube-net` (so `http://sonarqube:9000` resolves). The image is
invoked by `scripts/sonar.sh` — not installed as an npm dependency.

### Quality gate

The `gdfkube-gate` (set as default) targets **New Code** conditions:

- Coverage ≥ 80%
- Duplicated Lines ≤ 3%
- Maintainability / Reliability / Security rating = A
- Zero new Blocker or Critical issues

A failing gate fails the sonar command (non-zero exit).

## Out-of-scope notes

- The pre-existing `Dockerfile.jvm` references `target/` but the Maven build
  directory is overridden to `build/`. JaCoCo and `sonar.java.binaries` are
  pinned to `build/`; the `target/` mismatch is flagged but not fixed here.
- No GitHub Actions / CI changes (`.github/**` untouched).
