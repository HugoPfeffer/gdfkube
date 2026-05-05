const { useState, useEffect, useRef, Fragment } = React;

/* ─── colour tokens (extending the design system) ─── */
const C = {
  mongo:    "#4DB33D",
  debezium: "#E5472B",
  kafka:    "#231F20",
  camel:    "#E8702A",
  helm:     "#0F1689",
  git:      "#F05032",
  argo:     "#EF7B4D",
  dlq:      "#b91c1c",
};

/* ─── tiny icon SVGs ─── */
function Ico({ d, size = 16, color, style, ...rest }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color || "currentColor"} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" style={style} {...rest}>
      <path d={d} />
    </svg>
  );
}
const IcoChevron = (p) => <Ico d="M9 18l6-6-6-6" {...p} />;
const IcoDoc     = (p) => <Ico d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z M14 2v6h6" {...p} />;
const IcoDb      = (p) => <Ico d="M12 2C6.48 2 2 4.02 2 6.5v11C2 19.98 6.48 22 12 22s10-2.02 10-4.5v-11C22 4.02 17.52 2 12 2z M2 6.5C2 8.98 6.48 11 12 11s10-2.02 10-4.5 M2 11.5c0 2.49 4.48 4.5 10 4.5s10-2.01 10-4.5" {...p} />;
const IcoGit     = (p) => <Ico d="M6 3v12 M18 9a3 3 0 1 0 0-6 3 3 0 0 0 0 6z M6 21a3 3 0 1 0 0-6 3 3 0 0 0 0 6z M18 9a9 9 0 0 1-9 9" {...p} />;
const IcoTopic   = (p) => <Ico d="M4 6h16 M4 12h16 M4 18h16" {...p} />;
const IcoArrow   = (p) => <Ico d="M5 12h14 M12 5l7 7-7 7" {...p} />;
const IcoAlert   = (p) => <Ico d="M12 9v4 M12 17h.01 M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" {...p} />;

/* ─────────────────────────────────────────────────────
   SECTION DATA
   ───────────────────────────────────────────────────── */

const SECTIONS = [
  { id: "overview",   label: "Pipeline Overview" },
  { id: "mongodb",    label: "MongoDB Schemas" },
  { id: "debezium",   label: "Debezium CDC" },
  { id: "kafka",      label: "Kafka Topics & DLQ" },
  { id: "camel",      label: "Camel Routes" },
  { id: "helm",       label: "Helm Templates" },
  { id: "git",        label: "Git Repo Structure" },
  { id: "argocd",     label: "ArgoCD & RHACM" },
  { id: "secrets",    label: "Secret Handling" },
  { id: "rbac",       label: "RBAC & Access" },
];

/* ─────────────────────────────────────────────────────
   APP
   ───────────────────────────────────────────────────── */
function App() {
  const [active, setActive] = useState("overview");

  return (
    <div style={{display: "grid", gridTemplateColumns: "220px 1fr", height: "100vh", overflow: "hidden", background: "var(--canvas)"}}>
      {/* Sidebar */}
      <aside style={{background: "var(--navy-800)", color: "#cdd9eb", display: "flex", flexDirection: "column", borderRight: "1px solid var(--navy-900)"}}>
        <div style={{padding: "18px 16px", borderBottom: "1px solid var(--navy-900)"}}>
          <div style={{display: "flex", alignItems: "center", gap: 10}}>
            <div style={{width: 30, height: 30, background: "var(--paper)", display: "grid", placeItems: "center", fontFamily: "var(--font-serif)", fontWeight: 700, color: "var(--navy-800)", fontSize: 16, borderRadius: 2, position: "relative"}}>
              g
              <div style={{position: "absolute", bottom: -3, left: 0, right: 0, height: 3, background: "var(--civic-400)"}}></div>
            </div>
            <div>
              <div style={{fontWeight: 600, fontSize: 14, color: "white"}}>gdfkube</div>
              <div style={{fontSize: 10.5, color: "#8ca5c8", letterSpacing: "0.08em", textTransform: "uppercase"}}>Backend Architecture</div>
            </div>
          </div>
        </div>
        <nav style={{padding: "12px 0", flex: 1, overflowY: "auto"}}>
          <div style={{padding: "10px 16px 4px", fontSize: 10.5, letterSpacing: "0.1em", textTransform: "uppercase", color: "#7a92b3", fontWeight: 600}}>Documentation</div>
          {SECTIONS.map(s => (
            <div key={s.id}
                 onClick={() => setActive(s.id)}
                 style={{
                   display: "flex", alignItems: "center", gap: 10,
                   padding: "8px 16px", cursor: "pointer",
                   color: active === s.id ? "white" : "#cdd9eb",
                   background: active === s.id ? "rgba(43, 134, 217, 0.14)" : "transparent",
                   borderLeft: active === s.id ? "3px solid var(--civic-400)" : "3px solid transparent",
                   fontSize: 13,
                 }}>
              {s.label}
            </div>
          ))}
        </nav>
        <div style={{padding: "12px 16px", borderTop: "1px solid var(--navy-900)", fontSize: 11, color: "#7a92b3", display: "flex", alignItems: "center", gap: 8}}>
          PRD · v0.1.0-draft
        </div>
      </aside>

      {/* Main content */}
      <main style={{overflowY: "auto", padding: 0}}>
        {active === "overview" && <OverviewSection />}
        {active === "mongodb"  && <MongoSection />}
        {active === "debezium" && <DebeziumSection />}
        {active === "kafka"    && <KafkaSection />}
        {active === "camel"    && <CamelSection />}
        {active === "helm"     && <HelmSection />}
        {active === "git"      && <GitSection />}
        {active === "argocd"   && <ArgoCDSection />}
        {active === "secrets"  && <SecretsSection />}
        {active === "rbac"     && <RBACSection />}
      </main>
    </div>
  );
}

/* ─── shared components ─── */
function PageHead({ title, sub }) {
  return (
    <div style={{marginBottom: 20}}>
      <h1 style={{fontSize: 22, fontWeight: 600, color: "var(--ink-900)", margin: "0 0 4px", letterSpacing: "-0.01em"}}>{title}</h1>
      <p style={{fontSize: 13, color: "var(--ink-500)", margin: 0}}>{sub}</p>
    </div>
  );
}

function Card({ title, pill, children, style }) {
  return (
    <div style={{background: "var(--paper)", border: "1px solid var(--ink-200)", borderRadius: 6, ...style}}>
      {title && (
        <div style={{padding: "14px 18px", borderBottom: "1px solid var(--ink-200)", display: "flex", alignItems: "center", justifyContent: "space-between"}}>
          <h3 style={{fontSize: 13.5, fontWeight: 600, color: "var(--ink-800)", margin: 0}}>{title}</h3>
          {pill}
        </div>
      )}
      <div style={{padding: 18}}>{children}</div>
    </div>
  );
}

function Code({ children, lang }) {
  return (
    <pre style={{
      margin: 0, padding: 16, background: "#0f172a", color: "#e2e8f0",
      fontFamily: "var(--font-mono)", fontSize: 12, lineHeight: 1.7,
      borderRadius: 4, overflowX: "auto", whiteSpace: "pre",
    }}>
      {lang && <div style={{color: "#5e7392", fontSize: 10.5, marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.08em"}}>{lang}</div>}
      {children}
    </pre>
  );
}

function InfoBox({ children, type = "info" }) {
  const colors = {
    info: { bg: "#f0f6ff", border: "var(--ink-200)", accent: "var(--civic-500)" },
    warn: { bg: "#fef3c7", border: "#fde68a", accent: "var(--amber-700)" },
    error: { bg: "#fee2e2", border: "#fecaca", accent: "var(--red-700)" },
  };
  const c = colors[type];
  return (
    <div style={{padding: "10px 14px", background: c.bg, border: `1px solid ${c.border}`, borderRadius: 4, fontSize: 12.5, color: "var(--ink-700)", display: "flex", alignItems: "flex-start", gap: 8, lineHeight: 1.55}}>
      <span style={{color: c.accent, flexShrink: 0, marginTop: 1}}>{type === "warn" ? "⚠" : type === "error" ? "✕" : "ℹ"}</span>
      <div>{children}</div>
    </div>
  );
}

function Pill({ color = "blue", children }) {
  const map = {
    blue:  { bg: "var(--civic-100)", fg: "var(--navy-700)" },
    green: { bg: "var(--green-100)", fg: "var(--green-700)" },
    red:   { bg: "var(--red-100)",   fg: "var(--red-700)" },
    amber: { bg: "var(--amber-100)", fg: "var(--amber-700)" },
    gray:  { bg: "var(--ink-100)",   fg: "var(--ink-700)" },
  };
  const c = map[color] || map.blue;
  return (
    <span style={{display: "inline-flex", alignItems: "center", gap: 5, padding: "2px 8px", fontSize: 11.5, fontWeight: 600, borderRadius: 10, background: c.bg, color: c.fg, whiteSpace: "nowrap"}}>
      {children}
    </span>
  );
}

function TableRow({ cells, mono, header }) {
  const Tag = header ? "th" : "td";
  return (
    <tr>
      {cells.map((c, i) => (
        <Tag key={i} style={{
          padding: header ? "9px 14px" : "10px 14px",
          borderBottom: "1px solid var(--ink-200)",
          textAlign: "left",
          fontSize: header ? 11 : 13,
          fontWeight: header ? 600 : 400,
          color: header ? "var(--ink-500)" : "var(--ink-800)",
          letterSpacing: header ? "0.06em" : 0,
          textTransform: header ? "uppercase" : "none",
          background: header ? "var(--ink-50)" : "transparent",
          fontFamily: mono?.includes(i) ? "var(--font-mono)" : "inherit",
          ...(typeof c === "object" && c?.style ? c.style : {}),
        }}>
          {typeof c === "object" && c?.content ? c.content : c}
        </Tag>
      ))}
    </tr>
  );
}


/* ─────────────────────────────────────────────────────
   1. PIPELINE OVERVIEW
   ───────────────────────────────────────────────────── */
function OverviewSection() {
  const stages = [
    { key: "express", label: "Express API", sub: "Form submission", color: "var(--civic-500)", desc: "Receives form payload from the ITSM portal front-end. Validates fields, assigns ULID requestId, writes to MongoDB." },
    { key: "mongo",   label: "MongoDB", sub: "Document store", color: C.mongo, desc: "Persists the request document. Replica set with oplog enabled for Debezium CDC capture." },
    { key: "debezium",label: "Debezium", sub: "CDC connector", color: C.debezium, desc: "Kafka Connect source connector. Captures insert/update ops from the MongoDB oplog and publishes structured change events to Kafka." },
    { key: "kafka",   label: "Kafka", sub: "Event streaming", color: C.kafka, desc: "Strimzi-managed cluster. Topics organized by domain with DLQ pattern for error handling. Exactly-once semantics via idempotent producers." },
    { key: "camel",   label: "Camel K", sub: "Integration", color: C.camel, desc: "Consumes Debezium CDC events from Kafka topics. Deserializes the payload, routes by formId, invokes Helm to render manifests, and pushes to the Git repo." },
    { key: "helm",    label: "Helm", sub: "Template engine", color: C.helm, desc: "Used as a local template engine (not a release manager). Camel calls `helm template` with values derived from the CDC payload to render Kubernetes manifests." },
    { key: "git",     label: "Git Repo", sub: "GitOps state", color: C.git, desc: "Per-org customer repos. Camel commits rendered manifests to the appropriate directory. ArgoCD ApplicationSet watches for changes." },
  ];
  const [hovered, setHovered] = useState(null);

  return (
    <div style={{padding: "24px 28px 48px", maxWidth: 1200, margin: "0 auto"}}>
      <PageHead
        title="Pipeline Architecture Overview"
        sub="End-to-end CDC-driven GitOps pipeline: form submission → MongoDB → Debezium → Kafka → Camel → Helm → Git → ArgoCD"
      />

      {/* Pipeline diagram */}
      <Card title="Data Flow" pill={<Pill color="green">Event-driven · GitOps</Pill>}>
        <div style={{display: "flex", alignItems: "center", gap: 0, overflowX: "auto", padding: "12px 0"}}>
          {stages.map((s, i) => (
            <Fragment key={s.key}>
              <div
                onMouseEnter={() => setHovered(s.key)}
                onMouseLeave={() => setHovered(null)}
                style={{
                  display: "flex", flexDirection: "column", alignItems: "center",
                  padding: "14px 12px", borderRadius: 6, minWidth: 110,
                  background: hovered === s.key ? "var(--ink-50)" : "transparent",
                  transition: "background 120ms", cursor: "default",
                }}>
                <div style={{
                  width: 44, height: 44, borderRadius: "50%",
                  background: s.color, color: "white",
                  display: "grid", placeItems: "center",
                  fontSize: 13, fontWeight: 700, letterSpacing: "-0.02em",
                  boxShadow: hovered === s.key ? `0 0 0 4px ${s.color}33` : "none",
                  transition: "box-shadow 200ms",
                }}>
                  {s.label.slice(0, 2).toUpperCase()}
                </div>
                <div style={{fontSize: 12, fontWeight: 600, color: "var(--ink-800)", marginTop: 8, textAlign: "center"}}>{s.label}</div>
                <div style={{fontSize: 10.5, color: "var(--ink-500)", fontFamily: "var(--font-mono)", marginTop: 2}}>{s.sub}</div>
              </div>
              {i < stages.length - 1 && (
                <div style={{flex: "0 0 auto", display: "flex", alignItems: "center", color: "var(--ink-300)", margin: "0 -4px"}}>
                  <svg width="32" height="12" viewBox="0 0 32 12"><path d="M0 6h28m-6-5l6 5-6 5" fill="none" stroke="currentColor" strokeWidth="1.5" /></svg>
                </div>
              )}
            </Fragment>
          ))}
        </div>

        {/* Hover description */}
        <div style={{minHeight: 48, padding: "14px 0 0", borderTop: "1px solid var(--ink-100)", marginTop: 8}}>
          {hovered ? (
            <div style={{fontSize: 13, color: "var(--ink-700)", lineHeight: 1.55}}>
              <strong style={{color: "var(--ink-900)"}}>{stages.find(s => s.key === hovered).label}:</strong>{" "}
              {stages.find(s => s.key === hovered).desc}
            </div>
          ) : (
            <div style={{fontSize: 12.5, color: "var(--ink-400)", fontStyle: "italic"}}>Hover a stage to see its role in the pipeline.</div>
          )}
        </div>
      </Card>

      {/* Design principles */}
      <div style={{display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginTop: 18}}>
        <Card title="Design Principles">
          <div style={{display: "flex", flexDirection: "column", gap: 14}}>
            {[
              ["Event-driven", "All state changes flow as immutable events through Kafka. No direct service-to-service calls in the provisioning path."],
              ["GitOps as source of truth", "Rendered manifests are committed to Git. ArgoCD reconciles — the pipeline never talks to the Kubernetes API directly."],
              ["Helm as template engine only", "Helm renders YAML from values. No Helm releases, no Tiller, no release state. Pure `helm template`."],
              ["Dead-letter resilience", "Every Kafka consumer has a DLQ topic. Failed events are retried with backoff, then parked for manual inspection."],
              ["Per-org tenant isolation", "Each department gets its own Git repo, RBAC scope, ArgoCD AppProject, and RHACM ManagedClusterSet. Cross-tenant access is impossible by design."],
              ["Two-repo model", "gdfkube-infra holds shared platform resources (ArgoCD projects, RHACM cluster sets, RBAC). Per-org gdfkube-{org} repos hold customer cluster manifests. Camel writes to both."],
            ].map(([t, d], i) => (
              <div key={i} style={{display: "flex", gap: 12, alignItems: "flex-start"}}>
                <div style={{width: 22, height: 22, borderRadius: "50%", background: "var(--civic-50)", color: "var(--civic-500)", display: "grid", placeItems: "center", fontSize: 11, fontWeight: 700, flexShrink: 0}}>{i + 1}</div>
                <div>
                  <div style={{fontSize: 13, fontWeight: 600, color: "var(--ink-800)"}}>{t}</div>
                  <div style={{fontSize: 12, color: "var(--ink-500)", marginTop: 2, lineHeight: 1.5}}>{d}</div>
                </div>
              </div>
            ))}
          </div>
        </Card>

        <Card title="Technology Stack">
          <table style={{width: "100%", borderCollapse: "collapse"}}>
            <thead>
              <TableRow header cells={["Component", "Technology", "Deployment"]} />
            </thead>
            <tbody>
              {[
                ["API Layer",       "Express.js + Mongoose",     "Deployment"],
                ["Document Store",  "MongoDB 7.x (replica set)", "StatefulSet"],
                ["CDC",             "Debezium 2.x (MongoDB)",    "KafkaConnect"],
                ["Event Bus",       "Strimzi Kafka 3.7+",        "Strimzi Operator"],
                ["Integration",     "Camel K 2.x / Camel 4.x",  "Integration CR"],
                ["Templates",       "Helm 3.x (CLI)",            "Embedded in Camel"],
                ["Git Server",      "Gitea (abstracted)",        "Deployment"],
                ["GitOps",          "ArgoCD + ApplicationSet",   "Operator"],
                ["Cluster Engine",  "HyperShift + KubeVirt",     "Operator"],
              ].map((row, i) => <TableRow key={i} cells={row} mono={[1]} />)}
            </tbody>
          </table>
        </Card>
      </div>

      {/* Sequence diagram */}
      <Card title="Request Lifecycle — Sequence" style={{marginTop: 18}}>
        <Code lang="sequence (text representation)">
{`Operator          Express API        MongoDB         Debezium        Kafka            Camel K          Helm CLI         Git Repo
   │                   │                 │               │               │                │                │               │
   │── POST /request ─▶│                 │               │               │                │                │               │
   │                   │── insert() ────▶│               │               │                │                │               │
   │                   │◀── ack ─────────│               │               │                │                │               │
   │◀── 201 Created ──│                 │               │               │                │                │               │
   │                   │                 │── oplog ─────▶│               │                │                │               │
   │                   │                 │               │── produce ───▶│                │                │               │
   │                   │                 │               │               │── consume ────▶│                │               │
   │                   │                 │               │               │                │── template ───▶│               │
   │                   │                 │               │               │                │◀── manifests ──│               │
   │                   │                 │               │               │                │── git push ───────────────────▶│
   │                   │                 │               │               │                │                │               │
   │                   │                 │               │               │    (on error)   │                │               │
   │                   │                 │               │               │◀── produce ────│ (to DLQ topic) │               │
   │                   │                 │               │               │                │                │               │`}
        </Code>
      </Card>
    </div>
  );
}


/* ─────────────────────────────────────────────────────
   2. MONGODB SCHEMAS
   ───────────────────────────────────────────────────── */
function MongoSection() {
  return (
    <div style={{padding: "24px 28px 48px", maxWidth: 1200, margin: "0 auto"}}>
      <PageHead
        title="MongoDB Schemas & Collections"
        sub="Database: gdfkube · Replica set required for Debezium oplog tailing. All collections use ULID-based _id."
      />

      <InfoBox>
        MongoDB must run as a <strong>replica set</strong> (even single-node) to expose the oplog for Debezium CDC. The connector reads change streams from the <code>gdfkube</code> database.
      </InfoBox>

      {/* requests collection */}
      <Card title="Collection: requests" pill={<Pill>Primary · CDC-watched</Pill>} style={{marginTop: 16}}>
        <p style={{fontSize: 12.5, color: "var(--ink-600)", margin: "0 0 14px", lineHeight: 1.5}}>
          Every form submission creates a document in this collection. Debezium captures <code>insert</code> and <code>update</code> operations and publishes them to Kafka.
        </p>
        <Code lang="jsonc — document schema">
{`{
  // ─── Identity ───
  "_id":            ObjectId,           // MongoDB-generated
  "requestId":      "01HQ3K5M7N...",    // ULID — unique across the system, Kafka message key
  "formId":         "cluster-request",  // References the form definition

  // ─── Meta (system + form meta-bucket fields) ───
  "meta": {
    "requesterName":      "joao.silva",
    "requesterFullName":  "João Silva",
    "requesterEmail":     "joao.silva@saude.gov",
    "requesterRole":      "operator",
    "requesterGroupName": "saude",          // Department — drives Git repo + RBAC
    "submittedAt":        "2026-04-27T09:14:22.103Z",  // ISO-8601
    "correlationId":      "01HQ3K5M7N...", // = requestId, used as Kafka key
    "formId":             "cluster-request"
  },

  // ─── Vars (form vars-bucket fields) ───
  "vars": {
    "clusterName":  "vacinacao",
    "environment":  "production",
    "nodeCount":    3
  },

  // ─── Lifecycle ───
  "status":         "approval",         // approval | provisioning | ready | failed
  "stage":          0,                   // Pipeline stage index (0-6)
  "progress":       3,                   // 0-100 percentage
  "approvals": [
    {
      "approver":   "maria.costa",
      "decision":   "approved",          // approved | rejected
      "comment":    "Looks good.",
      "decidedAt":  "2026-04-27T09:20:00Z"
    }
  ],
  "error":          null,                // Populated on failure: { stage, message, timestamp }

  // ─── Timestamps ───
  "createdAt":      "2026-04-27T09:14:22.103Z",
  "updatedAt":      "2026-04-27T09:14:22.103Z"
}`}
        </Code>

        <div style={{marginTop: 16}}>
          <div style={{fontSize: 12, fontWeight: 600, color: "var(--ink-700)", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.05em"}}>Indexes</div>
          <table style={{width: "100%", borderCollapse: "collapse"}}>
            <thead><TableRow header cells={["Index Name", "Fields", "Type", "Purpose"]} /></thead>
            <tbody>
              {[
                ["idx_requestId",     "requestId",                  "Unique",    "Primary lookup, Kafka key correlation"],
                ["idx_formId_status",  "formId, status",             "Compound",  "Dashboard queries, approval queue"],
                ["idx_org_env",        "meta.requesterGroupName, vars.environment", "Compound", "Per-org filtering"],
                ["idx_status",         "status",                     "Simple",    "Pipeline stage queries"],
                ["idx_createdAt",      "createdAt",                  "Simple",    "Time-series queries, TTL-eligible"],
              ].map((r, i) => <TableRow key={i} cells={r} mono={[0, 1]} />)}
            </tbody>
          </table>
        </div>
      </Card>

      {/* forms collection */}
      <Card title="Collection: forms" pill={<Pill color="gray">Config · CDC-watched</Pill>} style={{marginTop: 16}}>
        <p style={{fontSize: 12.5, color: "var(--ink-600)", margin: "0 0 14px", lineHeight: 1.5}}>
          Stores form definitions managed via Admin → Forms. Changes are CDC-captured so Camel can hot-reload routing and template mappings.
        </p>
        <Code lang="jsonc — document schema">
{`{
  "_id":        ObjectId,
  "formId":     "cluster-request",       // Immutable slug, Kafka topic suffix
  "name":       "OpenShift Cluster Request",
  "topic":      "dbz.gdfkube.requests",  // Target Kafka topic
  "active":     true,
  "fields": [
    {
      "key":        "clusterName",
      "label":      "Cluster name",
      "type":       "text",              // text | number | select | textarea | checkbox
      "bucket":     "vars",              // vars | meta
      "required":   true,
      "validation": "^[a-z][a-z0-9-]*$",
      "options":    null,                // For select: "val|Label|Desc|#color; ..."
      "displayAs":  null,                // dropdown | radio-cards
      "prefix":     "hc-{requesterGroupName}-",
      "help":       "Lowercase, hyphens only.",
      "order":      1
    }
  ],
  "templates": [
    {
      "name":    "hostedcluster.yaml",
      "content": "apiVersion: hypershift.openshift.io/v1beta1\\nkind: HostedCluster\\n..."
    }
  ],
  "createdAt":  "2026-04-22T00:00:00Z",
  "updatedAt":  "2026-04-22T00:00:00Z"
}`}
        </Code>
      </Card>

      {/* audit collection */}
      <Card title="Collection: audit_log" pill={<Pill color="gray">Append-only</Pill>} style={{marginTop: 16}}>
        <p style={{fontSize: 12.5, color: "var(--ink-600)", margin: "0 0 14px", lineHeight: 1.5}}>
          Immutable audit trail of all pipeline events. Written by Camel on each stage transition. Not CDC-captured — consumed only by the portal API for display.
        </p>
        <Code lang="jsonc — document schema">
{`{
  "_id":           ObjectId,
  "requestId":     "01HQ3K5M7N...",
  "stage":         "camel",              // form | mongo | debezium | kafka | camel | git | argocd
  "action":        "template_rendered",
  "message":       "Rendered 5 templates for cluster-request",
  "level":         "info",               // info | warn | error
  "actor":         "camel-route/request-router",
  "timestamp":     "2026-04-27T09:14:22.305Z",
  "details":       { "fileCount": 5, "linesAdded": 412 }
}`}
        </Code>
      </Card>
    </div>
  );
}


/* ─────────────────────────────────────────────────────
   3. DEBEZIUM CDC
   ───────────────────────────────────────────────────── */
function DebeziumSection() {
  return (
    <div style={{padding: "24px 28px 48px", maxWidth: 1200, margin: "0 auto"}}>
      <PageHead
        title="Debezium CDC Configuration"
        sub="Kafka Connect source connector capturing MongoDB change streams and publishing structured events to Kafka topics."
      />

      <InfoBox>
        Debezium runs as a <strong>KafkaConnector</strong> custom resource managed by the Strimzi Kafka Connect operator. One connector instance watches the entire <code>gdfkube</code> database.
      </InfoBox>

      <Card title="KafkaConnector CR" pill={<Pill>Strimzi · Debezium MongoDB</Pill>} style={{marginTop: 16}}>
        <Code lang="yaml — debezium-connector.yaml">
{`apiVersion: kafka.strimzi.io/v1beta2
kind: KafkaConnector
metadata:
  name: gdfkube-mongodb-connector
  namespace: gdfkube-kafka
  labels:
    strimzi.io/cluster: gdfkube-connect
spec:
  class: io.debezium.connector.mongodb.MongoDbConnector
  tasksMax: 1
  config:
    # ─── MongoDB connection ───
    mongodb.connection.string: "mongodb://gdfkube-mongo-0.gdfkube-mongo-svc:27017,gdfkube-mongo-1.gdfkube-mongo-svc:27017,gdfkube-mongo-2.gdfkube-mongo-svc:27017/?replicaSet=rs0"
    mongodb.user: "\${secrets:gdfkube-kafka/mongodb-credentials:username}"
    mongodb.password: "\${secrets:gdfkube-kafka/mongodb-credentials:password}"
    mongodb.authsource: admin

    # ─── Scope ───
    database.include.list: gdfkube
    collection.include.list: gdfkube.requests,gdfkube.forms

    # ─── Topic routing ───
    topic.prefix: dbz
    # Produces topics:
    #   dbz.gdfkube.requests   (request lifecycle events)
    #   dbz.gdfkube.forms      (form config changes)

    # ─── Serialization ───
    key.converter: org.apache.kafka.connect.json.JsonConverter
    key.converter.schemas.enable: false
    value.converter: org.apache.kafka.connect.json.JsonConverter
    value.converter.schemas.enable: false

    # ─── Snapshot ───
    snapshot.mode: initial
    snapshot.max.threads: 1

    # ─── Signal & Heartbeat ───
    signal.data.collection: gdfkube.debezium_signals
    heartbeat.interval.ms: 10000

    # ─── SMTs (Single Message Transforms) ───
    transforms: unwrap,route
    transforms.unwrap.type: io.debezium.connector.mongodb.transforms.ExtractNewDocumentState
    transforms.unwrap.drop.tombstones: true
    transforms.unwrap.delete.handling.mode: drop
    transforms.unwrap.add.fields: "op,source.ts_ms,source.collection"
    transforms.route.type: org.apache.kafka.connect.transforms.RegexRouter
    transforms.route.regex: "dbz\\\\.gdfkube\\\\.(.*)"
    transforms.route.replacement: "dbz.gdfkube.$1"

    # ─── Error handling ───
    errors.tolerance: all
    errors.deadletterqueue.topic.name: dlq.dbz.gdfkube
    errors.deadletterqueue.topic.replication.factor: 3
    errors.deadletterqueue.context.headers.enable: true
    errors.log.enable: true
    errors.log.include.messages: true`}
        </Code>
      </Card>

      <Card title="CDC Event Structure" pill={<Pill color="green">After ExtractNewDocumentState</Pill>} style={{marginTop: 16}}>
        <p style={{fontSize: 12.5, color: "var(--ink-600)", margin: "0 0 14px", lineHeight: 1.5}}>
          After the <code>ExtractNewDocumentState</code> SMT, Debezium emits a flattened JSON payload. The Kafka message key is the document's <code>requestId</code> field (set via the <code>message.key.columns</code> config or SMT).
        </p>
        <Code lang="jsonc — kafka message on dbz.gdfkube.requests">
{`// Key (string):
"01HQ3K5M7N8P9Q0R1S2T3U4V5W"

// Value:
{
  "requestId":  "01HQ3K5M7N8P9Q0R1S2T3U4V5W",
  "formId":     "cluster-request",
  "meta": {
    "requesterName":      "joao.silva",
    "requesterFullName":  "João Silva",
    "requesterEmail":     "joao.silva@saude.gov",
    "requesterRole":      "operator",
    "requesterGroupName": "saude",
    "submittedAt":        "2026-04-27T09:14:22.103Z",
    "correlationId":      "01HQ3K5M7N8P9Q0R1S2T3U4V5W",
    "formId":             "cluster-request"
  },
  "vars": {
    "clusterName": "vacinacao",
    "environment": "production",
    "nodeCount":   3
  },
  "status":    "approval",
  "stage":     0,
  "progress":  3,
  "createdAt": "2026-04-27T09:14:22.103Z",
  "updatedAt": "2026-04-27T09:14:22.103Z",

  // ─── Debezium metadata (added by SMT) ───
  "__op":                "c",                    // c=create, u=update, d=delete
  "__source_ts_ms":      1745742862103,
  "__source_collection": "requests"
}`}
        </Code>
      </Card>

      <Card title="Watched Operations" style={{marginTop: 16}}>
        <table style={{width: "100%", borderCollapse: "collapse"}}>
          <thead><TableRow header cells={["Operation", "Debezium op", "Trigger", "Downstream Action"]} /></thead>
          <tbody>
            {[
              ["Insert (create)",  "c", "New form submission",          "Camel routes the event by formId, renders templates, pushes to Git"],
              ["Update (status)",  "u", "Approval granted / Stage advance", "Camel checks if status changed to 'provisioning', triggers pipeline"],
              ["Update (error)",   "u", "Pipeline failure recorded",    "Camel publishes to DLQ, updates audit_log"],
              ["Delete",           "d", "Dropped by SMT",               "Not propagated — requests are never deleted, only archived"],
            ].map((r, i) => <TableRow key={i} cells={r} mono={[1]} />)}
          </tbody>
        </table>
      </Card>
    </div>
  );
}


/* ─────────────────────────────────────────────────────
   4. KAFKA TOPICS & DLQ
   ───────────────────────────────────────────────────── */
function KafkaSection() {
  const topics = [
    { name: "dbz.gdfkube.requests",          partitions: 6, retention: "7d",  repl: 3, purpose: "CDC events from the requests collection. Partitioned by requestId for ordering.", type: "cdc", consumer: "camel-request-router" },
    { name: "dbz.gdfkube.forms",             partitions: 1, retention: "7d",  repl: 3, purpose: "CDC events from the forms collection. Used by Camel for hot-reload of form/template config.", type: "cdc", consumer: "camel-config-reload" },
    { name: "gdfkube.pipeline.status",       partitions: 6, retention: "14d", repl: 3, purpose: "Stage transition events emitted by Camel. Consumed by the Express API for real-time dashboard updates (SSE/WebSocket).", type: "internal", consumer: "express-sse-bridge" },
    { name: "gdfkube.pipeline.audit",        partitions: 3, retention: "30d", repl: 3, purpose: "Audit log events for compliance. Written to MongoDB audit_log collection by a dedicated consumer.", type: "internal", consumer: "camel-audit-sink" },
    { name: "dlq.dbz.gdfkube",              partitions: 1, retention: "30d", repl: 3, purpose: "Dead-letter queue for Debezium connector errors. Captures serialization failures, unreachable MongoDB, etc.", type: "dlq", consumer: "manual / alerting" },
    { name: "dlq.gdfkube.requests",          partitions: 3, retention: "30d", repl: 3, purpose: "Dead-letter queue for Camel request processing failures. Contains the original CDC event + error headers.", type: "dlq", consumer: "camel-dlq-handler" },
    { name: "dlq.gdfkube.git-push",          partitions: 1, retention: "30d", repl: 3, purpose: "Dead-letter queue for Git push failures (auth errors, merge conflicts, network). Supports manual retry.", type: "dlq", consumer: "camel-dlq-handler" },
    { name: "dlq.gdfkube.helm-render",       partitions: 1, retention: "30d", repl: 3, purpose: "Dead-letter queue for Helm template rendering failures (missing values, invalid YAML). Needs form/template fix.", type: "dlq", consumer: "camel-dlq-handler" },
  ];

  return (
    <div style={{padding: "24px 28px 48px", maxWidth: 1200, margin: "0 auto"}}>
      <PageHead
        title="Kafka Topics & Dead-Letter Queues"
        sub="Strimzi-managed Kafka cluster. All topics defined as KafkaTopic CRs with explicit retention, partitioning, and replication."
      />

      <InfoBox>
        Naming convention: <code>{"<source>.<database>.<collection>"}</code> for CDC topics, <code>{"gdfkube.pipeline.<purpose>"}</code> for internal topics, <code>{"dlq.<original-topic-name>"}</code> for dead-letter queues.
      </InfoBox>

      {/* Topic map */}
      <Card title="Topic Registry" style={{marginTop: 16}}>
        <table style={{width: "100%", borderCollapse: "collapse", fontSize: 13}}>
          <thead><TableRow header cells={["Topic Name", "Type", "Part.", "Ret.", "Repl.", "Consumer"]} /></thead>
          <tbody>
            {topics.map((t, i) => (
              <tr key={i} style={{borderBottom: "1px solid var(--ink-100)"}}>
                <td style={{padding: "10px 14px", fontFamily: "var(--font-mono)", fontSize: 12, fontWeight: 500, color: t.type === "dlq" ? "var(--red-700)" : "var(--ink-800)"}}>
                  {t.name}
                </td>
                <td style={{padding: "10px 14px"}}>
                  <Pill color={t.type === "dlq" ? "red" : t.type === "cdc" ? "blue" : "gray"}>
                    {t.type.toUpperCase()}
                  </Pill>
                </td>
                <td style={{padding: "10px 14px", fontFamily: "var(--font-mono)", fontSize: 12}}>{t.partitions}</td>
                <td style={{padding: "10px 14px", fontFamily: "var(--font-mono)", fontSize: 12}}>{t.retention}</td>
                <td style={{padding: "10px 14px", fontFamily: "var(--font-mono)", fontSize: 12}}>{t.repl}</td>
                <td style={{padding: "10px 14px", fontFamily: "var(--font-mono)", fontSize: 11.5, color: "var(--ink-600)"}}>{t.consumer}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      {/* DLQ Design */}
      <Card title="Dead-Letter Queue Design" pill={<Pill color="red">Error Handling</Pill>} style={{marginTop: 16}}>
        <div style={{display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18}}>
          <div>
            <div style={{fontSize: 13, fontWeight: 600, color: "var(--ink-800)", marginBottom: 8}}>Error Flow</div>
            <div style={{display: "flex", flexDirection: "column", gap: 10}}>
              {[
                ["1. Consume", "Camel picks up CDC event from primary topic"],
                ["2. Process", "Attempt Helm render → Git push"],
                ["3. Retry",   "On transient failure: exponential backoff (3 retries, 1s/5s/30s)"],
                ["4. Classify","Permanent errors (bad template, missing field) skip retry"],
                ["5. DLQ",     "After exhausting retries → produce to the appropriate dlq.* topic"],
                ["6. Enrich",  "DLQ message includes error headers: exception class, message, stack, timestamp, retry count"],
              ].map(([t, d], i) => (
                <div key={i} style={{display: "flex", gap: 10, alignItems: "flex-start"}}>
                  <div style={{width: 20, height: 20, borderRadius: "50%", background: i < 2 ? "var(--civic-50)" : i < 4 ? "var(--amber-100)" : "var(--red-100)", color: i < 2 ? "var(--civic-500)" : i < 4 ? "var(--amber-700)" : "var(--red-700)", display: "grid", placeItems: "center", fontSize: 10, fontWeight: 700, flexShrink: 0}}>{i + 1}</div>
                  <div>
                    <span style={{fontSize: 12.5, fontWeight: 600, color: "var(--ink-800)"}}>{t}: </span>
                    <span style={{fontSize: 12.5, color: "var(--ink-600)"}}>{d}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div>
            <div style={{fontSize: 13, fontWeight: 600, color: "var(--ink-800)", marginBottom: 8}}>DLQ Message Headers</div>
            <Code lang="headers on dlq.* messages">
{`x-original-topic:     dbz.gdfkube.requests
x-original-partition:  2
x-original-offset:     24871
x-original-key:        01HQ3K5M7N...
x-error-class:         GitPushException
x-error-message:       "Authentication failed for repo gdfkube-saude"
x-retry-count:         3
x-failed-at:           2026-04-27T09:14:22.488Z
x-camel-route:         request-router
x-pipeline-stage:      git`}
            </Code>

            <div style={{marginTop: 14}}>
              <InfoBox type="warn">
                DLQ topics retain messages for <strong>30 days</strong>. An alerting rule fires when any DLQ topic has unconsumed messages older than 15 minutes. The <code>camel-dlq-handler</code> route supports manual replay by re-publishing to the original topic with a <code>x-replayed: true</code> header.
              </InfoBox>
            </div>
          </div>
        </div>
      </Card>

      {/* KafkaTopic CR */}
      <Card title="KafkaTopic CR Example" style={{marginTop: 16}}>
        <Code lang="yaml — kafka-topics.yaml">
{`apiVersion: kafka.strimzi.io/v1beta2
kind: KafkaTopic
metadata:
  name: dbz.gdfkube.requests
  namespace: gdfkube-kafka
  labels:
    strimzi.io/cluster: gdfkube-kafka
    gdfkube.gov/domain: requests
    gdfkube.gov/type: cdc
spec:
  partitions: 6
  replicas: 3
  config:
    retention.ms: 604800000          # 7 days
    cleanup.policy: delete
    min.insync.replicas: 2
    compression.type: lz4
    max.message.bytes: 1048576       # 1 MiB
    message.timestamp.type: CreateTime
---
apiVersion: kafka.strimzi.io/v1beta2
kind: KafkaTopic
metadata:
  name: dlq.gdfkube.requests
  namespace: gdfkube-kafka
  labels:
    strimzi.io/cluster: gdfkube-kafka
    gdfkube.gov/domain: requests
    gdfkube.gov/type: dlq
spec:
  partitions: 3
  replicas: 3
  config:
    retention.ms: 2592000000         # 30 days
    cleanup.policy: delete
    min.insync.replicas: 2`}
        </Code>
      </Card>
    </div>
  );
}


/* ─────────────────────────────────────────────────────
   5. CAMEL ROUTES
   ───────────────────────────────────────────────────── */
function CamelSection() {
  return (
    <div style={{padding: "24px 28px 48px", maxWidth: 1200, margin: "0 auto"}}>
      <PageHead
        title="Apache Camel Route Design"
        sub="Camel K integrations consuming Debezium CDC events, transforming payloads into Helm values, rendering manifests, and pushing to Git."
      />

      <InfoBox>
        Camel routes are deployed as <strong>Integration</strong> CRs via the Camel K operator. Each route is a separate Integration to allow independent scaling and lifecycle management.
      </InfoBox>

      {/* Route overview */}
      <Card title="Route Inventory" style={{marginTop: 16}}>
        <table style={{width: "100%", borderCollapse: "collapse"}}>
          <thead><TableRow header cells={["Route ID", "Source", "Purpose", "Sink", "DLQ"]} /></thead>
          <tbody>
            {[
              ["request-router",   "dbz.gdfkube.requests",    "Main pipeline: consume CDC → route by formId → Helm render → Git push", "Git repo",                  "dlq.gdfkube.requests"],
              ["config-reload",    "dbz.gdfkube.forms",       "Hot-reload form definitions and template mappings into Camel registry",   "In-memory registry",        "dlq.dbz.gdfkube"],
              ["repo-bootstrap",   "(called by git-push)",    "Creates org Git repo if it doesn't exist. Initializes with README, baseline overlays, and .gitkeep structure.", "Git server API", "dlq.gdfkube.git-push"],
              ["status-emitter",   "(internal)",              "Publishes stage transitions to the status topic for real-time UI",         "gdfkube.pipeline.status",   "—"],
              ["audit-sink",       "gdfkube.pipeline.audit",  "Writes audit events from Kafka to MongoDB audit_log collection",          "MongoDB audit_log",         "dlq.gdfkube.requests"],
              ["dlq-handler",      "dlq.gdfkube.*",           "Monitors DLQ topics, supports manual replay and alerting",                "Original topic (on replay)","—"],
            ].map((r, i) => <TableRow key={i} cells={r} mono={[0, 1, 4]} />)}
          </tbody>
        </table>
      </Card>

      {/* Main request-router route */}
      <Card title="Route: request-router" pill={<Pill color="green">Primary pipeline</Pill>} style={{marginTop: 16}}>
        <p style={{fontSize: 12.5, color: "var(--ink-600)", margin: "0 0 14px", lineHeight: 1.5}}>
          The core integration route. Consumes CDC events from <code>dbz.gdfkube.requests</code>, filters for actionable operations, transforms the payload into Helm-compatible values, renders templates, and pushes results to the customer's Git repo.
        </p>

        <Code lang="yaml — request-router.camel.yaml (Camel YAML DSL)">
{`# Integration CR: request-router
apiVersion: camel.apache.org/v1
kind: Integration
metadata:
  name: request-router
  namespace: gdfkube-camel
spec:
  dependencies:
    - "camel:kafka"
    - "camel:jackson"
    - "camel:exec"          # For helm CLI invocation
    - "camel:git"           # For Git operations (JGit)
    - "camel:bean"
    - "camel:direct"
    - "mvn:io.strimzi:kafka-oauth-client:0.14.0"
  traits:
    container:
      image: gdfkube/camel-request-router:latest  # Custom image w/ Helm CLI baked in
    logging:
      level: INFO
  flows:
    # ── 1. Consume from Kafka ──
    - from:
        uri: "kafka:dbz.gdfkube.requests"
        parameters:
          brokers: "gdfkube-kafka-bootstrap.gdfkube-kafka:9092"
          groupId: "camel-request-router"
          autoOffsetReset: earliest
          keyDeserializer: "org.apache.kafka.common.serialization.StringDeserializer"
          valueDeserializer: "org.apache.kafka.common.serialization.StringDeserializer"
          maxPollRecords: 10
          # Exactly-once: manual commit after Git push succeeds
          autoCommitEnable: false
        steps:
          # ── 2. Deserialize JSON ──
          - unmarshal:
              json:
                library: Jackson

          # ── 3. Filter: only process actionable events ──
          - filter:
              jsonpath:
                expression: "$[?(@.__op == 'c' || (@.__op == 'u' && @.status == 'provisioning'))]"
              steps:

                # ── 4. Enrich: set exchange properties ──
                - setProperty:
                    name: requestId
                    jsonpath: "$.requestId"
                - setProperty:
                    name: formId
                    jsonpath: "$.formId"
                - setProperty:
                    name: orgName
                    jsonpath: "$.meta.requesterGroupName"

                # ── 5. Log entry ──
                - log:
                    message: "Processing request \${exchangeProperty.requestId} formId=\${exchangeProperty.formId}"
                    loggingLevel: INFO

                # ── 6. Emit status: stage=camel ──
                - to:
                    uri: "direct:emit-status"
                    parameters:
                      stage: camel
                      status: processing

                # ── 7. Route by formId → Helm render ──
                - to: "direct:helm-render"

                # ── 8. Git push ──
                - to: "direct:git-push"

                # ── 9. Emit status: stage=git ──
                - to:
                    uri: "direct:emit-status"
                    parameters:
                      stage: git
                      status: completed

                # ── 10. Manual Kafka commit ──
                - process:
                    ref: "kafkaManualCommit"

          # ── Error handler → DLQ ──
          - onException:
              - "java.lang.Exception"
            handled: true
            maximumRedeliveries: 3
            redeliveryDelay: 1000
            backOffMultiplier: 5
            retryAttemptedLogLevel: WARN
            steps:
              - setHeader:
                  name: x-error-class
                  simple: "\${exception.class.simpleName}"
              - setHeader:
                  name: x-error-message
                  simple: "\${exception.message}"
              - setHeader:
                  name: x-original-topic
                  constant: "dbz.gdfkube.requests"
              - setHeader:
                  name: x-pipeline-stage
                  simple: "\${exchangeProperty.currentStage}"
              - to: "kafka:dlq.gdfkube.requests?brokers=gdfkube-kafka-bootstrap.gdfkube-kafka:9092"
              - to:
                  uri: "direct:emit-status"
                  parameters:
                    stage: "\${exchangeProperty.currentStage}"
                    status: failed`}
        </Code>
      </Card>

      {/* Helm render sub-route */}
      <Card title="Sub-route: helm-render" pill={<Pill>Helm CLI invocation</Pill>} style={{marginTop: 16}}>
        <Code lang="yaml — helm-render sub-route">
{`    # ── direct:helm-render ──
    - from:
        uri: "direct:helm-render"
        steps:
          - setProperty:
              name: currentStage
              constant: camel

          # Build Helm values.yaml from CDC payload
          - bean:
              ref: helmValuesBuilder
              method: buildValues
              # Transforms:
              #   body.meta.*  → .Values.meta.*
              #   body.vars.*  → .Values.vars.*
              #   body.formId  → .Values.formId
              #   Injects system values: requestId, timestamp, orgName

          # Write values.yaml to temp dir
          - to: "file:///tmp/helm-render/\${exchangeProperty.requestId}?fileName=values.yaml"

          # Invoke Helm CLI: helm template <chart> -f values.yaml
          - to:
              uri: "exec:helm"
              parameters:
                args: "template gdfkube-\${exchangeProperty.formId} /opt/charts/\${exchangeProperty.formId} -f /tmp/helm-render/\${exchangeProperty.requestId}/values.yaml --output-dir /tmp/helm-render/\${exchangeProperty.requestId}/output"
                workingDir: "/tmp/helm-render/\${exchangeProperty.requestId}"

          # Read rendered manifests back into exchange
          - bean:
              ref: manifestCollector
              method: collectOutput
              # Reads /tmp/helm-render/{requestId}/output/**/*.yaml
              # Sets body to List<ManifestFile>

          - log:
              message: "Rendered \${body.size()} manifests for \${exchangeProperty.formId}"

          # ── Error: Helm render failure → specific DLQ ──
          - onException:
              - "org.apache.camel.component.exec.ExecException"
            handled: true
            maximumRedeliveries: 0   # Template errors are permanent
            steps:
              - to: "kafka:dlq.gdfkube.helm-render?brokers=gdfkube-kafka-bootstrap.gdfkube-kafka:9092"`}
        </Code>

        <div style={{marginTop: 14}}>
          <InfoBox>
            The <code>helmValuesBuilder</code> bean transforms the flat CDC JSON into a <code>values.yaml</code> structure. See the <strong>Helm Templates</strong> section for the chart structure and value mappings.
          </InfoBox>
        </div>
      </Card>

      {/* Git push sub-route */}
      <Card title="Sub-route: git-push" pill={<Pill>JGit integration</Pill>} style={{marginTop: 16}}>
        <Code lang="yaml — git-push sub-route">
{`    # ── direct:git-push ──
    - from:
        uri: "direct:git-push"
        steps:
          - setProperty:
              name: currentStage
              constant: git

          # Resolve target repo and path
          - bean:
              ref: gitRepoResolver
              method: resolve
              # Input:  orgName, formId, vars
              # Output: sets headers:
              #   x-git-repo-url:  https://git.gdfkube.gov/gdfkube-{orgName}.git
              #   x-git-branch:    main
              #   x-git-path:      clusters/{clusterName}/
              #   x-git-commit-msg: "[gdfkube] REQ{requestId}: provision {clusterName} ({formId})"

          # ── Ensure org repo exists (first-request bootstrap) ──
          - to: "direct:repo-bootstrap"

          # Clone / fetch the repo
          - to:
              uri: "git:///tmp/git-workdir/\${exchangeProperty.orgName}"
              parameters:
                operation: clone
                remotePath: "\${header.x-git-repo-url}"
                branchName: "\${header.x-git-branch}"
                username: "\${secrets:gdfkube-camel/git-credentials:username}"
                password: "\${secrets:gdfkube-camel/git-credentials:token}"

          # Write manifest files to the work tree
          - bean:
              ref: manifestWriter
              method: writeToWorkTree

          # Stage, commit, push
          - to:
              uri: "git:///tmp/git-workdir/\${exchangeProperty.orgName}"
              parameters:
                operation: add
                filenameToAdd: "."
          - to:
              uri: "git:///tmp/git-workdir/\${exchangeProperty.orgName}"
              parameters:
                operation: commit
                message: "\${header.x-git-commit-msg}"
          - to:
              uri: "git:///tmp/git-workdir/\${exchangeProperty.orgName}"
              parameters:
                operation: push
                remoteName: origin

          - log:
              message: "git push origin main → gdfkube-\${exchangeProperty.orgName}/\${header.x-git-path}"

    # ── direct:repo-bootstrap ──
    # Handles the first-request scenario: if the org repo does not exist,
    # create it via the Git server API, initialize with scaffolding, and push.
    - from:
        uri: "direct:repo-bootstrap"
        steps:
          # Check if repo exists (HTTP HEAD against Git server API)
          - setHeader:
              name: CamelHttpMethod
              constant: GET
          - doTry:
              - to:
                  uri: "https://git.gdfkube.gov/api/v1/repos/gdfkube/gdfkube-\${exchangeProperty.orgName}"
                  parameters:
                    throwExceptionOnFailure: true
                    authUsername: "\${secrets:gdfkube-camel/git-credentials:username}"
                    authPassword: "\${secrets:gdfkube-camel/git-credentials:token}"
              - log:
                  message: "Repo gdfkube-\${exchangeProperty.orgName} exists, skipping bootstrap"
            doCatch:
              - exception:
                  - "org.apache.camel.http.base.HttpOperationFailedException"
                steps:
                  - log:
                      message: "Repo gdfkube-\${exchangeProperty.orgName} not found — bootstrapping new org repo"

                  # Create repo via Git server API
                  - setHeader:
                      name: CamelHttpMethod
                      constant: POST
                  - setHeader:
                      name: Content-Type
                      constant: application/json
                  - setBody:
                      simple: >-
                        {
                          "name": "gdfkube-\${exchangeProperty.orgName}",
                          "description": "gdfkube GitOps repo for org \${exchangeProperty.orgName}",
                          "private": true,
                          "auto_init": true,
                          "default_branch": "main"
                        }
                  - to:
                      uri: "https://git.gdfkube.gov/api/v1/orgs/gdfkube/repos"
                      parameters:
                        authUsername: "\${secrets:gdfkube-camel/git-credentials:username}"
                        authPassword: "\${secrets:gdfkube-camel/git-credentials:token}"

                  # Clone the fresh repo and add scaffolding
                  - to:
                      uri: "git:///tmp/git-workdir/\${exchangeProperty.orgName}"
                      parameters:
                        operation: clone
                        remotePath: "https://git.gdfkube.gov/gdfkube/gdfkube-\${exchangeProperty.orgName}.git"
                        branchName: main
                        username: "\${secrets:gdfkube-camel/git-credentials:username}"
                        password: "\${secrets:gdfkube-camel/git-credentials:token}"

                  # Write scaffold files
                  - bean:
                      ref: repoScaffolder
                      method: writeScaffold
                      # Creates:
                      #   README.md
                      #   clusters/.gitkeep
                      #   namespaces/.gitkeep
                      #   scale-patches/.gitkeep
                      #   baseline/overlays/development/.gitkeep
                      #   baseline/overlays/staging/.gitkeep
                      #   baseline/overlays/production/.gitkeep

                  # Commit and push scaffold
                  - to:
                      uri: "git:///tmp/git-workdir/\${exchangeProperty.orgName}"
                      parameters:
                        operation: add
                        filenameToAdd: "."
                  - to:
                      uri: "git:///tmp/git-workdir/\${exchangeProperty.orgName}"
                      parameters:
                        operation: commit
                        message: "[gdfkube] Bootstrap org repo for \${exchangeProperty.orgName}"
                  - to:
                      uri: "git:///tmp/git-workdir/\${exchangeProperty.orgName}"
                      parameters:
                        operation: push
                        remoteName: origin

                  - log:
                      message: "Bootstrapped customer repo gdfkube-\${exchangeProperty.orgName}"

                  # ── Push org infra to gdfkube-infra ──
                  - log:
                      message: "Rendering org-infra chart for \${exchangeProperty.orgName} → gdfkube-infra"

                  # Render org-infra Helm chart (AppProject, ApplicationSet, ManagedClusterSet, Binding)
                  - bean:
                      ref: helmValuesBuilder
                      method: buildOrgInfraValues
                  - to: "file:///tmp/helm-render/infra-\${exchangeProperty.orgName}?fileName=values.yaml"
                  - to:
                      uri: "exec:helm"
                      parameters:
                        args: "template org-infra /opt/charts/org-infra -f /tmp/helm-render/infra-\${exchangeProperty.orgName}/values.yaml --output-dir /tmp/helm-render/infra-\${exchangeProperty.orgName}/output"

                  # Clone gdfkube-infra
                  - to:
                      uri: "git:///tmp/git-workdir/gdfkube-infra"
                      parameters:
                        operation: clone
                        remotePath: "\${properties:gitea.externalUrl}/\${properties:gitea.owner}/gdfkube-infra.git"
                        branchName: main
                        username: "\${secrets:gdfkube-camel/git-credentials:username}"
                        password: "\${secrets:gdfkube-camel/git-credentials:token}"

                  # Write rendered infra manifests to correct paths
                  - bean:
                      ref: infraManifestWriter
                      method: writeToInfraWorkTree
                      # Writes to:
                      #   argocd/orgs/{org}/appproject.yaml
                      #   argocd/orgs/{org}/applicationset.yaml
                      #   rhacm/orgs/{org}/managedclusterset.yaml
                      #   rhacm/orgs/{org}/binding.yaml

                  # Commit and push to gdfkube-infra
                  - to:
                      uri: "git:///tmp/git-workdir/gdfkube-infra"
                      parameters:
                        operation: add
                        filenameToAdd: "."
                  - to:
                      uri: "git:///tmp/git-workdir/gdfkube-infra"
                      parameters:
                        operation: commit
                        message: "[gdfkube] Bootstrap org infra for \${exchangeProperty.orgName}"
                  - to:
                      uri: "git:///tmp/git-workdir/gdfkube-infra"
                      parameters:
                        operation: push
                        remoteName: origin

                  - log:
                      message: "Pushed org infra (ArgoCD + RHACM) to gdfkube-infra for \${exchangeProperty.orgName}"

          # ── Error: Repo bootstrap failure → DLQ ──
          - onException:
              - "java.lang.Exception"
            handled: true
            maximumRedeliveries: 2
            redeliveryDelay: 3000
            steps:
              - to: "kafka:dlq.gdfkube.git-push?brokers=gdfkube-kafka-bootstrap.gdfkube-kafka:9092"

          # ── Error: Git push failure → specific DLQ ──
          - onException:
              - "org.eclipse.jgit.api.errors.TransportException"
              - "org.eclipse.jgit.api.errors.GitAPIException"
            handled: true
            maximumRedeliveries: 3
            redeliveryDelay: 2000
            backOffMultiplier: 3
            steps:
              - to: "kafka:dlq.gdfkube.git-push?brokers=gdfkube-kafka-bootstrap.gdfkube-kafka:9092"`}
        </Code>
      </Card>
    </div>
  );
}


/* ─────────────────────────────────────────────────────
   6. HELM TEMPLATES
   ───────────────────────────────────────────────────── */
function HelmSection() {
  return (
    <div style={{padding: "24px 28px 48px", maxWidth: 1200, margin: "0 auto"}}>
      <PageHead
        title="Helm Template Engine Design"
        sub="Helm is used strictly as a template engine — no releases, no state. Camel calls `helm template` to render manifests from CDC-derived values."
      />

      <InfoBox>
        Each form type (<code>formId</code>) maps to a Helm chart. Charts live in <code>/opt/charts/</code> inside the Camel container image. The <code>values.yaml</code> is dynamically generated by the <code>helmValuesBuilder</code> bean from the CDC event payload.
      </InfoBox>

      {/* Chart structure */}
      <Card title="Chart Directory Layout" style={{marginTop: 16}}>
        <div style={{display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18}}>
          <div>
            <div style={{fontSize: 12, fontWeight: 600, color: "var(--ink-700)", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.05em"}}>Chart: cluster-request</div>
            <Code lang="tree">
{`/opt/charts/cluster-request/
├── Chart.yaml
├── values.yaml              # Default values (overridden by Camel)
└── templates/
    ├── _helpers.tpl          # Naming conventions, labels
    ├── hostedcluster.yaml    # HyperShift HostedCluster
    ├── nodepool.yaml         # HyperShift NodePool
    ├── managedcluster.yaml   # RHACM ManagedCluster
    └── etcd-encryption.yaml  # Encryption secret`}
            </Code>
          </div>
          <div>
            <div style={{fontSize: 12, fontWeight: 600, color: "var(--ink-700)", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.05em"}}>Chart: org-infra (pushed to gdfkube-infra)</div>
            <Code lang="tree">
{`/opt/charts/org-infra/
├── Chart.yaml
├── values.yaml
└── templates/
    ├── _helpers.tpl
    ├── appproject.yaml         # ArgoCD AppProject
    ├── applicationset.yaml     # ArgoCD ApplicationSet
    ├── managedclusterset.yaml  # RHACM ManagedClusterSet
    └── binding.yaml            # RHACM ClusterSetBinding`}
            </Code>
          </div>
          <div>
            <div style={{fontSize: 12, fontWeight: 600, color: "var(--ink-700)", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.05em"}}>Charts for other forms</div>
            <Code lang="tree">
{`/opt/charts/namespace-request/
├── Chart.yaml
├── values.yaml
└── templates/
    ├── _helpers.tpl
    ├── namespace.yaml
    └── resourcequota.yaml

/opt/charts/scale-request/
├── Chart.yaml
├── values.yaml
└── templates/
    ├── _helpers.tpl
    └── nodepool-patch.yaml`}
            </Code>
          </div>
        </div>
      </Card>

      <div style={{marginTop: 16}}>
        <InfoBox type="warn">
          The <code>org-infra</code> chart is only rendered during <strong>new-org bootstrap</strong>. It produces manifests that Camel pushes to <code>gdfkube-infra/argocd/orgs/{'{org}'}/</code> and <code>gdfkube-infra/rhacm/orgs/{'{org}'}/</code>. Subsequent cluster requests only use the <code>cluster-request</code> chart targeting <code>gdfkube-{'{org}'}</code>.
        </InfoBox>
      </div>

      {/* Values mapping */}
      <Card title="CDC → Helm Values Mapping" pill={<Pill>helmValuesBuilder bean</Pill>} style={{marginTop: 16}}>
        <p style={{fontSize: 12.5, color: "var(--ink-600)", margin: "0 0 14px", lineHeight: 1.5}}>
          The <code>helmValuesBuilder</code> Camel bean transforms the flat CDC JSON payload into a structured <code>values.yaml</code> that Helm charts consume.
        </p>
        <Code lang="yaml — generated values.yaml (cluster-request example)">
{`# Auto-generated by helmValuesBuilder — DO NOT EDIT
# Request: 01HQ3K5M7N8P9Q0R1S2T3U4V5W
# Form:    cluster-request
# Time:    2026-04-27T09:14:22.103Z

meta:
  requestId:        "01HQ3K5M7N8P9Q0R1S2T3U4V5W"
  requesterName:    "joao.silva"
  requesterFullName: "João Silva"
  requesterEmail:   "joao.silva@saude.gov"
  requesterRole:    "operator"
  requesterGroupName: "saude"
  submittedAt:      "2026-04-27T09:14:22.103Z"
  correlationId:    "01HQ3K5M7N8P9Q0R1S2T3U4V5W"
  formId:           "cluster-request"

vars:
  clusterName:      "vacinacao"
  environment:      "production"
  nodeCount:        3

# System-injected values (not from form)
system:
  platform:
    baseDomain:     "gdfkube.gov.local"
    releaseImage:   "quay.io/openshift-release-dev/ocp-release:4.16.7-x86_64"
    pullSecretName: "pull-secret"
  naming:
    prefix:         "hc"
    namespace:      "clusters"
    fullName:       "hc-saude-vacinacao"    # {prefix}-{org}-{clusterName}
  gitea:
    externalUrl:    "https://gitea-gitea.apps.gdfkube.gov"   # Route URL
    owner:          "gdfkube"                                 # Gitea org
  git:
    repoName:       "gdfkube-saude"
    infraRepoName:  "gdfkube-infra"
    targetPath:     "clusters/vacinacao/"
  labels:
    # Clusterset membership (exclusive, required by RHACM)
    "cluster.open-cluster-management.io/clusterset": "saude"
    # Standard RHACM labels
    "name":                  "vacinacao"
    # SETIC identification labels (for Placement selectors)
    "setic.gov.br/managed":  "true"
    "setic.gov.br/customer": "saude"
    "setic.gov.br/cluster":  "vacinacao"
    # gdfkube tracking labels
    "gdfkube.io/managed":      "true"
    "gdfkube.io/organization": "saude"
    "gdfkube.io/cluster":      "vacinacao"
    "gdfkube.io/form-type":    "cluster-request"
    "gdfkube.io/env":          "production"
    "gdfkube.io/request-id":   "01HQ3K5M7N8P9Q0R1S2T3U4V5W"
  annotations:
    # HyperShift auto-import (required for hosted mode klusterlet)
    "import.open-cluster-management.io/klusterlet-deploy-mode": "Hosted"
    "import.open-cluster-management.io/hosting-cluster-name":   "local-cluster"
    "open-cluster-management/created-via":                      "hypershift"`}
        </Code>
      </Card>

      {/* Chart.yaml */}
      <Card title="Chart.yaml" style={{marginTop: 16}}>
        <Code lang="yaml — Chart.yaml (cluster-request)">
{`apiVersion: v2
name: cluster-request
description: >
  Renders HyperShift HostedCluster, NodePool, ManagedCluster, and
  ArgoCD ApplicationSet manifests for the gdfkube provisioning pipeline.
  Invoked by Camel as a template engine — no releases are created.
type: application
version: 0.1.0
appVersion: "4.16.7"
keywords:
  - gdfkube
  - hypershift
  - openshift
maintainers:
  - name: Platform Engineering
    email: platform@setic.gov`}
        </Code>
      </Card>

      {/* Template example */}
      <Card title="Template: hostedcluster.yaml" pill={<Pill color="green">Key manifest</Pill>} style={{marginTop: 16}}>
        <Code lang="yaml — templates/hostedcluster.yaml">
{`{{- /*
  Renders a HyperShift HostedCluster from CDC-derived values.
  Invoked: helm template cluster-request /opt/charts/cluster-request -f values.yaml
*/ -}}
apiVersion: hypershift.openshift.io/v1beta1
kind: HostedCluster
metadata:
  name: {{ .Values.system.naming.fullName }}
  namespace: {{ .Values.system.naming.namespace }}
  labels:
    {{- range $k, $v := .Values.system.labels }}
    {{ $k }}: {{ $v | quote }}
    {{- end }}
  annotations:
    {{- range $k, $v := .Values.system.annotations }}
    {{ $k }}: {{ $v | quote }}
    {{- end }}
    gdfkube.io/submitted-at: {{ .Values.meta.submittedAt | quote }}
    gdfkube.io/requester: {{ .Values.meta.requesterName | quote }}
spec:
  release:
    image: {{ .Values.system.platform.releaseImage }}
  pullSecret:
    name: {{ .Values.system.platform.pullSecretName }}
  platform:
    type: KubeVirt
    kubevirt:
      baseDomain: {{ .Values.system.platform.baseDomain }}
  services:
    - service: APIServer
      servicePublishingStrategy:
        type: LoadBalancer
    - service: OAuthServer
      servicePublishingStrategy:
        type: Route
    - service: Ignition
      servicePublishingStrategy:
        type: Route
  networking:
    clusterNetwork:
      - cidr: 10.132.0.0/14
    serviceNetwork:
      - cidr: 172.31.0.0/16
  {{- if eq .Values.vars.environment "production" }}
  controllerAvailabilityPolicy: HighlyAvailable
  {{- else }}
  controllerAvailabilityPolicy: SingleReplica
  {{- end }}`}
        </Code>
      </Card>

      {/* Helpers */}
      <Card title="Template: _helpers.tpl" style={{marginTop: 16}}>
        <Code lang="yaml — templates/_helpers.tpl">
{`{{/*
  Canonical resource name: hc-{org}-{clusterName}
*/}}
{{- define "gdfkube.fullName" -}}
{{ .Values.system.naming.fullName }}
{{- end -}}

{{/*
  Standard labels applied to all resources
*/}}
{{- define "gdfkube.labels" -}}
{{- range $k, $v := .Values.system.labels }}
{{ $k }}: {{ $v | quote }}
{{- end }}
app.kubernetes.io/managed-by: gdfkube-pipeline
app.kubernetes.io/part-of: gdfkube
helm.sh/chart: {{ .Chart.Name }}-{{ .Chart.Version }}
{{- end -}}

{{/*
  Standard annotations (includes HyperShift auto-import)
*/}}
{{- define "gdfkube.annotations" -}}
{{- range $k, $v := .Values.system.annotations }}
{{ $k }}: {{ $v | quote }}
{{- end }}
gdfkube.io/submitted-at: {{ .Values.meta.submittedAt | quote }}
gdfkube.io/requester: {{ .Values.meta.requesterName | quote }}
{{- end -}}

{{/*
  Gitea repo URL helper
*/}}
{{- define "gdfkube.repoURL" -}}
{{ .Values.system.gitea.externalUrl }}/{{ .Values.system.gitea.owner }}/{{ .Values.system.git.repoName }}.git
{{- end -}}

{{/*
  Environment-aware RHACM policy set
*/}}
{{- define "gdfkube.policySet" -}}
{{- if eq .Values.vars.environment "production" -}}
strict
{{- else if eq .Values.vars.environment "staging" -}}
moderate
{{- else -}}
permissive
{{- end -}}
{{- end -}}`}
        </Code>
      </Card>
    </div>
  );
}


/* ─────────────────────────────────────────────────────
   7. GIT REPO STRUCTURE
   ───────────────────────────────────────────────────── */
function GitSection() {
  return (
    <div style={{padding: "24px 28px 48px", maxWidth: 1200, margin: "0 auto"}}>
      <PageHead
        title="Git Repository Structure"
        sub="Per-organization customer repos following a directory-based structure for ArgoCD ApplicationSet discovery."
      />

      <InfoBox>
        Git server is abstracted — current implementation targets Gitea but the Camel route uses standard Git operations (JGit) compatible with any Git remote. Credentials are managed via Kubernetes Secrets.
      </InfoBox>

      {/* Repo bootstrap */}
      <Card title="First-Request Repo Bootstrap" pill={<Pill color="amber">Auto-creation</Pill>} style={{marginTop: 16}}>
        <p style={{fontSize: 12.5, color: "var(--ink-600)", margin: "0 0 14px", lineHeight: 1.5}}>
          When the first request arrives for an organization that has no Git repo yet, the Camel <code>repo-bootstrap</code> sub-route automatically creates and scaffolds it. This handles the cold-start scenario without manual intervention.
        </p>
        <div style={{display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18}}>
          <div>
            <div style={{fontSize: 12, fontWeight: 600, color: "var(--ink-700)", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.05em"}}>Bootstrap Flow</div>
            <div style={{display: "flex", flexDirection: "column", gap: 10}}>
              {[
                ["1. Check existence", "Camel sends GET to Git server API: /api/v1/repos/gdfkube/gdfkube-{org}"],
                ["2. 404 → Create",    "If the repo doesn't exist (HTTP 404), POST to /api/v1/orgs/gdfkube/repos to create it with auto_init=true"],
                ["3. Clone fresh repo","Clone the newly created repo (which has only the auto-generated README)"],
                ["4. Write scaffold",  "The repoScaffolder bean writes the directory structure: clusters/, namespaces/, scale-patches/, baseline/overlays/{dev,staging,prod}"],
                ["5. Commit & push",   "Commits scaffold with message '[gdfkube] Bootstrap org repo for {org}' and pushes to main"],
                ["6. Render org-infra","Helm renders org-infra chart → AppProject, ApplicationSet, ManagedClusterSet, Binding"],
                ["7. Push to infra",   "Commits rendered infra manifests to gdfkube-infra/argocd/orgs/{org}/ and rhacm/orgs/{org}/"],
                ["8. Continue",        "Control returns to git-push, which clones the now-existing customer repo and proceeds normally"],
              ].map(([t, d], i) => (
                <div key={i} style={{display: "flex", gap: 10, alignItems: "flex-start"}}>
                  <div style={{width: 20, height: 20, borderRadius: "50%", background: "var(--amber-100)", color: "var(--amber-700)", display: "grid", placeItems: "center", fontSize: 10, fontWeight: 700, flexShrink: 0}}>{i + 1}</div>
                  <div>
                    <span style={{fontSize: 12.5, fontWeight: 600, color: "var(--ink-800)"}}>{t}: </span>
                    <span style={{fontSize: 12.5, color: "var(--ink-600)"}}>{d}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div>
            <div style={{fontSize: 12, fontWeight: 600, color: "var(--ink-700)", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.05em"}}>Scaffold structure (created by repoScaffolder)</div>
            <Code lang="tree">
{`gdfkube-{org}/                    # Newly created
├── README.md                      # Auto-generated description
├── clusters/
│   └── .gitkeep
├── namespaces/
│   └── .gitkeep
├── scale-patches/
│   └── .gitkeep
└── baseline/
    └── overlays/
        ├── development/
        │   └── .gitkeep
        ├── staging/
        │   └── .gitkeep
        └── production/
            └── .gitkeep`}
            </Code>
            <div style={{marginTop: 14}}>
              <InfoBox type="warn">
                The bootstrap is <strong>idempotent</strong> — if the repo already exists (HTTP 200), the step is skipped entirely. Concurrent first-requests from the same org are safe: the second request will find the repo already created and proceed to clone.
              </InfoBox>
            </div>
          </div>
        </div>
      </Card>

      {/* Repo layout */}
      <Card title="Repository Layout" pill={<Pill>Per-org · ArgoCD ApplicationSet</Pill>} style={{marginTop: 16}}>
        <div style={{display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18}}>
          <div>
            <div style={{fontSize: 12, fontWeight: 600, color: "var(--ink-700)", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.05em"}}>Example: gdfkube-saude</div>
            <Code lang="tree">
{`gdfkube-saude/                          # Org-level repo
├── README.md
├── clusters/
│   ├── vacinacao/                       # One dir per cluster
│   │   ├── hostedcluster.yaml
│   │   ├── nodepool.yaml
│   │   ├── managedcluster.yaml
│   │   ├── managedclusterset.yaml
│   │   └── applicationset.yaml
│   ├── epidemiologia/
│   │   ├── hostedcluster.yaml
│   │   └── ...
│   └── agendamento-v2/
│       └── ...                          # Created by pipeline
├── namespaces/
│   ├── vacinacao-prod/
│   │   ├── namespace.yaml
│   │   └── resourcequota.yaml
│   └── ...
├── scale-patches/
│   └── vacinacao-workers-patch.yaml     # NodePool scale patches
└── baseline/
    └── overlays/
        ├── development/
        ├── staging/
        └── production/                  # Helm-rendered overlays`}
            </Code>
          </div>
          <div>
            <div style={{fontSize: 12, fontWeight: 600, color: "var(--ink-700)", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.05em"}}>Repo-per-org naming</div>
            <table style={{width: "100%", borderCollapse: "collapse", marginBottom: 16}}>
              <thead><TableRow header cells={["Organization", "Repo Name", "Git URL"]} /></thead>
              <tbody>
                {[
                  ["Saúde",       "gdfkube-saude",       "git.gdfkube.gov/gdfkube-saude.git"],
                  ["Educação",    "gdfkube-educacao",    "git.gdfkube.gov/gdfkube-educacao.git"],
                  ["Transportes", "gdfkube-transportes", "git.gdfkube.gov/gdfkube-transportes.git"],
                  ["Fazenda",     "gdfkube-fazenda",     "git.gdfkube.gov/gdfkube-fazenda.git"],
                  ["Agricultura", "gdfkube-agricultura", "git.gdfkube.gov/gdfkube-agricultura.git"],
                  ["Segurança",   "gdfkube-seguranca",   "git.gdfkube.gov/gdfkube-seguranca.git"],
                ].map((r, i) => <TableRow key={i} cells={r} mono={[1, 2]} />)}
              </tbody>
            </table>

            <div style={{fontSize: 12, fontWeight: 600, color: "var(--ink-700)", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.05em"}}>Directory mapping by formId</div>
            <table style={{width: "100%", borderCollapse: "collapse"}}>
              <thead><TableRow header cells={["formId", "Target Directory", "Key from vars"]} /></thead>
              <tbody>
                {[
                  ["cluster-request",   "clusters/{clusterName}/",             "vars.clusterName"],
                  ["namespace-request", "namespaces/{namespaceName}/",         "vars.namespaceName"],
                  ["scale-request",     "scale-patches/",                      "vars.clusterName"],
                ].map((r, i) => <TableRow key={i} cells={r} mono={[0, 1, 2]} />)}
              </tbody>
            </table>
          </div>
        </div>
      </Card>

      {/* Commit conventions */}
      <Card title="Commit Conventions" style={{marginTop: 16}}>
        <Code lang="text — commit message format">
{`[gdfkube] REQ{requestId}: {action} {resourceName} ({formId})

Examples:
  [gdfkube] REQ01HQ3K5M7N: provision vacinacao (cluster-request)
  [gdfkube] REQ01HQ3F1G2H: onboard tributos-api (namespace-request)
  [gdfkube] REQ01HQ3N4R5S: scale tracking-frota workers 2→5 (scale-request)`}
        </Code>

        <div style={{marginTop: 14, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16}}>
          <div>
            <div style={{fontSize: 12, fontWeight: 600, color: "var(--ink-700)", marginBottom: 6}}>Git author</div>
            <Code>{`Author: gdfkube-pipeline <platform@setic.gov>\nCommitter: gdfkube-pipeline <platform@setic.gov>`}</Code>
          </div>
          <div>
            <div style={{fontSize: 12, fontWeight: 600, color: "var(--ink-700)", marginBottom: 6}}>Branch strategy</div>
            <p style={{fontSize: 12.5, color: "var(--ink-600)", margin: 0, lineHeight: 1.55}}>
              All commits go to <code>main</code>. No feature branches — the pipeline is the only writer. ArgoCD watches <code>HEAD</code> of <code>main</code>. For rollback, ArgoCD's sync-to-revision or <code>git revert</code> via the DLQ handler.
            </p>
          </div>
        </div>
      </Card>

      {/* gdfkube-infra repo */}
      <Card title="Repository: gdfkube-infra" pill={<Pill color="blue">Platform · Shared</Pill>} style={{marginTop: 16}}>
        <p style={{fontSize: 12.5, color: "var(--ink-600)", margin: "0 0 14px", lineHeight: 1.5}}>
          A single shared repository holding platform-level resources: ArgoCD AppProjects, ApplicationSets, RHACM ManagedClusterSets, and RBAC ClusterRoles. Created manually once. Camel writes per-org directories here during org bootstrap.
        </p>
        <div style={{display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18}}>
          <div>
            <Code lang="tree">
{`gdfkube-infra/                           # Shared platform repo
├── argocd/
│   ├── discovery/
│   │   └── org-repos-discovery.yaml     # Bootstrap ApplicationSet
│   └── orgs/
│       ├── saude/                        # Camel-generated
│       │   ├── appproject.yaml
│       │   └── applicationset.yaml
│       ├── educacao/
│       │   ├── appproject.yaml
│       │   └── applicationset.yaml
│       └── .../
├── rhacm/
│   └── orgs/
│       ├── saude/                        # Camel-generated
│       │   ├── managedclusterset.yaml
│       │   └── binding.yaml
│       ├── educacao/
│       │   └── ...
│       └── .../
└── rbac/
    ├── setic-platform-admin.yaml
    └── setic-operator.yaml`}
            </Code>
          </div>
          <div>
            <div style={{fontSize: 12, fontWeight: 600, color: "var(--ink-700)", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.05em"}}>Ownership</div>
            <table style={{width: "100%", borderCollapse: "collapse"}}>
              <thead><TableRow header cells={["Path", "Created By", "Purpose"]} /></thead>
              <tbody>
                {[
                  ["argocd/discovery/",       "Manual (once)",  "Bootstrap ApplicationSet that discovers per-org dirs"],
                  ["argocd/orgs/{org}/",      "Camel pipeline", "Per-org AppProject + ApplicationSet"],
                  ["rhacm/orgs/{org}/",       "Camel pipeline", "Per-org ManagedClusterSet + Binding"],
                  ["rbac/",                   "Manual (once)",  "Platform ClusterRoles"],
                ].map((r, i) => <TableRow key={i} cells={r} mono={[0]} />)}
              </tbody>
            </table>

            <div style={{marginTop: 14}}>
              <InfoBox>
                The <code>org-repos-discovery</code> ApplicationSet uses project <code>gdfkube-platform</code> (not <code>default</code>) and discovers directories under <code>argocd/orgs/*</code>. When Camel adds a new org directory, ArgoCD automatically creates an <code>infra-{'{org}'}</code> Application that syncs the org's platform resources.
              </InfoBox>
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}


/* ─────────────────────────────────────────────────────
   8. ARGOCD & RHACM
   ───────────────────────────────────────────────────── */
function ArgoCDSection() {
  return (
    <div style={{padding: "24px 28px 48px", maxWidth: 1200, margin: "0 auto"}}>
      <PageHead
        title="ArgoCD & RHACM Configuration"
        sub="Single ArgoCD instance on the hub cluster with per-org AppProjects. Flat RHACM ManagedClusterSet model with exclusive label-based membership."
      />

      <InfoBox>
        ArgoCD runs in the <code>openshift-gitops</code> namespace on the hub cluster. RHACM is the fleet management layer. Both are configured via GitOps — Camel renders Helm templates into <code>gdfkube-infra</code> and ArgoCD self-syncs.
      </InfoBox>

      {/* ArgoCD Architecture */}
      <Card title="ArgoCD Architecture" pill={<Pill color="green">GitOps</Pill>} style={{marginTop: 16}}>
        <div style={{display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18}}>
          <div>
            <div style={{fontSize: 12, fontWeight: 600, color: "var(--ink-700)", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.05em"}}>Design</div>
            <div style={{display: "flex", flexDirection: "column", gap: 10}}>
              {[
                ["Single instance", "One ArgoCD on the hub cluster (openshift-gitops). No per-org ArgoCD installations."],
                ["gdfkube-platform AppProject", "Bootstrap/discovery tier. Impersonates argocd-platform-manager. Owns the org-infra-discovery ApplicationSet."],
                ["Per-org AppProject", "Each org gets an isolated AppProject scoped to its sourceRepo and destination namespace (hc-{org})."],
                ["Per-org ApplicationSet", "Git directory generator watching clusters/* in gdfkube-{org}. Auto-creates Applications per cluster directory."],
                ["Auto-sync disabled", "Customer manifests require manual sync approval. Pull secrets are distributed by RHACM ConfigurationPolicy — operators review before applying."],
                ["Bootstrap discovery", "org-repos-discovery ApplicationSet watches argocd/orgs/* in gdfkube-infra. New org dir → automatic infra-{org} Application."],
              ].map(([t, d], i) => (
                <div key={i} style={{display: "flex", gap: 10, alignItems: "flex-start"}}>
                  <div style={{width: 20, height: 20, borderRadius: "50%", background: "var(--civic-50)", color: "var(--civic-500)", display: "grid", placeItems: "center", fontSize: 10, fontWeight: 700, flexShrink: 0}}>{i + 1}</div>
                  <div>
                    <span style={{fontSize: 12.5, fontWeight: 600, color: "var(--ink-800)"}}>{t}: </span>
                    <span style={{fontSize: 12.5, color: "var(--ink-600)"}}>{d}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div>
            <div style={{fontSize: 12, fontWeight: 600, color: "var(--ink-700)", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.05em"}}>Resource Flow</div>
            <Code lang="text">
{`gdfkube-infra (hub)
│
├─ argocd/discovery/org-repos-discovery.yaml
│  └─ ApplicationSet (project: gdfkube-platform)
│     └─ Discovers: argocd/orgs/*
│        └─ Creates: infra-{org} Application
│           └─ Syncs: argocd/orgs/{org}/ + rhacm/orgs/{org}/
│
├─ argocd/orgs/saude/
│  ├─ appproject.yaml      → AppProject "saude"
│  └─ applicationset.yaml  → ApplicationSet "clusters-saude"
│     └─ Discovers: clusters/* in gdfkube-saude
│        └─ Creates: saude-{cluster} Application
│
gdfkube-saude (customer)
├─ clusters/vacinacao/
│  ├─ hostedcluster.yaml   ← Synced by "saude-vacinacao" App
│  ├─ nodepool.yaml
│  └─ managedcluster.yaml`}
            </Code>
          </div>
        </div>
      </Card>

      {/* AppProject template */}
      <Card title="Helm Template: appproject.yaml" pill={<Pill>org-infra chart</Pill>} style={{marginTop: 16}}>
        <Code lang="yaml — /opt/charts/org-infra/templates/appproject.yaml">
{`apiVersion: argoproj.io/v1alpha1
kind: AppProject
metadata:
  name: {{ .Values.meta.requesterGroupName }}
  namespace: openshift-gitops
  labels:
    {{- include "gdfkube.labels" . | nindent 4 }}
spec:
  sourceRepos:
    - '{{ include "gdfkube.repoURL" . }}'
  destinations:
    - namespace: 'hc-{{ .Values.meta.requesterGroupName }}'
      server: 'https://kubernetes.default.svc'
  clusterResourceWhitelist:
    - group: ''
      kind: 'Namespace'
    - group: 'cluster.open-cluster-management.io'
      kind: 'ManagedCluster'
  namespaceResourceWhitelist:
    - group: 'hypershift.openshift.io'
      kind: 'HostedCluster'
    - group: 'hypershift.openshift.io'
      kind: 'NodePool'
    - group: ''
      kind: 'Secret'
    - group: ''
      kind: 'ConfigMap'
  destinationServiceAccounts:
    - server: 'https://kubernetes.default.svc'
      namespace: 'hc-{{ .Values.meta.requesterGroupName }}'
      defaultServiceAccount: 'local-cluster:argocd-manager'
    - server: 'https://kubernetes.default.svc'
      namespace: '*'
      defaultServiceAccount: 'local-cluster:argocd-manager'`}
        </Code>
      </Card>

      {/* ApplicationSet template */}
      <Card title="Helm Template: applicationset.yaml" pill={<Pill>org-infra chart</Pill>} style={{marginTop: 16}}>
        <p style={{fontSize: 12.5, color: "var(--ink-600)", margin: "0 0 14px", lineHeight: 1.5}}>
          Per-org ApplicationSet with Git directory generator. <strong>No auto-sync</strong> — operators must manually approve syncs for cluster provisioning resources.
        </p>
        <Code lang="yaml — /opt/charts/org-infra/templates/applicationset.yaml">
{`apiVersion: argoproj.io/v1alpha1
kind: ApplicationSet
metadata:
  name: clusters-{{ .Values.meta.requesterGroupName }}
  namespace: openshift-gitops
  labels:
    {{- include "gdfkube.labels" . | nindent 4 }}
spec:
  generators:
    - git:
        repoURL: {{ include "gdfkube.repoURL" . }}
        directories:
          - path: 'clusters/*'
  template:
    metadata:
      name: '{{ .Values.meta.requesterGroupName }}-{{"{{"}}path.basename{{"}}"}}'
    spec:
      project: {{ .Values.meta.requesterGroupName }}
      source:
        repoURL: {{ include "gdfkube.repoURL" . }}
        path: '{{"{{"}}path{{"}}"}}'
      destination:
        namespace: 'hc-{{ .Values.meta.requesterGroupName }}'
      syncPolicy: {}    # No auto-sync — manual approval required`}
        </Code>
      </Card>

      {/* RHACM */}
      <Card title="RHACM ManagedClusterSet Model" pill={<Pill color="amber">Flat · Per-org</Pill>} style={{marginTop: 16}}>
        <div style={{display: "grid", gridTemplateColumns: "1.2fr 1fr", gap: 18}}>
          <div>
            <Code lang="text — cluster set topology">
{`┌─────────────────────────────────────────────────────┐
│              PER-ORG CLUSTERSET TIER                 │
│  ┌───────────┐  ┌───────────┐  ┌───────────┐       │
│  │   saude   │  │ educacao  │  │transportes│       │
│  ├───────────┤  ├───────────┤  ├───────────┤       │
│  │ vacinacao │  │ matriculas│  │ frota     │       │
│  │ prontuario│  │ notas     │  │ bilhetagem│       │
│  │ farmacia  │  │           │  │           │       │
│  └───────────┘  └───────────┘  └───────────┘       │
│                                                      │
│  Clusters join via label:                            │
│  cluster.open-cluster-management.io/clusterset={org} │
└─────────────────────────────────────────────────────┘

Hub cluster: local-cluster → built-in "default" ClusterSet`}
            </Code>

            <div style={{marginTop: 14}}>
              <InfoBox type="warn">
                <strong>RHACM limitation:</strong> <code>selectorType: LabelSelector</code> is NOT supported for user-created ManagedClusterSets. Only the built-in <code>default</code> and <code>global</code> sets support it. Achieve dynamic label-based cluster selection via <strong>Placement</strong> resources instead.
              </InfoBox>
            </div>
          </div>
          <div>
            <div style={{fontSize: 12, fontWeight: 600, color: "var(--ink-700)", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.05em"}}>Design decisions</div>
            <div style={{display: "flex", flexDirection: "column", gap: 10}}>
              {[
                ["Flat model", "Only per-org ManagedClusterSets. No global fleet-wide ClusterSet."],
                ["Exclusive membership", "Each cluster belongs to exactly ONE ClusterSet (RHACM enforces). Set via explicit clusterset label."],
                ["Pre-created ManagedCluster", "Camel pre-creates the ManagedCluster resource via GitOps before the HostedCluster control plane is available. The hypershift-addon-agent uses Get-then-Create — if it already exists, labels are preserved."],
                ["Fleet-wide targeting", "Via Placement label selectors (setic.gov.br/managed: true), not a dedicated global ClusterSet."],
                ["Hub policies", "inject-pull-secret and similar policies are in open-cluster-management namespace, bound to the built-in default ClusterSet."],
              ].map(([t, d], i) => (
                <div key={i} style={{display: "flex", gap: 10, alignItems: "flex-start"}}>
                  <div style={{width: 20, height: 20, borderRadius: "50%", background: "var(--amber-100)", color: "var(--amber-700)", display: "grid", placeItems: "center", fontSize: 10, fontWeight: 700, flexShrink: 0}}>{i + 1}</div>
                  <div>
                    <span style={{fontSize: 12.5, fontWeight: 600, color: "var(--ink-800)"}}>{t}: </span>
                    <span style={{fontSize: 12.5, color: "var(--ink-600)"}}>{d}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </Card>

      {/* ManagedClusterSet template */}
      <Card title="Helm Template: managedclusterset.yaml" pill={<Pill>org-infra chart</Pill>} style={{marginTop: 16}}>
        <Code lang="yaml — /opt/charts/org-infra/templates/managedclusterset.yaml">
{`apiVersion: cluster.open-cluster-management.io/v1beta2
kind: ManagedClusterSet
metadata:
  name: {{ .Values.meta.requesterGroupName }}
  labels:
    gdfkube.io/managed: "true"
    gdfkube.io/organization: {{ .Values.meta.requesterGroupName | quote }}
    gdfkube.io/infra-type: "managedclusterset"
    {{- include "gdfkube.labels" . | nindent 4 }}
spec:
  clusterSelector:
    selectorType: ExclusiveClusterSetLabel`}
        </Code>
      </Card>

      {/* ManagedCluster labels */}
      <Card title="ManagedCluster Label Schema" pill={<Pill color="green">Pre-created by Camel</Pill>} style={{marginTop: 16}}>
        <p style={{fontSize: 12.5, color: "var(--ink-600)", margin: "0 0 14px", lineHeight: 1.5}}>
          All hosted clusters receive these labels and annotations, rendered by the <code>cluster-request</code> Helm chart's <code>managedcluster.yaml</code> template. Pre-creating the ManagedCluster ensures correct clusterset membership from the start.
        </p>
        <Code lang="yaml — rendered managedcluster.yaml (example: vacinacao)">
{`apiVersion: cluster.open-cluster-management.io/v1
kind: ManagedCluster
metadata:
  name: vacinacao
  labels:
    # Clusterset membership (required, exclusive)
    cluster.open-cluster-management.io/clusterset: "saude"

    # Standard RHACM labels
    name: "vacinacao"
    cloud: auto-detect
    vendor: auto-detect

    # SETIC identification labels (for Placement selectors)
    setic.gov.br/managed: "true"
    setic.gov.br/customer: "saude"
    setic.gov.br/cluster: "vacinacao"

    # gdfkube tracking labels
    gdfkube.io/managed: "true"
    gdfkube.io/organization: "saude"
    gdfkube.io/cluster: "vacinacao"
    gdfkube.io/form-type: "cluster-request"

  annotations:
    # HyperShift auto-import (required for hosted mode klusterlet)
    import.open-cluster-management.io/klusterlet-deploy-mode: "Hosted"
    import.open-cluster-management.io/hosting-cluster-name: "local-cluster"
    open-cluster-management/created-via: "hypershift"
spec:
  hubAcceptsClient: true`}
        </Code>
      </Card>

      {/* Placement examples */}
      <Card title="Placement Examples" style={{marginTop: 16}}>
        <div style={{display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18}}>
          <div>
            <div style={{fontSize: 12, fontWeight: 600, color: "var(--ink-700)", marginBottom: 8}}>Hub-only targeting</div>
            <Code lang="yaml">
{`apiVersion: cluster.open-cluster-management.io/v1beta1
kind: Placement
metadata:
  name: placement-hub-cluster
  namespace: open-cluster-management
spec:
  clusterSets:
    - default
  predicates:
    - requiredClusterSelector:
        labelSelector:
          matchLabels:
            local-cluster: "true"`}
            </Code>
          </div>
          <div>
            <div style={{fontSize: 12, fontWeight: 600, color: "var(--ink-700)", marginBottom: 8}}>Fleet-wide targeting</div>
            <Code lang="yaml">
{`apiVersion: cluster.open-cluster-management.io/v1beta1
kind: Placement
metadata:
  name: all-managed-clusters
  namespace: open-cluster-management
spec:
  predicates:
    - requiredClusterSelector:
        labelSelector:
          matchLabels:
            setic.gov.br/managed: "true"`}
            </Code>
          </div>
        </div>
      </Card>
    </div>
  );
}


/* ─────────────────────────────────────────────────────
   8b. SECRET HANDLING
   ───────────────────────────────────────────────────── */
function SecretsSection() {
  return (
    <div style={{padding: "24px 28px 48px", maxWidth: 1200, margin: "0 auto"}}>
      <PageHead
        title="HyperShift Secret Handling"
        sub="How RHACM ConfigurationPolicy distributes provider credentials (pull secret + SSH key) to hosted control plane namespaces."
      />

      <InfoBox>
        HyperShift HostedCluster requires two secrets in the same namespace: a <strong>pull secret</strong> (<code>kubernetes.io/dockerconfigjson</code>) and an <strong>SSH key</strong> (<code>Opaque</code>). Without automation, operators must manually copy these into every <code>hc-*</code> namespace.
      </InfoBox>

      {/* Problem & solution overview */}
      <Card title="Credential Flow" pill={<Pill color="green">RHACM ConfigurationPolicy</Pill>} style={{marginTop: 16}}>
        <div style={{display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18}}>
          <div>
            <div style={{fontSize: 12, fontWeight: 600, color: "var(--ink-700)", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.05em"}}>How it works</div>
            <div style={{display: "flex", flexDirection: "column", gap: 10}}>
              {[
                ["Central credential", "kubevirt-secret exists in open-cluster-management with pullSecret and ssh-publickey data keys"],
                ["Policy targets hub", "policy-inject-hc-pull-secret targets local-cluster via Placement + default ClusterSet"],
                ["Namespace selector", "ConfigurationPolicy namespaceSelector: include: [\"hc-*\"] matches all hosted cluster namespaces"],
                ["Hub template reads", "Hub templating reads kubevirt-secret.data.pullSecret (already base64-encoded)"],
                ["Secrets enforced", "Policy creates pull-secret and sshkey in each matching namespace"],
                ["Eventually consistent", "HyperShift operator retries until secrets appear — no ordering dependency on the pipeline"],
              ].map(([t, d], i) => (
                <div key={i} style={{display: "flex", gap: 10, alignItems: "flex-start"}}>
                  <div style={{width: 20, height: 20, borderRadius: "50%", background: "var(--civic-50)", color: "var(--civic-500)", display: "grid", placeItems: "center", fontSize: 10, fontWeight: 700, flexShrink: 0}}>{i + 1}</div>
                  <div>
                    <span style={{fontSize: 12.5, fontWeight: 600, color: "var(--ink-800)"}}>{t}: </span>
                    <span style={{fontSize: 12.5, color: "var(--ink-600)"}}>{d}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div>
            <Code lang="text — secret distribution flow">
{`┌─────────────────────────────────────────┐
│   open-cluster-management namespace     │
│                                         │
│   kubevirt-secret (source of truth)     │
│   ├─ pullSecret: <base64>              │
│   └─ ssh-publickey: <base64>           │
│                                         │
│   Labels:                               │
│   ├─ cluster.open-cluster-management.io │
│   │  /credentials: ""                   │
│   └─ cluster.open-cluster-management.io │
│      /type: kubevirt                    │
└──────────────────┬──────────────────────┘
                   │ RHACM ConfigurationPolicy
                   │ (hub template lookup)
          ┌────────┴────────┐
          ▼                 ▼
┌─────────────────┐ ┌─────────────────┐
│  hc-saude-      │ │  hc-educacao-   │
│  vacinacao      │ │  matriculas     │
│                 │ │                 │
│  pull-secret    │ │  pull-secret    │
│  sshkey         │ │  sshkey         │
└─────────────────┘ └─────────────────┘
      ... every hc-* namespace`}
            </Code>
          </div>
        </div>
      </Card>

      {/* Source credential */}
      <Card title="Source Credential: kubevirt-secret" style={{marginTop: 16}}>
        <p style={{fontSize: 12.5, color: "var(--ink-600)", margin: "0 0 14px", lineHeight: 1.5}}>
          Provider credentials are stored centrally in <code>open-cluster-management</code>. Both RHACM labels are <strong>required</strong> for the credential to be recognized.
        </p>
        <Code lang="yaml — kubevirt-secret (manually created once)">
{`apiVersion: v1
kind: Secret
metadata:
  name: kubevirt-secret
  namespace: open-cluster-management
  labels:
    cluster.open-cluster-management.io/credentials: ""
    cluster.open-cluster-management.io/type: kubevirt
type: Opaque
data:
  pullSecret: <base64-encoded-dockerconfigjson>
  ssh-publickey: <base64-encoded-ssh-key>`}
        </Code>
      </Card>

      {/* Injected secrets detail */}
      <Card title="Injected Secrets" style={{marginTop: 16}}>
        <table style={{width: "100%", borderCollapse: "collapse"}}>
          <thead><TableRow header cells={["", "Pull Secret", "SSH Key"]} /></thead>
          <tbody>
            {[
              ["Source data key",     "pullSecret",                       "ssh-publickey"],
              ["Target secret name",  "pull-secret",                      "sshkey"],
              ["Target secret type",  "kubernetes.io/dockerconfigjson",   "Opaque"],
              ["Target data key",     ".dockerconfigjson",                "id_rsa.pub"],
              ["Namespace selector",  "hc-*",                             "hc-*"],
              ["HostedCluster ref",   "spec.pullSecret.name",             "spec.sshKey.name"],
              ["Cleanup",             "pruneObjectBehavior: DeleteIfCreated", "pruneObjectBehavior: DeleteIfCreated"],
            ].map((r, i) => <TableRow key={i} cells={r} mono={[1, 2]} />)}
          </tbody>
        </table>
        <div style={{marginTop: 14}}>
          <InfoBox>
            Both target secrets carry the label <code>hypershift.openshift.io/safe-to-delete-with-cluster: "true"</code> so HyperShift cleans them up automatically during cluster deletion.
          </InfoBox>
        </div>
      </Card>

      {/* ConfigurationPolicy */}
      <Card title="RHACM Policy: inject-pull-secret" pill={<Pill>platform/rhacm/policies/</Pill>} style={{marginTop: 16}}>
        <p style={{fontSize: 12.5, color: "var(--ink-600)", margin: "0 0 14px", lineHeight: 1.5}}>
          A single RHACM Policy with two ConfigurationPolicies — one for pull-secret, one for sshkey. Uses hub templating to read the central credential and enforce copies in all <code>hc-*</code> namespaces.
        </p>
        <Code lang="yaml — inject-pull-secret.yaml (simplified)">
{`apiVersion: policy.open-cluster-management.io/v1
kind: Policy
metadata:
  name: policy-inject-hc-pull-secret
  namespace: open-cluster-management
  annotations:
    policy.open-cluster-management.io/categories: "CM Configuration Management"
    policy.open-cluster-management.io/standards: "gdfkube Platform Security"
spec:
  disabled: false
  remediationAction: enforce
  policy-templates:

    # ── Pull Secret ──
    - objectDefinition:
        apiVersion: policy.open-cluster-management.io/v1
        kind: ConfigurationPolicy
        metadata:
          name: inject-hc-pull-secret
        spec:
          remediationAction: enforce
          severity: high
          pruneObjectBehavior: DeleteIfCreated
          namespaceSelector:
            include: ["hc-*"]
          object-templates:
            - complianceType: musthave
              objectDefinition:
                apiVersion: v1
                kind: Secret
                metadata:
                  name: pull-secret
                  labels:
                    hypershift.openshift.io/safe-to-delete-with-cluster: "true"
                    gdfkube.io/managed: "true"
                type: kubernetes.io/dockerconfigjson
                data:
                  .dockerconfigjson: '{{hub (lookup "v1" "Secret"
                    "open-cluster-management" "kubevirt-secret").data.pullSecret hub}}'

    # ── SSH Key ──
    - objectDefinition:
        apiVersion: policy.open-cluster-management.io/v1
        kind: ConfigurationPolicy
        metadata:
          name: inject-hc-sshkey
        spec:
          remediationAction: enforce
          severity: high
          pruneObjectBehavior: DeleteIfCreated
          namespaceSelector:
            include: ["hc-*"]
          object-templates:
            - complianceType: musthave
              objectDefinition:
                apiVersion: v1
                kind: Secret
                metadata:
                  name: sshkey
                  labels:
                    hypershift.openshift.io/safe-to-delete-with-cluster: "true"
                    gdfkube.io/managed: "true"
                type: Opaque
                data:
                  id_rsa.pub: '{{hub (lookup "v1" "Secret"
                    "open-cluster-management" "kubevirt-secret").data.ssh-publickey hub}}'
---
# PlacementBinding + Placement targeting local-cluster
apiVersion: policy.open-cluster-management.io/v1
kind: PlacementBinding
metadata:
  name: binding-inject-hc-pull-secret
  namespace: open-cluster-management
placementRef:
  apiGroup: cluster.open-cluster-management.io
  kind: Placement
  name: placement-hub-cluster
subjects:
  - apiGroup: policy.open-cluster-management.io
    kind: Policy
    name: policy-inject-hc-pull-secret`}
        </Code>
      </Card>

      {/* Service accounts */}
      <Card title="Service Account Roles" style={{marginTop: 16}}>
        <p style={{fontSize: 12.5, color: "var(--ink-600)", margin: "0 0 14px", lineHeight: 1.5}}>
          Three native service accounts manage different aspects of the credential and cluster lifecycle. The pipeline does <strong>not</strong> manage secrets directly — RHACM handles distribution.
        </p>
        <table style={{width: "100%", borderCollapse: "collapse"}}>
          <thead><TableRow header cells={["Service Account", "Namespace", "Role"]} /></thead>
          <tbody>
            {[
              ["hypershift-addon-agent-sa",   "open-cluster-management-agent-addon", "Creates HostedClusters, manages secrets, provisions clusters"],
              ["hypershift-addon-manager-sa",  "multicluster-engine",                 "Manages hypershift addon lifecycle on hub"],
              ["provider-credential",          "multicluster-engine",                 "Syncs credential updates (get/list/update/watch/patch, NOT create)"],
              ["argocd-manager",               "local-cluster",                       "ArgoCD impersonation SA for sync operations (separate from RHACM SAs)"],
            ].map((r, i) => <TableRow key={i} cells={r} mono={[0, 1]} />)}
          </tbody>
        </table>
        <div style={{marginTop: 14}}>
          <InfoBox type="warn">
            <strong>Do not confuse RHACM and ArgoCD SAs:</strong> <code>hypershift-addon-agent-sa</code> is RHACM's native SA for addon lifecycle (HostedCluster creation, ManagedCluster auto-import, klusterlet deployment). <code>argocd-manager</code> is ArgoCD's impersonation SA for sync operations (all per-org AppProject syncs). These are separate mechanisms.
          </InfoBox>
        </div>
      </Card>

      {/* HostedCluster references */}
      <Card title="HostedCluster Secret References" pill={<Pill color="green">Helm template update</Pill>} style={{marginTop: 16}}>
        <p style={{fontSize: 12.5, color: "var(--ink-600)", margin: "0 0 14px", lineHeight: 1.5}}>
          The <code>cluster-request</code> Helm chart's <code>hostedcluster.yaml</code> template references the injected secret names. The HyperShift operator retries until the secrets appear — the pipeline does not need to wait for RHACM policy enforcement.
        </p>
        <Code lang="yaml — relevant spec fields in hostedcluster.yaml">
{`spec:
  pullSecret:
    name: pull-secret            # Injected by ConfigurationPolicy
  sshKey:
    name: sshkey                 # Injected by ConfigurationPolicy
  platform:
    type: KubeVirt
    kubevirt:
      baseDomain: {{ .Values.system.platform.baseDomain }}`}
        </Code>

        <div style={{marginTop: 14, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16}}>
          <InfoBox>
            The pipeline is <strong>decoupled</strong> from secret distribution. Camel renders and pushes manifests to Git. ArgoCD syncs them. RHACM policy independently ensures secrets exist. HyperShift retries. No coordination needed.
          </InfoBox>
          <InfoBox type="warn">
            This project does <strong>not</strong> use <code>HypershiftDeployment</code> CRs (which handle secret copying automatically). ArgoCD syncs raw HostedCluster manifests directly, so RHACM ConfigurationPolicy is the active mechanism.
          </InfoBox>
        </div>
      </Card>
    </div>
  );
}


/* ─────────────────────────────────────────────────────
   9. RBAC & ACCESS CONTROL
   ───────────────────────────────────────────────────── */
function RBACSection() {
  return (
    <div style={{padding: "24px 28px 48px", maxWidth: 1200, margin: "0 auto"}}>
      <PageHead
        title="RBAC & Access Control"
        sub="Hub-cluster permission model: SETIC administers, Camel writes, customers have zero hub access — they receive cluster-admin on their hosted clusters only."
      />

      {/* Permission model diagram */}
      <Card title="Permission Model" style={{marginTop: 16}}>
        <Code lang="text">
{`┌─────────────────────────────────────────────────────┐
│                    HUB CLUSTER                       │
│                                                      │
│  SETIC Access:                                       │
│  ├── setic-platform-admin — Full infrastructure      │
│  └── setic-operator — Read + sync operations         │
│                                                      │
│  Camel Access:                                       │
│  └── Write to gdfkube-infra + gdfkube-{org} repos    │
│      (Git credentials only, no kube API access)      │
│                                                      │
│  Customer Access: NONE                               │
└────────────────┬────────────────┬────────────────────┘
                 │                │
    ┌────────────▼──┐  ┌─────────▼────┐  ┌────────────┐
    │   HOSTED      │  │   HOSTED     │  │   HOSTED   │
    │   CLUSTER     │  │   CLUSTER    │  │   CLUSTER  │
    │   Customer:   │  │   Customer:  │  │   Customer:│
    │   cluster-    │  │   cluster-   │  │   cluster- │
    │   admin       │  │   admin      │  │   admin    │
    └───────────────┘  └──────────────┘  └────────────┘`}
        </Code>
      </Card>

      {/* Access matrix */}
      <Card title="Access Matrix" style={{marginTop: 16}}>
        <table style={{width: "100%", borderCollapse: "collapse"}}>
          <thead><TableRow header cells={["Resource", "SETIC Platform Admin", "SETIC Operator", "Customer", "Camel Pipeline"]} /></thead>
          <tbody>
            {[
              ["Hub cluster API",            "Full",        "Read + sync",  "None",          "None"],
              ["gdfkube-infra repo",         "Read/Write",  "Read",         "None",          "Write"],
              ["gdfkube-{org} repo",         "Read/Write",  "Read",         "None",          "Write"],
              ["ArgoCD UI",                  "Full",        "Read + sync",  "None",          "None"],
              ["Hosted cluster (kube API)",  "Full",        "Read",         "cluster-admin", "None"],
              ["RHACM Console",              "Full",        "Read",         "None",          "None"],
            ].map((r, i) => <TableRow key={i} cells={r} />)}
          </tbody>
        </table>
      </Card>

      {/* ClusterRoles */}
      <Card title="ClusterRoles" pill={<Pill color="gray">gdfkube-infra/rbac/</Pill>} style={{marginTop: 16}}>
        <div style={{display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18}}>
          <div>
            <div style={{fontSize: 12, fontWeight: 600, color: "var(--ink-700)", marginBottom: 8}}>setic-platform-admin</div>
            <p style={{fontSize: 12.5, color: "var(--ink-600)", margin: "0 0 10px", lineHeight: 1.5}}>
              Full access to HyperShift, RHACM, ArgoCD, namespaces, and secrets. Assigned to the platform engineering team.
            </p>
            <Code lang="yaml — rbac/setic-platform-admin.yaml">
{`apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRole
metadata:
  name: setic-platform-admin
  labels:
    gdfkube.io/managed: "true"
    gdfkube.io/rbac-tier: platform
rules:
  - apiGroups: ["hypershift.openshift.io"]
    resources: ["*"]
    verbs: ["*"]
  - apiGroups: ["cluster.open-cluster-management.io"]
    resources: ["*"]
    verbs: ["*"]
  - apiGroups: ["argoproj.io"]
    resources: ["*"]
    verbs: ["*"]
  - apiGroups: [""]
    resources: ["namespaces", "secrets", "configmaps"]
    verbs: ["*"]
  - apiGroups: [""]
    resources: ["nodes", "pods", "events"]
    verbs: ["get", "list", "watch"]`}
            </Code>
          </div>
          <div>
            <div style={{fontSize: 12, fontWeight: 600, color: "var(--ink-700)", marginBottom: 8}}>setic-operator</div>
            <p style={{fontSize: 12.5, color: "var(--ink-600)", margin: "0 0 10px", lineHeight: 1.5}}>
              Read access plus ArgoCD sync capability. Assigned to operations staff who monitor and manually trigger syncs.
            </p>
            <Code lang="yaml — rbac/setic-operator.yaml">
{`apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRole
metadata:
  name: setic-operator
  labels:
    gdfkube.io/managed: "true"
    gdfkube.io/rbac-tier: operator
rules:
  - apiGroups: ["hypershift.openshift.io"]
    resources: ["*"]
    verbs: ["get", "list", "watch"]
  - apiGroups: ["cluster.open-cluster-management.io"]
    resources: ["*"]
    verbs: ["get", "list", "watch"]
  - apiGroups: ["argoproj.io"]
    resources: ["applications"]
    verbs: ["get", "list", "watch", "update"]
    # update allows manual sync trigger
  - apiGroups: ["argoproj.io"]
    resources: ["appprojects", "applicationsets"]
    verbs: ["get", "list", "watch"]
  - apiGroups: [""]
    resources: ["namespaces", "pods", "events", "configmaps"]
    verbs: ["get", "list", "watch"]`}
            </Code>
          </div>
        </div>
      </Card>

      {/* Customer kubeconfig */}
      <Card title="Customer Access — Hosted Cluster Kubeconfig" style={{marginTop: 16}}>
        <p style={{fontSize: 12.5, color: "var(--ink-600)", margin: "0 0 14px", lineHeight: 1.5}}>
          Customers receive <code>cluster-admin</code> on their hosted clusters only. The admin kubeconfig is stored as a Secret on the hub cluster in the hosted control plane namespace.
        </p>
        <Code lang="bash — retrieve customer kubeconfig">
{`# Kubeconfig location: Secret in hc-{org}-{cluster} namespace
oc get secret admin-kubeconfig \\
  -n hc-saude-vacinacao \\
  -o jsonpath='{.data.kubeconfig}' | base64 -d

# The portal "Download kubeconfig" button retrieves this
# via the Express API (requires operator role + org match)`}
        </Code>

        <div style={{marginTop: 14}}>
          <InfoBox>
            Customers never interact with the hub cluster, ArgoCD, RHACM, or Git repos. Their entire experience is through the gdfkube ITSM Portal (form submission) and the resulting hosted cluster kubeconfig.
          </InfoBox>
        </div>
      </Card>
    </div>
  );
}


/* ─── Mount ─── */
ReactDOM.render(<App />, document.getElementById("root"));
