package gov.gdf.camel.routes;

import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.locks.ReentrantLock;

import org.apache.camel.builder.RouteBuilder;
import org.jboss.logging.Logger;

import gov.gdf.camel.bean.AuditInterceptor;
import gov.gdf.camel.git.GitAuthor;
import gov.gdf.camel.git.GitProvider;
import gov.gdf.camel.model.RequestEvent;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;

@ApplicationScoped
public class GitPushRoute extends RouteBuilder {

    private static final Logger LOG = Logger.getLogger(GitPushRoute.class);
    private static final String ROUTE_ID = "git-push";
    private static final String GITEA_OWNER = "gdfkube";
    private static final ConcurrentHashMap<String, ReentrantLock> REPO_LOCKS = new ConcurrentHashMap<>();

    @Inject
    GitProvider gitProvider;

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
            .process(exchange -> exchange.setProperty("currentStage", 5))
            .to("direct:repo-bootstrap")
            .process(exchange -> {
                RequestEvent event = exchange.getProperty("requestEvent", RequestEvent.class);
                String requestId = event._id;
                String org = event.requesterGroupName;
                String releaseName = exchange.getProperty("releaseName", String.class);
                String formId = event.formId;

                @SuppressWarnings("unchecked")
                List<Path> renderedFiles = exchange.getProperty("renderedFiles", List.class);

                String repoName = GITEA_OWNER + "-" + org;
                ReentrantLock lock = REPO_LOCKS.computeIfAbsent(repoName, k -> new ReentrantLock());
                lock.lock();
                try {
                    Path workTree = gitProvider.cloneOrPull(GITEA_OWNER, repoName, "main");

                    Path targetDir = workTree.resolve("clusters").resolve(releaseName);
                    Files.createDirectories(targetDir);

                    List<Path> copiedFiles = new ArrayList<>();
                    for (Path source : renderedFiles) {
                        Path target = targetDir.resolve(source.getFileName());
                        Files.copy(source, target, StandardCopyOption.REPLACE_EXISTING);
                        copiedFiles.add(target);
                    }

                    String message = String.format("[gdfkube] REQ%s: provision %s (%s)",
                            requestId, releaseName, formId);
                    gitProvider.commitAndPush(workTree, copiedFiles, message, GitAuthor.CAMEL);

                    LOG.infof("Pushed %d files to %s/%s for requestId=%s",
                            copiedFiles.size(), GITEA_OWNER, repoName, requestId);
                } finally {
                    lock.unlock();
                }
            })
            .process(exchange -> {
                RequestEvent event = exchange.getProperty("requestEvent", RequestEvent.class);
                auditInterceptor.emit(ROUTE_ID, event._id, 5, "push",
                        Map.of("repo", GITEA_OWNER + "-" + event.requesterGroupName,
                               "release", exchange.getProperty("releaseName", String.class)));
            })
            .to("direct:status-emitter");
    }
}
