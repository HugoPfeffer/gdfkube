// Per-form editor with Definition / Fields / Template sub-tabs.
//
// Reads form metadata + fields from the data context. Definition writes
// patches via UPDATE_FORM on every input change. The Fields and Template
// sub-tabs delegate to FieldsTable and TemplateEditor respectively.

import { useState } from 'react';
import { itsmApi } from '../api/itsmApi';
import { useGdfData, useGdfDispatch } from '../state/dataContext';
import type { Toast } from '../shell/ToastStack';
import { FieldsTable } from './FieldsTable';
import { TemplateEditor } from './TemplateEditor';

type SubTab = 'definition' | 'fields' | 'template';

interface FormEditorProps {
  formId: string;
  onClose: () => void;
  setToast?: (t: Toast) => void;
}

export function FormEditor({ formId, onClose, setToast }: FormEditorProps) {
  const { forms, fields } = useGdfData();
  const dispatch = useGdfDispatch();
  const form = forms.find((f) => f.id === formId);
  const [subtab, setSubtab] = useState<SubTab>('definition');
  const [isSaving, setIsSaving] = useState(false);

  if (!form) {
    return (
      <div className="page" style={{ padding: 18 }}>
        <button type="button" className="btn ghost sm" onClick={onClose}>
          ← All forms
        </button>
        <p>Form not found.</p>
      </div>
    );
  }

  const fieldList = fields[formId] ?? [];

  const setName = (name: string) =>
    dispatch({ type: 'UPDATE_FORM', id: formId, patch: { name } });
  const setTopic = (topic: string) =>
    dispatch({ type: 'UPDATE_FORM', id: formId, patch: { topic } });
  const setDescription = (description: string) =>
    dispatch({ type: 'UPDATE_FORM', id: formId, patch: { description } });
  const setStatus = (active: boolean) =>
    dispatch({
      type: 'UPDATE_FORM',
      id: formId,
      patch: { status: active ? 'active' : 'disabled' },
    });

  return (
    <div className="form-editor" style={{ padding: '18px 0 24px' }}>
      <div className="row" style={{ marginBottom: 14, alignItems: 'center', gap: 8 }}>
        <button type="button" className="btn ghost sm" onClick={onClose}>
          ← All forms
        </button>
        <span className="spacer" />
        <button
          type="button"
          className="btn ghost sm"
          onClick={() =>
            setToast?.({
              id: `reload-${Date.now()}`,
              kind: 'info',
              title: 'Reloaded from Git (demo)',
              body: 'No changes were fetched in the demo environment.',
            })
          }
        >
          Reload from Git
        </button>
        <button
          type="button"
          className="btn primary sm"
          disabled={isSaving}
          onClick={async () => {
            setIsSaving(true);
            try {
              const patch: Record<string, unknown> = {
                name: form.name,
                topic: form.topic,
                description: form.description,
                status: form.status,
                fields: fields[formId] ?? [],
                templates: undefined,
              };
              await itsmApi.forms.update(formId, patch);
              setToast?.({
                id: `save-${Date.now()}`,
                kind: 'info',
                title: 'Saved',
                body: 'Changes persisted to the API.',
              });
            } catch (err) {
              setToast?.({
                id: `save-err-${Date.now()}`,
                kind: 'warn',
                title: 'Save failed',
                body: err instanceof Error ? err.message : String(err),
              });
            } finally {
              setIsSaving(false);
            }
          }}
        >
          {isSaving ? 'Saving…' : 'Save changes'}
        </button>
      </div>

      <div role="tablist" aria-label="Form editor sub-tabs" className="subtabs">
        {(
          [
            { id: 'definition', label: 'Definition' },
            { id: 'fields', label: `Fields · ${fieldList.length}` },
            { id: 'template', label: 'Template' },
          ] as const
        ).map((t) => {
          const active = subtab === t.id;
          return (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={active}
              className={`subtab${active ? ' active' : ''}`}
              onClick={() => setSubtab(t.id)}
            >
              {t.label}
            </button>
          );
        })}
      </div>

      {subtab === 'definition' && (
        <div className="form-grid" style={{ marginTop: 16 }}>
          <div className="field">
            <label htmlFor="form-id">Form ID</label>
            <input
              id="form-id"
              type="text"
              value={form.id}
              disabled
              readOnly
            />
          </div>
          <div className="field">
            <label htmlFor="form-name">Display name</label>
            <input
              id="form-name"
              type="text"
              value={form.name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="form-topic">Kafka topic</label>
            <input
              id="form-topic"
              type="text"
              value={form.topic}
              onChange={(e) => setTopic(e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="form-status">Status</label>
            <label className="row" style={{ height: 36, alignItems: 'center', gap: 8 }}>
              <input
                id="form-status"
                type="checkbox"
                checked={form.status === 'active'}
                onChange={(e) => setStatus(e.target.checked)}
              />
              <span>Form is active and accepting submissions</span>
            </label>
          </div>
          <div className="field span-2">
            <label htmlFor="form-description">Description</label>
            <textarea
              id="form-description"
              value={form.description ?? ''}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
        </div>
      )}

      {subtab === 'fields' && <FieldsTable formId={formId} />}

      {subtab === 'template' && <TemplateEditor formId={formId} />}
    </div>
  );
}

export default FormEditor;
