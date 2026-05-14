package gov.gdf.camel.bean;

import org.jboss.logging.Logger;

import gov.gdf.camel.git.GitProvider;
import gov.gdf.camel.git.RepoOptions;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;

@ApplicationScoped
public class GitRepoBootstrapper {

    private static final Logger LOG = Logger.getLogger(GitRepoBootstrapper.class);

    @Inject
    GitProvider gitProvider;

    /**
     * Ensures the named repo exists in Gitea. Creates it if absent (idempotent).
     *
     * @return true if the repo was created, false if it already existed
     */
    public boolean ensure(String owner, String repoName, String description) {
        if (!gitProvider.repoExists(owner, repoName)) {
            RepoOptions opts = new RepoOptions("main", true, description);
            gitProvider.createRepo(owner, repoName, opts);
            LOG.infof("Bootstrapped repo %s/%s", owner, repoName);
            return true;
        }
        return false;
    }
}
