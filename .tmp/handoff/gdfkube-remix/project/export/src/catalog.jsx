// Service Catalog — sourced from the admin Forms registry so adding/disabling
// a form there reflects here immediately.

const FORM_PRESENTATION = {
  "cluster-request":   { icon: "cluster", desc: "Provision a HyperShift hosted control plane cluster for your team.",          meta: ["~1m 47s", "GitOps"],     featured: true,  shortTitle: "OpenShift Cluster" },
  "namespace-request": { icon: "ns",      desc: "Request a namespace on a shared cluster with RBAC and quotas.",                meta: ["~5 min", "Self-service"], featured: false, shortTitle: "Namespace Onboarding" },
  "scale-request":     { icon: "scale",   desc: "Adjust node count or instance type for an existing hosted cluster.",           meta: ["~3 min", "Approval"],    featured: false, shortTitle: "Cluster Scale Change" },
};

function presentationFor(form) {
  const p = FORM_PRESENTATION[form.id] || {};
  const fieldCount = (window.GDF_ADMIN_DATA && window.GDF_ADMIN_DATA.fields[form.id] || []).length || form.fields || 0;
  return {
    icon: p.icon || "form",
    desc: p.desc || `Submit a ${form.name.toLowerCase()} request through the gdfkube pipeline.`,
    meta: p.meta || [`${fieldCount} field${fieldCount === 1 ? "" : "s"}`, "GitOps"],
    featured: !!p.featured,
    shortTitle: p.shortTitle || form.name,
  };
}

function Catalog({ navigate }) {
  const forms = (window.GDF_ADMIN_DATA && window.GDF_ADMIN_DATA.forms || []).filter(f => f.active);

  return (
    <div className="page">
      <div className="page-head">
        <h1 className="page-title">Service Catalog</h1>
        <p className="page-sub">Self-service requests for cluster lifecycle and platform services. All requests are processed through the GitOps pipeline.</p>
      </div>

      {forms.length === 0 ? (
        <div className="card"><div className="empty"><Icons.form size={32} /><div style={{marginTop: 8}}>No active forms. Ask an administrator to publish one.</div></div></div>
      ) : (
        <div className="catalog-grid">
          {forms.map(form => {
            const p = presentationFor(form);
            const Ic = Icons[p.icon] || Icons.form;
            return (
              <div key={form.id}
                   className={"cat-tile" + (p.featured ? " featured" : "")}
                   onClick={() => navigate("new-request", { formId: form.id })}>
                <div className="icn-box"><Ic size={22} /></div>
                <h3>{p.shortTitle}</h3>
                <p>{p.desc}</p>
                <div className="meta">
                  {p.meta.map((m, i) => <span key={i}><Icons.clock size={12} style={{marginRight: 4, verticalAlign: -2}} />{m}</span>)}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

window.Catalog = Catalog;
window.FORM_PRESENTATION = FORM_PRESENTATION;
window.presentationFor = presentationFor;
