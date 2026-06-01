package gov.gdf.camel.routes;

import java.time.Clock;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.locks.ReentrantLock;
import java.util.stream.Stream;

import org.apache.camel.Exchange;
import org.apache.camel.builder.RouteBuilder;
import org.jboss.logging.Logger;

import gov.gdf.camel.bean.AuditInterceptor;
import gov.gdf.camel.bean.GitRepoBootstrapper;
import gov.gdf.camel.bean.HelmTemplateRunner;
import gov.gdf.camel.bean.HelmValuesBuilder;
import gov.gdf.camel.git.GitAuthor;
import gov.gdf.camel.git.GitProvider;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.enterprise.inject.Produces;
import jakarta.inject.Inject;
import org.eclipse.microprofile.config.inject.ConfigProperty;

@ApplicationScoped
public class OrgBootstrapRoute extends RouteBuilder {

    private static final Logger LOG = Logger.getLogger(OrgBootstrapRoute.class);
    private static final String ROUTE_ID = "org-bootstrap";
    private static final long TTL_MS = 60_000;
    private static final ConcurrentHashMap<String, ReentrantLock> REPO_LOCKS = new ConcurrentHashMap<>();

    private final ConcurrentHashMap<String, Long> dedupCache = new ConcurrentHashMap<>();

    @ConfigProperty(name = "app.system.gitea-owner")
    String giteaOwner;

    @Inject
    GitRepoBootstrapper gitRepoBootstrapper;

    @Inject
    HelmTemplateRunner helmTemplateRunner;

    @Inject
    HelmValuesBuilder helmValuesBuilder;

    @Inject
    GitProvider gitProvider;

    @Inject
    AuditInterceptor auditInterceptor;

    @Inject
    Clock clock;

    @Override
    public void configure() {
        errorHandler(deadLetterChannel("kafka:dlq.gdfkube.groups")
                .maximumRedeliveries(3)
                .redeliveryDelay(1000)
                .backOffMultiplier(5.0)
                .useExponentialBackOff()
                .logRetryAttempted(true)
                .onPrepareFailure(DlqHeaders::stamp));

        from("direct:org-bootstrap")
            .routeId(ROUTE_ID)
            .onCompletion()
                .process(exchange -> {
                    String outputDir = exchange.getProperty("outputDir", String.class);
                    if (outputDir == null) return;
                    Path dir = Path.of(outputDir);
                    if (!Files.exists(dir)) return;
                    try (Stream<Path> walk = Files.walk(dir)) {
                        walk.sorted(Comparator.reverseOrder()).forEach(p -> {
                            try { Files.delete(p); }
                            catch (IOException e) {
                                LOG.warnf("Failed to clean up %s: %s", p, e.getMessage());
                            }
                        });
                    }
                })
            .end()
            .process(this::processOrgEvent);
    }

    private void processOrgEvent(Exchange exchange) throws Exception {
        String groupId = exchange.getProperty("org", String.class);

        evictExpired();
        if (dedupCache.containsKey(groupId)) {
            LOG.debugf("Dedup cache hit for groupId=%s, skipping", groupId);
            return;
        }

        boolean perOrgCreated = gitRepoBootstrapper.ensure(
                giteaOwner, helmValuesBuilder.getRepoName(groupId), "GitOps manifests for " + groupId);
        if (perOrgCreated) {
            auditInterceptor.emit(ROUTE_ID, groupId, 0, "create-repo",
                    Map.of("repo", giteaOwner + "/" + helmValuesBuilder.getRepoName(groupId)));
        }

        boolean centralCreated = gitRepoBootstrapper.ensure(
                giteaOwner, "gdfkube-orgs", "Org bootstrap manifests rendered by gdfkube-camel");
        if (centralCreated) {
            auditInterceptor.emit(ROUTE_ID, groupId, 0, "create-repo",
                    Map.of("repo", giteaOwner + "/gdfkube-orgs"));
        }

        ReentrantLock lock = REPO_LOCKS.computeIfAbsent("gdfkube-orgs", k -> new ReentrantLock());
        lock.lock();
        try {
            Path workTree = gitProvider.cloneOrPull(giteaOwner, "gdfkube-orgs", "main");

            Path orgDir = workTree.resolve("orgs").resolve(groupId);
            Path appProj = orgDir.resolve("appproject.yaml");
            Path appSet = orgDir.resolve("applicationset.yaml");
            Path clusterSet = orgDir.resolve(groupId + "-clusterset.yaml");

            List<Path> missing = new ArrayList<>();
            if (!Files.exists(appProj)) missing.add(appProj);
            if (!Files.exists(appSet)) missing.add(appSet);
            if (!Files.exists(clusterSet)) missing.add(clusterSet);

            if (missing.isEmpty()) {
                auditInterceptor.emit(ROUTE_ID, groupId, 0, "noop",
                        Map.of("groupId", groupId));
                return;
            }

            String valuesPath = helmValuesBuilder.buildForOrg(groupId);
            Path outputDirPath = Files.createTempDirectory("bootstrap-" + groupId + "-");
            String outputDir = outputDirPath.toString();
            exchange.setProperty("outputDir", outputDir);

            try {
                helmTemplateRunner.render(
                        helmValuesBuilder.getChartRef("argocd-org"),
                        helmValuesBuilder.getReleaseName(groupId),
                        valuesPath, outputDir);
                helmTemplateRunner.render(
                        helmValuesBuilder.getChartRef("rhacm-org"),
                        helmValuesBuilder.getReleaseName(groupId),
                        valuesPath, outputDir);
            } finally {
                Files.deleteIfExists(Path.of(valuesPath));
            }

            Files.createDirectories(orgDir);

            List<Path> addedPaths = new ArrayList<>();
            for (Path target : missing) {
                if (target.equals(clusterSet)) {
                    byte[] content = buildClusterSetContent(outputDir);
                    Files.write(target, content);
                } else {
                    Path source = findRenderedFile(outputDir, target.getFileName().toString());
                    if (source != null) {
                        Files.write(target, Files.readAllBytes(source));
                    }
                }
                addedPaths.add(target);
            }

            String message = "[gdfkube] GROUP-" + groupId + ": bootstrap org manifests";
            gitProvider.commitAndPush(workTree, addedPaths, message, GitAuthor.CAMEL);

            dedupCache.put(groupId, clock.millis());

            auditInterceptor.emit(ROUTE_ID, groupId, 0, "bootstrap",
                    Map.of("groupId", groupId, "files", addedPaths.stream()
                            .map(p -> workTree.relativize(p).toString())
                            .toList()));
        } finally {
            lock.unlock();
        }
    }

    private byte[] buildClusterSetContent(String outputDir) throws Exception {
        Path outPath = Path.of(outputDir);
        List<Path> rhacmFiles = new ArrayList<>();
        if (Files.exists(outPath)) {
            try (var walk = Files.walk(outPath)) {
                walk.filter(Files::isRegularFile)
                    .filter(p -> p.toString().contains("rhacm-org"))
                    .sorted()
                    .forEach(rhacmFiles::add);
            }
        }
        if (rhacmFiles.isEmpty()) {
            return new byte[0];
        }
        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < rhacmFiles.size(); i++) {
            if (i > 0) sb.append("\n---\n");
            sb.append(Files.readString(rhacmFiles.get(i)));
        }
        return sb.toString().getBytes();
    }

    private Path findRenderedFile(String outputDir, String fileName) throws Exception {
        Path outPath = Path.of(outputDir);
        if (!Files.exists(outPath)) return null;
        try (var walk = Files.walk(outPath)) {
            return walk.filter(Files::isRegularFile)
                       .filter(p -> p.getFileName().toString().equals(fileName))
                       .findFirst()
                       .orElse(null);
        }
    }

    private void evictExpired() {
        long now = clock.millis();
        dedupCache.entrySet().removeIf(e -> (now - e.getValue()) > TTL_MS);
    }

    void clearDedupCacheForTesting() {
        dedupCache.clear();
    }

    boolean dedupCacheContainsForTesting(String key) {
        return dedupCache.containsKey(key);
    }

    @Produces
    @ApplicationScoped
    Clock systemClock() {
        return Clock.systemUTC();
    }
}
