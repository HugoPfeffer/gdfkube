// Approvals page — admin queue to approve/reject pending form requests
function Approvals({ navigate, role }) {
  const { REQUESTS, ORGS } = window.GDF_DATA;

  // Pull pending approvals out of the global request set, plus a local layer for
  // session-only approve/reject decisions so the queue updates instantly without
  // mutating seed data on rerender.
  const [decisions, setDecisions] = React.useState({}); // id -> {action, by, at, comment}
  const [selectedId, setSelectedId] = React.useState(null);
  const [filter, setFilter] = React.useState("all");
  const [comment, setComment] = React.useState("");
  const [confirm, setConfirm] = React.useState(null); // {action, id}
  const [toast, setToast] = React.useState(null);

  const pending = REQUESTS.filter(r => r.status === "approval" && !decisions[r.id]);
  const decided = Object.entries(decisions).map(([id, d]) => {
    const r = REQUESTS.find(x => x.id === id);
    return r ? { ...r, _decision: d } : null;
  }).filter(Boolean);

  let queue = pending;
  if (filter === "production") queue = pending.filter(r => r.env === "production");
  else if (filter === "scale") queue = pending.filter(r => r.form === "scale");

  // Auto-pick first item in queue
  React.useEffect(() => {
    if (queue.length && !queue.find(r => r.id === selectedId)) {
      setSelectedId(queue[0].id);
      setComment("");
    } else if (!queue.length) {
      setSelectedId(null);
    }
  }, [queue.map(r => r.id).join(","), selectedId]);

  const sel = pending.find(r => r.id === selectedId);

  if (role !== "admin") {
    return (
      <div className="page">
        <div className="page-head">
          <h1 className="page-title">Approvals</h1>
          <p className="page-sub">Restricted to platform administrators.</p>
        </div>
        <div className="card"><div className="empty">
          <Icons.shield size={32} />
          <div style={{marginTop: 10, fontSize: 13}}>You need the <strong>Platform Admin</strong> role to approve requests.</div>
          <div style={{marginTop: 4, fontSize: 12, color: "var(--ink-500)"}}>Switch role from the user menu in the top-right.</div>
        </div></div>
      </div>
    );
  }

  function decide(action) {
    if (!sel) return;
    setDecisions(d => ({
      ...d,
      [sel.id]: {
        action,
        by: "Maria Costa",
        at: nowDateTime(),
        comment: comment.trim() || null,
      },
    }));
    setToast({
      type: action === "approve" ? "success" : "warn",
      msg: action === "approve"
        ? `${sel.id} approved · provisioning will start`
        : `${sel.id} rejected · requester notified`,
    });
    setTimeout(() => setToast(null), 3500);
    setComment("");
    setConfirm(null);
  }

  return (
    <div className="page approvals-page">
      <div className="page-head">
        <div className="page-head-row">
          <div>
            <h1 className="page-title">Approvals</h1>
            <p className="page-sub">Review and approve form requests submitted by department operators. Approved items proceed to the provisioning pipeline.</p>
          </div>
          <div className="row">
            <div className="approval-stat">
              <span className="num">{pending.length}</span>
              <span className="lbl">in queue</span>
            </div>
            <div className="approval-stat">
              <span className="num">{decided.filter(d => d._decision.action === "approve").length}</span>
              <span className="lbl approved">approved today</span>
            </div>
            <div className="approval-stat">
              <span className="num">{decided.filter(d => d._decision.action === "reject").length}</span>
              <span className="lbl rejected">rejected today</span>
            </div>
          </div>
        </div>
      </div>

      <div className="approvals-grid">
        {/* LEFT — Queue */}
        <div className="card approvals-queue">
          <div className="card-head" style={{padding: "10px 14px"}}>
            <div className="row" style={{gap: 8, flexWrap: "wrap"}}>
              <strong style={{fontSize: 13}}>Queue</strong>
              <span className="pill amber" style={{fontSize: 10.5}}>{pending.length} pending</span>
            </div>
          </div>
          <div className="filters" style={{padding: "8px 14px"}}>
            <Icons.filter style={{color: "var(--ink-500)"}} />
            {[
              { id: "all", label: "All" },
              { id: "production", label: "Production" },
              { id: "scale", label: "Scale" },
            ].map(f => (
              <div key={f.id} className={"filter-chip" + (filter === f.id ? " active" : "")} onClick={() => setFilter(f.id)}>
                {f.label}
              </div>
            ))}
          </div>
          <div className="approval-list">
            {queue.length === 0 && (
              <div className="empty" style={{padding: 28}}>
                <Icons.check size={26} />
                <div style={{marginTop: 8, fontSize: 13, color: "var(--ink-700)"}}>Inbox zero</div>
                <div style={{fontSize: 11.5, color: "var(--ink-500)", marginTop: 2}}>No pending approvals match this filter.</div>
              </div>
            )}
            {queue.map(r => {
              const org = ORGS.find(o => o.id === r.org);
              const active = r.id === selectedId;
              const failChecks = r.policyChecks?.filter(c => !c.ok).length || 0;
              return (
                <div
                  key={r.id}
                  className={"approval-row" + (active ? " active" : "")}
                  onClick={() => { setSelectedId(r.id); setComment(""); }}
                >
                  <div className="row" style={{justifyContent: "space-between"}}>
                    <span className="row-id">{r.id}</span>
                  </div>
                  <div className="approval-row-title">{r.cluster}</div>
                  <div className="approval-row-meta">
                    <span>{r.formLabel || "Cluster request"}</span>
                    <span className="dot-sep">·</span>
                    <span style={{
                      color: r.env === "production" ? "var(--red-700)" : r.env === "staging" ? "var(--amber-700)" : "var(--green-700)",
                      fontFamily: "var(--font-mono)",
                      fontSize: 11,
                    }}>{r.env}</span>
                    <span className="dot-sep">·</span>
                    <span>{org?.name}</span>
                  </div>
                  <div className="approval-row-foot">
                    <span><Icons.user size={11} /> {r.requesterFull}</span>
                    <span style={{flex: 1}}></span>
                    <span className="muted"><Icons.clock size={11} /> {r.waiting || "just now"}</span>
                    {failChecks > 0 && <span className="pill amber" style={{fontSize: 10}}><Icons.alert size={9} /> {failChecks}</span>}
                  </div>
                </div>
              );
            })}
          </div>

          {decided.length > 0 && (
            <React.Fragment>
              <div className="approval-section-head">Decided this session</div>
              <div className="approval-list compact">
                {decided.map(r => (
                  <div key={r.id} className="approval-row decided">
                    <div className="row" style={{justifyContent: "space-between", gap: 8}}>
                      <span className="row-id" style={{fontSize: 11}}>{r.id}</span>
                      <span className={"pill " + (r._decision.action === "approve" ? "green" : "red")} style={{fontSize: 10}}>
                        {r._decision.action === "approve" ? <Icons.check size={9} /> : <Icons.x size={9} />}
                        {r._decision.action === "approve" ? "Approved" : "Rejected"}
                      </span>
                    </div>
                    <div style={{fontSize: 12, color: "var(--ink-700)", marginTop: 2}}>{r.cluster}</div>
                  </div>
                ))}
              </div>
            </React.Fragment>
          )}
        </div>

        {/* RIGHT — Detail */}
        <div className="approvals-detail">
          {!sel && (
            <div className="card">
              <div className="empty" style={{padding: 80}}>
                <Icons.check size={40} />
                <div style={{marginTop: 14, fontSize: 14, color: "var(--ink-700)"}}>All caught up.</div>
                <div style={{marginTop: 4, fontSize: 12.5, color: "var(--ink-500)", maxWidth: 320, marginInline: "auto"}}>
                  No requests pending your review. New submissions arrive here automatically.
                </div>
              </div>
            </div>
          )}

          {sel && (() => {
            const org = ORGS.find(o => o.id === sel.org);
            const failChecks = sel.policyChecks?.filter(c => !c.ok) || [];
            return (
              <React.Fragment>
                <div className="card approval-header-card">
                  <div className="card-body">
                    <div className="row" style={{gap: 10, marginBottom: 8, flexWrap: "wrap"}}>
                      <span className="row-id" style={{fontSize: 13}}>{sel.id}</span>
                      <StatusPill status={sel.status} />
                      <span className="pill gray">{sel.formLabel}</span>
                      <span style={{flex: 1}}></span>
                      <span className="mono" style={{fontSize: 11.5, color: "var(--ink-500)"}}>
                        <Icons.clock size={11} /> waiting {sel.waiting}
                      </span>
                    </div>
                    <h2 style={{margin: "0 0 4px", fontSize: 19, color: "var(--ink-900)", letterSpacing: "-0.005em"}}>
                      Cluster <strong>{sel.cluster}</strong>
                    </h2>
                    <div style={{fontSize: 12.5, color: "var(--ink-500)"}}>
                      Submitted {sel.submitted} by <strong style={{color: "var(--ink-700)"}}>{sel.requesterFull}</strong> ({sel.requester}@{sel.org})
                    </div>
                  </div>
                </div>

                <div className="approval-detail-grid">
                  <div className="col">
                    <div className="card">
                      <div className="card-head"><h3 className="card-title">Request payload</h3>
                        <a href="#" className="link-sub" onClick={(e) => { e.preventDefault(); navigate("request-detail", { id: sel.id }); }}>
                          Open full record <Icons.ext size={11} />
                        </a>
                      </div>
                      <div className="card-body">
                        <dl className="dl">
                          <dt>Form</dt>        <dd className="mono">{sel.form}</dd>
                          <dt>Department</dt>  <dd>{org?.name} <span className="muted">({sel.org})</span></dd>
                          <dt>Cluster</dt>     <dd><strong>{sel.cluster}</strong></dd>
                          <dt>Namespace</dt>   <dd className="mono">hc-{sel.org}-{sel.cluster}</dd>
                          <dt>Environment</dt> <dd>
                            <span className={"pill " + (sel.env === "production" ? "red" : sel.env === "staging" ? "amber" : "green")}>{sel.env}</span>
                          </dd>
                          <dt>Nodes</dt>       <dd>{sel.nodes} × KubeVirt</dd>
                          <dt>ULID</dt>        <dd className="mono" style={{fontSize: 11}}>{sel.requestId}</dd>
                        </dl>
                        {sel.justification && (
                          <React.Fragment>
                            <div className="divider"></div>
                            <div style={{fontSize: 11.5, color: "var(--ink-500)", textTransform: "uppercase", letterSpacing: "0.05em", fontWeight: 600, marginBottom: 6}}>
                              Justification from requester
                            </div>
                            <div style={{
                              fontSize: 13, color: "var(--ink-800)", lineHeight: 1.5,
                              padding: "10px 12px", background: "var(--ink-50)",
                              borderLeft: "2px solid var(--civic-300)", borderRadius: 3,
                            }}>
                              {sel.justification}
                            </div>
                          </React.Fragment>
                        )}
                      </div>
                    </div>

                    <div className="card">
                      <div className="card-head">
                        <h3 className="card-title">Policy & governance checks</h3>
                        {failChecks.length > 0
                          ? <span className="pill amber" style={{fontSize: 10.5}}><Icons.alert size={10} /> {failChecks.length} issue{failChecks.length > 1 ? "s" : ""}</span>
                          : <span className="pill green" style={{fontSize: 10.5}}><Icons.check size={10} /> all passed</span>}
                      </div>
                      <div className="card-body" style={{padding: "6px 6px"}}>
                        {sel.policyChecks?.map((c, i) => (
                          <div key={i} className="policy-row">
                            <div className={"policy-icon " + (c.ok ? "ok" : "warn")}>
                              {c.ok ? <Icons.check size={11} /> : <Icons.alert size={11} />}
                            </div>
                            <div style={{flex: 1}}>
                              <div style={{fontSize: 13, color: "var(--ink-800)"}}>{c.label}</div>
                              {c.note && <div style={{fontSize: 11.5, color: "var(--amber-700)", marginTop: 2}}>{c.note}</div>}
                            </div>
                            <span className={"pill " + (c.ok ? "green" : "amber")} style={{fontSize: 10}}>
                              {c.ok ? "PASS" : "WARN"}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="col">
                    <div className="card decision-card">
                      <div className="card-head">
                        <h3 className="card-title">Your decision</h3>
                        <span style={{fontSize: 11, color: "var(--ink-500)"}}>as Maria Costa · SETIC</span>
                      </div>
                      <div className="card-body">
                        <label style={{display: "block", fontSize: 11.5, color: "var(--ink-500)", textTransform: "uppercase", letterSpacing: "0.05em", fontWeight: 600, marginBottom: 6}}>
                          Comment <span style={{textTransform: "none", fontWeight: 400, opacity: 0.7}}>(optional for approve, required for reject)</span>
                        </label>
                        <textarea
                          className="approval-comment"
                          placeholder={"Add a note for the requester — context, conditions, or reasons…"}
                          value={comment}
                          onChange={e => setComment(e.target.value)}
                        />
                        <div className="row" style={{gap: 8, marginTop: 12}}>
                          <button
                            className="btn primary"
                            style={{flex: 1, justifyContent: "center"}}
                            onClick={() => failChecks.length ? setConfirm({ action: "approve", id: sel.id }) : decide("approve")}
                          >
                            <Icons.check /> Approve
                          </button>
                          <button
                            className="btn danger"
                            style={{flex: 1, justifyContent: "center"}}
                            disabled={!comment.trim()}
                            onClick={() => decide("reject")}
                            title={!comment.trim() ? "Add a comment to reject" : ""}
                          >
                            <Icons.x /> Reject
                          </button>
                        </div>
                        <div className="row" style={{gap: 8, marginTop: 8}}>
                          <button className="btn ghost sm" style={{flex: 1, justifyContent: "center"}}>
                            <Icons.users size={12} /> Reassign
                          </button>
                          <button className="btn ghost sm" style={{flex: 1, justifyContent: "center"}}>
                            <Icons.clock size={12} /> Request changes
                          </button>
                        </div>
                      </div>
                    </div>

                    <div className="card">
                      <div className="card-head"><h3 className="card-title">Approval chain</h3></div>
                      <div className="card-body" style={{padding: "12px 14px"}}>
                        <div className="approval-step done">
                          <div className="step-dot"><Icons.check size={10} /></div>
                          <div>
                            <div style={{fontSize: 12.5, fontWeight: 600, color: "var(--ink-800)"}}>Department lead</div>
                            <div style={{fontSize: 11, color: "var(--ink-500)"}}>Auto-approved · within budget envelope</div>
                          </div>
                        </div>
                        <div className="approval-step current">
                          <div className="step-dot"><span className="pulse"></span></div>
                          <div>
                            <div style={{fontSize: 12.5, fontWeight: 600, color: "var(--ink-800)"}}>Platform admin (you)</div>
                            <div style={{fontSize: 11, color: "var(--ink-500)"}}>Awaiting your decision</div>
                          </div>
                        </div>
                        <div className="approval-step pending">
                          <div className="step-dot"></div>
                          <div>
                            <div style={{fontSize: 12.5, fontWeight: 600, color: "var(--ink-700)"}}>Provisioning pipeline</div>
                            <div style={{fontSize: 11, color: "var(--ink-500)"}}>MongoDB → Debezium → Kafka → Camel → Git → ArgoCD</div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </React.Fragment>
            );
          })()}
        </div>
      </div>

      {/* Confirm modal — only when approving despite warnings */}
      {confirm && sel && (
        <div className="modal-backdrop" onClick={() => setConfirm(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-head">
              <Icons.alert size={18} style={{color: "var(--amber-700)"}} />
              <strong>Approve despite warnings?</strong>
            </div>
            <div className="modal-body">
              <p style={{margin: "0 0 10px", fontSize: 13, color: "var(--ink-700)"}}>
                This request has <strong>{sel.policyChecks.filter(c => !c.ok).length}</strong> failing policy check{sel.policyChecks.filter(c => !c.ok).length > 1 ? "s" : ""}.
                Approving will record an override against your account.
              </p>
              <ul style={{margin: 0, paddingLeft: 18, fontSize: 12.5, color: "var(--amber-700)"}}>
                {sel.policyChecks.filter(c => !c.ok).map((c, i) => (
                  <li key={i}>{c.label}{c.note ? ` — ${c.note}` : ""}</li>
                ))}
              </ul>
            </div>
            <div className="modal-foot">
              <button className="btn ghost" onClick={() => setConfirm(null)}>Cancel</button>
              <button className="btn primary" onClick={() => decide("approve")}>
                <Icons.check /> Approve with override
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div className="toast-stack">
          <div className={"toast " + (toast.type === "success" ? "success" : "")}>
            <div style={{flexShrink: 0, marginTop: 1, color: toast.type === "success" ? "var(--green-700)" : "var(--amber-700)"}}>
              {toast.type === "success" ? <Icons.check /> : <Icons.alert />}
            </div>
            <div style={{flex: 1}}>
              <strong>{toast.type === "success" ? "Approved" : "Rejected"}</strong>
              <span>{toast.msg}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function nowDateTime() {
  const d = new Date();
  const p = n => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

window.Approvals = Approvals;
