// Admin clusters page
function ClustersAdmin({ navigate }) {
  const { CLUSTERS, ORGS } = window.GDF_DATA;
  const [orgFilter, setOrgFilter] = React.useState("all");
  const [envFilter, setEnvFilter] = React.useState("all");

  let rows = CLUSTERS;
  if (orgFilter !== "all") rows = rows.filter(c => c.org === orgFilter);
  if (envFilter !== "all") rows = rows.filter(c => c.env === envFilter);

  const byOrg = ORGS.map(o => ({...o, count: CLUSTERS.filter(c => c.org === o.id).length}));

  return (
    <div className="page">
      <div className="page-head">
        <div className="page-head-row">
          <div>
            <h1 className="page-title">Clusters · Fleet</h1>
            <p className="page-sub">All HyperShift hosted clusters managed across departments. Admin view.</p>
          </div>
          <div className="row">
            <button className="btn ghost"><Icons.refresh /> Refresh</button>
            <button className="btn ghost"><Icons.download /> Export</button>
          </div>
        </div>
      </div>

      <div className="kpi-grid" style={{gridTemplateColumns: "repeat(6, 1fr)", marginBottom: 18}}>
        {byOrg.map(o => (
          <div key={o.id} className={"kpi" + (orgFilter === o.id ? "" : "")}
               style={{cursor: "pointer", padding: "12px 14px", "--accent": orgFilter === o.id ? "var(--civic-500)" : "var(--ink-300)"}}
               onClick={() => setOrgFilter(orgFilter === o.id ? "all" : o.id)}>
            <div className="kpi-label" style={{fontSize: 10.5}}>{o.name}</div>
            <div className="kpi-value" style={{fontSize: 22}}>{o.count}</div>
            <div className="kpi-delta">clusters</div>
          </div>
        ))}
      </div>

      <div className="card">
        <div className="filters">
          <Icons.filter style={{color: "var(--ink-500)"}} />
          <span style={{fontSize: 12, color: "var(--ink-500)"}}>Environment:</span>
          {["all", "development", "staging", "production"].map(e => (
            <div key={e} className={"filter-chip" + (envFilter === e ? " active" : "")} onClick={() => setEnvFilter(e)}>
              {e}
            </div>
          ))}
          <span className="spacer"></span>
          <span style={{fontSize: 12, color: "var(--ink-500)"}}>{rows.length} clusters</span>
        </div>
        <div className="table-wrap">
          <table className="list">
            <thead>
              <tr>
                <th>Cluster name</th>
                <th>Department</th>
                <th>Environment</th>
                <th>Version</th>
                <th>Nodes</th>
                <th>Region</th>
                <th>Age</th>
                <th>Health</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((c, i) => (
                <tr key={i}>
                  <td>
                    <strong>{c.name}</strong>
                    <div className="mono" style={{fontSize: 11, color: "var(--ink-500)"}}>hc-{c.org}-{c.name}</div>
                  </td>
                  <td>{ORGS.find(o => o.id === c.org)?.name}</td>
                  <td>
                    <span className="mono" style={{color: c.env === "production" ? "var(--red-700)" : c.env === "staging" ? "var(--amber-700)" : "var(--green-700)"}}>
                      {c.env}
                    </span>
                  </td>
                  <td className="mono">{c.version}</td>
                  <td className="mono">{c.nodes}</td>
                  <td className="muted">{c.region}</td>
                  <td className="muted">{c.age}</td>
                  <td><StatusPill status={c.health} /></td>
                  <td><Icons.chevronRight style={{color: "var(--ink-400)"}} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

window.ClustersAdmin = ClustersAdmin;
