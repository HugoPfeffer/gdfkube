package gov.gdf.camel.git;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;

import org.eclipse.jgit.api.Git;
import org.eclipse.jgit.api.errors.GitAPIException;
import org.eclipse.jgit.transport.CredentialsProvider;
import org.eclipse.jgit.transport.UsernamePasswordCredentialsProvider;
import org.eclipse.microprofile.config.inject.ConfigProperty;
import org.jboss.logging.Logger;

import jakarta.enterprise.context.ApplicationScoped;

@ApplicationScoped
@io.quarkus.arc.properties.IfBuildProperty(name = "app.git.provider", stringValue = "gitea", enableIfMissing = false)
public class GiteaGitProvider implements GitProvider {

    private static final Logger LOG = Logger.getLogger(GiteaGitProvider.class);
    private static final Path CLONE_ROOT = Path.of("/tmp/gitea-repos");

    @ConfigProperty(name = "app.system.gitea-external-url")
    String giteaUrl;

    @ConfigProperty(name = "gitea.token", defaultValue = "")
    String giteaToken;

    private final HttpClient httpClient = HttpClient.newHttpClient();

    @Override
    public boolean repoExists(String owner, String name) {
        try {
            HttpRequest request = HttpRequest.newBuilder()
                    .uri(URI.create(giteaUrl + "/api/v1/repos/" + owner + "/" + name))
                    .header("Authorization", "token " + giteaToken)
                    .GET()
                    .build();
            HttpResponse<Void> response = httpClient.send(request, HttpResponse.BodyHandlers.discarding());
            return response.statusCode() == 200;
        } catch (IOException e) {
            throw new UncheckedIOException("Failed to check repo existence: " + owner + "/" + name, e);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new RuntimeException("Interrupted checking repo existence", e);
        }
    }

    @Override
    public void createRepo(String owner, String name, RepoOptions opts) {
        String json = String.format(
                "{\"name\":\"%s\",\"default_branch\":\"%s\",\"auto_init\":%s,\"description\":\"%s\"}",
                name, opts.getDefaultBranch(), opts.isAutoInit(),
                opts.getDescription() != null ? opts.getDescription() : "");
        try {
            HttpRequest request = HttpRequest.newBuilder()
                    .uri(URI.create(giteaUrl + "/api/v1/orgs/" + owner + "/repos"))
                    .header("Authorization", "token " + giteaToken)
                    .header("Content-Type", "application/json")
                    .POST(HttpRequest.BodyPublishers.ofString(json))
                    .build();
            HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());
            if (response.statusCode() != 201) {
                throw new RuntimeException("Failed to create repo " + owner + "/" + name
                        + ": HTTP " + response.statusCode() + " — " + response.body());
            }
            LOG.infof("Created Gitea repo: %s/%s", owner, name);
        } catch (IOException e) {
            throw new UncheckedIOException("Failed to create repo: " + owner + "/" + name, e);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new RuntimeException("Interrupted creating repo", e);
        }
    }

    @Override
    public Path cloneOrPull(String owner, String name, String branch) {
        Path dir = CLONE_ROOT.resolve(owner).resolve(name);
        CredentialsProvider creds = new UsernamePasswordCredentialsProvider("oauth2", giteaToken);
        String repoUrl = giteaUrl + "/" + owner + "/" + name + ".git";

        try {
            if (Files.exists(dir.resolve(".git"))) {
                try (Git git = Git.open(dir.toFile())) {
                    git.pull()
                            .setRemoteBranchName(branch)
                            .setCredentialsProvider(creds)
                            .call();
                    LOG.infof("Pulled %s/%s branch=%s", owner, name, branch);
                }
            } else {
                Files.createDirectories(dir.getParent());
                Git.cloneRepository()
                        .setURI(repoUrl)
                        .setDirectory(dir.toFile())
                        .setBranch(branch)
                        .setCredentialsProvider(creds)
                        .call()
                        .close();
                LOG.infof("Cloned %s/%s branch=%s -> %s", owner, name, branch, dir);
            }
        } catch (GitAPIException e) {
            throw new RuntimeException("Git operation failed for " + owner + "/" + name, e);
        } catch (IOException e) {
            throw new UncheckedIOException("Failed to set up clone directory: " + dir, e);
        }

        return dir;
    }

    @Override
    public void commitAndPush(Path workingTree, List<Path> files, String message, GitAuthor author) {
        CredentialsProvider creds = new UsernamePasswordCredentialsProvider("oauth2", giteaToken);

        try (Git git = Git.open(workingTree.toFile())) {
            for (Path file : files) {
                Path relative = workingTree.relativize(file);
                git.add().addFilepattern(relative.toString()).call();
            }

            git.commit()
                    .setMessage(message)
                    .setAuthor(author.getName(), author.getEmail())
                    .setCommitter(author.getName(), author.getEmail())
                    .call();

            git.push()
                    .setCredentialsProvider(creds)
                    .call();

            LOG.infof("Committed and pushed to %s: \"%s\" (%d files)", workingTree, message, files.size());
        } catch (GitAPIException e) {
            throw new RuntimeException("Git commit/push failed in " + workingTree, e);
        } catch (IOException e) {
            throw new UncheckedIOException("Failed to open git repo: " + workingTree, e);
        }
    }
}
