package gov.gdf.camel.bean;

import java.io.FileWriter;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.Map;

import org.bson.Document;
import org.eclipse.microprofile.config.inject.ConfigProperty;
import org.yaml.snakeyaml.Yaml;

import gov.gdf.camel.model.RequestEvent;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;

@ApplicationScoped
public class HelmValuesBuilder {

    @Inject
    FormDefCache formDefCache;

    @ConfigProperty(name = "app.system.base-domain")
    String baseDomain;

    @ConfigProperty(name = "app.system.release-image")
    String releaseImage;

    @ConfigProperty(name = "app.system.gitea-external-url")
    String giteaExternalUrl;

    @ConfigProperty(name = "app.system.gitea-owner")
    String giteaOwner;

    public String build(RequestEvent event) throws IOException {
        Document formDef = formDefCache.lookup(event.formId);
        String org = event.requesterGroupName;
        String requestId = event._id;

        Map<String, Object> values = new LinkedHashMap<>();
        values.put("meta", buildMeta(event, org, requestId));
        // vars passthrough carries CIDR overrides (clusterNetworkCidr, serviceNetworkCidr)
        values.put("vars", event.vars != null ? event.vars : Map.of());
        values.put("system", buildSystem(event, org, requestId));

        String path = "/tmp/" + requestId + "-values.yaml";
        try (FileWriter writer = new FileWriter(path)) {
            new Yaml().dump(values, writer);
        }
        return path;
    }

    public String getChartRef(RequestEvent event) {
        return event.formId;
    }

    public String getChartRef(String chartName) {
        return "infra/" + chartName;
    }

    public String getReleaseName(RequestEvent event) {
        return resolveResourceName(event, event.requesterGroupName);
    }

    public String getReleaseName(String groupId) {
        return groupId + "-bootstrap";
    }

    public String getRepoName(String groupId) {
        return "gdfkube-" + groupId;
    }

    public String buildForOrg(String groupId) throws IOException {
        Map<String, Object> meta = new LinkedHashMap<>();
        meta.put("requestId", "bootstrap-" + groupId);
        meta.put("formId", "org-bootstrap");
        meta.put("org", groupId);
        meta.put("email", null);
        meta.put("submittedAt", Instant.now().toString());
        meta.put("correlationId", "bootstrap-" + groupId);

        Map<String, Object> naming = new LinkedHashMap<>();
        naming.put("appProject", groupId);
        naming.put("clusterSet", groupId);
        naming.put("hostedClusterName", groupId);
        naming.put("namespace", "clusters");
        naming.put("policyNamespace", "gdfkube-policies");

        Map<String, Object> system = new LinkedHashMap<>();
        system.put("giteaExternalUrl", giteaExternalUrl);
        system.put("giteaOwner", giteaOwner);
        system.put("naming", naming);
        system.put("labels", buildLabels(groupId, "bootstrap-" + groupId));

        Map<String, Object> values = new LinkedHashMap<>();
        values.put("meta", meta);
        values.put("vars", Map.of());
        values.put("system", system);

        Path valuesPath = Files.createTempFile("bootstrap-" + groupId + "-", ".yaml");
        try (FileWriter writer = new FileWriter(valuesPath.toFile())) {
            new Yaml().dump(values, writer);
        }
        return valuesPath.toString();
    }

    private Map<String, Object> buildMeta(RequestEvent event, String org,
                                           String requestId) {
        Map<String, Object> meta = new LinkedHashMap<>();
        meta.put("requestId", requestId);
        meta.put("formId", event.formId);
        meta.put("org", org);
        meta.put("email", extractEmail(event));
        meta.put("submittedAt", event.submittedAt);
        meta.put("correlationId", extractCorrelationId(event, requestId));
        return meta;
    }

    private Map<String, Object> buildSystem(RequestEvent event, String org,
                                             String requestId) {
        Map<String, Object> system = new LinkedHashMap<>();
        system.put("baseDomain", baseDomain);
        system.put("releaseImage", releaseImage);
        system.put("giteaExternalUrl", giteaExternalUrl);
        system.put("giteaOwner", giteaOwner);
        system.put("naming", buildNaming(event, org));
        String clusterName = event.vars != null
                ? (String) event.vars.get("clusterName") : null;
        String environment = event.vars != null
                ? (String) event.vars.get("environment") : null;
        system.put("labels", buildLabels(org, requestId, event.formId,
                clusterName, environment));
        return system;
    }

    private Map<String, Object> buildNaming(RequestEvent event, String org) {
        Map<String, Object> naming = new LinkedHashMap<>();
        String resourceName = resolveResourceName(event, org);
        naming.put("hostedClusterName", resourceName);
        naming.put("namespace", "namespace-request".equals(event.formId) ? resourceName : "clusters");
        naming.put("appProject", org);
        naming.put("clusterSet", org);
        naming.put("policyNamespace", "gdfkube-policies");
        return naming;
    }

    private String resolveResourceName(RequestEvent event, String org) {
        if ("namespace-request".equals(event.formId)) {
            String nsName = event.vars != null
                    ? String.valueOf(event.vars.getOrDefault("namespaceName", "default"))
                    : "default";
            return "ns-" + org + "-" + nsName;
        }
        String clusterName = (event.vars != null
                ? String.valueOf(event.vars.getOrDefault("clusterName", "default"))
                : "default").trim();
        return applyPrefixOnce("hc-" + org + "-", clusterName);
    }

    /**
     * Prepend {@code prefix} unless {@code name} already starts with it. Guards against the
     * hc-&lt;org&gt;-hc-&lt;org&gt;-&lt;name&gt; double-prefix that occurs when a submitted
     * clusterName already carries the org-qualified prefix (form validation permits it). The
     * result always retains the hc-&lt;org&gt;- prefix, so it stays within the org AppProject's
     * hc-&lt;org&gt;-* destination whitelist. Collapses a single layer only; not a recursive
     * normalizer.
     */
    private static String applyPrefixOnce(String prefix, String name) {
        return name.startsWith(prefix) ? name : prefix + name;
    }

    Map<String, String> buildLabels(String org, String requestId) {
        Map<String, String> labels = new LinkedHashMap<>();
        labels.put("cluster.open-cluster-management.io/clusterset", org);
        labels.put("setic.gov.br/managed", "true");
        labels.put("setic.gov.br/customer", org);
        labels.put("gdfkube.io/managed", "true");
        labels.put("gdfkube.io/organization", org);
        labels.put("gdfkube.io/request-id", requestId);
        return labels;
    }

    Map<String, String> buildLabels(String org, String requestId, String formType,
                                    String clusterName, String environment) {
        Map<String, String> labels = buildLabels(org, requestId);
        if (clusterName != null) {
            labels.put("setic.gov.br/cluster", clusterName);
            labels.put("gdfkube.io/cluster", clusterName);
        }
        if (formType != null) {
            labels.put("gdfkube.io/form-type", formType);
        }
        if (environment != null) {
            labels.put("gdfkube.io/env", environment);
        }
        return labels;
    }

    private String extractEmail(RequestEvent event) {
        if (event.requester != null && event.requester.containsKey("email")) {
            return String.valueOf(event.requester.get("email"));
        }
        return null;
    }

    private String extractCorrelationId(RequestEvent event, String fallback) {
        if (event.meta != null && event.meta.containsKey("correlationId")) {
            return String.valueOf(event.meta.get("correlationId"));
        }
        return fallback;
    }
}
