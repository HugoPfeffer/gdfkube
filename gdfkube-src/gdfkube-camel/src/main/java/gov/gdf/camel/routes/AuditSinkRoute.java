package gov.gdf.camel.routes;

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
public class AuditSinkRoute extends RouteBuilder {

    private static final Logger LOG = Logger.getLogger(AuditSinkRoute.class);
    private static final String ROUTE_ID = "audit-sink";

    @Inject
    MongoClient mongoClient;

    @Override
    public void configure() {
        errorHandler(deadLetterChannel("kafka:dlq.gdfkube." + ROUTE_ID)
                .maximumRedeliveries(3)
                .redeliveryDelay(1000)
                .backOffMultiplier(5.0)
                .useExponentialBackOff()
                .logRetryAttempted(true)
                .onPrepareFailure(DlqHeaders::stamp));

        from("kafka:gdfkube.audit"
                + "?groupId=gdfkube-camel"
                + "&autoOffsetReset=earliest"
                + "&autoCommitEnable=false"
                + "&allowManualCommit=true")
            .routeId(ROUTE_ID)
            .process(exchange -> {
                String body = exchange.getIn().getBody(String.class);
                Document doc = Document.parse(body);

                mongoClient.getDatabase("gdfkube")
                        .getCollection("audit_log")
                        .insertOne(doc);

                LOG.debugf("Inserted audit_log document: requestId=%s",
                        doc.getString("requestId"));
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
