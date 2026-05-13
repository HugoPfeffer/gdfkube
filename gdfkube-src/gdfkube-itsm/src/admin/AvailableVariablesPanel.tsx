// Click-to-copy variable panel for the template editor. Lists eight
// auto-injected meta.* tokens at the top, then the form's own fields as
// `{{ bucket.key }}`. Copy goes through `copyToClipboard` so the textarea
// + execCommand fallback fires when navigator.clipboard rejects.

import { useCallback, useState } from 'react';
import { useGdfData } from '../state/dataContext';
import { copyToClipboard } from '../utils/clipboard';

const SYSTEM_VARS: { token: string; desc: string }[] = [
  { token: '{{ meta.requestId }}', desc: 'ULID assigned at submission' },
  { token: '{{ meta.correlationId }}', desc: 'Kafka message key (= requestId)' },
  { token: '{{ meta.requesterName }}', desc: 'Username of the submitter' },
  { token: '{{ meta.requesterFullName }}', desc: 'Display name of the submitter' },
  { token: '{{ meta.requesterEmail }}', desc: 'Email of the submitter' },
  { token: '{{ meta.requesterRole }}', desc: 'Role: operator | admin' },
  { token: '{{ meta.submittedAt }}', desc: 'ISO-8601 timestamp' },
  { token: '{{ meta.formId }}', desc: 'Form identifier' },
];

function VarRow({ token, desc }: { token: string; desc: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(() => {
    void copyToClipboard(token);
    setCopied(true);
    setTimeout(() => setCopied(false), 1200);
  }, [token]);

  return (
    <div className="var-row">
      <div className="mono">{token}</div>
      <div className="muted" style={{ fontSize: 11 }}>{desc}</div>
      <button type="button" className={`icon-btn${copied ? ' copied' : ''}`} title={`Copy ${token}`} aria-label={`Copy ${token}`} onClick={handleCopy}>
        {copied ? '✓' : '⧉'}
      </button>
    </div>
  );
}

export function AvailableVariablesPanel({ formId }: { formId: string }) {
  const { fields } = useGdfData();
  const list = fields[formId] ?? [];
  return (
    <div className="vars-panel" data-testid="available-vars">
      <div className="vars-group-head">System · auto-injected</div>
      <div className="vars-group">{SYSTEM_VARS.map((v) => <VarRow key={v.token} {...v} />)}</div>
      <div className="vars-group-head">From form fields</div>
      <div className="vars-group">
        {list.length === 0 && <div className="muted" style={{ padding: 6, fontSize: 12 }}>Add fields first.</div>}
        {list.map((f) => <VarRow key={f.key} token={`{{ ${f.bucket}.${f.key} }}`} desc={f.label} />)}
      </div>
    </div>
  );
}

export default AvailableVariablesPanel;
