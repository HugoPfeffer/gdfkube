package gov.gdf.camel.routes;

import java.util.Map;

import org.apache.camel.builder.RouteBuilder;
import org.jboss.logging.Logger;

import gov.gdf.camel.bean.AuditInterceptor;
import gov.gdf.camel.bean.GitRepoBootstrapper;
import gov.gdf.camel.bean.HelmValuesBuilder;
import gov.gdf.camel.bean.StageUpdater;
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
    GitRepoBootstrapper gitRepoBootstrapper;

    @Inject
    AuditInterceptor auditInterceptor;

    @Inject
    StageUpdater stageUpdater;

    @Inject
    HelmValuesBuilder helmValuesBuilder;

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
                String repoName = helmValuesBuilder.getRepoName(org);

                boolean created = gitRepoBootstrapper.ensure(
                        giteaOwner, repoName, "GitOps manifests for " + org);
                if (created) {
                    auditInterceptor.emit(ROUTE_ID, event._id, 5, "create-repo",
                            Map.of("repo", giteaOwner + "/" + repoName));
                }

                stageUpdater.updateStage(event._id, STAGE_REPO_BOOTSTRAPPED);
            });
    }
}
