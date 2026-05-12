package gov.gdf.camel.git;

import java.nio.file.Path;
import java.util.List;

public interface GitProvider {
    boolean repoExists(String owner, String name);
    void createRepo(String owner, String name, RepoOptions opts);
    Path cloneOrPull(String owner, String name, String branch);
    void commitAndPush(Path workingTree, List<Path> files, String message, GitAuthor author);
}
