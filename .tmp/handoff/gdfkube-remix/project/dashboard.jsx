// Dashboard / Home page
const { useState: useStateD } = React;

function Dashboard({ navigate, role }) {
  const { KPIS, RECENT_ACTIVITY, REQUESTS } = window.GDF_DATA;
  const myRecent = REQUESTS.slice(0, 4);

  return (
    <div className="page">
      <div className="page-head">
        <div className="page-head-row">
          <div>
            <h1 className="page-title">{role === "admin" ? "Platform Overview" : "Welcome back, João"}</h1>
            <p className="page-sub">{role === "admin" ? "Fleet health and recent activity across all departments." : "Saúde · Department of Health · Operator role"}</p>
          </div>
          <div className="row">
            <button className="btn primary" onClick={() => navigate("new-request")}><Icons.plus /> New cluster request</button>
          </div>
        </div>
      </div>

      <div className="banner">
        <div className="icn"><Icons.info /></div>
        <div className="flex-1">
          <h4>Pipeline operating normally</h4>
          <p>Last 24h: 12 clusters provisioned · median time-to-ready 1m 47s · 0 manual interventions.</p>
        </div>
        <button className="btn" style={{background: "rgba(255,255,255,0.1)", borderColor: "rgba(255,255,255,0.2)", color: "white"}} onClick={() => navigate("requests")}>View activity</button>
      </div>

      <div className="kpi-grid" style={{marginBottom: 18}}>
        {KPIS.map((k, i) => (
          <div key={i} className="kpi" style={{"--accent": k.accent}}>
            <div className="kpi-label">{k.label}</div>
            <div className="kpi-value">{k.value}</div>
            <div className="kpi-delta">
              {k.trend === "up" && <span className="up">▲ </span>}
              {k.trend === "down" && <span className="down">▼ </span>}
              {k.delta}
            </div>
          </div>
        ))}
      </div>

      <div className="detail-grid">
        <div className="card">
          <div className="card-head">
            <h3 className="card-title">Recent Requests</h3>
            <button className="btn sm ghost" onClick={() => navigate("requests")}>View all <Icons.chevronRight /></button>
          </div>
          <div className="table-wrap">
            <table className="list">
              <thead>
                <tr>
                  <th style={{width: 110}}>Number</th>
                  <th>Cluster</th>
                  <th>Department</th>
                  <th>Status</th>
                  <th>Submitted</th>
                </tr>
              </thead>
              <tbody>
                {myRecent.map(r => (
                  <tr key={r.id} onClick={() => navigate("request-detail", {id: r.id})}>
                    <td><span className="row-id">{r.id}</span></td>
                    <td><strong>{r.cluster}</strong> <span className="muted">/ {r.env}</span></td>
                    <td className="muted">{window.GDF_DATA.ORGS.find(o => o.id === r.org)?.name}</td>
                    <td><StatusPill status={r.status} /></td>
                    <td className="muted">{r.submitted.split(" ")[1]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="card">
          <div className="card-head">
            <h3 className="card-title">Activity Stream</h3>
            <button className="btn sm ghost"><Icons.refresh /></button>
          </div>
          <div style={{padding: "8px 0"}}>
            {RECENT_ACTIVITY.map((a, i) => (
              <div key={i} style={{display: "flex", gap: 12, padding: "10px 18px", borderBottom: i < RECENT_ACTIVITY.length - 1 ? "1px solid var(--ink-100)" : "none"}}>
                <div style={{width: 8, height: 8, borderRadius: "50%", marginTop: 6, flexShrink: 0,
                  background: a.type === "ok" ? "var(--green-500)" : a.type === "warn" ? "var(--amber-500)" : a.type === "err" ? "var(--red-500)" : "var(--civic-400)"}} />
                <div style={{flex: 1, minWidth: 0}}>
                  <div style={{fontSize: 12.5, color: "var(--ink-800)", lineHeight: 1.4}}>{a.txt}</div>
                  <div style={{fontSize: 11, color: "var(--ink-500)", marginTop: 2}}>{a.time} · by {a.who}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function StatusPill({ status }) {
  const map = {
    ready:        { cls: "green",  label: "Ready" },
    provisioning: { cls: "blue",   label: "Provisioning" },
    approval:     { cls: "amber",  label: "Awaiting approval" },
    failed:       { cls: "red",    label: "Failed" },
    pending:      { cls: "gray",   label: "Pending" },
    healthy:      { cls: "green",  label: "Healthy" },
    degraded:     { cls: "amber",  label: "Degraded" },
  };
  const m = map[status] || { cls: "gray", label: status };
  return <span className={"pill " + m.cls}><span className="dot"></span>{m.label}</span>;
}

window.Dashboard = Dashboard;
window.StatusPill = StatusPill;
