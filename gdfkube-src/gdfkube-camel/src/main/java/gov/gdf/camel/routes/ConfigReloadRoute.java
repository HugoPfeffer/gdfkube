package gov.gdf.camel.routes;

import org.apache.camel.Exchange;
import org.apache.camel.builder.RouteBuilder;
import org.apache.camel.component.kafka.KafkaConstants;
import org.apache.camel.component.kafka.KafkaManualCommit;
import org.jboss.logging.Logger;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

import gov.gdf.camel.bean.FormDefCache;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;

@ApplicationScoped
public class ConfigReloadRoute extends RouteBuilder {

    private static final Logger LOG = Logger.getLogger(ConfigReloadRoute.class);
    private static final String ROUTE_ID = "config-reload";
    private static final ObjectMapper MAPPER = new ObjectMapper();

    @Inject
    FormDefCache formDefCache;

    @Override
    public void configure() {
        errorHandler(deadLetterChannel("kafka:dlq.gdfkube." + ROUTE_ID)
                .maximumRedeliveries(3)
                .redeliveryDelay(1000)
                .backOffMultiplier(5.0)
                .useExponentialBackOff()
                .logRetryAttempted(true)
                .onPrepareFailure(DlqHeaders::stamp));

        from("kafka:dbz.gdfkube.forms"
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

                if ("d".equals(op)) {
                    LOG.debugf("Skipping delete event for forms topic");
                    exchange.setProperty("skip", true);
                    return;
                }

                String body = exchange.getIn().getBody(String.class);
                JsonNode node = MAPPER.readTree(body);
                String formId = node.path("_id").asText(null);

                if (formId != null) {
                    formDefCache.refresh(formId);
                    LOG.infof("Refreshed form definition: formId=%s (op=%s)", formId, op);
                } else {
                    LOG.warnf("Received forms CDC event without _id field, op=%s", op);
                }
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
