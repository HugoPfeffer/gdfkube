package gov.gdf.camel.git;

public class GitAuthor {

    public static final GitAuthor CAMEL = new GitAuthor("gdfkube-camel", "camel@gdfkube.gov.br");

    private final String name;
    private final String email;

    public GitAuthor(String name, String email) {
        this.name = name;
        this.email = email;
    }

    public String getName() {
        return name;
    }

    public String getEmail() {
        return email;
    }
}
