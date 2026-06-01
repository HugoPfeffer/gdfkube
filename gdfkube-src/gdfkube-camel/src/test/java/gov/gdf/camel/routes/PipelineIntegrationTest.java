package gov.gdf.camel.routes;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Map;

import org.apache.camel.CamelContext;
import org.apache.camel.EndpointInject;
import org.apache.camel.ProducerTemplate;
import org.apache.camel.builder.AdviceWith;
import org.apache.camel.builder.RouteBuilder;
import org.apache.camel.component.mock.MockEndpoint;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.TestInstance;

import gov.gdf.camel.bean.HelmTemplateRunner;
import gov.gdf.camel.git.MockGitProvider;
import gov.gdf.camel.git.RepoOptions;
import gov.gdf.camel.model.RequestEvent;
import io.quarkus.test.junit.QuarkusTest;
import io.quarkus.test.junit.QuarkusTestProfile;
import io.quarkus.test.junit.TestProfile;
import io.quarkus.test.junit.mockito.InjectMock;
import jakarta.inject.Inject;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

/**
 * Golden-path integration test: exercises the git-push -> repo-bootstrap ->
 * status-emitter flow using MockGitProvider and mock kafka endpoints.
 *
 * <p>Helm rendering is replaced with a lightweight stub that sets exchange
 * properties without invoking the helm binary.</p>
 */
@QuarkusTest
@TestProfile(PipelineIntegrationTest.MockProfile.class)
@TestInstance(TestInstance.Lifecycle.PER_CLASS)
class PipelineIntegrationTest {

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

    @Inject
    CamelContext context;

    @Inject
    ProducerTemplate producer;

    @Inject
    MockGitProvider mockGitProvider;

    @InjectMock
    HelmTemplateRunner helmTemplateRunner;

    @Inject
    OrgBootstrapRoute orgBootstrapRoute;

    @EndpointInject("mock:status-emitter")
    MockEndpoint mockStatusEmit;

    @BeforeAll
    void adviceRoutes() throws Exception {
        AdviceWith.adviceWith(context, "helm-render", route -> {
            route.replaceFromWith("seda:helm-render-disabled");
        });

        context.addRoutes(new RouteBuilder() {
            @Override
            public void configure() {
                from("direct:helm-render")
                        .routeId("test-helm-render")
                        .process(exchange -> {
                            exchange.setProperty("currentStage", 4);
                            RequestEvent event = exchange.getProperty("requestEvent", RequestEvent.class);
                            String org = event.requesterGroupName;
                            String name = event.vars != null
                                    ? String.valueOf(event.vars.getOrDefault("clusterName", "default"))
                                    : "default";
                            exchange.setProperty("releaseName", "hc-" + org + "-" + name);
                            exchange.setProperty("chartRef", event.formId);
                            exchange.setProperty("renderedFiles", List.of());
                        })
                        .to("direct:git-push");
            }
        });

        AdviceWith.adviceWith(context, "git-push", route ->
                route.interceptSendToEndpoint("direct:status-emitter")
                        .skipSendToOriginalEndpoint()
                        .to("mock:status-emitter"));

        AdviceWith.adviceWith(context, "status-emitter", route ->
                route.replaceFromWith("seda:status-emitter-disabled"));
    }

    @BeforeEach
    void resetState() throws Exception {
        mockGitProvider.reset();
        mockStatusEmit.reset();
        reset(helmTemplateRunner);
        orgBootstrapRoute.clearDedupCacheForTesting();
        stubOrgHelmRender();
    }

    /**
     * Stubs the org-bootstrap helm render (invoked by repo-bootstrap ->
     * direct:org-bootstrap) so it writes argocd-org / rhacm-org templates into
     * the output dir without invoking the helm binary.
     */
    private void stubOrgHelmRender() throws Exception {
        when(helmTemplateRunner.render(anyString(), anyString(), anyString(), anyString()))
                .thenAnswer(invocation -> {
                    String chartRef = invocation.getArgument(0);
                    Path outBase = Path.of(invocation.getArgument(3, String.class));

                    if (chartRef.contains("argocd-org")) {
                        Path argoDir = outBase.resolve("argocd-org").resolve("templates");
                        Files.createDirectories(argoDir);
                        Files.writeString(argoDir.resolve("appproject.yaml"),
                                "apiVersion: argoproj.io/v1alpha1\nkind: AppProject\n");
                        Files.writeString(argoDir.resolve("applicationset.yaml"),
                                "apiVersion: argoproj.io/v1alpha1\nkind: ApplicationSet\n");
                        return List.of(argoDir.resolve("appproject.yaml"), argoDir.resolve("applicationset.yaml"));
                    } else if (chartRef.contains("rhacm-org")) {
                        Path rhacmDir = outBase.resolve("rhacm-org").resolve("templates");
                        Files.createDirectories(rhacmDir);
                        Files.writeString(rhacmDir.resolve("managedclusterset.yaml"),
                                "apiVersion: cluster.open-cluster-management.io/v1beta2\nkind: ManagedClusterSet\n");
                        return List.of(rhacmDir.resolve("managedclusterset.yaml"));
                    }
                    return List.of();
                });
    }

    @Test
    void goldenPath_gitPushRecordsCommit() throws Exception {
        RequestEvent event = buildSampleRequest();
        mockStatusEmit.expectedMessageCount(1);

        producer.send("direct:helm-render", exchange -> {
            exchange.setProperty("requestEvent", event);
            exchange.setProperty("requestId", event._id);
        });

        String repoName = "gdfkube-" + event.requesterGroupName;
        var commits = mockGitProvider.getCommits("gdfkube", repoName);
        assertFalse(commits.isEmpty(), "MockGitProvider should record at least one commit");
        assertTrue(commits.get(0).getMessage().contains(event._id),
                "Commit message must reference the requestId");
    }

    @Test
    void goldenPath_provisioningAlsoCreatesOrgScaffolding() throws Exception {
        RequestEvent event = buildSampleRequest();
        String org = event.requesterGroupName;

        producer.send("direct:helm-render", exchange -> {
            exchange.setProperty("requestEvent", event);
            exchange.setProperty("requestId", event._id);
        });

        // repo-bootstrap invokes direct:org-bootstrap, which renders and commits
        // the per-org scaffolding into the central gdfkube-orgs repo.
        assertTrue(mockGitProvider.repoExists("gdfkube", "gdfkube-orgs"),
                "Central gdfkube-orgs repo must be bootstrapped during provisioning");

        var orgCommits = mockGitProvider.getCommits("gdfkube", "gdfkube-orgs");
        assertFalse(orgCommits.isEmpty(), "Org scaffolding commit expected");

        var files = orgCommits.get(0).getFiles();
        assertTrue(files.contains("orgs/" + org + "/appproject.yaml"),
                "Must commit orgs/" + org + "/appproject.yaml");
        assertTrue(files.contains("orgs/" + org + "/applicationset.yaml"),
                "Must commit orgs/" + org + "/applicationset.yaml");
        assertTrue(files.contains("orgs/" + org + "/" + org + "-clusterset.yaml"),
                "Must commit orgs/" + org + "/" + org + "-clusterset.yaml");
    }

    @Test
    void goldenPath_repoBootstrapCreatesRepoIfMissing() throws Exception {
        RequestEvent event = buildSampleRequest();
        String repoName = "gdfkube-" + event.requesterGroupName;
        mockStatusEmit.expectedMessageCount(1);

        assertFalse(mockGitProvider.repoExists("gdfkube", repoName),
                "Repo must not exist before the flow");

        producer.send("direct:helm-render", exchange -> {
            exchange.setProperty("requestEvent", event);
            exchange.setProperty("requestId", event._id);
        });

        assertTrue(mockGitProvider.repoExists("gdfkube", repoName),
                "Repo-bootstrap must create the repo automatically");
    }

    @Test
    void goldenPath_statusEmitReached() throws Exception {
        RequestEvent event = buildSampleRequest();
        mockStatusEmit.expectedMessageCount(1);

        producer.send("direct:helm-render", exchange -> {
            exchange.setProperty("requestEvent", event);
            exchange.setProperty("requestId", event._id);
        });

        mockStatusEmit.assertIsSatisfied(5000);
    }

    @Test
    void goldenPath_existingRepoIsNotRecreated() throws Exception {
        RequestEvent event = buildSampleRequest();
        String repoName = "gdfkube-" + event.requesterGroupName;
        mockStatusEmit.expectedMessageCount(1);

        mockGitProvider.createRepo("gdfkube", repoName,
                new RepoOptions("main", true, "pre-existing"));

        producer.send("direct:helm-render", exchange -> {
            exchange.setProperty("requestEvent", event);
            exchange.setProperty("requestId", event._id);
        });

        var commits = mockGitProvider.getCommits("gdfkube", repoName);
        assertFalse(commits.isEmpty(), "Commit should still be recorded in existing repo");
    }

    private static RequestEvent buildSampleRequest() {
        RequestEvent event = new RequestEvent();
        event._id = "REQ-INT-" + System.nanoTime();
        event.formId = "cluster-request";
        event.status = "provisioning";
        event.env = "dev";
        event.requesterGroupName = "sec-educ";
        event.stage = 0;
        event.submittedAt = "2025-01-01T00:00:00Z";
        event.vars = Map.of("clusterName", "test-cluster");
        event.meta = Map.of("correlationId", "corr-001");
        event.requester = Map.of("email", "user@gdf.gov.br");
        return event;
    }
}
