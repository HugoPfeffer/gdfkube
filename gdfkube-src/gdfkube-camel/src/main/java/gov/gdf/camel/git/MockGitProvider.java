package gov.gdf.camel.git;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.concurrent.ConcurrentHashMap;

import org.jboss.logging.Logger;

import jakarta.enterprise.context.ApplicationScoped;

@ApplicationScoped
@io.quarkus.arc.properties.IfBuildProperty(name = "app.git.provider", stringValue = "mock", enableIfMissing = false)
public class MockGitProvider implements GitProvider {

    private static final Logger LOG = Logger.getLogger(MockGitProvider.class);
    private static final Path MOCK_ROOT = Path.of("/tmp/mock-git");

    private final ConcurrentHashMap<String, List<MockCommit>> repos = new ConcurrentHashMap<>();

    public static class MockCommit {
        private final String message;
        private final List<String> files;
        private final GitAuthor author;
        private final Instant timestamp;

        public MockCommit(String message, List<String> files, GitAuthor author) {
            this.message = message;
            this.files = List.copyOf(files);
            this.author = author;
            this.timestamp = Instant.now();
        }

        public String getMessage() { return message; }
        public List<String> getFiles() { return files; }
        public GitAuthor getAuthor() { return author; }
        public Instant getTimestamp() { return timestamp; }
    }

    @Override
    public boolean repoExists(String owner, String name) {
        return repos.containsKey(key(owner, name));
    }

    @Override
    public void createRepo(String owner, String name, RepoOptions opts) {
        repos.putIfAbsent(key(owner, name), Collections.synchronizedList(new ArrayList<>()));
        LOG.infof("Mock repo created: %s/%s (branch=%s, autoInit=%s)",
                owner, name, opts.getDefaultBranch(), opts.isAutoInit());
    }

    @Override
    public Path cloneOrPull(String owner, String name, String branch) {
        Path dir = MOCK_ROOT.resolve(owner).resolve(name);
        try {
            Files.createDirectories(dir);
        } catch (IOException e) {
            throw new UncheckedIOException("Failed to create mock working tree: " + dir, e);
        }
        LOG.infof("Mock clone/pull: %s/%s branch=%s -> %s", owner, name, branch, dir);
        return dir;
    }

    @Override
    public void commitAndPush(Path workingTree, List<Path> files, String message, GitAuthor author) {
        String owner = MOCK_ROOT.relativize(workingTree).getName(0).toString();
        String name = MOCK_ROOT.relativize(workingTree).getName(1).toString();
        String k = key(owner, name);

        repos.putIfAbsent(k, Collections.synchronizedList(new ArrayList<>()));

        List<String> relativePaths = new ArrayList<>();
        for (Path file : files) {
            Path dest = workingTree.resolve(file.getFileName());
            try {
                Files.copy(file, dest, StandardCopyOption.REPLACE_EXISTING);
            } catch (IOException e) {
                throw new UncheckedIOException("Failed to copy file to mock working tree: " + file, e);
            }
            relativePaths.add(file.getFileName().toString());
        }

        repos.get(k).add(new MockCommit(message, relativePaths, author));
        LOG.infof("Mock commit in %s: \"%s\" (%d files)", k, message, files.size());
    }

    public List<MockCommit> getCommits(String owner, String name) {
        List<MockCommit> commits = repos.get(key(owner, name));
        return commits != null ? Collections.unmodifiableList(commits) : List.of();
    }

    public void reset() {
        repos.clear();
        try {
            if (Files.exists(MOCK_ROOT)) {
                try (var walk = Files.walk(MOCK_ROOT)) {
                    walk.sorted(java.util.Comparator.reverseOrder())
                        .forEach(p -> { try { Files.deleteIfExists(p); } catch (IOException ignored) {} });
                }
            }
        } catch (IOException ignored) {
        }
        LOG.info("MockGitProvider state cleared");
    }

    private static String key(String owner, String name) {
        return owner + "/" + name;
    }
}
