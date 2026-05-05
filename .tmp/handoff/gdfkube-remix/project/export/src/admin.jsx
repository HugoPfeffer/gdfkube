// Admin module: Forms, Form Fields, Users
const { useState: useStateA } = React;

// --- seed admin data ---
if (!window.GDF_ADMIN_DATA) {
  window.GDF_ADMIN_DATA = {
    forms: [
      { id: "cluster-request",    name: "OpenShift Cluster Request",  topic: "dbz.gdfkube.requests", fields: 4, active: true,  submissions: 47, updated: "2026-04-22" },
      { id: "namespace-request",  name: "Namespace Onboarding",        topic: "dbz.gdfkube.requests", fields: 6, active: true,  submissions: 23, updated: "2026-04-19" },
      { id: "scale-request",      name: "Cluster Scale Change",        topic: "dbz.gdfkube.requests", fields: 4, active: true,  submissions: 12, updated: "2026-04-15" },
    ],
    fields: {
      "cluster-request": [
        { id: 4, key: "requesterGroupName", label: "Department / Organization", type: "select", required: true,  bucket: "meta",
          options: "saude|Saúde — Department of Health; educacao|Educação — Department of Education; transportes|Transportes — Transit Authority; fazenda|Fazenda — Treasury Department; agricultura|Agricultura — Agriculture Department; seguranca|Segurança — Public Safety",
          help: "Determines the customer Git repo (gdfkube-{requesterGroupName}) and RHACM cluster set." },
        { id: 1, key: "clusterName",  label: "Cluster name",  type: "text",   required: true,  bucket: "vars",
          validation: "^[a-z][a-z0-9-]*$",
          prefix: "hc-{requesterGroupName}-",
          help: "Lowercase letters, digits, hyphens. Must start with a letter. The full namespace will be hc-{requesterGroupName}-{clusterName}." },
        { id: 2, key: "environment",  label: "Environment", type: "select", required: true,  bucket: "vars",
          displayAs: "radio-cards",
          options: "development|Development|Dev sandbox, ephemeral|#16a34a; staging|Staging|Pre-prod, relaxed quotas|#f59e0b; production|Production|RHACM strict policy set|#dc2626",
          help: "Determines RHACM policy set." },
        { id: 3, key: "nodeCount",    label: "Worker node count", type: "number", required: true, bucket: "vars", min: 1, max: 10,
          help: "KubeVirt VMs provisioned by HyperShift NodePool." },
      ],
      "namespace-request": [
        { id: 10, key: "requesterGroupName", label: "Department",      type: "select", required: true,  bucket: "meta", options: "saude, educacao, transportes, fazenda, agricultura, seguranca", help: "Maps to customer Git repo." },
        { id: 11, key: "targetCluster",      label: "Target cluster",   type: "select", required: true,  bucket: "vars", options: "shared-dev, shared-staging, shared-prod", help: "Pick a multi-tenant cluster." },
        { id: 12, key: "namespaceName",      label: "Namespace name",   type: "text",   required: true,  bucket: "vars", validation: "^[a-z][a-z0-9-]*$", help: "Lowercase, dash-separated." },
        { id: 13, key: "cpuQuota",           label: "CPU quota (cores)", type: "number", required: true,  bucket: "vars", min: 1, max: 32, help: "Total cores requested." },
        { id: 14, key: "memQuotaGi",         label: "Memory quota (Gi)", type: "number", required: true,  bucket: "vars", min: 1, max: 256, help: "GiB of RAM." },
        { id: 15, key: "purpose",            label: "Purpose",           type: "textarea", required: true, bucket: "meta", help: "What workloads will run here?" },
      ],
      "scale-request": [
        { id: 20, key: "requesterGroupName", label: "Department",      type: "select", required: true,  bucket: "meta", options: "saude, educacao, transportes, fazenda, agricultura, seguranca" },
        { id: 21, key: "clusterName",        label: "Cluster",         type: "text",   required: true,  bucket: "vars", validation: "^[a-z][a-z0-9-]*$", help: "Existing cluster name." },
        { id: 22, key: "newNodeCount",       label: "New node count",  type: "number", required: true,  bucket: "vars", min: 1, max: 20 },
        { id: 23, key: "justification",      label: "Justification",   type: "textarea", required: true, bucket: "meta", help: "Why this scale change is needed." },
      ],
    },
    users: [
      { id: 1, username: "joao.silva",      name: "João Silva",       email: "joao.silva@saude.gov",        group: "saude",       role: "operator", active: true,  last: "2 min ago" },
      { id: 2, username: "maria.costa",     name: "Maria Costa",      email: "m.costa@setic.gov",           group: "setic",       role: "admin",    active: true,  last: "now" },
      { id: 3, username: "carlos.mendes",   name: "Carlos Mendes",    email: "c.mendes@transportes.gov",    group: "transportes", role: "operator", active: true,  last: "18m ago" },
      { id: 4, username: "ana.rodrigues",   name: "Ana Rodrigues",    email: "ana.r@fazenda.gov",           group: "fazenda",     role: "operator", active: true,  last: "1h ago" },
      { id: 5, username: "pedro.almeida",   name: "Pedro Almeida",    email: "p.almeida@agricultura.gov",   group: "agricultura", role: "operator", active: false, last: "3d ago" },
      { id: 6, username: "lucia.fernandes", name: "Lúcia Fernandes",  email: "l.fernandes@seguranca.gov",   group: "seguranca",   role: "approver", active: true,  last: "yesterday" },
      { id: 7, username: "rafael.souza",    name: "Rafael Souza",     email: "r.souza@educacao.gov",        group: "educacao",    role: "operator", active: true,  last: "5h ago" },
      { id: 8, username: "platform.bot",    name: "Platform Service", email: "platform@setic.gov",          group: "setic",       role: "service",  active: true,  last: "now" },
    ],
  };
}

const DEFAULT_TEMPLATE_FILES = {
  default: [
    { name: "configmap.yaml", content: `# Rendered for each submission.
# Reference field values with {{ vars.fieldKey }} or {{ meta.fieldKey }}.
apiVersion: v1
kind: ConfigMap
metadata:
  name: {{ vars.name }}
  namespace: {{ meta.requesterGroupName }}
data:
  owner: "{{ meta.requesterUsername }}"
` },
  ],
  "cluster-request": [
    { name: "hostedcluster.yaml", content: `# HyperShift HostedCluster manifest, rendered per submission.
apiVersion: hypershift.openshift.io/v1beta1
kind: HostedCluster
metadata:
  name: hc-{{ meta.requesterGroupName }}-{{ vars.clusterName }}
  namespace: clusters
  labels:
    gdfkube.gov/group: {{ meta.requesterGroupName }}
    gdfkube.gov/env:   {{ vars.environment }}
spec:
  release:
    image: quay.io/openshift-release-dev/ocp-release:4.16.6-x86_64
  pullSecret:
    name: pull-secret
  platform:
    type: KubeVirt
    kubevirt:
      baseDomain: gdfkube.gov.local
  services:
    - service: APIServer
      servicePublishingStrategy: { type: LoadBalancer }
  nodePools:
    - name: workers
      replicas: {{ vars.nodeCount }}
      platform: { type: KubeVirt }
` },
    { name: "applicationset.yaml", content: `# ArgoCD ApplicationSet that fans out workloads to the new cluster.
apiVersion: argoproj.io/v1alpha1
kind: ApplicationSet
metadata:
  name: appset-{{ meta.requesterGroupName }}-{{ vars.clusterName }}
  namespace: argocd
spec:
  generators:
    - clusters:
        selector:
          matchLabels:
            gdfkube.gov/group: {{ meta.requesterGroupName }}
            gdfkube.gov/env:   {{ vars.environment }}
  template:
    metadata:
      name: '{{ "{{name}}" }}-baseline'
    spec:
      project: {{ meta.requesterGroupName }}
      source:
        repoURL: https://git.gdfkube.gov/{{ meta.requesterGroupName }}/baseline.git
        targetRevision: HEAD
        path: overlays/{{ vars.environment }}
      destination:
        server: '{{ "{{server}}" }}'
        namespace: kube-system
` },
    { name: "managedcluster.yaml", content: `# RHACM ManagedCluster registration.
apiVersion: cluster.open-cluster-management.io/v1
kind: ManagedCluster
metadata:
  name: {{ vars.clusterName }}
  labels:
    gdfkube.gov/group: {{ meta.requesterGroupName }}
    gdfkube.gov/env:   {{ vars.environment }}
spec:
  hubAcceptsClient: true
` },
  ],
  "namespace-request": [
    { name: "namespace.yaml", content: `apiVersion: v1
kind: Namespace
metadata:
  name: {{ vars.namespaceName }}
  labels:
    gdfkube.gov/group: {{ meta.requesterGroupName }}
` },
    { name: "resourcequota.yaml", content: `apiVersion: v1
kind: ResourceQuota
metadata:
  name: default-quota
  namespace: {{ vars.namespaceName }}
spec:
  hard:
    requests.cpu: "{{ vars.cpuQuota }}"
    requests.memory: "{{ vars.memQuota }}Gi"
` },
  ],
  "scale-request": [
    { name: "nodepool-patch.yaml", content: `# Patch applied to the existing NodePool.
apiVersion: hypershift.openshift.io/v1beta1
kind: NodePool
metadata:
  name: {{ vars.clusterName }}-workers
  namespace: clusters
spec:
  replicas: {{ vars.newNodeCount }}
` },
  ],
};


function TemplateEditor({ files, onChange, fields, formId }) {
  const [activeIdx, setActiveIdx] = useStateA(0);
  const [tab, setTab] = useStateA("template");
  const safeFiles = files && files.length ? files : [{ name: "main.yaml", content: "" }];
  const idx = Math.min(activeIdx, safeFiles.length - 1);
  const current = safeFiles[idx];
  const lineCount = (current.content || "").split("\n").length;

  const updateContent = (val) => {
    const next = safeFiles.map((f, i) => i === idx ? {...f, content: val} : f);
    onChange(next);
  };
  const renameFile = (newName) => {
    const trimmed = (newName || "").trim();
    if (!trimmed) return;
    const next = safeFiles.map((f, i) => i === idx ? {...f, name: trimmed} : f);
    onChange(next);
  };
  const addFile = () => {
    const base = "manifest";
    let n = safeFiles.length + 1;
    let name = `${base}-${n}.yaml`;
    while (safeFiles.some(f => f.name === name)) { n += 1; name = `${base}-${n}.yaml`; }
    onChange([...safeFiles, { name, content: "# New manifest\n" }]);
    setActiveIdx(safeFiles.length);
  };
  const removeFile = (i) => {
    if (safeFiles.length <= 1) return;
    const next = safeFiles.filter((_, j) => j !== i);
    onChange(next);
    if (idx >= next.length) setActiveIdx(next.length - 1);
  };

  const examplePreview = current.content
    .replace(/\{\{\s*vars\.clusterName\s*\}\}/g, "vacinacao")
    .replace(/\{\{\s*vars\.environment\s*\}\}/g, "production")
    .replace(/\{\{\s*vars\.nodeCount\s*\}\}/g, "4")
    .replace(/\{\{\s*vars\.namespaceName\s*\}\}/g, "vacinacao-prod")
    .replace(/\{\{\s*vars\.cpuQuota\s*\}\}/g, "8")
    .replace(/\{\{\s*vars\.memQuota\s*\}\}/g, "16")
    .replace(/\{\{\s*vars\.newNodeCount\s*\}\}/g, "6")
    .replace(/\{\{\s*vars\.name\s*\}\}/g, "example")
    .replace(/\{\{\s*meta\.requesterGroupName\s*\}\}/g, "saude")
    .replace(/\{\{\s*meta\.requesterUsername\s*\}\}/g, "joao.silva")
    .replace(/\{\{\s*"([^"]+)"\s*\}\}/g, "$1")
    .replace(/\{\{\s*([a-zA-Z0-9._]+)\s*\}\}/g, "<$1>");

  return (
    <div>
      <div style={{marginBottom: 14, padding: "10px 12px", background: "#f0f6ff", border: "1px solid var(--ink-200)", borderRadius: "var(--radius)", fontSize: 12, color: "var(--ink-700)", display: "flex", alignItems: "center", gap: 8}}>
        <Icons.info size={14} style={{color: "var(--civic-500)", flex: "0 0 auto"}} />
        <span>The Camel route renders each manifest below per submission, replacing <span className="mono">{"{{ vars.x }}"}</span> and <span className="mono">{"{{ meta.x }}"}</span> with values from the form, then commits all results to the group's Git repo for ArgoCD to reconcile.</span>
      </div>

      {/* File tabs */}
      <div style={{display: "flex", alignItems: "stretch", borderBottom: "1px solid var(--ink-200)", marginBottom: 0, gap: 0, flexWrap: "wrap"}}>
        {safeFiles.map((f, i) => (
          <div key={i}
               onClick={() => setActiveIdx(i)}
               style={{
                 display: "flex", alignItems: "center", gap: 6,
                 padding: "7px 10px 7px 12px",
                 fontFamily: "var(--font-mono)", fontSize: 11.5,
                 cursor: "pointer", borderRadius: "6px 6px 0 0",
                 background: i === idx ? "var(--paper)" : "transparent",
                 border: i === idx ? "1px solid var(--ink-200)" : "1px solid transparent",
                 borderBottom: i === idx ? "1px solid var(--paper)" : "1px solid var(--ink-200)",
                 marginBottom: -1,
                 color: i === idx ? "var(--ink-900)" : "var(--ink-600)",
                 fontWeight: i === idx ? 500 : 400,
               }}>
            <Icons.doc size={11} style={{opacity: 0.6}} />
            <span>{f.name}</span>
            {safeFiles.length > 1 && (
              <button
                className="icon-btn"
                onClick={e => { e.stopPropagation(); removeFile(i); }}
                title={`Remove ${f.name}`}
                style={{width: 18, height: 18, marginLeft: 2, opacity: 0.5}}>
                <Icons.x size={9} />
              </button>
            )}
          </div>
        ))}
        <button
          className="btn ghost sm"
          onClick={addFile}
          style={{margin: "4px 0 4px 6px", padding: "4px 10px", fontSize: 11.5, height: 26}}>
          <Icons.plus size={11} /> Add manifest
        </button>
      </div>

      <div className="row" style={{margin: "10px 0", alignItems: "center"}}>
        <div style={{display: "flex", gap: 4, padding: 2, background: "var(--ink-100, #eef0f4)", borderRadius: 6}}>
          {[
            { id: "template", label: "Template" },
            { id: "preview",  label: "Rendered preview" },
          ].map(t => (
            <div key={t.id} onClick={() => setTab(t.id)}
                 style={{
                   padding: "5px 12px", fontSize: 12, fontWeight: 500, cursor: "pointer", borderRadius: 4,
                   background: tab === t.id ? "var(--paper)" : "transparent",
                   color: tab === t.id ? "var(--ink-900)" : "var(--ink-600)",
                   boxShadow: tab === t.id ? "0 1px 2px rgba(0,0,0,0.06)" : "none",
                 }}>{t.label}</div>
          ))}
        </div>
        <span className="spacer"></span>
        <input
          type="text"
          value={current.name}
          onChange={e => renameFile(e.target.value)}
          spellCheck={false}
          style={{height: 26, padding: "0 8px", fontFamily: "var(--font-mono)", fontSize: 11.5, border: "1px solid var(--ink-200)", borderRadius: 4, background: "var(--paper)", color: "var(--ink-700)", width: 220}}
        />
        <span className="muted" style={{fontSize: 11.5}}>· {lineCount} lines</span>
        <button className="btn sm ghost"><Icons.download size={12} /> Download all</button>
      </div>

      {tab === "template" && (
        <div style={{display: "grid", gridTemplateColumns: "minmax(0, 1fr) 240px", gap: 14, alignItems: "start"}}>
          <div style={{border: "1px solid var(--ink-200)", borderRadius: "var(--radius)", overflow: "hidden", background: "#0f172a"}}>
            <div style={{padding: "6px 12px", background: "#1e293b", borderBottom: "1px solid #334155", fontSize: 11, color: "#94a3b8", fontFamily: "var(--font-mono)"}}>{current.name} · YAML · Go templates</div>
            <textarea
              value={current.content}
              onChange={e => updateContent(e.target.value)}
              spellCheck={false}
              style={{
                width: "100%", minHeight: 380, padding: 14, border: 0, outline: "none",
                background: "#0f172a", color: "#e2e8f0", fontFamily: "var(--font-mono)",
                fontSize: 12.5, lineHeight: 1.7, resize: "vertical", display: "block",
              }}
            />
          </div>
          <div>
            <div style={{fontSize: 11, fontWeight: 600, color: "var(--ink-600)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8}}>Available variables</div>
            <div style={{border: "1px solid var(--ink-200)", borderRadius: "var(--radius)", background: "var(--paper)", maxHeight: 420, overflowY: "auto"}}>

              {/* System (auto-injected, never on user form) */}
              <div style={{padding: "8px 10px 4px", borderBottom: "1px solid var(--ink-100)", background: "var(--ink-50)", position: "sticky", top: 0, zIndex: 1}}>
                <div style={{fontSize: 10, fontWeight: 700, color: "var(--ink-500)", textTransform: "uppercase", letterSpacing: "0.06em", display: "flex", alignItems: "center", gap: 6}}>
                  <Icons.shield size={11} /> System · auto-injected
                </div>
                <div style={{fontSize: 10.5, color: "var(--ink-500)", marginTop: 2}}>Available in every form. Not user-editable.</div>
              </div>
              <div style={{padding: 8, borderBottom: "1px solid var(--ink-200)"}}>
                {[
                  { token: "{{ meta.requestId }}",          desc: "ULID assigned at submission" },
                  { token: "{{ meta.requesterName }}",      desc: "Username of the submitter" },
                  { token: "{{ meta.requesterFullName }}",  desc: "Display name of the submitter" },
                  { token: "{{ meta.requesterEmail }}",     desc: "Email of the submitter" },
                  { token: "{{ meta.requesterRole }}",      desc: "Role: operator | approver | admin" },
                  { token: "{{ meta.submittedAt }}",        desc: "ISO-8601 timestamp" },
                  { token: "{{ meta.formId }}",             desc: "Form identifier" },
                  { token: "{{ meta.correlationId }}",      desc: "Kafka message key (= requestId)" },
                ].map(v => (
                  <div key={v.token}
                       className="var-row"
                       onClick={() => navigator.clipboard?.writeText(v.token)}
                       title="Click to copy"
                       style={{padding: "5px 6px", borderRadius: 4, fontSize: 11.5, lineHeight: 1.4, marginBottom: 1, cursor: "pointer", display: "flex", alignItems: "flex-start", gap: 6}}>
                    <div style={{flex: 1, minWidth: 0}}>
                      <div className="mono" style={{color: "var(--ink-700)", fontWeight: 500, fontSize: 11.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap"}}>{v.token}</div>
                      <div className="muted" style={{fontSize: 10.5}}>{v.desc}</div>
                    </div>
                    <button className="icon-btn" onClick={e => { e.stopPropagation(); navigator.clipboard?.writeText(v.token); }} title={`Copy ${v.token}`} style={{width: 22, height: 22, flex: "0 0 auto", marginTop: 1}}>
                      <Icons.copy size={11} />
                    </button>
                  </div>
                ))}
              </div>

              {/* From form fields */}
              <div style={{padding: "8px 10px 4px", borderBottom: "1px solid var(--ink-100)", background: "var(--ink-50)", position: "sticky", top: 0, zIndex: 1}}>
                <div style={{fontSize: 10, fontWeight: 700, color: "var(--ink-500)", textTransform: "uppercase", letterSpacing: "0.06em", display: "flex", alignItems: "center", gap: 6}}>
                  <Icons.form size={11} /> From form fields
                </div>
              </div>
              <div style={{padding: 8}}>
                {fields.length === 0 && <div className="muted" style={{fontSize: 12, padding: 6}}>Add fields first.</div>}
                {fields.map(f => {
                  const token = `{{ ${f.bucket}.${f.key} }}`;
                  return (
                    <div key={f.id}
                         className="var-row"
                         onClick={() => navigator.clipboard?.writeText(token)}
                         title="Click to copy"
                         style={{padding: "5px 6px", borderRadius: 4, fontSize: 11.5, lineHeight: 1.4, marginBottom: 1, cursor: "pointer", display: "flex", alignItems: "flex-start", gap: 6}}>
                      <div style={{flex: 1, minWidth: 0}}>
                        <div className="mono" style={{color: "var(--civic-500)", fontWeight: 500, fontSize: 11.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap"}}>{token}</div>
                        <div className="muted" style={{fontSize: 10.5}}>{f.label}</div>
                      </div>
                      <button className="icon-btn" onClick={e => { e.stopPropagation(); navigator.clipboard?.writeText(token); }} title={`Copy ${token}`} style={{width: 22, height: 22, flex: "0 0 auto", marginTop: 1}}>
                        <Icons.copy size={11} />
                      </button>
                    </div>
                  );
                })}
              </div>

            </div>
            <div style={{marginTop: 12, fontSize: 11, color: "var(--ink-500)", lineHeight: 1.5}}>
              Click any variable to copy <span className="mono">{"{{ … }}"}</span> to your clipboard. System variables are populated by the Camel route on every submission.
            </div>
          </div>
        </div>
      )}

      {tab === "preview" && (
        <div style={{border: "1px solid var(--ink-200)", borderRadius: "var(--radius)", overflow: "hidden"}}>
          <div style={{padding: "6px 12px", background: "var(--ink-50)", borderBottom: "1px solid var(--ink-200)", fontSize: 11, color: "var(--ink-600)", fontFamily: "var(--font-mono)", display: "flex", alignItems: "center", gap: 8}}>
            <Icons.check size={11} style={{color: "var(--green-700)"}} />
            {current.name} · sample render with placeholder values
          </div>
          <pre style={{margin: 0, padding: 14, fontFamily: "var(--font-mono)", fontSize: 12, lineHeight: 1.7, color: "var(--ink-800)", background: "var(--paper)", overflowX: "auto", whiteSpace: "pre"}}>{examplePreview}</pre>
        </div>
      )}
    </div>
  );
}

function AdminConsole({ navigate, section = "forms" }) {
  const isUsers = section === "users";
  const defaultTab = isUsers ? "users" : "forms";
  const [tab, setTab] = useStateA(defaultTab);
  const [editingForm, setEditingForm] = useStateA(null);
  const [editingUser, setEditingUser] = useStateA(null);
  const [creatingForm, setCreatingForm] = useStateA(false);
  const [creatingUser, setCreatingUser] = useStateA(false);
  const [creatingGroup, setCreatingGroup] = useStateA(false);

  // Reset tab when switching between Forms / Users sections via the sidebar
  React.useEffect(() => {
    setTab(defaultTab);
    setEditingForm(null);
    setEditingUser(null);
    setCreatingForm(false);
    setCreatingUser(false);
    setCreatingGroup(false);
  }, [section]);

  const handleNew = () => {
    if (tab === "forms") { setEditingForm(null); setCreatingForm(true); }
    else if (tab === "users") { setEditingUser(null); setCreatingUser(true); }
    else if (tab === "groups") { setCreatingGroup(true); }
  };

  const tabs = isUsers
    ? [
        { id: "users",  label: "Users",  count: window.GDF_ADMIN_DATA.users.length },
        { id: "groups", label: "Groups", count: 7 },
      ]
    : [
        { id: "forms",  label: "Forms",       count: window.GDF_ADMIN_DATA.forms.length },
        { id: "fields", label: "Form Fields", count: Object.values(window.GDF_ADMIN_DATA.fields).reduce((n, l) => n + l.length, 0) },
      ];

  const title = isUsers ? "Users" : "Forms";
  const sub = isUsers
    ? "Manage portal users and group membership. Role and group changes propagate via the next CDC event."
    : "Manage request forms and their field definitions. Changes apply at the next CDC event.";
  const newLabel = tab === "users" ? "New user" : tab === "groups" ? "New group" : tab === "fields" ? null : "New form";

  return (
    <div className="page">
      <div className="page-head">
        <div className="page-head-row">
          <div>
            <h1 className="page-title">{title}</h1>
            <p className="page-sub">{sub}</p>
          </div>
          <div className="row">
            {newLabel && <button className="btn primary" onClick={handleNew}><Icons.plus /> {newLabel}</button>}
          </div>
        </div>
      </div>

      <div className="card">
        <div className="tabs" style={{margin: 0, padding: "0 14px"}}>
          {tabs.map(t => (
            <div key={t.id} className={"tab" + (tab === t.id ? " active" : "")} onClick={() => { setTab(t.id); setEditingForm(null); setEditingUser(null); }}>
              {t.label}<span className="count">· {t.count}</span>
            </div>
          ))}
        </div>

        {tab === "forms" && !editingForm && !creatingForm && <FormsTable onEdit={f => setEditingForm(f)} />}
        {tab === "forms" && editingForm && <FormEditor form={editingForm} onBack={() => setEditingForm(null)} />}
        {tab === "forms" && creatingForm && <NewFormPage onBack={() => setCreatingForm(false)} />}
        {tab === "fields" && <FieldsTable />}
        {tab === "users" && !editingUser && !creatingUser && <UsersTable onEdit={u => setEditingUser(u)} />}
        {tab === "users" && editingUser && <UserEditor user={editingUser} onBack={() => setEditingUser(null)} />}
        {tab === "users" && creatingUser && <NewUserPage onBack={() => setCreatingUser(false)} />}
        {tab === "groups" && !creatingGroup && <GroupsTable />}
        {tab === "groups" && creatingGroup && <NewGroupPage onBack={() => setCreatingGroup(false)} />}
      </div>
    </div>
  );
}

function FormsTable({ onEdit }) {
  const { forms } = window.GDF_ADMIN_DATA;
  return (
    <div className="table-wrap">
      <table className="list">
        <thead>
          <tr>
            <th style={{width: 200}}>Form ID</th>
            <th>Name</th>
            <th>Kafka topic</th>
            <th style={{width: 80}}>Fields</th>
            <th style={{width: 110}}>Submissions</th>
            <th style={{width: 100}}>Status</th>
            <th style={{width: 120}}>Updated</th>
            <th style={{width: 40}}></th>
          </tr>
        </thead>
        <tbody>
          {forms.map(f => (
            <tr key={f.id} onClick={() => onEdit(f)}>
              <td className="mono" style={{color: "var(--civic-500)", fontWeight: 500}}>{f.id}</td>
              <td><strong>{f.name}</strong></td>
              <td className="mono muted" style={{fontSize: 11.5}}>{f.topic}</td>
              <td className="mono">{f.fields}</td>
              <td className="mono">{f.submissions}</td>
              <td>
                {f.active
                  ? <span className="pill green"><span className="dot"></span>Active</span>
                  : <span className="pill gray"><span className="dot"></span>Disabled</span>}
              </td>
              <td className="muted mono">{f.updated}</td>
              <td><Icons.chevronRight style={{color: "var(--ink-400)"}} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function FormEditor({ form, onBack }) {
  const seedFields = window.GDF_ADMIN_DATA.fields[form.id] || window.GDF_ADMIN_DATA.fields["cluster-request"];
  const [active, setActive] = useStateA(form.active);
  const [subtab, setSubtab] = useStateA("definition");
  const [files, setFiles] = useStateA(DEFAULT_TEMPLATE_FILES[form.id] || DEFAULT_TEMPLATE_FILES.default);
  const [fields, setFields] = useStateA(seedFields);
  const [newFieldId, setNewFieldId] = useStateA(null);

  const addField = () => {
    const nf = { id: Date.now(), key: "", label: "", type: "text", required: false, bucket: "vars", validation: "" };
    setFields([...fields, nf]);
    setNewFieldId(nf.id);
    setSubtab("fields");
  };
  const updateField = (idx, patch) => {
    setFields(fields.map((f, i) => i === idx ? {...f, ...patch} : f));
  };
  const removeField = (idx) => setFields(fields.filter((_, i) => i !== idx));
  const [dragIdx, setDragIdx] = useStateA(null);
  const [overIdx, setOverIdx] = useStateA(null);
  const moveField = (from, to) => {
    if (from === to || from == null || to == null) return;
    const next = fields.slice();
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    setFields(next);
  };
  const dragProps = (i) => ({
    draggable: true,
    onDragStart: (e) => { setDragIdx(i); e.dataTransfer.effectAllowed = "move"; try { e.dataTransfer.setData("text/plain", String(i)); } catch (_) {} },
    onDragOver: (e) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; if (overIdx !== i) setOverIdx(i); },
    onDragLeave: () => { if (overIdx === i) setOverIdx(null); },
    onDrop: (e) => { e.preventDefault(); moveField(dragIdx, i); setDragIdx(null); setOverIdx(null); },
    onDragEnd: () => { setDragIdx(null); setOverIdx(null); },
    style: {
      background: dragIdx === i ? "var(--ink-100, #f0f2f5)" : (overIdx === i && dragIdx !== null ? "var(--blue-50, #f0f6ff)" : undefined),
      borderTop: overIdx === i && dragIdx !== null && dragIdx > i ? "2px solid var(--civic-500)" : undefined,
      borderBottom: overIdx === i && dragIdx !== null && dragIdx < i ? "2px solid var(--civic-500)" : undefined,
      opacity: dragIdx === i ? 0.5 : 1,
      transition: "background 120ms",
    },
  });
  return (
    <div style={{padding: "18px 18px 24px"}}>
      <div className="row" style={{marginBottom: 14}}>
        <button className="btn ghost sm" onClick={onBack}>← All forms</button>
        <span className="spacer"></span>
        <button className="btn sm"><Icons.refresh size={12} /> Reload from Git</button>
        <button className="btn primary sm">Save changes</button>
      </div>

      <div className="subtabs" style={{display: "flex", gap: 4, borderBottom: "1px solid var(--ink-200)", marginBottom: 18}}>
        {[
          { id: "definition", label: "Definition" },
          { id: "fields",     label: `Fields · ${fields.length}` },
          { id: "template",   label: "Template" },
        ].map(t => (
          <div key={t.id}
               onClick={() => setSubtab(t.id)}
               style={{
                 padding: "8px 14px", fontSize: 13, fontWeight: 500, cursor: "pointer",
                 color: subtab === t.id ? "var(--civic-500)" : "var(--ink-600)",
                 borderBottom: subtab === t.id ? "2px solid var(--civic-500)" : "2px solid transparent",
                 marginBottom: -1,
               }}>
            {t.label}
          </div>
        ))}
      </div>

      {subtab === "definition" && (
        <div className="form-grid">
          <div className="field">
            <label>Form ID</label>
            <input type="text" defaultValue={form.id} disabled style={{fontFamily: "var(--font-mono)", fontSize: 12.5}} />
            <div className="help">Immutable. Used as the Kafka message key.</div>
          </div>
          <div className="field">
            <label>Display name</label>
            <input type="text" defaultValue={form.name} />
          </div>
          <div className="field">
            <label>Kafka topic</label>
            <input type="text" defaultValue={form.topic} style={{fontFamily: "var(--font-mono)", fontSize: 12.5}} />
          </div>
          <div className="field">
            <label>Status</label>
            <div className="row" style={{height: 36}}>
              <label style={{display: "flex", alignItems: "center", gap: 8, cursor: "pointer"}}>
                <input type="checkbox" checked={active} onChange={e => setActive(e.target.checked)} />
                <span style={{fontSize: 13}}>Form is active and accepting submissions</span>
              </label>
            </div>
          </div>
          <div className="field span-2">
            <label>Description</label>
            <textarea defaultValue="Provision a HyperShift hosted control plane cluster. The request flows through the CDC pipeline and is GitOps-reconciled." />
          </div>
        </div>
      )}

      {subtab === "fields" && (
        <React.Fragment>
          <div className="row" style={{marginBottom: 10}}>
            <h3 style={{margin: 0, fontSize: 14, fontWeight: 600}}>Fields ({fields.length})</h3>
            <span className="muted" style={{fontSize: 12}}>Inputs the requester fills in. Field keys are referenced from the template as <span className="mono">{"{{ vars.fieldKey }}"}</span>.</span>
            <span className="spacer"></span>
            <button className="btn sm" onClick={addField}><Icons.plus size={12} /> Add field</button>
          </div>
          <div style={{border: "1px solid var(--ink-200)", borderRadius: "var(--radius)", overflow: "hidden"}}>
            <table className="list">
              <thead>
                <tr>
                  <th style={{width: 30}}></th>
                  <th>Key</th>
                  <th>Label</th>
                  <th style={{width: 110}}>Type</th>
                  <th style={{width: 90}}>Bucket</th>
                  <th style={{width: 80}}>Required</th>
                  <th>Validation / options</th>
                  <th style={{width: 50}}></th>
                </tr>
              </thead>
              <tbody>
                {fields.map((f, i) => {
                  const isNew = f.id === newFieldId;
                  const validationText = (f.type === "select" && f.options)
                    ? f.options
                    : (f.type === "number" && (f.min != null || f.max != null))
                      ? `${f.min ?? "—"} – ${f.max ?? "—"}`
                      : (f.validation || "");
                  const renderEditableValidation = () => {
                    if (f.type === "select") {
                      return (
                        <input type="text"
                               value={f.options || ""}
                               onChange={e => updateField(i, {options: e.target.value})}
                               placeholder='value|Label|Description|#hex; next|...'
                               style={{height: 26, padding: "0 6px", fontFamily: "var(--font-mono)", fontSize: 11.5, border: "1px solid var(--ink-200)", borderRadius: 4, background: "var(--paper)", color: "var(--ink-700)", width: "100%"}} />
                      );
                    }
                    if (f.type === "number") {
                      return (
                        <div style={{display: "flex", gap: 4, alignItems: "center"}}>
                          <input type="number" value={f.min ?? ""} onChange={e => updateField(i, {min: e.target.value === "" ? null : Number(e.target.value)})} placeholder="min" style={{height: 26, padding: "0 6px", fontFamily: "var(--font-mono)", fontSize: 11.5, border: "1px solid var(--ink-200)", borderRadius: 4, background: "var(--paper)", width: "50%"}} />
                          <span className="muted" style={{fontSize: 11}}>–</span>
                          <input type="number" value={f.max ?? ""} onChange={e => updateField(i, {max: e.target.value === "" ? null : Number(e.target.value)})} placeholder="max" style={{height: 26, padding: "0 6px", fontFamily: "var(--font-mono)", fontSize: 11.5, border: "1px solid var(--ink-200)", borderRadius: 4, background: "var(--paper)", width: "50%"}} />
                        </div>
                      );
                    }
                    if (f.type === "checkbox") {
                      return <span className="muted" style={{fontSize: 11.5}}>n/a</span>;
                    }
                    return (
                      <input type="text"
                             value={f.validation || ""}
                             onChange={e => updateField(i, {validation: e.target.value})}
                             placeholder={f.type === "textarea" ? "regex (optional)" : "e.g. ^[a-z][a-z0-9-]*$"}
                             style={{height: 26, padding: "0 6px", fontFamily: "var(--font-mono)", fontSize: 11.5, border: "1px solid var(--ink-200)", borderRadius: 4, background: "var(--paper)", color: "var(--ink-700)", width: "100%"}} />
                    );
                  };
                  if (isNew) {
                    return (
                    <React.Fragment key={f.id}>
                      <tr style={{background: "var(--blue-50, #f0f6ff)"}}>
                        <td className="muted mono" style={{cursor: "grab"}}>⋮⋮</td>
                        <td>
                          <input autoFocus type="text" value={f.key} onChange={e => updateField(i, {key: e.target.value.replace(/[^a-zA-Z0-9_]/g, "")})} placeholder="fieldKey" style={{height: 26, padding: "0 6px", fontFamily: "var(--font-mono)", fontSize: 12, border: "1px solid var(--ink-200)", borderRadius: 4, background: "var(--paper)", color: "var(--navy-700)", width: "100%"}} />
                        </td>
                        <td>
                          <input type="text" value={f.label} onChange={e => updateField(i, {label: e.target.value})} placeholder="Display label" style={{height: 26, padding: "0 6px", fontSize: 12.5, border: "1px solid var(--ink-200)", borderRadius: 4, background: "var(--paper)", width: "100%"}} />
                        </td>
                        <td>
                          <select value={f.type} onChange={e => updateField(i, {type: e.target.value})} style={{height: 26, padding: "0 4px", fontSize: 12, border: "1px solid var(--ink-200)", borderRadius: 4, background: "var(--paper)", width: "100%"}}>
                            <option value="text">text</option>
                            <option value="number">number</option>
                            <option value="select">select</option>
                            <option value="textarea">textarea</option>
                            <option value="checkbox">checkbox</option>
                          </select>
                        </td>
                        <td>
                          <select value={f.bucket} onChange={e => updateField(i, {bucket: e.target.value})} style={{height: 26, padding: "0 4px", fontSize: 12, border: "1px solid var(--ink-200)", borderRadius: 4, background: "var(--paper)", width: "100%"}}>
                            <option value="vars">vars</option>
                            <option value="meta">meta</option>
                          </select>
                        </td>
                        <td>
                          <label style={{display: "flex", alignItems: "center", justifyContent: "center"}}>
                            <input type="checkbox" checked={!!f.required} onChange={e => updateField(i, {required: e.target.checked})} />
                          </label>
                        </td>
                        <td>
                          {renderEditableValidation()}
                        </td>
                        <td>
                          <div className="row" style={{gap: 4, justifyContent: "flex-end"}}>
                            <button className="icon-btn" style={{width: 26, height: 26}} title="Confirm" onClick={() => setNewFieldId(null)}><Icons.check size={13} /></button>
                            <button className="icon-btn" style={{width: 26, height: 26}} title="Discard" onClick={() => { removeField(i); setNewFieldId(null); }}><Icons.trash size={13} /></button>
                          </div>
                        </td>
                      </tr>
                      <tr style={{background: "var(--blue-50, #f0f6ff)"}}>
                        <td></td>
                        <td colSpan={7} style={{paddingTop: 0}}>
                          <div style={{display: "grid", gridTemplateColumns: f.type === "select" ? "auto 1fr 2fr" : "1fr 2fr", gap: 10, alignItems: "center", paddingBottom: 8}}>
                            {f.type === "select" && (
                              <React.Fragment>
                                <span style={{fontSize: 11, color: "var(--ink-500)", fontWeight: 500}}>Display as</span>
                                <select value={f.displayAs || "dropdown"} onChange={e => updateField(i, {displayAs: e.target.value})} style={{height: 26, padding: "0 4px", fontSize: 12, border: "1px solid var(--ink-200)", borderRadius: 4, background: "var(--paper)", width: "100%"}}>
                                  <option value="dropdown">Dropdown</option>
                                  <option value="radio-cards">Radio cards</option>
                                </select>
                                <span></span>
                              </React.Fragment>
                            )}
                            {f.type === "text" && (
                              <React.Fragment>
                                <span style={{fontSize: 11, color: "var(--ink-500)", fontWeight: 500}}>Prefix</span>
                                <input type="text" value={f.prefix || ""} onChange={e => updateField(i, {prefix: e.target.value})} placeholder='e.g. "hc-{requesterGroupName}-"' style={{height: 26, padding: "0 6px", fontFamily: "var(--font-mono)", fontSize: 11.5, border: "1px solid var(--ink-200)", borderRadius: 4, background: "var(--paper)", color: "var(--ink-700)", width: "100%"}} />
                              </React.Fragment>
                            )}
                            <span style={{fontSize: 11, color: "var(--ink-500)", fontWeight: 500}}>Help text</span>
                            <input type="text" value={f.help || ""} onChange={e => updateField(i, {help: e.target.value})} placeholder="Shown beneath the input. Use {fieldKey} to interpolate." style={{height: 26, padding: "0 6px", fontSize: 11.5, border: "1px solid var(--ink-200)", borderRadius: 4, background: "var(--paper)", width: "100%", gridColumn: f.type === "select" ? "2 / span 2" : undefined}} />
                          </div>
                          {f.type === "select" && f.displayAs === "radio-cards" && (
                            <div style={{fontSize: 11, color: "var(--ink-500)", marginTop: 2, paddingBottom: 8}}>
                              <span className="mono" style={{color: "var(--ink-700)"}}>Options</span> grammar: <span className="mono">value | label | description | dotColor</span> (label/description/dotColor optional). Separate options with <span className="mono">;</span> so descriptions can contain commas.
                            </div>
                          )}
                        </td>
                      </tr>
                    </React.Fragment>
                    );
                  }
                  return (
                    <tr key={f.id} {...dragProps(i)}>
                      <td className="muted mono" style={{cursor: "grab"}} title="Drag to reorder">⋮⋮</td>
                      <td className="mono" style={{color: "var(--navy-700)", fontWeight: 500}}>{f.key || <span className="muted">—</span>}</td>
                      <td>{f.label || <span className="muted">—</span>}</td>
                      <td><span className="pill blue" style={{fontSize: 10}}>{f.type}</span></td>
                      <td className="mono muted">{f.bucket}</td>
                      <td>{f.required ? <Icons.check style={{color: "var(--green-700)"}} /> : <span className="muted">—</span>}</td>
                      <td className="mono muted" style={{fontSize: 11.5}}>{validationText || "—"}</td>
                      <td>
                        <div className="row" style={{gap: 4, justifyContent: "flex-end"}}>
                          <button className="icon-btn" style={{width: 26, height: 26}} title="Edit" onClick={() => setNewFieldId(f.id)}><Icons.cog size={13} /></button>
                          <button className="icon-btn" style={{width: 26, height: 26}} title="Remove" onClick={() => removeField(i)}><Icons.trash size={13} /></button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {fields.length === 0 && (
                  <tr><td colSpan={8} style={{padding: 28, textAlign: "center", color: "var(--ink-500)", fontSize: 12}}>No fields yet. Click <strong>Add field</strong> to start.</td></tr>
                )}
              </tbody>
            </table>
          </div>

          <div style={{marginTop: 18, padding: 14, background: "var(--ink-50)", borderRadius: "var(--radius)", border: "1px solid var(--ink-200)"}}>
            <div style={{fontSize: 12, fontWeight: 600, color: "var(--ink-700)", marginBottom: 6}}>MongoDB document shape (preview)</div>
            <pre style={{margin: 0, fontFamily: "var(--font-mono)", fontSize: 11.5, color: "var(--ink-700)", lineHeight: 1.6, overflowX: "auto"}}>{`{
  "formId": "${form.id}",
  "requestId": "<ulid>",
  "meta":  { ${fields.filter(f => f.bucket === "meta").map(f => `"${f.key}": "…"`).join(", ")} },
  "vars":  { ${fields.filter(f => f.bucket === "vars").map(f => `"${f.key}": "…"`).join(", ")} }
}`}</pre>
          </div>
        </React.Fragment>
      )}

      {subtab === "template" && (
        <TemplateEditor
          files={files}
          onChange={setFiles}
          fields={fields}
          formId={form.id}
        />
      )}
    </div>
  );
}

function NewFormPage({ onBack }) {
  const [active, setActive] = useStateA(true);
  const [id, setId] = useStateA("");
  const [name, setName] = useStateA("");
  const [topic, setTopic] = useStateA("dbz.gdfkube.requests");
  const [desc, setDesc] = useStateA("");
  const [subtab, setSubtab] = useStateA("definition");
  const [files, setFiles] = useStateA(DEFAULT_TEMPLATE_FILES.default);
  const [fields, setFields] = useStateA([
    { id: 1, key: "requesterGroupName", label: "Department", type: "select", required: true, bucket: "meta", validation: "saude, educacao, transportes, fazenda, …" },
  ]);

  const addField = () => {
    setFields([...fields, { id: Date.now(), key: "", label: "", type: "text", required: false, bucket: "vars", validation: "" }]);
  };
  const updateField = (idx, patch) => {
    setFields(fields.map((f, i) => i === idx ? {...f, ...patch} : f));
  };
  const removeField = (idx) => setFields(fields.filter((_, i) => i !== idx));
  const [dragIdx, setDragIdx] = useStateA(null);
  const [overIdx, setOverIdx] = useStateA(null);
  const moveField = (from, to) => {
    if (from === to || from == null || to == null) return;
    const next = fields.slice();
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    setFields(next);
  };
  const dragProps = (i) => ({
    draggable: true,
    onDragStart: (e) => { setDragIdx(i); e.dataTransfer.effectAllowed = "move"; try { e.dataTransfer.setData("text/plain", String(i)); } catch (_) {} },
    onDragOver: (e) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; if (overIdx !== i) setOverIdx(i); },
    onDragLeave: () => { if (overIdx === i) setOverIdx(null); },
    onDrop: (e) => { e.preventDefault(); moveField(dragIdx, i); setDragIdx(null); setOverIdx(null); },
    onDragEnd: () => { setDragIdx(null); setOverIdx(null); },
    style: {
      background: dragIdx === i ? "var(--ink-100, #f0f2f5)" : (overIdx === i && dragIdx !== null ? "var(--blue-50, #f0f6ff)" : undefined),
      borderTop: overIdx === i && dragIdx !== null && dragIdx > i ? "2px solid var(--civic-500)" : undefined,
      borderBottom: overIdx === i && dragIdx !== null && dragIdx < i ? "2px solid var(--civic-500)" : undefined,
      opacity: dragIdx === i ? 0.5 : 1,
      transition: "background 120ms",
    },
  });

  const slugId = id.trim() || "new-form";
  const existingIds = new Set(window.GDF_ADMIN_DATA.forms.map(f => f.id));
  const idCollision = id.trim() && existingIds.has(id.trim());
  const canSave = id.trim() && name.trim() && !idCollision;

  const handleCreate = () => {
    if (!canSave) return;
    const today = new Date().toISOString().slice(0, 10);
    const cleanFields = fields.filter(f => f.key.trim());
    window.GDF_ADMIN_DATA.forms.push({
      id: id.trim(),
      name: name.trim(),
      topic: topic.trim() || "dbz.gdfkube.requests",
      fields: cleanFields.length,
      active,
      submissions: 0,
      updated: today,
    });
    window.GDF_ADMIN_DATA.fields[id.trim()] = cleanFields.map((f, i) => ({
      id: f.id || (Date.now() + i),
      key: f.key.trim(),
      label: f.label.trim() || f.key.trim(),
      type: f.type,
      required: !!f.required,
      bucket: f.bucket,
      validation: f.validation || "",
    }));
    onBack();
  };

  return (
    <div style={{padding: "18px 18px 24px"}}>
      <div className="row" style={{marginBottom: 14}}>
        <button className="btn ghost sm" onClick={onBack}>← All forms</button>
        <span className="spacer"></span>
        <button className="btn sm" onClick={onBack}>Cancel</button>
        <button className="btn primary sm" disabled={!canSave} onClick={handleCreate} title={idCollision ? "A form with this ID already exists" : (!id.trim() || !name.trim() ? "Form ID and Display name are required" : "Create form")}>Create form</button>
      </div>

      <div className="subtabs" style={{display: "flex", gap: 4, borderBottom: "1px solid var(--ink-200)", marginBottom: 18}}>
        {[
          { id: "definition", label: "Definition" },
          { id: "fields",     label: `Fields · ${fields.length}` },
          { id: "template",   label: "Template" },
        ].map(t => (
          <div key={t.id}
               onClick={() => setSubtab(t.id)}
               style={{
                 padding: "8px 14px", fontSize: 13, fontWeight: 500, cursor: "pointer",
                 color: subtab === t.id ? "var(--civic-500)" : "var(--ink-600)",
                 borderBottom: subtab === t.id ? "2px solid var(--civic-500)" : "2px solid transparent",
                 marginBottom: -1,
               }}>
            {t.label}
          </div>
        ))}
      </div>

      {subtab === "definition" && (
      <React.Fragment>
      <div style={{marginBottom: 16, padding: "10px 12px", background: "var(--blue-50, #f0f6ff)", border: "1px solid var(--ink-200)", borderRadius: "var(--radius)", fontSize: 12, color: "var(--ink-700)", display: "flex", alignItems: "center", gap: 8}}>
        <Icons.info size={14} style={{color: "var(--civic-500)", flex: "0 0 auto"}} />
        <span>New forms are written to the Git config repo. The Camel route picks them up on the next reconcile (≈ 30s). Form ID is permanent and used as the Kafka message key.</span>
      </div>

      <div className="form-grid">
        <div className="field">
          <label>Form ID <span style={{color: "var(--red-700, #b91c1c)"}}>*</span></label>
          <input type="text" placeholder="e.g. backup-restore" value={id} onChange={e => setId(e.target.value.replace(/[^a-z0-9-]/g, "").toLowerCase())} style={{fontFamily: "var(--font-mono)", fontSize: 12.5, borderColor: idCollision ? "var(--red-700, #b91c1c)" : undefined}} />
          <div className="help" style={{color: idCollision ? "var(--red-700, #b91c1c)" : undefined}}>{idCollision ? `A form with ID "${id}" already exists.` : "Lowercase, dash-separated. Immutable once created."}</div>
        </div>
        <div className="field">
          <label>Display name <span style={{color: "var(--red-700, #b91c1c)"}}>*</span></label>
          <input type="text" placeholder="e.g. Backup &amp; Restore" value={name} onChange={e => setName(e.target.value)} />
        </div>
        <div className="field">
          <label>Kafka topic</label>
          <input type="text" value={topic} onChange={e => setTopic(e.target.value)} style={{fontFamily: "var(--font-mono)", fontSize: 12.5}} />
        </div>
        <div className="field">
          <label>Status</label>
          <div className="row" style={{height: 36}}>
            <label style={{display: "flex", alignItems: "center", gap: 8, cursor: "pointer"}}>
              <input type="checkbox" checked={active} onChange={e => setActive(e.target.checked)} />
              <span style={{fontSize: 13}}>Activate immediately on save</span>
            </label>
          </div>
        </div>
        <div className="field span-2">
          <label>Description</label>
          <textarea placeholder="What does this form provision? Who can submit it?" value={desc} onChange={e => setDesc(e.target.value)} />
        </div>
      </div>
      </React.Fragment>
      )}

      {subtab === "fields" && (
      <React.Fragment>

      <div className="row" style={{marginBottom: 10}}>
        <h3 style={{margin: 0, fontSize: 14, fontWeight: 600}}>Fields ({fields.length})</h3>
        <span className="muted" style={{fontSize: 12}}>Define the inputs the requester will fill in.</span>
        <span className="spacer"></span>
        <button className="btn sm" onClick={addField}><Icons.plus size={12} /> Add field</button>
      </div>

      <div style={{border: "1px solid var(--ink-200)", borderRadius: "var(--radius)", overflow: "hidden"}}>
        <table className="list">
          <thead>
            <tr>
              <th style={{width: 30}}></th>
              <th>Key</th>
              <th>Label</th>
              <th style={{width: 110}}>Type</th>
              <th style={{width: 90}}>Bucket</th>
              <th style={{width: 80}}>Required</th>
              <th>Validation / options</th>
              <th style={{width: 50}}></th>
            </tr>
          </thead>
          <tbody>
            {fields.map((f, i) => {
              const renderEditableValidation = () => {
                if (f.type === "select") {
                  return <input type="text" value={f.options || ""} onChange={e => updateField(i, {options: e.target.value})} placeholder='value|Label; next|Label' style={{height: 26, padding: "0 6px", fontFamily: "var(--font-mono)", fontSize: 11.5, border: "1px solid var(--ink-200)", borderRadius: 4, background: "var(--paper)", color: "var(--ink-700)", width: "100%"}} />;
                }
                if (f.type === "number") {
                  return (
                    <div style={{display: "flex", gap: 4, alignItems: "center"}}>
                      <input type="number" value={f.min ?? ""} onChange={e => updateField(i, {min: e.target.value === "" ? null : Number(e.target.value)})} placeholder="min" style={{height: 26, padding: "0 6px", fontFamily: "var(--font-mono)", fontSize: 11.5, border: "1px solid var(--ink-200)", borderRadius: 4, background: "var(--paper)", width: "50%"}} />
                      <span className="muted" style={{fontSize: 11}}>–</span>
                      <input type="number" value={f.max ?? ""} onChange={e => updateField(i, {max: e.target.value === "" ? null : Number(e.target.value)})} placeholder="max" style={{height: 26, padding: "0 6px", fontFamily: "var(--font-mono)", fontSize: 11.5, border: "1px solid var(--ink-200)", borderRadius: 4, background: "var(--paper)", width: "50%"}} />
                    </div>
                  );
                }
                if (f.type === "checkbox") return <span className="muted" style={{fontSize: 11.5}}>n/a</span>;
                return <input type="text" value={f.validation || ""} onChange={e => updateField(i, {validation: e.target.value})} placeholder={f.type === "textarea" ? "regex (optional)" : "e.g. ^[a-z][a-z0-9-]*$"} style={{height: 26, padding: "0 6px", fontFamily: "var(--font-mono)", fontSize: 11.5, border: "1px solid var(--ink-200)", borderRadius: 4, background: "var(--paper)", color: "var(--ink-700)", width: "100%"}} />;
              };
              return (
              <tr key={f.id} {...dragProps(i)}>
                <td className="muted mono" style={{cursor: "grab"}} title="Drag to reorder">⋮⋮</td>
                <td>
                  <input type="text" value={f.key} onChange={e => updateField(i, {key: e.target.value})} placeholder="fieldKey" style={{height: 26, padding: "0 6px", fontFamily: "var(--font-mono)", fontSize: 12, border: "1px solid var(--ink-200)", borderRadius: 4, background: "var(--paper)", color: "var(--navy-700)", width: "100%"}} />
                </td>
                <td>
                  <input type="text" value={f.label} onChange={e => updateField(i, {label: e.target.value})} placeholder="Display label" style={{height: 26, padding: "0 6px", fontSize: 12.5, border: "1px solid var(--ink-200)", borderRadius: 4, background: "var(--paper)", width: "100%"}} />
                </td>
                <td>
                  <select value={f.type} onChange={e => updateField(i, {type: e.target.value})} style={{height: 26, padding: "0 4px", fontSize: 12, border: "1px solid var(--ink-200)", borderRadius: 4, background: "var(--paper)", width: "100%"}}>
                    <option value="text">text</option>
                    <option value="number">number</option>
                    <option value="select">select</option>
                    <option value="textarea">textarea</option>
                    <option value="checkbox">checkbox</option>
                  </select>
                </td>
                <td>
                  <select value={f.bucket} onChange={e => updateField(i, {bucket: e.target.value})} style={{height: 26, padding: "0 4px", fontSize: 12, border: "1px solid var(--ink-200)", borderRadius: 4, background: "var(--paper)", width: "100%"}}>
                    <option value="vars">vars</option>
                    <option value="meta">meta</option>
                  </select>
                </td>
                <td>
                  <label style={{display: "flex", alignItems: "center", justifyContent: "center"}}>
                    <input type="checkbox" checked={f.required} onChange={e => updateField(i, {required: e.target.checked})} />
                  </label>
                </td>
                <td>
                  {renderEditableValidation()}
                </td>
                <td>
                  <button className="icon-btn" style={{width: 26, height: 26}} onClick={() => removeField(i)}><Icons.trash size={13} /></button>
                </td>
              </tr>
              );
            })}
            {fields.length === 0 && (
              <tr><td colSpan={8} style={{padding: 28, textAlign: "center", color: "var(--ink-500)", fontSize: 12}}>No fields yet. Click <strong>Add field</strong> to start.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <div style={{marginTop: 18, padding: 14, background: "var(--ink-50)", borderRadius: "var(--radius)", border: "1px solid var(--ink-200)"}}>
        <div style={{fontSize: 12, fontWeight: 600, color: "var(--ink-700)", marginBottom: 6}}>MongoDB document shape (preview)</div>
        <pre style={{margin: 0, fontFamily: "var(--font-mono)", fontSize: 11.5, color: "var(--ink-700)", lineHeight: 1.6, overflowX: "auto"}}>{`{
  "formId": "${slugId}",
  "requestId": "<ulid>",
  "meta":  { ${fields.filter(f => f.bucket === "meta" && f.key).map(f => `"${f.key}": "…"`).join(", ")} },
  "vars":  { ${fields.filter(f => f.bucket === "vars" && f.key).map(f => `"${f.key}": "…"`).join(", ")} }
}`}</pre>
      </div>
      </React.Fragment>
      )}

      {subtab === "template" && (
        <TemplateEditor
          files={files}
          onChange={setFiles}
          fields={fields}
          formId={slugId}
        />
      )}
    </div>
  );
}

function FieldsTable() {
  const all = [];
  Object.entries(window.GDF_ADMIN_DATA.fields).forEach(([fid, list]) => {
    list.forEach(f => all.push({...f, formId: fid}));
  });
  // also synthesize a few cross-form rows
  const synth = [
    { id: 100, formId: "namespace-request", key: "namespaceName", label: "Namespace name", type: "text", required: true, bucket: "vars", validation: "^[a-z0-9-]+$" },
    { id: 101, formId: "namespace-request", key: "cpuQuota", label: "CPU quota (cores)", type: "number", required: true, bucket: "vars", min: 1, max: 32 },
    { id: 102, formId: "scale-request", key: "newNodeCount", label: "New node count", type: "number", required: true, bucket: "vars", min: 1, max: 20 },
  ];
  const rows = [...all, ...synth];
  return (
    <React.Fragment>
      <div className="filters">
        <Icons.filter style={{color: "var(--ink-500)"}} />
        <div className="filter-chip active">All forms</div>
        <div className="filter-chip">Required only</div>
        <div className="filter-chip">By type</div>
        <span className="spacer"></span>
        <span style={{fontSize: 12, color: "var(--ink-500)"}}>{rows.length} fields across {window.GDF_ADMIN_DATA.forms.length} form{window.GDF_ADMIN_DATA.forms.length === 1 ? "" : "s"}</span>
      </div>
      <div className="table-wrap">
        <table className="list">
          <thead>
            <tr>
              <th>Key</th>
              <th>Label</th>
              <th>Form</th>
              <th style={{width: 100}}>Type</th>
              <th style={{width: 80}}>Bucket</th>
              <th style={{width: 80}}>Required</th>
              <th>Validation / options</th>
              <th style={{width: 40}}></th>
            </tr>
          </thead>
          <tbody>
            {rows.map(f => (
              <tr key={f.formId + ":" + f.id}>
                <td className="mono" style={{color: "var(--navy-700)", fontWeight: 500}}>{f.key}</td>
                <td>{f.label}</td>
                <td className="mono muted" style={{fontSize: 11.5}}>{f.formId}</td>
                <td><span className="pill blue" style={{fontSize: 10}}>{f.type}</span></td>
                <td className="mono muted">{f.bucket}</td>
                <td>{f.required ? <Icons.check style={{color: "var(--green-700)"}} /> : <span className="muted">—</span>}</td>
                <td className="mono muted" style={{fontSize: 11.5, maxWidth: 280, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap"}}>
                  {f.validation || (f.options ? f.options : f.min != null ? `${f.min}–${f.max}` : "—")}
                </td>
                <td><Icons.chevronRight style={{color: "var(--ink-400)"}} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </React.Fragment>
  );
}

function UsersTable({ onEdit }) {
  const { users } = window.GDF_ADMIN_DATA;
  const [q, setQ] = useStateA("");
  const [roleF, setRoleF] = useStateA("all");
  const filtered = users.filter(u => {
    if (roleF !== "all" && u.role !== roleF) return false;
    if (q && !(u.name + u.username + u.email).toLowerCase().includes(q.toLowerCase())) return false;
    return true;
  });
  return (
    <React.Fragment>
      <div className="filters">
        <div style={{position: "relative", flex: "0 0 240px"}}>
          <span style={{position: "absolute", left: 8, top: "50%", transform: "translateY(-50%)", color: "var(--ink-400)"}}><Icons.search size={13} /></span>
          <input type="text" placeholder="Search users…" value={q} onChange={e => setQ(e.target.value)}
            style={{width: "100%", height: 28, border: "1px solid var(--ink-200)", borderRadius: "var(--radius)", padding: "0 10px 0 28px", fontSize: 12, background: "var(--paper)", color: "var(--ink-800)"}} />
        </div>
        {["all", "operator", "approver", "admin", "service"].map(r => (
          <div key={r} className={"filter-chip" + (roleF === r ? " active" : "")} onClick={() => setRoleF(r)}>{r}</div>
        ))}
        <span className="spacer"></span>
        <span style={{fontSize: 12, color: "var(--ink-500)"}}>{filtered.length} of {users.length}</span>
      </div>
      <div className="table-wrap">
        <table className="list">
          <thead>
            <tr>
              <th style={{width: 36}}></th>
              <th>Name</th>
              <th>Username</th>
              <th>Email</th>
              <th style={{width: 130}}>Group</th>
              <th style={{width: 110}}>Role</th>
              <th style={{width: 90}}>Status</th>
              <th style={{width: 110}}>Last active</th>
              <th style={{width: 40}}></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(u => (
              <tr key={u.id} onClick={() => onEdit(u)}>
                <td><div className="avatar" style={{width: 24, height: 24, fontSize: 10}}>{u.name.split(" ").map(p => p[0]).join("").slice(0, 2)}</div></td>
                <td><strong>{u.name}</strong></td>
                <td className="mono" style={{color: "var(--civic-500)"}}>{u.username}</td>
                <td className="muted">{u.email}</td>
                <td><span className="pill gray" style={{fontSize: 10.5}}>{u.group}</span></td>
                <td>
                  <span className={"pill " + (u.role === "admin" ? "purple" : u.role === "approver" ? "amber" : u.role === "service" ? "blue" : "gray")} style={{fontSize: 10.5}}>
                    {u.role}
                  </span>
                </td>
                <td>{u.active ? <span className="pill green"><span className="dot"></span>Active</span> : <span className="pill red"><span className="dot"></span>Disabled</span>}</td>
                <td className="muted">{u.last}</td>
                <td><Icons.chevronRight style={{color: "var(--ink-400)"}} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </React.Fragment>
  );
}

function UserEditor({ user, onBack }) {
  const [pw, setPw] = useStateA("");
  return (
    <div style={{padding: "18px 18px 24px"}}>
      <div className="row" style={{marginBottom: 14}}>
        <button className="btn ghost sm" onClick={onBack}>← All users</button>
        <span className="spacer"></span>
        <button className="btn sm danger"><Icons.trash size={12} /> Disable account</button>
        <button className="btn primary sm">Save changes</button>
      </div>

      <div className="row" style={{gap: 14, marginBottom: 22, padding: 16, background: "var(--ink-50)", borderRadius: "var(--radius)", border: "1px solid var(--ink-200)"}}>
        <div className="avatar" style={{width: 48, height: 48, fontSize: 16}}>{user.name.split(" ").map(p => p[0]).join("").slice(0, 2)}</div>
        <div style={{flex: 1}}>
          <div style={{fontSize: 16, fontWeight: 600, color: "var(--ink-900)"}}>{user.name}</div>
          <div className="mono" style={{fontSize: 12, color: "var(--ink-500)"}}>{user.username} · {user.email}</div>
        </div>
        <span className={"pill " + (user.active ? "green" : "red")}>
          <span className="dot"></span>{user.active ? "Active" : "Disabled"}
        </span>
      </div>

      <div className="form-grid">
        <div className="field">
          <label>Display name <span className="req">*</span></label>
          <input type="text" defaultValue={user.name} />
        </div>
        <div className="field">
          <label>Username <span className="req">*</span></label>
          <input type="text" defaultValue={user.username} style={{fontFamily: "var(--font-mono)", fontSize: 12.5}} />
        </div>
        <div className="field">
          <label>Email <span className="req">*</span></label>
          <input type="text" defaultValue={user.email} />
        </div>
        <div className="field">
          <label>Group / Department <span className="req">*</span></label>
          <select defaultValue={user.group}>
            {window.GDF_DATA.ORGS.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
            <option value="setic">SETIC (Platform)</option>
          </select>
          <div className="help">Determines Git repo and ManagedClusterSet access.</div>
        </div>
        <div className="field">
          <label>Role <span className="req">*</span></label>
          <select defaultValue={user.role}>
            <option value="operator">Operator — submit requests</option>
            <option value="approver">Approver — review group requests</option>
            <option value="admin">Platform Admin — full access</option>
            <option value="service">Service account — automation</option>
          </select>
        </div>
        <div className="field">
          <label>Account status</label>
          <div className="radio-group" style={{gridTemplateColumns: "1fr 1fr"}}>
            <div className={"radio-card" + (user.active ? " selected" : "")}>
              <div className="rc-title"><span style={{display: "inline-block", width: 8, height: 8, borderRadius: "50%", background: "var(--green-500)"}}/>Active</div>
              <div className="rc-sub">Can sign in and submit</div>
            </div>
            <div className={"radio-card" + (!user.active ? " selected" : "")}>
              <div className="rc-title"><span style={{display: "inline-block", width: 8, height: 8, borderRadius: "50%", background: "var(--red-500)"}}/>Disabled</div>
              <div className="rc-sub">Sign-in blocked</div>
            </div>
          </div>
        </div>

        <div className="field span-2">
          <div style={{borderTop: "1px solid var(--ink-200)", paddingTop: 14, marginTop: 4}}>
            <h3 style={{margin: "0 0 10px", fontSize: 13, fontWeight: 600, color: "var(--ink-800)"}}>Credentials</h3>
          </div>
        </div>
        <div className="field">
          <label>Set new password</label>
          <input type="password" placeholder="Leave blank to keep current" value={pw} onChange={e => setPw(e.target.value)} />
          <div className="help">Min 12 chars · stored hashed (argon2id) · forces re-login.</div>
        </div>
        <div className="field">
          <label>Multi-factor</label>
          <select defaultValue="totp">
            <option value="off">Disabled</option>
            <option value="totp">TOTP (authenticator app)</option>
            <option value="webauthn">WebAuthn / Passkey</option>
          </select>
        </div>
      </div>

      <div style={{marginTop: 22, padding: 14, background: "var(--ink-50)", borderRadius: "var(--radius)", border: "1px solid var(--ink-200)"}}>
        <div className="row" style={{marginBottom: 8}}>
          <strong style={{fontSize: 13, color: "var(--ink-800)"}}>Recent sessions</strong>
          <span className="spacer"></span>
          <button className="btn sm ghost">Revoke all</button>
        </div>
        {[
          { ip: "10.42.18.103", agent: "Firefox 124 · Linux", when: "now" },
          { ip: "10.42.18.103", agent: "Firefox 124 · Linux", when: "yesterday 16:08" },
          { ip: "192.168.0.51",  agent: "Chrome 122 · macOS",  when: "2026-04-22 09:12" },
        ].map((s, i) => (
          <div key={i} className="row" style={{padding: "6px 0", borderTop: i > 0 ? "1px solid var(--ink-200)" : "none", fontSize: 12.5}}>
            <span className="mono" style={{width: 130, color: "var(--ink-700)"}}>{s.ip}</span>
            <span style={{flex: 1, color: "var(--ink-600)"}}>{s.agent}</span>
            <span className="muted mono" style={{fontSize: 11.5}}>{s.when}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function NewUserPage({ onBack }) {
  const [name, setName] = useStateA("");
  const [username, setUsername] = useStateA("");
  const [email, setEmail] = useStateA("");
  const [group, setGroup] = useStateA("saude");
  const [role, setRole] = useStateA("operator");
  const [active, setActive] = useStateA(true);
  const [sendInvite, setSendInvite] = useStateA(true);
  const [mfa, setMfa] = useStateA("totp");
  const canSave = name.trim() && username.trim() && email.trim();

  return (
    <div style={{padding: "18px 18px 24px"}}>
      <div className="row" style={{marginBottom: 14}}>
        <button className="btn ghost sm" onClick={onBack}>← All users</button>
        <span className="spacer"></span>
        <button className="btn sm" onClick={onBack}>Cancel</button>
        <button className="btn primary sm" disabled={!canSave} onClick={onBack}>Create user</button>
      </div>

      <div style={{marginBottom: 16, padding: "10px 12px", background: "var(--blue-50, #f0f6ff)", border: "1px solid var(--ink-200)", borderRadius: "var(--radius)", fontSize: 12, color: "var(--ink-700)", display: "flex", alignItems: "center", gap: 8}}>
        <Icons.info size={14} style={{color: "var(--civic-500)", flex: "0 0 auto"}} />
        <span>The user is provisioned in Keycloak and synced to MongoDB. Group membership grants ManagedClusterSet access via the matching Git repo.</span>
      </div>

      <div className="form-grid">
        <div className="field">
          <label>Display name <span className="req">*</span></label>
          <input type="text" placeholder="e.g. Ana Pereira" value={name} onChange={e => setName(e.target.value)} />
        </div>
        <div className="field">
          <label>Username <span className="req">*</span></label>
          <input type="text" placeholder="e.g. ana.pereira" value={username} onChange={e => setUsername(e.target.value.replace(/[^a-z0-9.\-_]/gi, "").toLowerCase())} style={{fontFamily: "var(--font-mono)", fontSize: 12.5}} />
          <div className="help">Lowercase. Used as the JWT subject.</div>
        </div>
        <div className="field span-2">
          <label>Email <span className="req">*</span></label>
          <input type="email" placeholder="ana.pereira@saude.gov" value={email} onChange={e => setEmail(e.target.value)} />
        </div>
        <div className="field">
          <label>Group / Department <span className="req">*</span></label>
          <select value={group} onChange={e => setGroup(e.target.value)}>
            {(window.GDF_DATA?.ORGS || []).map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
            <option value="setic">SETIC (Platform)</option>
          </select>
          <div className="help">Determines Git repo and ManagedClusterSet access.</div>
        </div>
        <div className="field">
          <label>Role <span className="req">*</span></label>
          <select value={role} onChange={e => setRole(e.target.value)}>
            <option value="operator">Operator — submit requests</option>
            <option value="approver">Approver — review group requests</option>
            <option value="admin">Platform Admin — full access</option>
            <option value="service">Service account — automation</option>
          </select>
        </div>
        <div className="field">
          <label>Account status</label>
          <div className="radio-group" style={{gridTemplateColumns: "1fr 1fr"}}>
            <div className={"radio-card" + (active ? " selected" : "")} onClick={() => setActive(true)}>
              <div className="rc-title"><span style={{display: "inline-block", width: 8, height: 8, borderRadius: "50%", background: "var(--green-500)"}}/>Active</div>
              <div className="rc-sub">Can sign in immediately</div>
            </div>
            <div className={"radio-card" + (!active ? " selected" : "")} onClick={() => setActive(false)}>
              <div className="rc-title"><span style={{display: "inline-block", width: 8, height: 8, borderRadius: "50%", background: "var(--ink-400)"}}/>Inactive</div>
              <div className="rc-sub">Provisioned, sign-in blocked</div>
            </div>
          </div>
        </div>
        <div className="field">
          <label>Multi-factor</label>
          <select value={mfa} onChange={e => setMfa(e.target.value)}>
            <option value="off">Disabled</option>
            <option value="totp">TOTP (authenticator app)</option>
            <option value="webauthn">WebAuthn / Passkey</option>
          </select>
          <div className="help">User configures on first sign-in.</div>
        </div>

        <div className="field span-2">
          <div style={{borderTop: "1px solid var(--ink-200)", paddingTop: 14, marginTop: 4}}>
            <h3 style={{margin: "0 0 10px", fontSize: 13, fontWeight: 600, color: "var(--ink-800)"}}>Initial credentials</h3>
          </div>
        </div>
        <div className="field span-2">
          <label style={{display: "flex", alignItems: "center", gap: 8, cursor: "pointer"}}>
            <input type="checkbox" checked={sendInvite} onChange={e => setSendInvite(e.target.checked)} />
            <span style={{fontSize: 13}}>Send password-setup email to {email || "the address above"}</span>
          </label>
          <div className="help" style={{marginLeft: 24}}>
            {sendInvite ? "Invite link expires in 24h. User sets their own password and MFA." : "Generate a temporary password to share manually. User must change it on first sign-in."}
          </div>
        </div>
      </div>
    </div>
  );
}

function GroupsTable() {
  const groups = [
    { id: "saude",       name: "Saúde",           full: "Department of Health",         users: 8,  forms: 4, repo: "gdfkube-saude",       clusters: 2 },
    { id: "educacao",    name: "Educação",        full: "Department of Education",      users: 6,  forms: 4, repo: "gdfkube-educacao",    clusters: 2 },
    { id: "transportes", name: "Transportes",     full: "Department of Transportation", users: 4,  forms: 4, repo: "gdfkube-transportes", clusters: 2 },
    { id: "fazenda",     name: "Fazenda",         full: "Department of Finance",        users: 5,  forms: 4, repo: "gdfkube-fazenda",     clusters: 1 },
    { id: "agricultura", name: "Agricultura",     full: "Department of Agriculture",    users: 3,  forms: 4, repo: "gdfkube-agricultura", clusters: 0 },
    { id: "seguranca",   name: "Segurança",       full: "Department of Public Safety",  users: 4,  forms: 4, repo: "gdfkube-seguranca",   clusters: 1 },
    { id: "setic",       name: "SETIC",           full: "Platform Engineering",         users: 3,  forms: 6, repo: "gdfkube-infra",       clusters: null },
  ];
  return (
    <div className="table-wrap">
      <table className="list">
        <thead>
          <tr>
            <th>Group ID</th>
            <th>Name</th>
            <th>Full name</th>
            <th style={{width: 80}}>Users</th>
            <th style={{width: 80}}>Forms</th>
            <th>Git repo</th>
            <th style={{width: 90}}>Clusters</th>
            <th style={{width: 40}}></th>
          </tr>
        </thead>
        <tbody>
          {groups.map(g => (
            <tr key={g.id}>
              <td className="mono" style={{color: "var(--civic-500)", fontWeight: 500}}>{g.id}</td>
              <td><strong>{g.name}</strong></td>
              <td className="muted">{g.full}</td>
              <td className="mono">{g.users}</td>
              <td className="mono">{g.forms}</td>
              <td className="mono muted" style={{fontSize: 11.5}}>{g.repo}</td>
              <td className="mono">{g.clusters == null ? "—" : g.clusters}</td>
              <td><Icons.chevronRight style={{color: "var(--ink-400)"}} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function NewGroupPage({ onBack }) {
  const [id, setId] = useStateA("");
  const [name, setName] = useStateA("");
  const [full, setFull] = useStateA("");
  const [repo, setRepo] = useStateA("");
  const [clusterSet, setClusterSet] = useStateA("shared");
  const [provisionRepo, setProvisionRepo] = useStateA(true);
  const canSave = id.trim() && name.trim();

  // Auto-suggest repo name when id changes
  React.useEffect(() => {
    if (id && !repo) setRepo("gdfkube-" + id);
  }, [id]);

  return (
    <div style={{padding: "18px 18px 24px"}}>
      <div className="row" style={{marginBottom: 14}}>
        <button className="btn ghost sm" onClick={onBack}>← All groups</button>
        <span className="spacer"></span>
        <button className="btn sm" onClick={onBack}>Cancel</button>
        <button className="btn primary sm" disabled={!canSave} onClick={onBack}>Create group</button>
      </div>

      <div style={{marginBottom: 16, padding: "10px 12px", background: "var(--blue-50, #f0f6ff)", border: "1px solid var(--ink-200)", borderRadius: "var(--radius)", fontSize: 12, color: "var(--ink-700)", display: "flex", alignItems: "center", gap: 8}}>
        <Icons.info size={14} style={{color: "var(--civic-500)", flex: "0 0 auto"}} />
        <span>A new Git repo is created and bound to a ManagedClusterSet. ArgoCD ApplicationSet picks it up on the next reconcile.</span>
      </div>

      <div className="form-grid">
        <div className="field">
          <label>Group ID <span className="req">*</span></label>
          <input type="text" placeholder="e.g. cultura" value={id} onChange={e => setId(e.target.value.replace(/[^a-z0-9-]/g, "").toLowerCase())} style={{fontFamily: "var(--font-mono)", fontSize: 12.5}} />
          <div className="help">Lowercase, dash-separated. Used in JWT claims and repo name.</div>
        </div>
        <div className="field">
          <label>Display name <span className="req">*</span></label>
          <input type="text" placeholder="e.g. Cultura" value={name} onChange={e => setName(e.target.value)} />
        </div>
        <div className="field span-2">
          <label>Full name</label>
          <input type="text" placeholder="e.g. Department of Culture" value={full} onChange={e => setFull(e.target.value)} />
        </div>
        <div className="field">
          <label>Git repository</label>
          <input type="text" value={repo} onChange={e => setRepo(e.target.value)} style={{fontFamily: "var(--font-mono)", fontSize: 12.5}} />
          <div className="help">Holds the group's manifests and request history.</div>
        </div>
        <div className="field">
          <label>ManagedClusterSet</label>
          <select value={clusterSet} onChange={e => setClusterSet(e.target.value)}>
            <option value="shared">shared — multi-tenant clusters</option>
            <option value="dedicated">dedicated — group-specific clusters</option>
            <option value="none">none — no cluster access yet</option>
          </select>
        </div>
        <div className="field span-2">
          <label style={{display: "flex", alignItems: "center", gap: 8, cursor: "pointer"}}>
            <input type="checkbox" checked={provisionRepo} onChange={e => setProvisionRepo(e.target.checked)} />
            <span style={{fontSize: 13}}>Auto-provision Git repo &amp; seed with template manifests</span>
          </label>
          <div className="help" style={{marginLeft: 24}}>
            {provisionRepo ? "A new repo is created on the platform Forgejo with branch protection and SETIC as code-owner." : "Repo must already exist; you'll be prompted to point at it."}
          </div>
        </div>
      </div>

      <div style={{marginTop: 18, padding: 14, background: "var(--ink-50)", borderRadius: "var(--radius)", border: "1px solid var(--ink-200)"}}>
        <div style={{fontSize: 12, fontWeight: 600, color: "var(--ink-700)", marginBottom: 6}}>Resources that will be created</div>
        <div style={{fontFamily: "var(--font-mono)", fontSize: 11.5, color: "var(--ink-700)", lineHeight: 1.8}}>
          <div>• Keycloak group <span style={{color: "var(--navy-700)"}}>/{id || "<id>"}</span></div>
          <div>• Git repo <span style={{color: "var(--navy-700)"}}>{repo || "gdfkube-<id>"}</span></div>
          <div>• ArgoCD AppProject <span style={{color: "var(--navy-700)"}}>{id || "<id>"}-apps</span></div>
          <div>• ManagedClusterSetBinding → <span style={{color: "var(--navy-700)"}}>{clusterSet}</span></div>
        </div>
      </div>
    </div>
  );
}

window.AdminConsole = AdminConsole;
