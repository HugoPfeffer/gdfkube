package gov.gdf.camel.routes;

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

import gov.gdf.camel.git.MockGitProvider;
import gov.gdf.camel.git.RepoOptions;
import gov.gdf.camel.model.RequestEvent;
import io.quarkus.test.junit.QuarkusTest;
import io.quarkus.test.junit.QuarkusTestProfile;
import io.quarkus.test.junit.TestProfile;
import jakarta.inject.Inject;

import static org.junit.jupiter.api.Assertions.*;

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

    @EndpointInject("mock:status-emit")
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
                route.interceptSendToEndpoint("direct:status-emit")
                        .skipSendToOriginalEndpoint()
                        .to("mock:status-emit"));

        AdviceWith.adviceWith(context, "status-emitter", route ->
                route.replaceFromWith("seda:status-emitter-disabled"));
    }

    @BeforeEach
    void resetState() {
        mockGitProvider.reset();
        mockStatusEmit.reset();
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
