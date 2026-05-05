// My Requests list page
function RequestsList({ navigate, role }) {
  const { REQUESTS, ORGS } = window.GDF_DATA;
  const [tab, setTab] = React.useState("mine");
  const [filter, setFilter] = React.useState("all");
  const [, force] = React.useReducer(x => x + 1, 0);
  React.useEffect(() => { const t = setInterval(force, 1500); return () => clearInterval(t); }, []);

  const tabs = [
    { id: "mine", label: "My requests", count: REQUESTS.filter(r => r.requester === "joao.silva").length },
    { id: "group", label: "My department", count: REQUESTS.filter(r => r.org === "saude").length },
    ...(role === "admin" ? [{ id: "all", label: "All", count: REQUESTS.length }] : []),
  ];

  let rows = REQUESTS;
  if (tab === "mine") rows = rows.filter(r => r.requester === "joao.silva" || r.live);
  else if (tab === "group") rows = rows.filter(r => r.org === "saude");

  if (filter !== "all") rows = rows.filter(r => r.status === filter);

  const statusFilters = [
    { id: "all", label: "All" },
    { id: "provisioning", label: "Provisioning" },
    { id: "approval", label: "Awaiting approval" },
    { id: "ready", label: "Ready" },
    { id: "failed", label: "Failed" },
  ];

  return (
    <div className="page">
      <div className="page-head">
        <div className="page-head-row">
          <div>
            <h1 className="page-title">{role === "admin" ? "All Requests" : "My Requests"}</h1>
            <p className="page-sub">Cluster provisioning requests submitted through the IT service portal.</p>
          </div>
          <div className="row">
            <button className="btn ghost"><Icons.download /> CSV</button>
            <button className="btn primary" onClick={() => navigate("new-request")}><Icons.plus /> New request</button>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="tabs" style={{margin: 0, padding: "0 14px"}}>
          {tabs.map(t => (
            <div key={t.id} className={"tab" + (tab === t.id ? " active" : "")} onClick={() => setTab(t.id)}>
              {t.label}<span className="count">· {t.count}</span>
            </div>
          ))}
        </div>
        <div className="filters">
          <Icons.filter style={{color: "var(--ink-500)"}} />
          {statusFilters.map(s => (
            <div key={s.id} className={"filter-chip" + (filter === s.id ? " active" : "")} onClick={() => setFilter(s.id)}>
              {s.label}
            </div>
          ))}
          <span className="spacer"></span>
          <span style={{fontSize: 12, color: "var(--ink-500)"}}>Showing {rows.length} of {REQUESTS.length}</span>
        </div>
        <div className="table-wrap">
          <table className="list">
            <thead>
              <tr>
                <th style={{width: 110}}>Number</th>
                <th>Cluster</th>
                <th style={{width: 130}}>Department</th>
                <th style={{width: 110}}>Environment</th>
                <th style={{width: 80}}>Nodes</th>
                <th style={{width: 130}}>Requester</th>
                <th style={{width: 160}}>Status</th>
                <th style={{width: 150}}>Submitted</th>
                <th style={{width: 40}}></th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.id} onClick={() => navigate("request-detail", {id: r.id})}>
                  <td><span className="row-id">{r.id}</span></td>
                  <td>
                    <strong>{r.cluster}</strong>
                  </td>
                  <td className="muted">{ORGS.find(o => o.id === r.org)?.name}</td>
                  <td>
                    <span className="mono" style={{color: r.env === "production" ? "var(--red-700)" : r.env === "staging" ? "var(--amber-700)" : "var(--green-700)"}}>
                      {r.env}
                    </span>
                  </td>
                  <td className="mono">{r.nodes}</td>
                  <td className="muted">{r.requesterFull}</td>
                  <td>
                    <StatusPill status={r.status} />
                    {r.status === "provisioning" && (
                      <div className="progress" style={{marginTop: 6, width: 100}}>
                        <div style={{width: r.progress + "%"}}></div>
                      </div>
                    )}
                  </td>
                  <td className="muted mono">{r.submitted}</td>
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

window.RequestsList = RequestsList;
