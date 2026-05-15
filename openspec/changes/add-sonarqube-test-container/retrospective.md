## Retrospective

Change: `add-sonarqube-test-container`
Date: 2026-05-15

### What Went Well

- **Gitea-pattern reuse** — The `sonar-bootstrap` one-shot init followed the established `gitea-bootstrap`/`gitea-token-sync` pattern closely, providing idempotency, secret isolation, and compose-native lifecycle management with minimal new design.

- **New-Code gate scoping** — Scoping the quality gate to New Code was the right call. The existing codebase has substantial legacy debt (pre-existing test failures across all three suites), and a whole-code gate would have been unusable on day one.

- **Additive, zero-drift design** — SonarQube is in no app service's `depends_on`. The fast inner loop (`./mvnw verify`, `npm test`) is completely unaffected. The blast radius is exactly the enumerated files.

- **Token-in-volume pattern** — The token handoff via a named volume with `chmod 600`, consumed read-only by the scanner, keeps secrets out of the repo, logs, and environment. `pre-commit` trufflehog scanning confirms no leakage.

- **Orchestrator script** — `scripts/sonar.sh` provides a single entrypoint with per-module granularity (`camel|web|server|all`), clear error reporting (`GATE FAILED: <module>`), and correct DinD volume resolution.

### Issues Discovered During Implementation

1. **Wrong image tag** — The spec pinned `sonarqube:2025.1.1-community`, which does not exist on Docker Hub. Community Build images use a `YY.M.patch-community` scheme (e.g., `26.4.0.121862-community`). The version assumption was based on outdated documentation.
   - **Fix:** Changed to `sonarqube:26.4.0.121862-community`.

2. **API endpoint change** — SonarQube 26.x moved the password change endpoint from `/api/authentication/change_password` to `/api/users/change_password`. The spec and design did not anticipate this breaking change between SonarQube versions.
   - **Fix:** Updated `bootstrap.sh` to use `/api/users/change_password`.

3. **Password complexity requirements** — SonarQube 26.x requires passwords with 12+ characters, uppercase, lowercase, digit, and special character. The originally planned password did not meet these requirements.
   - **Fix:** Changed default to `GdfKube-S0nar!` (14 chars, mixed case, digit, special).

4. **Volume permissions** — `curlimages/curl:8.11.1` runs as uid 100 (`curl_user`), which cannot write to root-owned volumes. The bootstrap script failed silently when trying to write the token.
   - **Fix:** Added `user: "0:0"` to the `sonar-bootstrap` service in `docker-compose.yml`.

5. **DinD mount paths** — Docker-in-Docker means `127.0.0.1:9000` from the devcontainer doesn't route to the SonarQube container. The scanner must use `docker run --network` with the compose network. Additionally, volume mounts must use the host path (derived from the bootstrap container's bind mount), not the devcontainer-local path.
   - **Fix:** `scripts/sonar.sh` uses `docker run --network $NET` instead of `docker compose run --network`, and resolves the host path via `docker inspect` on the bootstrap container's bind mount.

6. **`docker compose run --network` invalid flag** — The spec assumed `docker compose run --rm --network gdfkube-net` would work, but `docker compose run` does not accept `--network`. Only `docker run` supports it.
   - **Fix:** Changed to `docker run --rm --network $NET` for scanner invocations.

7. **JaCoCo report-location bug** — Quarkus 3.16.3's `quarkus-jacoco` extension does not resolve relative `report-location` paths correctly (upstream bug #52290). Setting `report-location=build/jacoco-report` produced the report in the wrong directory.
   - **Fix:** Used absolute path `${maven.multiModuleProjectDirectory}/build/jacoco-report`.

### Lessons Learned

1. **Pin images by digest or verify tags before speccing** — Docker Hub tag naming conventions vary by project. The SonarQube Community Build tag scheme (`YY.M.patch-community`) was not obvious. Always verify the exact tag exists before writing it into a spec.

2. **API surfaces drift between major versions** — When targeting a specific software version, check the release notes for breaking API changes. SonarQube 26.x moved and renamed several API endpoints.

3. **Container user IDs matter for volume writes** — Lightweight images like `curlimages/curl` often run as non-root users. If a container needs to write to a shared volume, explicitly set the user or pre-configure volume permissions.

4. **DinD introduces a path translation layer** — In Docker-in-Docker setups, the filesystem paths visible to the devcontainer are not the same paths the Docker daemon uses for bind mounts. Any script that mounts host directories into ephemeral containers must resolve the true host path.

5. **`docker compose run` is not `docker run`** — The two commands have different flag sets. Don't assume `docker run` flags (like `--network`) work with `docker compose run`.

6. **Test framework extensions can have subtle bugs** — Quarkus's JaCoCo integration is generally solid, but edge cases (like relative `report-location` with a non-standard build directory) can surface bugs. Always verify the actual output path rather than trusting configuration.

### Spec Drift

| Area | Spec Said | Reality |
|------|-----------|---------|
| SonarQube image | `sonarqube:2025.1.1-community` | `sonarqube:26.4.0.121862-community` |
| Password change API | `/api/authentication/change_password` | `/api/users/change_password` (26.x) |
| Default password | Not specified (assumed simple) | Requires 12+ chars with complexity |
| curl image user | Not specified (assumed root) | uid 100, needs `user: "0:0"` |
| Scanner invocation | `docker compose run --rm` | `docker run --rm` (compose run lacks `--network`) |
| JaCoCo report path | `build/jacoco-report` (relative) | `${maven.multiModuleProjectDirectory}/build/jacoco-report` (absolute, upstream bug) |
| Volume mounts in DinD | Not addressed | Host path resolution via `docker inspect` |

The spec files themselves were NOT updated to reflect these corrections (the code is the source of truth post-implementation). The design doc's decisions and trade-offs remain accurate in intent.
