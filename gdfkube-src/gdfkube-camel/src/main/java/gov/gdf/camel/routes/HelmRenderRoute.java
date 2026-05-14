package gov.gdf.camel.routes;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.stream.Stream;

import org.apache.camel.builder.RouteBuilder;
import org.jboss.logging.Logger;

import gov.gdf.camel.bean.AuditInterceptor;
import gov.gdf.camel.bean.HelmTemplateRunner;
import gov.gdf.camel.bean.HelmValuesBuilder;
import gov.gdf.camel.model.RequestEvent;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;

@ApplicationScoped
public class HelmRenderRoute extends RouteBuilder {

    private static final Logger LOG = Logger.getLogger(HelmRenderRoute.class);
    private static final String ROUTE_ID = "helm-render";

    @Inject
    HelmValuesBuilder helmValuesBuilder;

    @Inject
    HelmTemplateRunner helmTemplateRunner;

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
            .onCompletion()
                .process(exchange -> {
                    String outputDir = exchange.getProperty("outputDir", String.class);
                    if (outputDir != null) {
                        Path dir = Path.of(outputDir);
                        if (Files.exists(dir)) {
                            try (Stream<Path> walk = Files.walk(dir)) {
                                walk.sorted(Comparator.reverseOrder()).forEach(p -> {
                                    try { Files.delete(p); } catch (IOException e) {
                                        LOG.warnf("Failed to clean up %s: %s", p, e.getMessage());
                                    }
                                });
                            }
                        }
                    }
                })
            .end()
            .process(exchange -> {
                exchange.setProperty("currentStage", 4);
                RequestEvent event = exchange.getProperty("requestEvent", RequestEvent.class);
                String requestId = event._id;

                String valuesPath = helmValuesBuilder.build(event);
                String chartRef = helmValuesBuilder.getChartRef(event);
                String releaseName = helmValuesBuilder.getReleaseName(event);
                String outputDir = "/tmp/" + requestId + "-out";

                try {
                    List<Path> renderedFiles = helmTemplateRunner.render(
                            chartRef, releaseName, valuesPath, outputDir);
                    LOG.infof("Helm rendered %d files for requestId=%s chart=%s",
                            renderedFiles.size(), requestId, chartRef);
                    exchange.setProperty("renderedFiles", renderedFiles);
                } finally {
                    Files.deleteIfExists(Path.of(valuesPath));
                }

                exchange.setProperty("releaseName", releaseName);
                exchange.setProperty("chartRef", chartRef);
                exchange.setProperty("outputDir", outputDir);
            })
            .process(exchange -> {
                RequestEvent event = exchange.getProperty("requestEvent", RequestEvent.class);
                auditInterceptor.emit(ROUTE_ID, event._id, 4, "render",
                        Map.of("chart", exchange.getProperty("chartRef", String.class),
                               "release", exchange.getProperty("releaseName", String.class)));
            })
            .to("direct:git-push");
    }

}
