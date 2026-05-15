package gov.gdf.camel.bean;

import java.io.FileReader;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Map;
import java.util.stream.Stream;
import java.util.stream.StreamSupport;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.bson.Document;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.MethodSource;
import org.yaml.snakeyaml.Yaml;

import gov.gdf.camel.model.RequestEvent;

import static org.junit.jupiter.api.Assertions.*;

class HelmValuesBuilderTest {

    private HelmValuesBuilder builder;

    @BeforeEach
    @SuppressWarnings("unchecked")
    void setUp() throws Exception {
        var formDef = new Document("_id", "cluster-request")
                .append("name", "Cluster Request");

        var mockCache = new FormDefCache() {
            @Override
            public Document lookup(String formId) {
                return formDef;
            }
        };

        builder = new HelmValuesBuilder();

        var formDefCacheField = HelmValuesBuilder.class.getDeclaredField("formDefCache");
        formDefCacheField.setAccessible(true);
        formDefCacheField.set(builder, mockCache);

        var baseDomainField = HelmValuesBuilder.class.getDeclaredField("baseDomain");
        baseDomainField.setAccessible(true);
        baseDomainField.set(builder, "apps.gdfkube.gov");

        var releaseImageField = HelmValuesBuilder.class.getDeclaredField("releaseImage");
        releaseImageField.setAccessible(true);
        releaseImageField.set(builder, "quay.io/openshift-release-dev/ocp-release:4.16.7-x86_64");

        var giteaUrlField = HelmValuesBuilder.class.getDeclaredField("giteaExternalUrl");
        giteaUrlField.setAccessible(true);
        giteaUrlField.set(builder, "https://gitea.apps.gdfkube.gov");

        var giteaOwnerField = HelmValuesBuilder.class.getDeclaredField("giteaOwner");
        giteaOwnerField.setAccessible(true);
        giteaOwnerField.set(builder, "gdfkube");
    }

    @Test
    @SuppressWarnings("unchecked")
    void build_systemLabels_has6RequiredEntries() throws Exception {
        RequestEvent event = buildEvent();
        String path = builder.build(event);

        Map<String, Object> values = parseYaml(path);
        Map<String, Object> system = (Map<String, Object>) values.get("system");
        Map<String, String> labels = (Map<String, String>) system.get("labels");

        assertNotNull(labels, "system.labels must be present");
        assertEquals(6, labels.size(), "system.labels must have exactly 6 entries");

        assertTrue(labels.containsKey("cluster.open-cluster-management.io/clusterset"));
        assertTrue(labels.containsKey("setic.gov.br/managed"));
        assertTrue(labels.containsKey("setic.gov.br/customer"));
        assertTrue(labels.containsKey("gdfkube.io/managed"));
        assertTrue(labels.containsKey("gdfkube.io/organization"));
        assertTrue(labels.containsKey("gdfkube.io/request-id"));

        assertEquals("sec-educ", labels.get("gdfkube.io/organization"));
        assertEquals("REQ0010252C", labels.get("gdfkube.io/request-id"));

        Files.deleteIfExists(Path.of(path));
    }

    @Test
    @SuppressWarnings("unchecked")
    void build_systemNaming_correctlyComposed() throws Exception {
        RequestEvent event = buildEvent();
        String path = builder.build(event);

        Map<String, Object> values = parseYaml(path);
        Map<String, Object> system = (Map<String, Object>) values.get("system");
        Map<String, Object> naming = (Map<String, Object>) system.get("naming");

        assertNotNull(naming, "system.naming must be present");
        assertEquals("hc-sec-educ-my-cluster", naming.get("hostedClusterName"));
        assertEquals("hc-sec-educ-my-cluster", naming.get("namespace"));
        assertEquals("sec-educ", naming.get("appProject"));
        assertEquals("sec-educ", naming.get("clusterSet"));

        Files.deleteIfExists(Path.of(path));
    }

    @Test
    @SuppressWarnings("unchecked")
    void build_metaFields_populated() throws Exception {
        RequestEvent event = buildEvent();
        String path = builder.build(event);

        Map<String, Object> values = parseYaml(path);
        Map<String, Object> meta = (Map<String, Object>) values.get("meta");

        assertNotNull(meta, "meta must be present");
        assertEquals("REQ0010252C", meta.get("requestId"));
        assertEquals("cluster-request", meta.get("formId"));
        assertEquals("sec-educ", meta.get("org"));
        assertEquals("user@gdf.gov.br", meta.get("email"));
        assertEquals("2025-06-01T00:00:00Z", meta.get("submittedAt"));
        assertEquals("corr-hvb-001", meta.get("correlationId"));

        Files.deleteIfExists(Path.of(path));
    }

    @Test
    @SuppressWarnings("unchecked")
    void build_varsPassThrough() throws Exception {
        RequestEvent event = buildEvent();
        String path = builder.build(event);

        Map<String, Object> values = parseYaml(path);
        Map<String, Object> vars = (Map<String, Object>) values.get("vars");

        assertNotNull(vars, "vars must be present");
        assertEquals("my-cluster", vars.get("clusterName"));
        assertEquals("3", String.valueOf(vars.get("workerCount")));

        Files.deleteIfExists(Path.of(path));
    }

    @Test
    void build_writesYamlToTmpPath() throws Exception {
        RequestEvent event = buildEvent();
        String path = builder.build(event);

        assertTrue(path.startsWith("/tmp/"), "Output path must be under /tmp/");
        assertTrue(path.contains(event._id), "Output path must contain the requestId");
        assertTrue(path.endsWith("-values.yaml"), "Output path must end with -values.yaml");
        assertTrue(Files.exists(Path.of(path)), "YAML file must actually be written to disk");

        String content = Files.readString(Path.of(path));
        assertFalse(content.isBlank(), "YAML file must not be empty");

        Files.deleteIfExists(Path.of(path));
    }

    @Test
    void getChartRef_returnsFormId() {
        RequestEvent event = buildEvent();
        assertEquals("cluster-request", builder.getChartRef(event));
    }

    @Test
    void getReleaseName_clusterRequest_usesClusterNameVar() {
        RequestEvent event = buildEvent();
        assertEquals("hc-sec-educ-my-cluster", builder.getReleaseName(event));
    }

    @Test
    void getReleaseName_namespaceRequest_usesNamespaceNameVar() {
        RequestEvent event = buildEvent();
        event.formId = "namespace-request";
        event.vars = Map.of("namespaceName", "dev-apps");

        assertEquals("ns-sec-educ-dev-apps", builder.getReleaseName(event));
    }

    @Test
    @SuppressWarnings("unchecked")
    void buildForOrg_writesCanonicalValues() throws Exception {
        String path = builder.buildForOrg("cultura");

        try {
            Map<String, Object> values = parseYaml(path);

            Map<String, Object> meta = (Map<String, Object>) values.get("meta");
            assertNotNull(meta, "meta must be present");
            assertEquals("bootstrap-cultura", meta.get("requestId"));
            assertEquals("org-bootstrap", meta.get("formId"));
            assertEquals("cultura", meta.get("org"));
            assertNull(meta.get("email"));
            assertNotNull(meta.get("submittedAt"));
            assertEquals("bootstrap-cultura", meta.get("correlationId"));

            Map<String, Object> system = (Map<String, Object>) values.get("system");
            assertNotNull(system, "system must be present");
            Map<String, Object> naming = (Map<String, Object>) system.get("naming");
            assertEquals("cultura", naming.get("appProject"));
            assertEquals("cultura", naming.get("clusterSet"));
            assertEquals("cultura", naming.get("hostedClusterName"));
            assertEquals("cultura", naming.get("namespace"));

            Map<String, String> labels = (Map<String, String>) system.get("labels");
            assertNotNull(labels, "system.labels must be present");
            assertEquals(6, labels.size(), "system.labels must have exactly 6 entries");
            assertEquals("cultura", labels.get("gdfkube.io/organization"));
            assertEquals("bootstrap-cultura", labels.get("gdfkube.io/request-id"));

            assertEquals("https://gitea.apps.gdfkube.gov", system.get("giteaExternalUrl"));
            assertEquals("gdfkube", system.get("giteaOwner"));

            Map<String, Object> vars = (Map<String, Object>) values.get("vars");
            assertNotNull(vars, "vars must be present");
            assertTrue(vars.isEmpty(), "vars must be empty for org-bootstrap");
        } finally {
            Files.deleteIfExists(Path.of(path));
        }
    }

    @Test
    void getChartRef_stringOverload_prefixesInfra() {
        assertEquals("infra/argocd-org", builder.getChartRef("argocd-org"));
        assertEquals("infra/rhacm-org", builder.getChartRef("rhacm-org"));
    }

    @Test
    void getReleaseName_stringOverload_appendsBootstrap() {
        assertEquals("cultura-bootstrap", builder.getReleaseName("cultura"));
    }

    @Test
    void getRepoName_returnsCanonicalGdfkubePrefixedName() {
        assertEquals("gdfkube-cultura", builder.getRepoName("cultura"));
    }

    @Test
    void getRepoName_acceptsHyphenatedGroupIds() {
        assertEquals("gdfkube-sec-educ", builder.getRepoName("sec-educ"));
    }

    @Test
    @SuppressWarnings("unchecked")
    void formIdMatchesChartDefaults() throws Exception {
        String emittedPath = builder.buildForOrg("alpha");
        try {
            Map<String, Object> emittedValues = parseYaml(emittedPath);
            Map<String, Object> emittedMeta = (Map<String, Object>) emittedValues.get("meta");
            String emittedFormId = (String) emittedMeta.get("formId");
            assertEquals("org-bootstrap", emittedFormId, "buildForOrg must emit formId=org-bootstrap");

            String argocdFormId = readChartFormId("../gdfkube-infra/charts/infra/argocd-org/values.yaml");
            String rhacmFormId = readChartFormId("../gdfkube-infra/charts/infra/rhacm-org/values.yaml");

            assertEquals(emittedFormId, argocdFormId,
                    "argocd-org/values.yaml formId default drifted from HelmValuesBuilder");
            assertEquals(emittedFormId, rhacmFormId,
                    "rhacm-org/values.yaml formId default drifted from HelmValuesBuilder");
        } finally {
            Files.deleteIfExists(Path.of(emittedPath));
        }
    }

    @SuppressWarnings("unchecked")
    private String readChartFormId(String relativePath) throws Exception {
        Path chartPath = Path.of(relativePath).toAbsolutePath();
        if (!Files.exists(chartPath)) {
            fail("Chart file not found at " + chartPath + " — cannot verify formId drift guard");
        }
        Map<String, Object> values;
        try (FileReader reader = new FileReader(chartPath.toFile())) {
            values = new Yaml().load(reader);
        }
        Map<String, Object> meta = (Map<String, Object>) values.get("meta");
        assertNotNull(meta, "meta section missing from " + relativePath);
        String formId = (String) meta.get("formId");
        assertNotNull(formId, "meta.formId missing from " + relativePath);
        return formId;
    }

    @ParameterizedTest(name = "form id {0} has a chart directory")
    @MethodSource("seededFormIds")
    void everySeededFormIdResolvesToAChartDirectory(String formId) {
        Path chart = Path.of("../gdfkube-infra/charts", formId, "Chart.yaml");
        assertTrue(Files.exists(chart),
                "Missing chart for formId=" + formId + " at " + chart.toAbsolutePath());
    }

    static Stream<String> seededFormIds() throws IOException {
        Path seed = Path.of("../gdfkube-infra/mongodb/seed-data/forms.json");
        JsonNode root = new ObjectMapper().readTree(Files.readString(seed));
        return StreamSupport.stream(root.spliterator(), false)
                .map(n -> n.get("_id").asText());
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> parseYaml(String path) throws Exception {
        try (FileReader reader = new FileReader(path)) {
            return new Yaml().load(reader);
        }
    }

    private static RequestEvent buildEvent() {
        RequestEvent event = new RequestEvent();
        event._id = "REQ0010252C";
        event.formId = "cluster-request";
        event.status = "provisioning";
        event.env = "dev";
        event.requesterGroupName = "sec-educ";
        event.stage = 0;
        event.submittedAt = "2025-06-01T00:00:00Z";
        event.vars = Map.of("clusterName", "my-cluster", "workerCount", 3);
        event.meta = Map.of("correlationId", "corr-hvb-001");
        event.requester = Map.of("email", "user@gdf.gov.br");
        return event;
    }
}
