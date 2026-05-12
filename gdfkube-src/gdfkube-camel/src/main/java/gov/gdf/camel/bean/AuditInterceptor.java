package gov.gdf.camel.bean;

import java.util.Map;

import org.apache.camel.ProducerTemplate;
import org.jboss.logging.Logger;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;

import gov.gdf.camel.model.AuditEvent;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;

@ApplicationScoped
public class AuditInterceptor {

    private static final Logger LOG = Logger.getLogger(AuditInterceptor.class);
    private static final ObjectMapper MAPPER = new ObjectMapper();

    @Inject
    ProducerTemplate producerTemplate;

    public void emit(String routeName, String requestId, int stage, String verb,
                     Map<String, Object> detail) {
        String actor = "gdfkube-camel/" + routeName;
        AuditEvent event = new AuditEvent(requestId, stage, actor, verb, detail);

        try {
            String json = MAPPER.writeValueAsString(event);
            producerTemplate.sendBodyAndHeader(
                    "kafka:gdfkube.audit", json, "kafka.KEY", requestId);
        } catch (JsonProcessingException e) {
            LOG.errorf(e, "Failed to serialize AuditEvent for requestId=%s", requestId);
        }
    }
}
