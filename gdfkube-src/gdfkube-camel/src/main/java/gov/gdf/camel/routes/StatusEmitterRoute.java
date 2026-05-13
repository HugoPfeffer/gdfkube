package gov.gdf.camel.routes;

import java.time.Instant;
import java.util.Map;

import org.apache.camel.Exchange;
import org.apache.camel.ProducerTemplate;
import org.apache.camel.builder.RouteBuilder;
import org.jboss.logging.Logger;

import com.fasterxml.jackson.databind.ObjectMapper;

import gov.gdf.camel.bean.AuditInterceptor;
import gov.gdf.camel.bean.StageUpdater;
import gov.gdf.camel.model.RequestEvent;
import gov.gdf.camel.model.StageEvent;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;

@ApplicationScoped
public class StatusEmitterRoute extends RouteBuilder {

    private static final Logger LOG = Logger.getLogger(StatusEmitterRoute.class);
    private static final String ROUTE_ID = "status-emitter";
    private static final ObjectMapper MAPPER = new ObjectMapper();

    @Inject
    StageUpdater stageUpdater;

    @Inject
    AuditInterceptor auditInterceptor;

    @Override
    public void configure() {
        errorHandler(deadLetterChannel("kafka:dlq.gdfkube." + ROUTE_ID)
                .maximumRedeliveries(3)
                .redeliveryDelay(1000)
                .backOffMultiplier(5.0)
                .useExponentialBackOff()
                .logRetryAttempted(true)
                .onPrepareFailure(DlqHeaders::stamp));

        from("direct:" + ROUTE_ID)
            .routeId(ROUTE_ID)
            .process(this::emitStageEvents)
            .process(exchange -> {
                RequestEvent event = exchange.getProperty("requestEvent", RequestEvent.class);
                auditInterceptor.emit(ROUTE_ID, event._id, 4, "status-emit",
                        Map.of("stages", StageEvent.STAGE_NAMES.length));
            });
    }

    private void emitStageEvents(Exchange exchange) throws Exception {
        RequestEvent event = exchange.getProperty("requestEvent", RequestEvent.class);
        String requestId = event._id;
        ProducerTemplate producer = exchange.getContext().createProducerTemplate();

        String submittedAt = event.submittedAt;
        String sourceTsMs = exchange.getIn().getHeader("__source.ts_ms", String.class);
        String dbzTimestamp = sourceTsMs != null
                ? Instant.ofEpochMilli(Long.parseLong(sourceTsMs)).toString()
                : null;
        String now = Instant.now().toString();

        int currentStage = 5; // git stage is the last completed stage

        for (int i = 0; i < StageEvent.STAGE_NAMES.length; i++) {
            String status;
            String detail;

            if (i <= currentStage) {
                status = "ok";
                detail = "processed";
            } else {
                status = "fail";
                detail = "awaiting";
            }

            StageEvent stageEvent = new StageEvent(requestId, i, status, detail);

            // Override timestamps for stages with known values
            switch (i) {
                case 0 -> { if (submittedAt != null) stageEvent.at = submittedAt; }
                case 1, 2 -> { if (dbzTimestamp != null) stageEvent.at = dbzTimestamp; }
                default -> stageEvent.at = now;
            }

            String json = MAPPER.writeValueAsString(stageEvent);
            producer.sendBodyAndHeaders("kafka:gdfkube.pipeline.status", json,
                    Map.of("kafka.KEY", requestId,
                           "x-producer", "gdfkube-camel/" + ROUTE_ID));
        }

        try {
            producer.close();
        } catch (Exception ignored) { }

        stageUpdater.updateStage(requestId, currentStage);
        LOG.infof("Emitted %d stage events and updated MongoDB stage=%d for requestId=%s",
                StageEvent.STAGE_NAMES.length, currentStage, requestId);
    }
}
