package gov.gdf.camel.bean;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.TimeUnit;
import java.util.stream.Stream;

import org.jboss.logging.Logger;

import jakarta.enterprise.context.ApplicationScoped;

@ApplicationScoped
public class HelmTemplateRunner {

    private static final Logger LOG = Logger.getLogger(HelmTemplateRunner.class);

    /**
     * Shells out to {@code helm template} and returns the list of rendered file paths.
     *
     * @param chartRef     chart name relative to /opt/charts/ (e.g. "infra/argocd-org")
     * @param releaseName  Helm release name
     * @param valuesPath   path to the values YAML file
     * @param outputDir    directory where rendered manifests are written
     * @return list of rendered YAML file paths
     */
    public List<Path> render(String chartRef, String releaseName,
                             String valuesPath, String outputDir) throws IOException, InterruptedException {
        ProcessBuilder pb = new ProcessBuilder(
                "helm", "template", releaseName,
                "/opt/charts/" + chartRef,
                "--values", valuesPath,
                "--output-dir", outputDir,
                "--include-crds");
        pb.redirectErrorStream(true);

        Process process = pb.start();
        try {
            CompletableFuture<byte[]> stdout = CompletableFuture.supplyAsync(() -> {
                try { return process.getInputStream().readAllBytes(); }
                catch (IOException e) { return new byte[0]; }
            });

            boolean finished = process.waitFor(30, TimeUnit.SECONDS);
            if (!finished) {
                process.destroyForcibly();
                process.waitFor(5, TimeUnit.SECONDS);
                throw new RuntimeException("helm template timed out after 30 seconds");
            }

            String output = new String(stdout.join(), StandardCharsets.UTF_8);
            int exitCode = process.exitValue();

            if (exitCode != 0) {
                throw new RuntimeException(
                        "helm template failed (exit " + exitCode + "): " + output);
            }
            LOG.debugf("helm template output: %s", output);
        } finally {
            process.destroyForcibly();
        }

        return collectRenderedFiles(outputDir);
    }

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
