package gov.gdf.camel.model;

import java.util.Map;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;

@JsonIgnoreProperties(ignoreUnknown = true)
public class RequestEvent {

    public String _id;
    public String formId;
    public String status;
    public String env;
    public Map<String, Object> vars;
    public Map<String, Object> meta;
    public Map<String, Object> requester;
    public String requesterGroupName;
    public Integer stage;
    public String submittedAt;
}
