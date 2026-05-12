package gov.gdf.camel.routes;

import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.Map;

import org.apache.camel.Exchange;
import org.apache.camel.builder.RouteBuilder;
import org.apache.camel.component.kafka.KafkaConstants;
import org.apache.camel.component.kafka.consumer.KafkaManualCommit;
import org.bson.Document;
import org.jboss.logging.Logger;

import com.mongodb.client.MongoClient;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;

@ApplicationScoped
public class DlqHandlerRoute extends RouteBuilder {

    private static final Logger LOG = Logger.getLogger(DlqHandlerRoute.class);
    private static final String ROUTE_ID = "dlq-handler";

    private static final String DLQ_TOPICS = "dlq.gdfkube.request-router"
            + ",dlq.gdfkube.helm-render"
            + ",dlq.gdfkube.git-push"
            + ",dlq.gdfkube.repo-bootstrap"
            + ",dlq.gdfkube.status-emitter"
            + ",dlq.gdfkube.audit-sink"
            + ",dlq.gdfkube.config-reload";

    @Inject
    MongoClient mongoClient;

    @Override
    public void configure() {
        // No DLQ error handler here to avoid infinite loops;
        // log and drop on failure.
        errorHandler(defaultErrorHandler()
                .maximumRedeliveries(1)
                .logExhausted(true));

        from("kafka:" + DLQ_TOPICS
                + "?groupId=gdfkube-camel-dlq"
                + "&autoOffsetReset=earliest"
                + "&autoCommitEnable=false"
                + "&allowManualCommit=true")
            .routeId(ROUTE_ID)
            .process(exchange -> {
                var msg = exchange.getIn();
                String body = msg.getBody(String.class);

                String originalTopic = msg.getHeader("x-original-topic", String.class);
                String originalKey = msg.getHeader("x-original-key", String.class);
                String errorClass = msg.getHeader("x-error-class", String.class);
                String errorMsg = msg.getHeader("x-error-msg", String.class);

                Map<String, Object> headers = new LinkedHashMap<>();
                headers.put("x-original-topic", originalTopic);
                headers.put("x-original-partition", msg.getHeader("x-original-partition"));
                headers.put("x-original-offset", msg.getHeader("x-original-offset"));
                headers.put("x-original-key", originalKey);
                headers.put("x-error-class", errorClass);
                headers.put("x-error-msg", errorMsg);
                headers.put("x-stage", msg.getHeader("x-stage"));
                headers.put("x-attempts", msg.getHeader("x-attempts"));
                headers.put("x-first-failure-at", msg.getHeader("x-first-failure-at"));
                headers.put("x-replayed", msg.getHeader("x-replayed", "false", String.class));

                String dlqTopic = msg.getHeader(KafkaConstants.TOPIC, String.class);

                Document dlqDoc = new Document()
                        .append("topic", dlqTopic)
                        .append("requestId", originalKey)
                        .append("headers", new Document(headers))
                        .append("payload", body)
                        .append("firstSeenAt", Instant.now().toString())
                        .append("replayCount", 0);

                mongoClient.getDatabase("gdfkube")
                        .getCollection("dlq_log")
                        .insertOne(dlqDoc);

                LOG.infof("Persisted DLQ message: topic=%s requestId=%s error=%s",
                        dlqTopic, originalKey, errorClass);
            })
            .process(this::commitKafkaOffset);
    }

    private void commitKafkaOffset(Exchange exchange) {
        KafkaManualCommit commit = exchange.getIn().getHeader(
                KafkaConstants.MANUAL_COMMIT, KafkaManualCommit.class);
        if (commit != null) {
            commit.commit();
        }
    }
}
