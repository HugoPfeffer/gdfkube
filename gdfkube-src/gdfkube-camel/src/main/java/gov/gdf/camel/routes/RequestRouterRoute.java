package gov.gdf.camel.routes;

import java.time.Instant;
import java.util.concurrent.ConcurrentHashMap;

import org.apache.camel.Exchange;
import org.apache.camel.LoggingLevel;
import org.apache.camel.builder.RouteBuilder;
import org.apache.camel.component.kafka.KafkaConstants;
import org.apache.camel.component.kafka.consumer.KafkaManualCommit;
import org.jboss.logging.Logger;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

import gov.gdf.camel.model.RequestEvent;
import jakarta.enterprise.context.ApplicationScoped;

@ApplicationScoped
public class RequestRouterRoute extends RouteBuilder {

    private static final Logger LOG = Logger.getLogger(RequestRouterRoute.class);
    private static final String ROUTE_ID = "request-router";
    private static final ObjectMapper MAPPER = new ObjectMapper();
    private static final long TTL_MS = 60_000;

    private final ConcurrentHashMap<String, Long> recentlyProcessed = new ConcurrentHashMap<>();

    @Override
    public void configure() {
        errorHandler(deadLetterChannel("kafka:dlq.gdfkube." + ROUTE_ID)
                .maximumRedeliveries(3)
                .redeliveryDelay(1000)
                .backOffMultiplier(5.0)
                .useExponentialBackOff()
                .logRetryAttempted(true)
                .onPrepareFailure(this::stampDlqHeaders));

        from("kafka:dbz.gdfkube.requests"
                + "?groupId=gdfkube-camel"
                + "&autoOffsetReset=earliest"
                + "&autoCommitEnable=false"
                + "&allowManualCommit=true")
            .routeId(ROUTE_ID)
            .process(exchange -> {
                String op = exchange.getIn().getHeader("__op", String.class);
                if (op == null) {
                    op = exchange.getIn().getHeader("op", String.class);
                }

                boolean accepted = false;
                String body = exchange.getIn().getBody(String.class);

                if ("c".equals(op) || "r".equals(op)) {
                    accepted = true;
                } else if ("u".equals(op)) {
                    JsonNode node = MAPPER.readTree(body);
                    String status = node.path("status").asText("");
                    boolean isStageWriteback = node.path("_stageWriteback").asBoolean(false);
                    accepted = "provisioning".equals(status) && !isStageWriteback;
                }

                if (accepted) {
                    RequestEvent event = MAPPER.readValue(body, RequestEvent.class);
                    String requestId = event._id;

                    evictExpired();
                    if (recentlyProcessed.containsKey(requestId)) {
                        accepted = false;
                        LOG.debugf("Skipping recently processed requestId=%s", requestId);
                    } else {
                        recentlyProcessed.put(requestId, System.currentTimeMillis());
                        exchange.setProperty("requestEvent", event);
                        exchange.setProperty("requestId", requestId);
                    }
                }

                exchange.setProperty("accepted", accepted);
            })
            .choice()
                .when(exchangeProperty("accepted").isEqualTo(true))
                    .to("direct:helm-render")
                .otherwise()
                    .log(LoggingLevel.DEBUG, "Dropped CDC event: op=${header.__op}")
            .end()
            .process(this::commitKafkaOffset);
    }

    private void commitKafkaOffset(Exchange exchange) {
        KafkaManualCommit commit = exchange.getIn().getHeader(
                KafkaConstants.MANUAL_COMMIT, KafkaManualCommit.class);
        if (commit != null) {
            commit.commit();
        }
    }

    private void evictExpired() {
        long now = System.currentTimeMillis();
        recentlyProcessed.entrySet().removeIf(e -> (now - e.getValue()) > TTL_MS);
    }

    private void stampDlqHeaders(Exchange exchange) {
        Exception cause = exchange.getProperty(Exchange.EXCEPTION_CAUGHT, Exception.class);
        var msg = exchange.getIn();

        msg.setHeader("x-original-topic", msg.getHeader(KafkaConstants.TOPIC));
        msg.setHeader("x-original-partition", msg.getHeader(KafkaConstants.PARTITION));
        msg.setHeader("x-original-offset", msg.getHeader(KafkaConstants.OFFSET));
        msg.setHeader("x-original-key", msg.getHeader(KafkaConstants.KEY));
        msg.setHeader("x-error-class", cause != null ? cause.getClass().getName() : "unknown");
        msg.setHeader("x-error-msg", cause != null ? cause.getMessage() : "unknown");
        msg.setHeader("x-stage", exchange.getProperty("currentStage", "unknown", String.class));
        msg.setHeader("x-attempts", exchange.getProperty(Exchange.REDELIVERY_COUNTER, 0, Integer.class));
        msg.setHeader("x-first-failure-at", Instant.now().toString());
        msg.setHeader("x-replayed", "false");

        commitKafkaOffset(exchange);
    }
}
