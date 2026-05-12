package gov.gdf.camel.routes;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.concurrent.TimeUnit;
import java.util.stream.Stream;

import org.apache.camel.Exchange;
import org.apache.camel.builder.RouteBuilder;
import org.jboss.logging.Logger;

import gov.gdf.camel.bean.AuditInterceptor;
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
            .process(exchange -> {
                exchange.setProperty("currentStage", 4);
                RequestEvent event = exchange.getProperty("requestEvent", RequestEvent.class);
                String requestId = event._id;

                String valuesPath = helmValuesBuilder.build(event);
                String chartRef = helmValuesBuilder.getChartRef(event);
                String releaseName = helmValuesBuilder.getReleaseName(event);
                String outputDir = "/tmp/" + requestId + "-out";

                try {
                    runHelmTemplate(releaseName, chartRef, valuesPath, outputDir);
                } finally {
                    Files.deleteIfExists(Path.of(valuesPath));
                }

                List<Path> renderedFiles = collectRenderedFiles(outputDir);
                LOG.infof("Helm rendered %d files for requestId=%s chart=%s",
                        renderedFiles.size(), requestId, chartRef);

                exchange.setProperty("releaseName", releaseName);
                exchange.setProperty("chartRef", chartRef);
                exchange.setProperty("renderedFiles", renderedFiles);
                exchange.setProperty("outputDir", outputDir);
            })
            .process(exchange -> {
                RequestEvent event = exchange.getProperty("requestEvent", RequestEvent.class);
                auditInterceptor.emit(ROUTE_ID, event._id, 4, "render",
                        Map.of("chart", exchange.getProperty("chartRef", String.class),
                               "release", exchange.getProperty("releaseName", String.class)));
            })
            .to("direct:git-push")
            .process(exchange -> {
                String outputDir = exchange.getProperty("outputDir", String.class);
                if (outputDir != null) {
                    Path dir = Path.of(outputDir);
                    if (Files.exists(dir)) {
                        try (Stream<Path> walk = Files.walk(dir)) {
                            walk.sorted(Comparator.reverseOrder()).forEach(p -> {
                                try { Files.delete(p); } catch (IOException ignored) {}
                            });
                        }
                    }
                }
            });
    }

    private void runHelmTemplate(String releaseName, String chartRef,
                                 String valuesPath, String outputDir) throws IOException, InterruptedException {
        ProcessBuilder pb = new ProcessBuilder(
                "helm", "template", releaseName,
                "/opt/charts/" + chartRef,
                "--values", valuesPath,
                "--output-dir", outputDir,
                "--include-crds");
        pb.redirectErrorStream(true);

        Process process = pb.start();
        boolean finished = process.waitFor(30, TimeUnit.SECONDS);
        if (!finished) {
            process.destroyForcibly();
            throw new RuntimeException("helm template timed out after 30 seconds");
        }

        String output = new String(process.getInputStream().readAllBytes());
        int exitCode = process.exitValue();

        if (exitCode != 0) {
            throw new RuntimeException(
                    "helm template failed (exit " + exitCode + "): " + output);
        }
        LOG.debugf("helm template output: %s", output);
    }

    @SuppressWarnings("unchecked")
    private List<Path> collectRenderedFiles(String outputDir) throws IOException {
        try (Stream<Path> walk = Files.walk(Path.of(outputDir))) {
            return walk.filter(Files::isRegularFile)
                       .filter(p -> {
                           String name = p.toString();
                           return name.endsWith(".yaml") || name.endsWith(".yml");
                       })
                       .toList();
        }
    }
}
