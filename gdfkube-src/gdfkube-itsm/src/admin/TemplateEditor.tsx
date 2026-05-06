// Multi-file YAML template editor. Inner tabs map to TemplateFile entries
// (add / rename / remove). The textarea below edits the active file's
// content; a "Rendered preview" toggle replaces `{{ bucket.key }}` tokens
// with placeholder values for the active file only. The right-hand
// AvailableVariablesPanel exposes click-to-copy tokens.
//
// Affordances:
//   - Info banner: "Templates are reconciled by Camel and committed to
//     Git on approval." (rendered above the file tabs).
//   - Line counter: "{n} lines" caption near the active file's name.
//   - Download all: ghost button that synthesizes a single text blob with
//     `--- {filename} ---` separators and triggers a browser download.
//
// Controlled / draft mode: when `value` and `onChange` are supplied, the
// editor operates entirely on local state. NewFormPage uses this to
// author draft templates before Create.

import { useState } from 'react';
import { useGdfData, useGdfDispatch } from '../state/dataContext';
import type { TemplateFile } from '../types';
import { AvailableVariablesPanel } from './AvailableVariablesPanel';

const PLACEHOLDERS: Record<string, string> = {
  'meta.requestId': 'REQ0010247',
  'meta.correlationId': 'REQ0010247',
  'meta.requesterName': 'joao.silva',
  'meta.requesterFullName': 'João Silva',
  'meta.requesterEmail': 'joao.silva@saude.gov',
  'meta.requesterRole': 'operator',
  'meta.requesterGroupName': 'saude',
  'meta.submittedAt': '2026-04-27T12:00:00Z',
  'meta.formId': 'cluster-request',
  'vars.clusterName': 'vacinacao',
  'vars.environment': 'production',
  'vars.nodeCount': '4',
  'vars.namespaceName': 'vacinacao-prod',
  'vars.cpuQuota': '8',
  'vars.memQuota': '16',
  'vars.newNodeCount': '6',
};

const renderPreview = (content: string): string =>
  content.replace(/\{\{\s*([a-zA-Z0-9._]+)\s*\}\}/g, (_m, key: string) =>
    Object.prototype.hasOwnProperty.call(PLACEHOLDERS, key) ? PLACEHOLDERS[key]! : `<${key}>`,
  );

function downloadAll(formId: string, files: TemplateFile[]): void {
  const blob = files
    .map((f) => `--- ${f.name} ---\n${f.content}`)
    .join('\n\n');
  try {
    const url = URL.createObjectURL(
      new Blob([blob], { type: 'text/plain;charset=utf-8' }),
    );
    const a = document.createElement('a');
    a.href = url;
    a.download = `${formId}-templates.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  } catch {
    /* jsdom: URL.createObjectURL may not exist; the click is decorative for the demo. */
  }
}

interface TemplateEditorProps {
  formId: string;
  // Optional controlled mode: when provided, the editor reads/writes via
  // these props instead of the data context.
  value?: TemplateFile[];
  onChange?: (next: TemplateFile[]) => void;
}

export function TemplateEditor({ formId, value, onChange }: TemplateEditorProps) {
  const ctxData = useGdfData();
  const ctxDispatch = useGdfDispatch();
  const controlled = value !== undefined && onChange !== undefined;
  const ctxFiles = ctxData.templates[formId];
  const files: TemplateFile[] = controlled
    ? (value.length ? value : [{ name: 'main.yaml', content: '' }])
    : (ctxFiles && ctxFiles.length ? ctxFiles : [{ name: 'main.yaml', content: '' }]);

  const [activeIdx, setActiveIdx] = useState(0);
  const [showPreview, setShowPreview] = useState(false);
  const idx = Math.min(activeIdx, files.length - 1);
  const current = files[idx]!;

  const persist = (next: TemplateFile[]) => {
    if (controlled) onChange!(next);
    else ctxDispatch({ type: 'UPDATE_TEMPLATES', formId, templates: next });
  };

  const updateContent = (content: string) =>
    persist(files.map((f, i) => (i === idx ? { ...f, content } : f)));

  const renameActive = (name: string) => {
    if (!name.trim()) return;
    persist(files.map((f, i) => (i === idx ? { ...f, name: name.trim() } : f)));
  };

  const addFile = () => {
    let n = files.length + 1;
    let name = `manifest-${n}.yaml`;
    while (files.some((f) => f.name === name)) { n += 1; name = `manifest-${n}.yaml`; }
    persist([...files, { name, content: '# New manifest\n' }]);
    setActiveIdx(files.length);
  };

  const removeFile = (i: number) => {
    if (files.length <= 1) return;
    const next = files.filter((_, j) => j !== i);
    persist(next);
    if (idx >= next.length) setActiveIdx(next.length - 1);
  };

  const lineCount = current.content.split('\n').length;

  return (
    <div className="template-editor" style={{ marginTop: 16 }}>
      <div
        data-testid="template-info-banner"
        className="banner-info"
        style={{
          padding: '8px 12px',
          marginBottom: 10,
          border: '1px solid var(--ink-200)',
          borderRadius: 'var(--radius)',
          background: 'var(--paper)',
          fontSize: 12,
        }}
      >
        Templates are reconciled by Camel and committed to Git on approval.
      </div>

      <div className="row" style={{ margin: '0 0 8px', alignItems: 'center', gap: 8 }}>
        <span className="spacer" />
        <button
          type="button"
          className="btn ghost sm"
          onClick={() => downloadAll(formId, files)}
        >
          Download all
        </button>
      </div>

      <div className="template-tabs" role="tablist" aria-label="Template files">
        {files.map((f, i) => (
          <span
            key={`${f.name}-${i}`}
            className={`template-tab-wrap${i === idx ? ' active' : ''}`}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 10px', borderBottom: i === idx ? '2px solid var(--civic-500)' : 'none' }}
          >
            <button
              type="button"
              role="tab"
              aria-selected={i === idx}
              data-testid={`template-tab-${f.name}`}
              className={`template-tab${i === idx ? ' active' : ''}`}
              onClick={() => setActiveIdx(i)}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'transparent', border: 0, padding: 0, font: 'inherit', cursor: 'pointer', color: 'inherit' }}
            >
              <span className="mono">{f.name}</span>
            </button>
            {files.length > 1 && (
              <button
                type="button"
                className="icon-btn"
                title={`Remove ${f.name}`}
                aria-label={`Remove ${f.name}`}
                onClick={(e) => { e.stopPropagation(); removeFile(i); }}
              >✕</button>
            )}
          </span>
        ))}
        <button type="button" className="btn ghost sm" onClick={addFile} aria-label="Add manifest">+ Add manifest</button>
      </div>

      <div className="row" style={{ margin: '10px 0', alignItems: 'center', gap: 8 }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
          <input type="checkbox" checked={showPreview} onChange={(e) => setShowPreview(e.target.checked)} />
          Rendered preview
        </label>
        <span data-testid="template-line-count" className="muted" style={{ fontSize: 12 }}>
          {lineCount} lines
        </span>
        <span className="spacer" />
        <input type="text" aria-label="Active file name" value={current.name} onChange={(e) => renameActive(e.target.value)} className="mono" style={{ width: 240 }} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 240px', gap: 14, alignItems: 'start' }}>
        <div>
          {showPreview ? (
            <pre data-testid="template-preview" style={{ margin: 0, padding: 14, fontFamily: 'var(--font-mono)', fontSize: 12, lineHeight: 1.7, background: 'var(--paper)', border: '1px solid var(--ink-200)', borderRadius: 'var(--radius)', overflowX: 'auto', whiteSpace: 'pre' }}>
              {renderPreview(current.content)}
            </pre>
          ) : (
            <textarea
              aria-label={`${current.name} content`}
              data-testid="template-textarea"
              value={current.content}
              onChange={(e) => updateContent(e.target.value)}
              spellCheck={false}
              style={{ width: '100%', minHeight: 320, padding: 14, background: '#0f172a', color: '#e2e8f0', fontFamily: 'var(--font-mono)', fontSize: 12.5, lineHeight: 1.7, border: '1px solid var(--ink-200)', borderRadius: 'var(--radius)', resize: 'vertical', display: 'block' }}
            />
          )}
        </div>
        <AvailableVariablesPanel formId={formId} />
      </div>
    </div>
  );
}

export default TemplateEditor;
