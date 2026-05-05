// Request detail with animated CDC pipeline
function RequestDetail({ id, navigate, role, fresh, pipelineSpeed }) {
  const { REQUESTS, ORGS, PIPELINE_STAGES, ACTIVITY_LOG } = window.GDF_DATA;
  const req = REQUESTS.find(r => r.id === id) || REQUESTS[0];
  const totalStages = PIPELINE_STAGES.length;

  const [stage, setStage] = React.useState(fresh ? 0 : req.stage);
  const [progress, setProgress] = React.useState(fresh ? 0 : req.progress);
  const [running, setRunning] = React.useState(fresh || req.status === "provisioning");
  const [logs, setLogs] = React.useState(fresh ? [] : ACTIVITY_LOG.slice(0, Math.min(req.stage + 2, ACTIVITY_LOG.length)));
  const stepDur = Math.max(400, 1800 / (pipelineSpeed || 1));

  React.useEffect(() => {
    if (!running) return;
    if (stage >= totalStages) { setRunning(false); req.status = "ready"; req.stage = totalStages; req.progress = 100; return; }
    const t = setTimeout(() => {
      setStage(s => s + 1);
      setProgress(p => Math.min(100, Math.round(((stage + 1) / totalStages) * 100)));
      const newLog = ACTIVITY_LOG[Math.min(stage + 1, ACTIVITY_LOG.length - 1)];
      if (newLog) setLogs(l => [...l, {...newLog, ts: nowTs()}]);
    }, stepDur);
    return () => clearTimeout(t);
  }, [running, stage, stepDur]);

  function nowTs() {
    const d = new Date();
    return `${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}:${String(d.getSeconds()).padStart(2,"0")}.${String(d.getMilliseconds()).padStart(3,"0")}`;
  }

  const org = ORGS.find(o => o.id === req.org);
  const isFailed = req.status === "failed";
  const failedAt = isFailed ? req.stage : -1;

  return (
    <div className="page">
      <div className="page-head">
        <div className="page-head-row">
          <div>
            <div className="row" style={{gap: 10, marginBottom: 6}}>
              <span className="row-id" style={{fontSize: 14}}>{req.id}</span>
              <StatusPill status={req.status} />
            </div>
            <h1 className="page-title">Cluster {req.cluster} · {org?.name}</h1>
            <p className="page-sub">Submitted {req.submitted} by {req.requesterFull} ({req.requester}@{req.org})</p>
          </div>
          <div className="row">
            <button className="btn ghost" onClick={() => navigate("requests")}>← Back</button>
            <button className="btn"><Icons.link /> Open in Gitea</button>
            {role === "admin" && req.status === "approval" && (
              <button className="btn primary"><Icons.check /> Approve</button>
            )}
            {req.status === "ready" && <button className="btn"><Icons.download /> kubeconfig</button>}
          </div>
        </div>
      </div>

      <div className="pipeline" style={{marginBottom: 18}}>
        <div className="pipe-head">
          <div className="row" style={{gap: 14}}>
            <h3>Provisioning Pipeline</h3>
            {running && <span className="pill blue"><span className="dot"></span>Live · stage {Math.min(stage + 1, totalStages)} of {totalStages}</span>}
            {!running && req.status === "ready" && <span className="pill green"><Icons.check size={11} /> Completed in 1m 43s</span>}
            {isFailed && <span className="pill red"><Icons.alert size={11} /> Failed at {PIPELINE_STAGES[failedAt]?.label}</span>}
          </div>
          <div className="row">
            <span style={{fontSize: 12, color: "var(--ink-500)"}}>Overall</span>
            <div className="progress" style={{width: 180}}><div style={{width: progress + "%"}}></div></div>
            <span className="mono" style={{fontSize: 12, color: "var(--ink-700)"}}>{progress}%</span>
          </div>
        </div>
        <div className="pipe-stages">
          {PIPELINE_STAGES.map((s, i) => {
            const Ic = Icons[s.icon] || Icons.cluster;
            let cls = "";
            if (isFailed) {
              if (i < failedAt) cls = "done";
              else if (i === failedAt) cls = "failed";
            } else {
              if (i < stage) cls = "done";
              else if (i === stage && running) cls = "active";
              else if (i < req.stage && !running) cls = "done";
            }
            return (
              <div key={s.key} className={"pipe-stage " + cls}>
                <div className="node"><Ic size={13} /></div>
                <div className="label">{s.label}</div>
                <div className="sublabel">{s.sub}</div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="detail-grid">
        <div className="col">
          <div className="card">
            <div className="card-head"><h3 className="card-title">Request Details</h3></div>
            <div className="card-body">
              <dl className="dl">
                <dt>Number</dt>      <dd className="row-id">{req.id}</dd>
                <dt>ULID</dt>        <dd className="mono" style={{fontSize: 11}}>{req.requestId}</dd>
                <dt>Form</dt>        <dd className="mono">cluster-request</dd>
                <dt>Department</dt>  <dd>{org?.name} <span className="muted">({req.org})</span></dd>
                <dt>Cluster</dt>     <dd><strong>{req.cluster}</strong></dd>
                <dt>Namespace</dt>   <dd className="mono">hc-{req.org}-{req.cluster}</dd>
                <dt>Environment</dt> <dd><span className="pill blue">{req.env}</span></dd>
                <dt>Nodes</dt>       <dd>{req.nodes} × KubeVirt</dd>
                <dt>Requester</dt>   <dd>{req.requesterFull}</dd>
                <dt>Submitted</dt>   <dd className="mono" style={{fontSize: 12}}>{req.submitted}</dd>
              </dl>
            </div>
          </div>

          <div className="card">
            <div className="card-head"><h3 className="card-title">Approvals</h3></div>
            <div className="card-body">
              <div className="row" style={{gap: 10}}>
                <div className="avatar" style={{background: "linear-gradient(135deg, var(--green-700), var(--green-500))"}}>MC</div>
                <div style={{flex: 1}}>
                  <div style={{fontSize: 13, fontWeight: 600}}>M. Costa · Group Lead</div>
                  <div style={{fontSize: 11.5, color: "var(--ink-500)"}}>Approved · {req.submitted}</div>
                </div>
                <Icons.check style={{color: "var(--green-700)"}} />
              </div>
              <div className="divider"></div>
              <div className="row" style={{gap: 10}}>
                <div className="avatar" style={{background: "linear-gradient(135deg, var(--navy-700), var(--civic-500))"}}>PE</div>
                <div style={{flex: 1}}>
                  <div style={{fontSize: 13, fontWeight: 600}}>Platform Eng · Auto-policy</div>
                  <div style={{fontSize: 11.5, color: "var(--ink-500)"}}>RHACM compliant · governance OK</div>
                </div>
                <Icons.check style={{color: "var(--green-700)"}} />
              </div>
            </div>
          </div>

          {req.status === "ready" && (
            <div className="card">
              <div className="card-head"><h3 className="card-title">Cluster Access</h3></div>
              <div className="card-body">
                <dl className="dl">
                  <dt>API</dt>       <dd className="mono" style={{fontSize: 11}}>https://api.{req.cluster}.{req.org}.gov.local:6443</dd>
                  <dt>Console</dt>   <dd className="mono" style={{fontSize: 11}}>https://console.{req.cluster}…</dd>
                  <dt>Version</dt>   <dd>OpenShift 4.16.7</dd>
                </dl>
                <button className="btn primary" style={{width: "100%", marginTop: 12, justifyContent: "center"}}>
                  <Icons.download /> Download kubeconfig
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

window.RequestDetail = RequestDetail;
