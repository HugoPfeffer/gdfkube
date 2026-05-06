// Editable per-form fields table with HTML5 drag-and-drop reorder.
//
// The "Validation / options" cell is type-aware (regex for text/textarea,
// min/max for number, options for select, "n/a" for checkbox). Clicking
// the row's edit button toggles an advanced sub-row exposing displayAs
// (select-only), prefix (text-only), and help (any). Drag-and-drop uses
// the `⋮⋮` handle and dispatches REORDER_FIELDS on drop. Visual feedback:
// dragged row at 50% opacity; drop target gets a 2px civic-blue border on
// the side that indicates the insertion position.
//
// Controlled / draft mode: when `value` and `onChange` are supplied, the
// table operates entirely on local state without touching the data
// context. NewFormPage uses this to author draft fields before Create.

import { useState, type DragEvent } from 'react';
import { useGdfData, useGdfDispatch } from '../state/dataContext';
import type { Field, FieldBucket, FieldType } from '../types';

const FIELD_TYPES: FieldType[] = ['text', 'number', 'select', 'textarea', 'checkbox'];
const BUCKETS: FieldBucket[] = ['vars', 'meta'];
const CIVIC_BORDER = '2px solid var(--civic-500)';

function ValidationCell({ f, patch }: { f: Field; patch: (p: Partial<Field>) => void }) {
  if (f.type === 'select') {
    return (
      <input
        type="text"
        aria-label={`Options for ${f.key}`}
        value={f.options ?? ''}
        onChange={(e) => patch({ options: e.target.value })}
        placeholder="value|Label; next|Label"
        className="mono cell-input"
      />
    );
  }
  if (f.type === 'number') {
    const num = (key: 'min' | 'max') => (e: React.ChangeEvent<HTMLInputElement>) =>
      patch({ [key]: e.target.value === '' ? undefined : Number(e.target.value) } as Partial<Field>);
    return (
      <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
        <input type="number" aria-label={`Min for ${f.key}`} value={f.min ?? ''} onChange={num('min')} placeholder="min" className="mono cell-input" style={{ width: '50%' }} />
        <span className="muted">–</span>
        <input type="number" aria-label={`Max for ${f.key}`} value={f.max ?? ''} onChange={num('max')} placeholder="max" className="mono cell-input" style={{ width: '50%' }} />
      </div>
    );
  }
  if (f.type === 'checkbox') {
    return <span className="muted" data-testid={`validation-na-${f.key}`}>n/a</span>;
  }
  return (
    <input
      type="text"
      aria-label={`Validation for ${f.key}`}
      value={f.validation ?? ''}
      onChange={(e) => patch({ validation: e.target.value })}
      placeholder={f.type === 'textarea' ? 'regex (optional)' : 'e.g. ^[a-z][a-z0-9-]*$'}
      className="mono cell-input"
    />
  );
}

function AdvancedRow({ f, patch }: { f: Field; patch: (p: Partial<Field>) => void }) {
  return (
    <tr data-testid={`field-adv-${f.key}`} className="fields-adv-row">
      <td></td>
      <td colSpan={7}>
        <div style={{ display: 'grid', gridTemplateColumns: f.type === 'select' ? 'auto 1fr 2fr' : '1fr 2fr', gap: 10, alignItems: 'center', paddingBottom: 8 }}>
          {f.type === 'select' && (
            <>
              <span className="muted">Display as</span>
              <select aria-label={`Display as for ${f.key}`} value={f.displayAs ?? 'dropdown'} onChange={(e) => patch({ displayAs: e.target.value as Field['displayAs'] })} className="cell-input">
                <option value="dropdown">Dropdown</option>
                <option value="radio-cards">Radio cards</option>
              </select>
              <span></span>
            </>
          )}
          {f.type === 'text' && (
            <>
              <span className="muted">Prefix</span>
              <input type="text" aria-label={`Prefix for ${f.key}`} value={f.prefix ?? ''} onChange={(e) => patch({ prefix: e.target.value })} placeholder='e.g. "hc-{requesterGroupName}-"' className="mono cell-input" />
            </>
          )}
          <span className="muted">Help text</span>
          <input type="text" aria-label={`Help for ${f.key}`} value={f.help ?? ''} onChange={(e) => patch({ help: e.target.value })} placeholder="Shown beneath the input." className="cell-input" />
        </div>
      </td>
    </tr>
  );
}

function mintFieldKey(existing: Field[]): string {
  if (!existing.some((f) => f.key === 'newField')) return 'newField';
  let i = 2;
  while (existing.some((f) => f.key === `newField${i}`)) i += 1;
  return `newField${i}`;
}

function mongoShape(fields: Field[]): string {
  const vars: Record<string, string> = {};
  const meta: Record<string, string> = {};
  fields.forEach((f) => {
    const target = f.bucket === 'meta' ? meta : vars;
    target[f.key] = `<${f.type}>`;
  });
  return JSON.stringify({ vars, meta }, null, 2);
}

interface FieldsTableProps {
  formId: string;
  // Optional controlled mode: when provided, the table reads/writes via
  // these props instead of the data context.
  value?: Field[];
  onChange?: (next: Field[]) => void;
}

export function FieldsTable({ formId, value, onChange }: FieldsTableProps) {
  const ctxData = useGdfData();
  const ctxDispatch = useGdfDispatch();
  const controlled = value !== undefined && onChange !== undefined;
  const list = controlled ? value : (ctxData.fields[formId] ?? []);

  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [overIdx, setOverIdx] = useState<number | null>(null);

  const patch = (key: string, p: Partial<Field>) => {
    if (controlled) {
      onChange!(list.map((f) => (f.key === key ? { ...f, ...p } : f)));
    } else {
      ctxDispatch({ type: 'UPDATE_FIELD', formId, key, patch: p });
    }
  };

  const reorder = (from: number, to: number) => {
    if (controlled) {
      const next = list.slice();
      const [moved] = next.splice(from, 1);
      if (!moved) return;
      next.splice(to, 0, moved);
      onChange!(next);
    } else {
      ctxDispatch({ type: 'REORDER_FIELDS', formId, from, to });
    }
  };

  const addField = () => {
    const newKey = mintFieldKey(list);
    const f: Field = {
      key: newKey,
      label: 'New field',
      type: 'text',
      bucket: 'vars',
      required: false,
    };
    if (controlled) {
      onChange!([...list, f]);
    } else {
      ctxDispatch({ type: 'UPDATE_FIELD', formId, key: newKey, patch: f });
    }
    setEditingKey(newKey);
  };

  const dragProps = (i: number) => ({
    draggable: true,
    onDragStart: (e: DragEvent<HTMLTableRowElement>) => {
      setDragIdx(i);
      e.dataTransfer.effectAllowed = 'move';
      try { e.dataTransfer.setData('text/plain', String(i)); } catch { /* jsdom */ }
    },
    onDragOver: (e: DragEvent<HTMLTableRowElement>) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      if (overIdx !== i) setOverIdx(i);
    },
    onDragLeave: () => { if (overIdx === i) setOverIdx(null); },
    onDrop: (e: DragEvent<HTMLTableRowElement>) => {
      e.preventDefault();
      if (dragIdx !== null && dragIdx !== i) reorder(dragIdx, i);
      setDragIdx(null);
      setOverIdx(null);
    },
    onDragEnd: () => { setDragIdx(null); setOverIdx(null); },
  });

  const rowVisualProps = (i: number) => {
    const isDragging = dragIdx === i;
    const isOver = overIdx === i && dragIdx !== null && dragIdx !== i;
    const classes = ['fields-row'];
    if (isDragging) classes.push('dragging');
    if (isOver) classes.push('drop-target', dragIdx! > i ? 'drop-above' : 'drop-below');
    return {
      className: classes.join(' '),
      style: {
        opacity: isDragging ? 0.5 : 1,
        borderTop: isOver && dragIdx! > i ? CIVIC_BORDER : undefined,
        borderBottom: isOver && dragIdx! < i ? CIVIC_BORDER : undefined,
      },
    };
  };

  return (
    <div className="fields-table">
      <div className="row" style={{ margin: '14px 0 10px', alignItems: 'center' }}>
        <h3 style={{ margin: 0, fontSize: 14, fontWeight: 600 }}>Fields ({list.length})</h3>
        <span className="muted" style={{ fontSize: 12, marginLeft: 8 }}>Inputs the requester fills in.</span>
      </div>

      <div className="table-wrap">
        <table className="list" data-testid="fields-table">
          <thead>
            <tr>
              <th style={{ width: 30 }}></th>
              <th>Key</th>
              <th>Label</th>
              <th style={{ width: 110 }}>Type</th>
              <th style={{ width: 90 }}>Bucket</th>
              <th style={{ width: 80 }}>Required</th>
              <th>Validation / options</th>
              <th style={{ width: 50 }}></th>
            </tr>
          </thead>
          <tbody>
            {list.map((f, i) => {
              const isEditing = editingKey === f.key;
              return [
                <tr
                  key={`${f.key}-row`}
                  data-testid={`field-row-${f.key}`}
                  {...rowVisualProps(i)}
                  {...dragProps(i)}
                >
                  <td className="muted mono drag-handle" title="Drag to reorder">⋮⋮</td>
                  <td><input type="text" aria-label={`Key for ${f.key}`} value={f.key} readOnly className="mono cell-input" /></td>
                  <td><input type="text" aria-label={`Label for ${f.key}`} value={f.label} onChange={(e) => patch(f.key, { label: e.target.value })} className="cell-input" /></td>
                  <td>
                    <select aria-label={`Type for ${f.key}`} value={f.type} onChange={(e) => patch(f.key, { type: e.target.value as FieldType })} className="cell-input">
                      {FIELD_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </td>
                  <td>
                    <select aria-label={`Bucket for ${f.key}`} value={f.bucket} onChange={(e) => patch(f.key, { bucket: e.target.value as FieldBucket })} className="cell-input">
                      {BUCKETS.map((b) => <option key={b} value={b}>{b}</option>)}
                    </select>
                  </td>
                  <td>
                    <input type="checkbox" aria-label={`Required for ${f.key}`} checked={!!f.required} onChange={(e) => patch(f.key, { required: e.target.checked })} />
                  </td>
                  <td><ValidationCell f={f} patch={(p) => patch(f.key, p)} /></td>
                  <td>
                    <button type="button" className="icon-btn" title={isEditing ? 'Done editing' : 'Edit advanced'} aria-label={`Edit ${f.key}`} onClick={() => setEditingKey(isEditing ? null : f.key)}>⚙</button>
                  </td>
                </tr>,
                isEditing ? <AdvancedRow key={`${f.key}-adv`} f={f} patch={(p) => patch(f.key, p)} /> : null,
              ];
            })}
            {list.length === 0 && (
              <tr><td colSpan={8} className="empty">No fields yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="row" style={{ margin: '10px 0', alignItems: 'center' }}>
        <button type="button" className="btn ghost sm" onClick={addField}>+ Add field</button>
      </div>

      <div style={{ marginTop: 14 }}>
        <div className="muted" style={{ fontSize: 12, marginBottom: 6 }}>
          MongoDB document shape (preview)
        </div>
        <pre
          data-testid="mongo-shape-preview"
          className="mono"
          style={{
            margin: 0,
            padding: 12,
            background: 'var(--paper)',
            border: '1px solid var(--ink-200)',
            borderRadius: 'var(--radius)',
            fontSize: 12,
            lineHeight: 1.6,
            overflowX: 'auto',
          }}
        >
          {mongoShape(list)}
        </pre>
      </div>
    </div>
  );
}

export default FieldsTable;
