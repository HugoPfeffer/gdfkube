package gov.gdf.camel.git;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;

class MockGitProviderTest {

    private MockGitProvider provider;

    @BeforeEach
    void setUp() {
        provider = new MockGitProvider();
        provider.reset();
    }

    @Test
    void createRepo_thenRepoExists() {
        assertFalse(provider.repoExists("gdfkube", "my-repo"),
                "Repo must not exist before creation");

        provider.createRepo("gdfkube", "my-repo",
                new RepoOptions("main", true, "Test repo"));

        assertTrue(provider.repoExists("gdfkube", "my-repo"),
                "Repo must exist after creation");
    }

    @Test
    void createRepo_idempotent() {
        var opts = new RepoOptions("main", true, "Test repo");
        provider.createRepo("gdfkube", "my-repo", opts);
        provider.createRepo("gdfkube", "my-repo", opts);

        assertTrue(provider.repoExists("gdfkube", "my-repo"),
                "Repo must still exist after duplicate creation");
    }

    @Test
    void cloneOrPull_returnsTempDirectory() {
        provider.createRepo("gdfkube", "clone-test",
                new RepoOptions("main", true, "clone test"));

        Path dir = provider.cloneOrPull("gdfkube", "clone-test", "main");

        assertNotNull(dir, "cloneOrPull must return a path");
        assertTrue(Files.isDirectory(dir),
                "Returned path must be an existing directory");
        assertTrue(dir.toString().contains("gdfkube"),
                "Path should contain the owner name");
        assertTrue(dir.toString().contains("clone-test"),
                "Path should contain the repo name");
    }

    @Test
    void commitAndPush_recordsCommits() throws Exception {
        provider.createRepo("gdfkube", "commit-test",
                new RepoOptions("main", true, "commit test"));

        Path workTree = provider.cloneOrPull("gdfkube", "commit-test", "main");

        Path tempFile = workTree.resolve("test-manifest.yaml");
        Files.writeString(tempFile, "apiVersion: v1\nkind: Namespace\n");

        provider.commitAndPush(workTree, List.of(tempFile),
                "add namespace manifest", GitAuthor.CAMEL);

        var commits = provider.getCommits("gdfkube", "commit-test");
        assertEquals(1, commits.size(), "Should have exactly one commit");
        assertEquals("add namespace manifest", commits.get(0).getMessage());
        assertFalse(commits.get(0).getFiles().isEmpty(),
                "Commit should reference at least one file");
        assertEquals(GitAuthor.CAMEL.getName(), commits.get(0).getAuthor().getName());
    }

    @Test
    void commitAndPush_multipleCommitsAccumulate() throws Exception {
        provider.createRepo("gdfkube", "multi-test",
                new RepoOptions("main", true, "multi test"));

        Path workTree = provider.cloneOrPull("gdfkube", "multi-test", "main");

        Path file1 = workTree.resolve("manifest-1.yaml");
        Path file2 = workTree.resolve("manifest-2.yaml");
        Files.writeString(file1, "first: true");
        Files.writeString(file2, "second: true");

        provider.commitAndPush(workTree, List.of(file1), "first commit", GitAuthor.CAMEL);
        provider.commitAndPush(workTree, List.of(file2), "second commit", GitAuthor.CAMEL);

        var commits = provider.getCommits("gdfkube", "multi-test");
        assertEquals(2, commits.size(), "Should have two commits");
        assertEquals("first commit", commits.get(0).getMessage());
        assertEquals("second commit", commits.get(1).getMessage());
    }

    @Test
    void reset_clearsAllState() {
        provider.createRepo("gdfkube", "reset-test",
                new RepoOptions("main", true, "reset test"));
        assertTrue(provider.repoExists("gdfkube", "reset-test"));

        provider.reset();

        assertFalse(provider.repoExists("gdfkube", "reset-test"),
                "All repos must be gone after reset");
        assertTrue(provider.getCommits("gdfkube", "reset-test").isEmpty(),
                "All commits must be gone after reset");
    }

    @Test
    void getCommits_unknownRepo_returnsEmptyList() {
        var commits = provider.getCommits("gdfkube", "no-such-repo");
        assertNotNull(commits, "Must not return null for unknown repo");
        assertTrue(commits.isEmpty(), "Must return empty list for unknown repo");
    }
}
