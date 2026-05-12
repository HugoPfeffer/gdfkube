package gov.gdf.camel.routes;

import java.util.Map;

import org.apache.camel.CamelContext;
import org.apache.camel.EndpointInject;
import org.apache.camel.Exchange;
import org.apache.camel.ProducerTemplate;
import org.apache.camel.builder.AdviceWith;
import org.apache.camel.component.mock.MockEndpoint;
import org.apache.camel.impl.DefaultCamelContext;
import org.apache.camel.support.DefaultExchange;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.TestInstance;

import gov.gdf.camel.model.RequestEvent;
import io.quarkus.test.junit.QuarkusTest;
import io.quarkus.test.junit.QuarkusTestProfile;
import io.quarkus.test.junit.TestProfile;
import jakarta.inject.Inject;

import static org.junit.jupiter.api.Assertions.*;

/**
 * Tests the DLQ (dead-letter queue) path:
 * <ol>
 *   <li>Verifies {@link DlqHeaders#stamp(Exchange)} sets all required headers</li>
 *   <li>Verifies that when a route processor throws, the message reaches the
 *       DLQ endpoint with the correct headers after retries are exhausted</li>
 * </ol>
 */
@QuarkusTest
@TestProfile(DlqFlowTest.MockProfile.class)
@TestInstance(TestInstance.Lifecycle.PER_CLASS)
class DlqFlowTest {

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

    @EndpointInject("mock:dlq-capture")
    MockEndpoint mockDlq;

    @BeforeAll
    void adviceRoutes() throws Exception {
        AdviceWith.adviceWith(context, "helm-render", route -> {
            route.interceptSendToEndpoint("kafka:dlq.gdfkube.helm-render")
                    .skipSendToOriginalEndpoint()
                    .to("mock:dlq-capture");
            route.weaveAddFirst()
                    .process(exchange -> {
                        throw new RuntimeException("Simulated helm failure");
                    });
        });
    }

    @BeforeEach
    void resetMocks() {
        mockDlq.reset();
    }

    // ---- DlqHeaders.stamp() unit tests ----

    @Test
    void stamp_setsErrorClassAndMessage() {
        try (DefaultCamelContext testCtx = new DefaultCamelContext()) {
            Exchange exchange = new DefaultExchange(testCtx);
            exchange.setProperty(Exchange.EXCEPTION_CAUGHT,
                    new RuntimeException("chart not found"));
            exchange.setProperty("currentStage", 4);

            DlqHeaders.stamp(exchange);

            var msg = exchange.getIn();
            assertEquals("java.lang.RuntimeException", msg.getHeader("x-error-class"));
            assertEquals("chart not found", msg.getHeader("x-error-msg"));
        }
    }

    @Test
    void stamp_setsTimestampAndReplayedFlag() {
        try (DefaultCamelContext testCtx = new DefaultCamelContext()) {
            Exchange exchange = new DefaultExchange(testCtx);
            exchange.setProperty(Exchange.EXCEPTION_CAUGHT, new IllegalStateException("err"));

            DlqHeaders.stamp(exchange);

            var msg = exchange.getIn();
            assertNotNull(msg.getHeader("x-first-failure-at"),
                    "x-first-failure-at must be set");
            assertEquals("false", msg.getHeader("x-replayed"),
                    "x-replayed must default to false");
        }
    }

    @Test
    void stamp_setsStageAndAttempts() {
        try (DefaultCamelContext testCtx = new DefaultCamelContext()) {
            Exchange exchange = new DefaultExchange(testCtx);
            exchange.setProperty(Exchange.EXCEPTION_CAUGHT, new RuntimeException("err"));
            exchange.setProperty("currentStage", 5);
            exchange.setProperty(Exchange.REDELIVERY_COUNTER, 3);

            DlqHeaders.stamp(exchange);

            var msg = exchange.getIn();
            assertEquals(5, msg.getHeader("x-stage"));
            assertEquals(3, msg.getHeader("x-attempts"));
        }
    }

    @Test
    void stamp_withNullException_setsUnknown() {
        try (DefaultCamelContext testCtx = new DefaultCamelContext()) {
            Exchange exchange = new DefaultExchange(testCtx);

            DlqHeaders.stamp(exchange);

            var msg = exchange.getIn();
            assertEquals("unknown", msg.getHeader("x-error-class"));
            assertEquals("unknown", msg.getHeader("x-error-msg"));
        }
    }

    // ---- DLQ route flow test ----

    @Test
    void processorFailure_landsOnDlqMockWithHeaders() throws Exception {
        mockDlq.expectedMinimumMessageCount(1);

        RequestEvent event = buildSampleRequest();
        try {
            producer.send("direct:helm-render", exchange -> {
                exchange.setProperty("requestEvent", event);
                exchange.setProperty("requestId", event._id);
            });
        } catch (Exception ignored) {
            // Error handler routes to DLQ after exhausting retries
        }

        // Allow time for exponential-backoff retries (3 retries, ~31s worst case)
        mockDlq.assertIsSatisfied(45000);

        Exchange dlqExchange = mockDlq.getReceivedExchanges().get(0);
        assertNotNull(dlqExchange.getIn().getHeader("x-error-class"),
                "DLQ message must carry x-error-class");
        assertEquals("java.lang.RuntimeException",
                dlqExchange.getIn().getHeader("x-error-class", String.class));
        assertNotNull(dlqExchange.getIn().getHeader("x-error-msg"),
                "DLQ message must carry x-error-msg");
        assertNotNull(dlqExchange.getIn().getHeader("x-first-failure-at"),
                "DLQ message must carry x-first-failure-at");
        assertEquals("false",
                dlqExchange.getIn().getHeader("x-replayed", String.class));
    }

    private static RequestEvent buildSampleRequest() {
        RequestEvent event = new RequestEvent();
        event._id = "REQ-DLQ-001";
        event.formId = "cluster-request";
        event.status = "provisioning";
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
