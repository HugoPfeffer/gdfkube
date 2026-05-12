package gov.gdf.camel.model;

import java.util.Map;

public class AuditEvent {

    public String requestId;
    public int stage;
    public String actor;
    public String verb;
    public Map<String, Object> detail;
    public String at;

    public AuditEvent() {}

    public AuditEvent(String requestId, int stage, String actor, String verb,
                      Map<String, Object> detail) {
        this.requestId = requestId;
        this.stage = stage;
        this.actor = actor;
        this.verb = verb;
        this.detail = detail;
        this.at = java.time.Instant.now().toString();
    }
}
