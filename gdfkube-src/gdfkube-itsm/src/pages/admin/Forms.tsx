// Forms admin page.
//
// Top-level tabs: Forms (every entry, active + disabled — row click opens
// the per-form editor) and Form Fields (read-only aggregate of every
// field across every form; NO "New field" button per spec). The page also
// owns navigation to FormEditor and NewFormPage.

import { useMemo, useState } from 'react';
import { FormEditor } from '../../admin/FormEditor';
import { NewFormPage } from '../../admin/NewFormPage';
import type { Navigate } from '../../router';
import { useGdfData } from '../../state/dataContext';
import type { Field } from '../../types';

type Tab = 'forms' | 'fields';
type FieldRow = Field & { formId: string };

function aggregateFields(fields: Record<string, Field[]>): FieldRow[] {
  return Object.entries(fields).flatMap(([formId, list]) =>
    list.map((f) => ({ ...f, formId })),
  );
}

function validationSummary(f: Field): string {
  if (f.type === 'select' && f.options) return f.options;
  if (f.type === 'number' && (f.min != null || f.max != null)) return `${f.min ?? '—'}–${f.max ?? '—'}`;
  if (f.type === 'checkbox') return 'n/a';
  return f.validation ?? '—';
}

export function Forms({ navigate: _navigate }: { navigate: Navigate }) {
  void _navigate;
  const data = useGdfData();
  const [tab, setTab] = useState<Tab>('forms');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const aggregated = useMemo(() => aggregateFields(data.fields), [data.fields]);

  if (creating) {
    return <div className="page admin-forms"><NewFormPage onClose={() => setCreating(false)} /></div>;
  }
  if (editingId) {
    return <div className="page admin-forms"><FormEditor formId={editingId} onClose={() => setEditingId(null)} /></div>;
  }

  return (
    <div className="page admin-forms">
      <div className="page-head" data-testid="forms-head">
        <h1 className="page-title">Forms</h1>
        <p className="page-sub">Forms registered with the gdfkube ITSM portal. Form ID is the Kafka message key.</p>
        <div className="row" style={{ marginTop: 8 }}>
          <span className="spacer" />
          <button type="button" className="btn primary sm" onClick={() => setCreating(true)}>+ New form</button>
        </div>
      </div>

      <div role="tablist" aria-label="Admin forms tabs" className="tabs">
        {(['forms', 'fields'] as const).map((id) => {
          const label = id === 'forms' ? 'Forms' : 'Form Fields';
          const active = tab === id;
          return (
            <button key={id} type="button" role="tab" aria-selected={active} className={`tab${active ? ' active' : ''}`} onClick={() => setTab(id)}>{label}</button>
          );
        })}
      </div>

      {tab === 'forms' && (
        <div className="card">
          <div className="table-wrap">
            <table className="list" data-testid="forms-table">
              <thead>
                <tr>
                  <th style={{ width: 200 }}>Form ID</th>
                  <th>Name</th>
                  <th>Kafka topic</th>
                  <th style={{ width: 80 }}>Fields</th>
                  <th style={{ width: 100 }}>Status</th>
                  <th style={{ width: 120 }}>Last edited</th>
                </tr>
              </thead>
              <tbody>
                {data.forms.map((f) => {
                  const fieldCount = data.fields[f.id]?.length ?? f.fieldCount ?? 0;
                  const open = () => setEditingId(f.id);
                  return (
                    <tr key={f.id} role="button" tabIndex={0} onClick={open}
                        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { if (e.key === ' ') e.preventDefault(); open(); } }}>
                      <td className="mono"><span className="row-form-id">{f.id}</span></td>
                      <td><strong>{f.name}</strong></td>
                      <td className="mono muted">{f.topic}</td>
                      <td className="mono">{fieldCount}</td>
                      <td>{f.status === 'active' ? <span className="pill green">Active</span> : <span className="pill gray">Disabled</span>}</td>
                      <td className="muted mono">{f.lastEdited ?? f.updated ?? '—'}</td>
                    </tr>
                  );
                })}
                {data.forms.length === 0 && <tr><td colSpan={6} className="empty">No forms yet.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'fields' && (
        <div className="card">
          <div className="filters">
            <span className="muted" style={{ fontSize: 12 }}>
              {aggregated.length} fields across {data.forms.length} form{data.forms.length === 1 ? '' : 's'}
            </span>
          </div>
          <div className="table-wrap">
            <table className="list" data-testid="form-fields-table">
              <thead>
                <tr>
                  <th>Form</th>
                  <th>Key</th>
                  <th>Label</th>
                  <th style={{ width: 100 }}>Type</th>
                  <th style={{ width: 80 }}>Bucket</th>
                  <th style={{ width: 80 }}>Required</th>
                  <th>Validation / options</th>
                </tr>
              </thead>
              <tbody>
                {aggregated.map((f) => (
                  <tr key={`${f.formId}:${f.key}`}>
                    <td className="mono muted"><span className="row-source-form-id">{f.formId}</span></td>
                    <td className="mono">{f.key}</td>
                    <td>{f.label}</td>
                    <td><span className="pill blue">{f.type}</span></td>
                    <td className="mono muted">{f.bucket}</td>
                    <td>{f.required ? '✓' : <span className="muted">—</span>}</td>
                    <td className="mono muted">{validationSummary(f)}</td>
                  </tr>
                ))}
                {aggregated.length === 0 && <tr><td colSpan={7} className="empty">No fields defined yet.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

export default Forms;
