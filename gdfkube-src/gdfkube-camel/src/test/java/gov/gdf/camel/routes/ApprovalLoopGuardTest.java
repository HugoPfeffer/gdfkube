package gov.gdf.camel.routes;

import java.util.Map;

import org.apache.camel.CamelContext;
import org.apache.camel.EndpointInject;
import org.apache.camel.ProducerTemplate;
import org.apache.camel.builder.AdviceWith;
import org.apache.camel.component.mock.MockEndpoint;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.TestInstance;

import com.fasterxml.jackson.databind.ObjectMapper;

import gov.gdf.camel.model.RequestEvent;
import io.quarkus.test.junit.QuarkusTest;
import io.quarkus.test.junit.QuarkusTestProfile;
import io.quarkus.test.junit.TestProfile;
import jakarta.inject.Inject;

import static org.junit.jupiter.api.Assertions.*;

/**
 * Tests the approval-loop guard in {@link RequestRouterRoute}:
 * <ul>
 *   <li>{@code op=u} with {@code status != "provisioning"} is dropped</li>
 *   <li>{@code op=u} with same requestId within TTL is dropped (dedup)</li>
 *   <li>{@code op=d} is dropped</li>
 * </ul>
 */
@QuarkusTest
@TestProfile(ApprovalLoopGuardTest.MockProfile.class)
@TestInstance(TestInstance.Lifecycle.PER_CLASS)
class ApprovalLoopGuardTest {

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

    @Inject
    CamelContext context;

    @Inject
    ProducerTemplate producer;

    @EndpointInject("mock:helm-render")
    MockEndpoint mockHelmRender;

    @BeforeAll
    void adviceRoutes() throws Exception {
        AdviceWith.adviceWith(context, "request-router", route -> {
            route.replaceFromWith("direct:request-router-input");
            route.interceptSendToEndpoint("direct:helm-render")
                    .skipSendToOriginalEndpoint()
                    .to("mock:helm-render");
            route.interceptSendToEndpoint("kafka:dlq.*")
                    .skipSendToOriginalEndpoint()
                    .to("mock:dlq-guard");
        });
    }

    @BeforeEach
    void resetMocks() {
        mockHelmRender.reset();
    }

    @Test
    void opCreate_isAccepted() throws Exception {
        RequestEvent event = buildRequest("REQ-GUARD-CREATE", "provisioning");
        String payload = MAPPER.writeValueAsString(event);
        mockHelmRender.expectedMessageCount(1);

        producer.sendBodyAndHeaders("direct:request-router-input", payload,
                Map.of("__op", "c"));

        mockHelmRender.assertIsSatisfied(5000);
    }

    @Test
    void opUpdateWithProvisioningStatus_isAccepted() throws Exception {
        RequestEvent event = buildRequest("REQ-GUARD-UPROV", "provisioning");
        String payload = MAPPER.writeValueAsString(event);
        mockHelmRender.expectedMessageCount(1);

        producer.sendBodyAndHeaders("direct:request-router-input", payload,
                Map.of("__op", "u"));

        mockHelmRender.assertIsSatisfied(5000);
    }

    @Test
    void opUpdateWithNonProvisioningStatus_isDropped() throws Exception {
        RequestEvent event = buildRequest("REQ-GUARD-UAPPR", "approved");
        String payload = MAPPER.writeValueAsString(event);
        mockHelmRender.expectedMessageCount(0);

        producer.sendBodyAndHeaders("direct:request-router-input", payload,
                Map.of("__op", "u"));

        mockHelmRender.assertIsSatisfied(2000);
        assertEquals(0, mockHelmRender.getReceivedCounter(),
                "op=u with status!=provisioning must be dropped");
    }

    @Test
    void duplicateRequestIdWithinTtl_isDropped() throws Exception {
        String requestId = "REQ-GUARD-DUP-" + System.nanoTime();
        RequestEvent event = buildRequest(requestId, "provisioning");
        String payload = MAPPER.writeValueAsString(event);

        mockHelmRender.expectedMessageCount(1);
        producer.sendBodyAndHeaders("direct:request-router-input", payload,
                Map.of("__op", "c"));
        mockHelmRender.assertIsSatisfied(5000);

        mockHelmRender.reset();
        mockHelmRender.expectedMessageCount(0);
        producer.sendBodyAndHeaders("direct:request-router-input", payload,
                Map.of("__op", "c"));

        mockHelmRender.assertIsSatisfied(2000);
        assertEquals(0, mockHelmRender.getReceivedCounter(),
                "Duplicate requestId within TTL window must be dropped");
    }

    @Test
    void opDelete_isDropped() throws Exception {
        RequestEvent event = buildRequest("REQ-GUARD-DEL", "provisioning");
        String payload = MAPPER.writeValueAsString(event);
        mockHelmRender.expectedMessageCount(0);

        producer.sendBodyAndHeaders("direct:request-router-input", payload,
                Map.of("__op", "d"));

        mockHelmRender.assertIsSatisfied(2000);
        assertEquals(0, mockHelmRender.getReceivedCounter(),
                "op=d must always be dropped");
    }

    @Test
    void opReadSnapshot_isAccepted() throws Exception {
        RequestEvent event = buildRequest("REQ-GUARD-READ", "provisioning");
        String payload = MAPPER.writeValueAsString(event);
        mockHelmRender.expectedMessageCount(1);

        producer.sendBodyAndHeaders("direct:request-router-input", payload,
                Map.of("__op", "r"));

        mockHelmRender.assertIsSatisfied(5000);
    }

    private static RequestEvent buildRequest(String id, String status) {
        RequestEvent event = new RequestEvent();
        event._id = id;
        event.formId = "cluster-request";
        event.status = status;
        event.env = "dev";
        event.requesterGroupName = "sec-educ";
        event.stage = 0;
        event.submittedAt = "2025-01-01T00:00:00Z";
        event.vars = Map.of("clusterName", "test-cluster");
        event.meta = Map.of();
        event.requester = Map.of("email", "test@gdf.gov.br");
        return event;
    }
}
