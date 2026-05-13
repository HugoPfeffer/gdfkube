package gov.gdf.camel.routes;

import java.util.Map;

import org.apache.camel.builder.RouteBuilder;
import org.jboss.logging.Logger;

import gov.gdf.camel.bean.AuditInterceptor;
import gov.gdf.camel.bean.StageUpdater;
import gov.gdf.camel.git.GitProvider;
import gov.gdf.camel.git.RepoOptions;
import gov.gdf.camel.model.RequestEvent;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import org.eclipse.microprofile.config.inject.ConfigProperty;

@ApplicationScoped
public class RepoBootstrapRoute extends RouteBuilder {

    private static final Logger LOG = Logger.getLogger(RepoBootstrapRoute.class);
    private static final String ROUTE_ID = "repo-bootstrap";
    private static final int STAGE_REPO_BOOTSTRAPPED = 5;

    @ConfigProperty(name = "app.system.gitea-owner")
    String giteaOwner;

    @Inject
    GitProvider gitProvider;

    @Inject
    AuditInterceptor auditInterceptor;

    @Inject
    StageUpdater stageUpdater;

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
                RequestEvent event = exchange.getProperty("requestEvent", RequestEvent.class);
                String org = event.requesterGroupName;
                String repoName = giteaOwner + "-" + org;

                if (!gitProvider.repoExists(giteaOwner, repoName)) {
                    RepoOptions opts = new RepoOptions("main", true,
                            "GitOps manifests for " + org);
                    gitProvider.createRepo(giteaOwner, repoName, opts);
                    LOG.infof("Bootstrapped repo %s/%s for org=%s",
                            giteaOwner, repoName, org);

                    auditInterceptor.emit(ROUTE_ID, event._id, 5, "create-repo",
                            Map.of("repo", giteaOwner + "/" + repoName));
                }

                // Stage 5: repo-bootstrapped. Only emitted on the success path —
                // if createRepo throws, Camel's error handler routes to the DLQ
                // and this line is never reached.
                stageUpdater.updateStage(event._id, STAGE_REPO_BOOTSTRAPPED);
            });
    }
}
