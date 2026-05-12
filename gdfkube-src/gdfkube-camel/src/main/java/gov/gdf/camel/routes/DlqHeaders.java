package gov.gdf.camel.routes;

import java.time.Instant;

import org.apache.camel.Exchange;
import org.apache.camel.Message;
import org.apache.camel.component.kafka.KafkaConstants;
import org.apache.camel.component.kafka.consumer.KafkaManualCommit;

/**
 * Shared DLQ header stamper used by all route error handlers via
 * {@code .onPrepareFailure(DlqHeaders::stamp)}.
 */
final class DlqHeaders {

    private DlqHeaders() {}

    static void stamp(Exchange exchange) {
        Exception cause = exchange.getProperty(Exchange.EXCEPTION_CAUGHT, Exception.class);
        Message msg = exchange.getIn();

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

        KafkaManualCommit commit = msg.getHeader(
                KafkaConstants.MANUAL_COMMIT, KafkaManualCommit.class);
        if (commit != null) {
            commit.commit();
        }
    }
}
