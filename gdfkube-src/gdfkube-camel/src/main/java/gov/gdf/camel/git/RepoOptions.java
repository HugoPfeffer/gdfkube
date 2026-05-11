package gov.gdf.camel.git;

public class RepoOptions {

    private String defaultBranch = "main";
    private boolean autoInit = true;
    private String description;

    public RepoOptions() {}

    public RepoOptions(String defaultBranch, boolean autoInit, String description) {
        this.defaultBranch = defaultBranch;
        this.autoInit = autoInit;
        this.description = description;
    }

    public String getDefaultBranch() {
        return defaultBranch;
    }

    public void setDefaultBranch(String defaultBranch) {
        this.defaultBranch = defaultBranch;
    }

    public boolean isAutoInit() {
        return autoInit;
    }

    public void setAutoInit(boolean autoInit) {
        this.autoInit = autoInit;
    }

    public String getDescription() {
        return description;
    }

    public void setDescription(String description) {
        this.description = description;
    }
}
