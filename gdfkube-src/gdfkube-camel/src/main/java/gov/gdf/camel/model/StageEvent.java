package gov.gdf.camel.model;

public class StageEvent {

    public static final String[] STAGE_NAMES = {
        "form", "mongo", "debezium", "kafka", "camel", "git", "argocd"
    };

    public String requestId;
    public int stage;
    public String stageName;
    public String status;
    public String at;
    public String detail;

    public StageEvent() {}

    public StageEvent(String requestId, int stage, String status, String detail) {
        this.requestId = requestId;
        this.stage = stage;
        this.stageName = (stage >= 0 && stage < STAGE_NAMES.length)
                ? STAGE_NAMES[stage] : "unknown";
        this.status = status;
        this.at = java.time.Instant.now().toString();
        this.detail = detail;
    }
}
