// Single dynamic form runner driven by GDF_ADMIN_DATA.fields[formId].
// Supports rich field options via a small option grammar:
//   "value | label | description | dotColor"  (label/description/dotColor are optional)
// Field options:
//   displayAs: "dropdown" (default) | "radio-cards"   — for select fields
//   prefix:    string with {fieldKey} tokens          — for text fields, renders inline pre-chrome
//   help:      string with {fieldKey} tokens          — interpolated against current values
//   validation: regex string ^...$                    — text fields only
//   min, max:  numeric bounds                         — number fields

function NewRequest({ navigate, role, user, formId }) {
  return <GenericRequest navigate={navigate} role={role} user={user} formId={formId || "cluster-request"} />;
}

function parseSelectOptions(s) {
  if (!s) return [];
  // Primary separator is ";" (chosen so option descriptions can freely contain commas).
  // For backward-compat with simple "a, b, c" lists we fall back to "," when no ";" is present.
  const sep = s.includes(";") ? ";" : ",";
  return s.split(sep).map(raw => {
    const parts = raw.split("|").map(p => p.trim());
    const value = parts[0] || "";
    if (!value) return null;
    const label = parts[1] || value;
    const description = parts[2] || "";
    const dotColor = parts[3] || "";
    return { value, label, description, dotColor };
  }).filter(Boolean);
}

function interpolate(s, values) {
  if (!s) return s;
  return s.replace(/\{(\w+)\}/g, (_, k) => {
    const v = values[k];
    return (v == null || v === "") ? `<${k}>` : String(v);
  });
}

function defaultForField(f) {
  if (f.type === "checkbox") return false;
  if (f.type === "select") {
    const opts = parseSelectOptions(f.options);
    return opts[0] ? opts[0].value : "";
  }
  if (f.type === "number") return f.min != null ? String(f.min) : "";
  return "";
}

function GenericRequest({ navigate, user, formId }) {
  const formMeta = (window.GDF_ADMIN_DATA.forms.find(f => f.id === formId)) || { id: formId, name: formId, topic: "dbz.gdfkube.requests" };
  const fields = window.GDF_ADMIN_DATA.fields[formId] || [];

  const [values, setValues] = React.useState(() => {
    const seed = {};
    fields.forEach(f => { seed[f.key] = defaultForField(f); });
    return seed;
  });
  const [submitting, setSubmitting] = React.useState(false);
  const set = (k, v) => setValues(s => ({...s, [k]: v}));

  // Validation
  const errors = {};
  fields.forEach(f => {
    const v = values[f.key];
    if (f.required) {
      if (f.type === "checkbox") { if (!v) errors[f.key] = "Required."; }
      else if (v == null || String(v).trim() === "") errors[f.key] = "Required.";
    }
    if (!errors[f.key] && v && f.type === "text" && f.validation && /^\^.*\$$/.test(f.validation)) {
      try { if (!new RegExp(f.validation).test(String(v))) errors[f.key] = `Must match ${f.validation}.`; } catch (e) {}
    }
    if (!errors[f.key] && v !== "" && f.type === "number") {
      const n = Number(v);
      if (Number.isNaN(n)) errors[f.key] = "Must be a number.";
      else if (f.min != null && n < f.min) errors[f.key] = `Min ${f.min}.`;
      else if (f.max != null && n > f.max) errors[f.key] = `Max ${f.max}.`;
    }
  });
  const valid = fields.length > 0 && Object.keys(errors).length === 0;

  // Bucket the values for the payload preview + submission
  const meta = {};
  const vars = {};
  fields.forEach(f => {
    const target = f.bucket === "meta" ? meta : vars;
    target[f.key] = values[f.key];
  });

  const submit = (e) => {
    e.preventDefault();
    if (!valid) return;
    setSubmitting(true);
    setTimeout(() => {
      const orgGuess = (meta.requesterGroupName || vars.org || vars.department || user.org || "saude").toString().toLowerCase();
      const clusterGuess = (vars.clusterName || vars.namespaceName || vars.targetCluster || formMeta.id + "-" + Math.random().toString(36).slice(2, 6));
      const newReq = {
        id: "REQ" + String(Math.floor(10000000 + Math.random() * 99999)).slice(0, 7),
        cluster: clusterGuess,
        org: orgGuess,
        env: (vars.environment || "development"),
        nodes: parseInt(vars.nodeCount || vars.newNodeCount || 0) || 0,
        requester: user.username, requesterFull: user.name,
        submitted: new Date().toISOString().replace("T", " ").slice(0, 19),
        status: "provisioning", stage: 0, progress: 0,
        live: true,
        form: formMeta.id,
        formLabel: formMeta.name,
      };
      window.GDF_DATA.REQUESTS.unshift(newReq);
      navigate("request-detail", {id: newReq.id, fresh: true});
    }, 700);
  };

  const renderField = (f) => {
    const v = values[f.key];
    const err = errors[f.key];
    const opts = f.type === "select" ? parseSelectOptions(f.options) : [];
    let control;

    if (f.type === "select") {
      if (f.displayAs === "radio-cards") {
        control = (
          <div className="radio-group">
            {opts.length === 0 && <div className="muted" style={{fontSize: 12, padding: 12}}>No options defined.</div>}
            {opts.map(o => (
              <div key={o.value}
                   className={"radio-card" + (v === o.value ? " selected" : "")}
                   onClick={() => set(f.key, o.value)}>
                <div className="rc-title">
                  {o.dotColor && (
                    <span style={{display: "inline-block", width: 8, height: 8, borderRadius: "50%", background: o.dotColor}} />
                  )}
                  {o.label}
                </div>
                {o.description && <div className="rc-sub">{o.description}</div>}
              </div>
            ))}
          </div>
        );
      } else {
        control = (
          <select value={v == null ? "" : v} onChange={e => set(f.key, e.target.value)}>
            {opts.length === 0 && <option value="">—</option>}
            {opts.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        );
      }
    } else if (f.type === "textarea") {
      control = <textarea rows={4} placeholder={f.help ? interpolate(f.help, values) : ""} value={v == null ? "" : v} onChange={e => set(f.key, e.target.value)} />;
    } else if (f.type === "checkbox") {
      control = (
        <label style={{display: "flex", alignItems: "center", gap: 8, height: 36, cursor: "pointer", fontSize: 13}}>
          <input type="checkbox" checked={!!v} onChange={e => set(f.key, e.target.checked)} />
          <span>{f.help ? interpolate(f.help, values) : "Yes"}</span>
        </label>
      );
    } else if (f.type === "number") {
      control = <input type="number" min={f.min} max={f.max} value={v == null ? "" : v} onChange={e => set(f.key, e.target.value)} />;
    } else {
      // text
      const prefixText = f.prefix ? interpolate(f.prefix, values) : "";
      const input = (
        <input type="text"
               placeholder={f.placeholder || ""}
               value={v == null ? "" : v}
               onChange={e => set(f.key, e.target.value.toLowerCase ? (f.validation && /\[a-z\]/.test(f.validation) ? e.target.value.toLowerCase() : e.target.value) : e.target.value)} />
      );
      control = prefixText
        ? <div className="input-prefix"><div className="pre">{prefixText}</div>{input}</div>
        : input;
    }

    const helpText = f.help ? interpolate(f.help, values) : "";

    return (
      <div key={f.id || f.key} className="field span-2">
        <label>
          {f.label || f.key} {f.required && <span className="req">*</span>}
          {f.bucket === "meta" && <span className="muted" style={{fontWeight: 400, fontSize: 11, marginLeft: 6}}>· meta</span>}
        </label>
        {control}
        {err
          ? <div className="help" style={{color: "var(--red-700, #b91c1c)"}}>{err}</div>
          : (helpText && f.type !== "checkbox") ? <div className="help">{helpText}</div>
          : (f.validation && f.type !== "checkbox") ? <div className="help mono" style={{fontSize: 11}}>{f.validation}</div>
          : null}
      </div>
    );
  };

  const presentation = (window.presentationFor ? window.presentationFor(formMeta) : { shortTitle: formMeta.name });
  const orgForGitPath = meta.requesterGroupName || vars.org || vars.department || "<org>";
  const clusterForGitPath = vars.clusterName || vars.namespaceName || "<name>";

  return (
    <div className="page" style={{maxWidth: 980}}>
      <div className="page-head">
        <h1 className="page-title">{presentation.shortTitle || formMeta.name}</h1>
        <p className="page-sub">
          {formMeta.id === "cluster-request"
            ? "Provision a HyperShift hosted control plane cluster. The request flows through the CDC pipeline and is GitOps-reconciled — typically ready in under 2 minutes."
            : <span>Submit a request through the gdfkube CDC pipeline. Fields below are defined by your platform team in <span className="mono">Admin → Forms</span>.</span>}
        </p>
      </div>

      <div className="detail-grid">
        <form className="card" onSubmit={submit}>
          <div className="card-head">
            <h3 className="card-title">{formMeta.name}</h3>
            <span className="pill blue"><span className="dot"></span>Form ID · {formMeta.id}</span>
          </div>
          <div className="card-body">
            {fields.length === 0 ? (
              <div className="empty" style={{padding: 32, textAlign: "center", color: "var(--ink-500)", fontSize: 13}}>
                <Icons.form size={28} />
                <div style={{marginTop: 8}}>This form has no fields defined yet.</div>
                <div style={{marginTop: 4, fontSize: 12}}>An administrator can add fields in <span className="mono">Admin → Forms → {formMeta.name} → Fields</span>.</div>
              </div>
            ) : (
              <div className="form-grid">
                {fields.map(renderField)}
              </div>
            )}

            <div className="divider"></div>

            <div style={{display: "flex", justifyContent: "space-between", alignItems: "center"}}>
              <div className="row" style={{fontSize: 12, color: "var(--ink-500)"}}>
                <Icons.shield style={{color: "var(--green-700)"}} />
                <span>Routed via Kafka topic <span className="mono">{formMeta.topic}</span></span>
              </div>
              <div className="row">
                <button type="button" className="btn ghost" onClick={() => navigate("catalog")}>Cancel</button>
                <button type="submit" className="btn primary" disabled={!valid || submitting}>
                  {submitting ? "Submitting…" : "Submit request"} <Icons.chevronRight />
                </button>
              </div>
            </div>
          </div>
        </form>

        <div className="col">
          <div className="card">
            <div className="card-head"><h3 className="card-title">Generated payload</h3></div>
            <div style={{padding: 14, background: "var(--ink-900)", borderRadius: "0 0 6px 6px", fontFamily: "var(--font-mono)", fontSize: 11.5, color: "#d0d8e6", lineHeight: 1.6, overflowX: "auto"}}>
{`{
  "formId": "${formMeta.id}",
  "requestId": "01HQ…<ulid>",
  "meta": ${JSON.stringify({requesterName: user.username, ...meta}, null, 2).split("\n").map((l, i) => i === 0 ? l : "  " + l).join("\n")},
  "vars": ${JSON.stringify(vars, null, 2).split("\n").map((l, i) => i === 0 ? l : "  " + l).join("\n")}
}`}
            </div>
          </div>

          <div className="card">
            <div className="card-head"><h3 className="card-title">What happens next</h3></div>
            <div style={{padding: "4px 0"}}>
              {(formMeta.id === "cluster-request"
                ? [
                  ["MongoDB insert", "Document persists to gdfkube/requests"],
                  ["CDC capture", "Debezium emits change event to Kafka"],
                  ["Camel orchestration", "Templates rendered, manifests pushed"],
                  ["Git push", `gdfkube-${orgForGitPath}/clusters/${clusterForGitPath}`],
                  ["ArgoCD sync", "ApplicationSet detects new directory"],
                  ["HyperShift", "Control plane + KubeVirt workers"],
                ]
                : [
                  ["MongoDB insert", "Document persists to gdfkube/requests"],
                  ["CDC capture", "Debezium emits change event to Kafka"],
                  ["Camel orchestration", `Route picks up formId="${formMeta.id}"`],
                  ["Git push", "Templates rendered into the customer repo"],
                  ["ArgoCD sync", "ApplicationSet reconciles the change"],
                ]
              ).map((s, i) => (
                <div key={i} style={{display: "flex", gap: 12, padding: "10px 18px", alignItems: "flex-start"}}>
                  <div style={{width: 22, height: 22, borderRadius: "50%", background: "var(--civic-50)", color: "var(--civic-500)",
                    display: "grid", placeItems: "center", fontSize: 11, fontWeight: 700, flexShrink: 0}}>{i + 1}</div>
                  <div>
                    <div style={{fontSize: 12.5, fontWeight: 600, color: "var(--ink-800)"}}>{s[0]}</div>
                    <div style={{fontSize: 11.5, color: "var(--ink-500)"}}>{s[1]}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

window.NewRequest = NewRequest;
