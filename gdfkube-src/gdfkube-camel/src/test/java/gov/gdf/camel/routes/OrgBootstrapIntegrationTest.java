package gov.gdf.camel.routes;

import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Map;

import org.apache.camel.CamelContext;
import org.apache.camel.EndpointInject;
import org.apache.camel.Exchange;
import org.apache.camel.ProducerTemplate;
import org.apache.camel.builder.AdviceWith;
import org.apache.camel.component.mock.MockEndpoint;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.TestInstance;

import gov.gdf.camel.bean.HelmTemplateRunner;
import gov.gdf.camel.git.MockGitProvider;
import gov.gdf.camel.testsupport.MutableClock;
import gov.gdf.camel.testsupport.TestClockProducer;
import io.quarkus.test.junit.QuarkusTest;
import io.quarkus.test.junit.QuarkusTestProfile;
import io.quarkus.test.junit.TestProfile;
import io.quarkus.test.junit.mockito.InjectMock;
import jakarta.inject.Inject;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

@QuarkusTest
@TestProfile(OrgBootstrapIntegrationTest.MockProfile.class)
@TestInstance(TestInstance.Lifecycle.PER_CLASS)
class OrgBootstrapIntegrationTest {

    public static class MockProfile implements QuarkusTestProfile {
        @Override
        public Map<String, String> getConfigOverrides() {
            return Map.of(
                    "app.git.provider", "mock",
                    "app.system.base-domain", "test.local",
                    "app.system.release-image", "registry.local/ocp:4.16.7",
                    "app.system.gitea-external-url", "https://gitea.test.local",
                    "app.system.gitea-owner", "gdfkube"
            );
        }
    }

    private static final String OWNER = "gdfkube";

    @Inject
    CamelContext context;

    @Inject
    ProducerTemplate producer;

    @Inject
    MockGitProvider mockGitProvider;

    @Inject
    OrgBootstrapRoute orgBootstrapRoute;

    @InjectMock
    HelmTemplateRunner helmTemplateRunner;

    @EndpointInject("mock:dlq.gdfkube.groups")
    MockEndpoint dlqMock;

    private final MutableClock mutableClock = TestClockProducer.getMutableClock();

    @BeforeAll
    void adviceRoutes() throws Exception {
        AdviceWith.adviceWith(context, "org-bootstrap", route -> {
            route.replaceFromWith("direct:org-bootstrap-test");
            route.interceptSendToEndpoint("kafka:dlq.gdfkube.groups*")
                    .skipSendToOriginalEndpoint()
                    .to("mock:dlq.gdfkube.groups");
        });
    }

    @BeforeEach
    void resetState() throws Exception {
        mockGitProvider.reset();
        reset(helmTemplateRunner);
        orgBootstrapRoute.clearDedupCacheForTesting();
        dlqMock.reset();
        mutableClock.set(Instant.parse("2026-01-01T00:00:00Z"));
        stubHelmRender();
    }

    private void stubHelmRender() throws Exception {
        when(helmTemplateRunner.render(anyString(), anyString(), anyString(), anyString()))
                .thenAnswer(invocation -> {
                    String outputDir = invocation.getArgument(3);
                    String chartRef = invocation.getArgument(0);
                    Path outBase = Path.of(outputDir);

                    if (chartRef.contains("argocd-org")) {
                        Path argoDir = outBase.resolve("argocd-org").resolve("templates");
                        Files.createDirectories(argoDir);
                        Files.writeString(argoDir.resolve("appproject.yaml"),
                                "apiVersion: argoproj.io/v1alpha1\nkind: AppProject\nmetadata:\n  name: cultura\n");
                        Files.writeString(argoDir.resolve("applicationset.yaml"),
                                "apiVersion: argoproj.io/v1alpha1\nkind: ApplicationSet\nmetadata:\n  name: cultura\n");
                        return List.of(argoDir.resolve("appproject.yaml"), argoDir.resolve("applicationset.yaml"));
                    } else if (chartRef.contains("rhacm-org")) {
                        Path rhacmDir = outBase.resolve("rhacm-org").resolve("templates");
                        Files.createDirectories(rhacmDir);
                        Files.writeString(rhacmDir.resolve("managedclusterset.yaml"),
                                "apiVersion: cluster.open-cluster-management.io/v1beta2\nkind: ManagedClusterSet\nmetadata:\n  name: cultura\n");
                        Files.writeString(rhacmDir.resolve("managedclustersetbinding.yaml"),
                                "apiVersion: cluster.open-cluster-management.io/v1beta2\nkind: ManagedClusterSetBinding\nmetadata:\n  name: cultura\n");
                        return List.of(rhacmDir.resolve("managedclusterset.yaml"), rhacmDir.resolve("managedclustersetbinding.yaml"));
                    }
                    return List.of();
                });
    }

    @Test
    void firstEvent_bootstrapsBothReposAndWritesAllThree() throws Exception {
        sendOrgEvent("cultura");

        assertTrue(mockGitProvider.repoExists(OWNER, "gdfkube-cultura"),
                "Per-org repo must be created");
        assertTrue(mockGitProvider.repoExists(OWNER, "gdfkube-orgs"),
                "Central repo must be created");

        var commits = mockGitProvider.getCommits(OWNER, "gdfkube-orgs");
        assertEquals(1, commits.size(), "Exactly one commit expected");

        var commit = commits.get(0);
        assertTrue(commit.getMessage().contains("[gdfkube] GROUP-cultura: bootstrap org manifests"),
                "Commit message must match expected format");

        var files = commit.getFiles();
        assertEquals(3, files.size(), "Should commit exactly 3 files");
        assertTrue(files.contains("orgs/cultura/appproject.yaml"));
        assertTrue(files.contains("orgs/cultura/applicationset.yaml"));
        assertTrue(files.contains("orgs/cultura/cultura-clusterset.yaml"));

        List<Path> committedPaths = mockGitProvider.getCommittedPaths(OWNER, "gdfkube-orgs");
        assertTrue(committedPaths.contains(Path.of("orgs/cultura/appproject.yaml")),
                "Must contain orgs/cultura/appproject.yaml");
        assertTrue(committedPaths.contains(Path.of("orgs/cultura/applicationset.yaml")),
                "Must contain orgs/cultura/applicationset.yaml");
        assertTrue(committedPaths.contains(Path.of("orgs/cultura/cultura-clusterset.yaml")),
                "Must contain orgs/cultura/cultura-clusterset.yaml");
    }

    @Test
    void secondEvent_idempotentNoop() throws Exception {
        sendOrgEvent("cultura");
        var commitsAfterFirst = mockGitProvider.getCommits(OWNER, "gdfkube-orgs");
        assertEquals(1, commitsAfterFirst.size());

        sendOrgEvent("cultura");
        var commitsAfterSecond = mockGitProvider.getCommits(OWNER, "gdfkube-orgs");
        assertEquals(1, commitsAfterSecond.size(),
                "No second commit expected — files already exist (noop)");
    }

    @Test
    void partialState_onlyMissingFilesPushed() throws Exception {
        mockGitProvider.createRepo(OWNER, "gdfkube-orgs",
                new gov.gdf.camel.git.RepoOptions("main", true, "pre-existing"));
        Path workTree = mockGitProvider.cloneOrPull(OWNER, "gdfkube-orgs", "main");
        Path orgDir = workTree.resolve("orgs").resolve("cultura");
        Files.createDirectories(orgDir);
        Files.writeString(orgDir.resolve("appproject.yaml"), "pre-existing content");

        sendOrgEvent("cultura");

        var commits = mockGitProvider.getCommits(OWNER, "gdfkube-orgs");
        assertEquals(1, commits.size());

        var files = commits.get(0).getFiles();
        assertEquals(2, files.size(), "Only 2 missing files should be committed");
        assertTrue(files.contains("orgs/cultura/applicationset.yaml"));
        assertTrue(files.contains("orgs/cultura/cultura-clusterset.yaml"));
        assertFalse(files.contains("orgs/cultura/appproject.yaml"),
                "Pre-existing appproject.yaml must not be overwritten");
    }

    @Test
    void existingPerOrgRepo_centralRepoStillBootstraps() throws Exception {
        mockGitProvider.createRepo(OWNER, "gdfkube-cultura",
                new gov.gdf.camel.git.RepoOptions("main", true, "pre-existing"));

        sendOrgEvent("cultura");

        assertTrue(mockGitProvider.repoExists(OWNER, "gdfkube-orgs"),
                "Central repo must still be created");
        var commits = mockGitProvider.getCommits(OWNER, "gdfkube-orgs");
        assertFalse(commits.isEmpty(), "Manifests should still be committed");
    }

    @Test
    void replayWithinTtl_dedupedByCache() throws Exception {
        sendOrgEvent("cultura");
        assertEquals(1, mockGitProvider.getCommits(OWNER, "gdfkube-orgs").size());

        mockGitProvider.reset();
        mockGitProvider.createRepo(OWNER, "gdfkube-orgs",
                new gov.gdf.camel.git.RepoOptions("main", true, "re-created"));

        mutableClock.advance(Duration.ofSeconds(30));
        sendOrgEvent("cultura");
        var commits = mockGitProvider.getCommits(OWNER, "gdfkube-orgs");
        assertTrue(commits.isEmpty(),
                "Event within 60s should be deduped");
    }

    @Test
    void replayAfterTtl_reprocesses() throws Exception {
        sendOrgEvent("cultura");
        assertEquals(1, mockGitProvider.getCommits(OWNER, "gdfkube-orgs").size());

        mockGitProvider.reset();
        mockGitProvider.createRepo(OWNER, "gdfkube-orgs",
                new gov.gdf.camel.git.RepoOptions("main", true, "re-created"));

        mutableClock.advance(Duration.ofSeconds(61));
        sendOrgEvent("cultura");
        assertEquals(1, mockGitProvider.getCommits(OWNER, "gdfkube-orgs").size(),
                "Event after 60s TTL should be re-processed");
    }

    @Test
    void helmRenderFailure_dlq() throws Exception {
        dlqMock.expectedMessageCount(1);
        dlqMock.message(0).header("x-error-class").isEqualTo("java.lang.RuntimeException");
        dlqMock.message(0).header("x-error-msg").isNotNull();
        dlqMock.message(0).header("x-first-failure-at").isNotNull();
        dlqMock.message(0).header("x-replayed").isEqualTo("false");
        dlqMock.message(0).header("x-stage").isNotNull();
        dlqMock.message(0).header("x-attempts").isNotNull();

        reset(helmTemplateRunner);
        when(helmTemplateRunner.render(anyString(), anyString(), anyString(), anyString()))
                .thenThrow(new RuntimeException("helm template failed (exit 1): chart not found"));

        sendOrgEvent("cultura");

        dlqMock.assertIsSatisfied(45_000);

        assertTrue(mockGitProvider.getCommits(OWNER, "gdfkube-orgs").isEmpty(),
                "No commits expected when helm render fails");
    }

    @Test
    void outputDir_cleanedUpAfterSuccess() throws Exception {
        sendOrgEvent("cultura");

        try (var listing = Files.list(Path.of(System.getProperty("java.io.tmpdir")))) {
            long leftover = listing
                    .filter(p -> p.getFileName().toString().startsWith("bootstrap-cultura-"))
                    .filter(Files::isDirectory)
                    .count();
            assertEquals(0, leftover,
                    "All bootstrap-cultura-* temp directories must be cleaned up after the exchange");
        }
    }

    @Test
    void helmFailure_leavesDedupCacheEmpty() throws Exception {
        reset(helmTemplateRunner);
        when(helmTemplateRunner.render(anyString(), anyString(), anyString(), anyString()))
                .thenThrow(new RuntimeException("helm template failed"));

        sendOrgEvent("cultura");

        assertFalse(orgBootstrapRoute.dedupCacheContainsForTesting("cultura"),
                "dedupCache must NOT contain cultura after a failed exchange");

        reset(helmTemplateRunner);
        stubHelmRender();
        mockGitProvider.reset();

        sendOrgEvent("cultura");

        assertFalse(mockGitProvider.getCommits(OWNER, "gdfkube-orgs").isEmpty(),
                "Second event must NOT be suppressed — cache was not poisoned by the failure");
    }

    private Exchange sendOrgEvent(String org) {
        return producer.send("direct:org-bootstrap-test",
                exchange -> exchange.setProperty("org", org));
    }
}
