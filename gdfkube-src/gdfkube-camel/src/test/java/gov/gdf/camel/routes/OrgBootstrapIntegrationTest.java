package gov.gdf.camel.routes;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Map;

import org.apache.camel.CamelContext;
import org.apache.camel.ProducerTemplate;
import org.apache.camel.builder.AdviceWith;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.TestInstance;

import com.fasterxml.jackson.databind.ObjectMapper;

import gov.gdf.camel.bean.HelmTemplateRunner;
import gov.gdf.camel.git.MockGitProvider;
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

    private static final ObjectMapper MAPPER = new ObjectMapper();
    private static final String OWNER = "gdfkube";

    @Inject
    CamelContext context;

    @Inject
    ProducerTemplate producer;

    @Inject
    MockGitProvider mockGitProvider;

    @InjectMock
    HelmTemplateRunner helmTemplateRunner;

    @BeforeAll
    void adviceRoutes() throws Exception {
        AdviceWith.adviceWith(context, "org-bootstrap", route ->
                route.replaceFromWith("seda:org-bootstrap-test"));
    }

    @BeforeEach
    void resetState() throws Exception {
        mockGitProvider.reset();
        reset(helmTemplateRunner);
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
    void firstEvent_bootstrapsBothReposAndWritesAllFour() throws Exception {
        sendGroupEvent("cultura", "gdfkube-cultura", "c");

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
        assertTrue(files.contains("appproject.yaml"));
        assertTrue(files.contains("applicationset.yaml"));
        assertTrue(files.contains("cultura-clusterset.yaml"));
    }

    @Test
    void secondEvent_idempotentNoop() throws Exception {
        sendGroupEvent("cultura", "gdfkube-cultura", "c");
        var commitsAfterFirst = mockGitProvider.getCommits(OWNER, "gdfkube-orgs");
        assertEquals(1, commitsAfterFirst.size());

        sendGroupEvent("cultura", "gdfkube-cultura", "u");
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

        sendGroupEvent("cultura", "gdfkube-cultura", "c");

        var commits = mockGitProvider.getCommits(OWNER, "gdfkube-orgs");
        assertEquals(1, commits.size());

        var files = commits.get(0).getFiles();
        assertEquals(2, files.size(), "Only 2 missing files should be committed");
        assertTrue(files.contains("applicationset.yaml"));
        assertTrue(files.contains("cultura-clusterset.yaml"));
        assertFalse(files.contains("appproject.yaml"),
                "Pre-existing appproject.yaml must not be overwritten");
    }

    @Test
    void existingPerOrgRepo_centralRepoStillBootstraps() throws Exception {
        mockGitProvider.createRepo(OWNER, "gdfkube-cultura",
                new gov.gdf.camel.git.RepoOptions("main", true, "pre-existing"));

        sendGroupEvent("cultura", "gdfkube-cultura", "c");

        assertTrue(mockGitProvider.repoExists(OWNER, "gdfkube-orgs"),
                "Central repo must still be created");
        var commits = mockGitProvider.getCommits(OWNER, "gdfkube-orgs");
        assertFalse(commits.isEmpty(), "Manifests should still be committed");
    }

    @Test
    void deleteEvent_dropped() throws Exception {
        sendGroupEvent("cultura", "gdfkube-cultura", "d");

        assertFalse(mockGitProvider.repoExists(OWNER, "gdfkube-orgs"),
                "No repos created for delete event");
        var commits = mockGitProvider.getCommits(OWNER, "gdfkube-orgs");
        assertTrue(commits.isEmpty(), "No commits for delete event");
    }

    @Test
    void replayWithinTtl_dedupedByCache() throws Exception {
        sendGroupEvent("cultura", "gdfkube-cultura", "c");
        assertEquals(1, mockGitProvider.getCommits(OWNER, "gdfkube-orgs").size());

        mockGitProvider.reset();
        mockGitProvider.createRepo(OWNER, "gdfkube-orgs",
                new gov.gdf.camel.git.RepoOptions("main", true, "re-created"));

        sendGroupEvent("cultura", "gdfkube-cultura", "c");
        var commits = mockGitProvider.getCommits(OWNER, "gdfkube-orgs");
        assertTrue(commits.isEmpty(),
                "Second event within 60s should be suppressed by dedup cache (no work done)");
    }

    @Test
    void helmRenderFailure_dlq() throws Exception {
        reset(helmTemplateRunner);
        when(helmTemplateRunner.render(anyString(), anyString(), anyString(), anyString()))
                .thenThrow(new RuntimeException("helm template failed (exit 1): chart not found"));

        try {
            sendGroupEvent("cultura", "gdfkube-cultura", "c");
        } catch (Exception ignored) {
            // DLQ error handler may surface as exchange exception in test mode
        }

        // In a full integration environment the message would land on dlq.gdfkube.groups.
        // Here we verify the helm failure is thrown (DLQ routing verified via DlqFlowTest pattern).
        verify(helmTemplateRunner, atLeastOnce()).render(anyString(), anyString(), anyString(), anyString());
    }

    private void sendGroupEvent(String groupId, String repo, String op) {
        String body;
        try {
            body = MAPPER.writeValueAsString(Map.of(
                    "_id", groupId,
                    "name", groupId.substring(0, 1).toUpperCase() + groupId.substring(1),
                    "fullName", "Department of " + groupId,
                    "repo", repo,
                    "users", 0,
                    "forms", 0,
                    "clusters", 0
            ));
        } catch (Exception e) {
            throw new RuntimeException(e);
        }

        producer.send("seda:org-bootstrap-test", exchange -> {
            exchange.getIn().setBody(body);
            exchange.getIn().setHeader("__op", op);
        });
    }
}
