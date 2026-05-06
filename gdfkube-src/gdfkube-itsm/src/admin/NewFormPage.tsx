// New Form creation page.
//
// Hosts three sub-tabs (Definition / Fields / Template) so the operator
// can author all three slices before clicking Create. The Fields and
// Template sub-tabs reuse FieldsTable and TemplateEditor in controlled
// (draft) mode — they operate on local state until Create. On Create we
// dispatch ADD_FORM, then UPDATE_FIELD per draft field, then
// UPDATE_TEMPLATES with the draft templates.

import { useState } from 'react';
import { useGdfData, useGdfDispatch } from '../state/dataContext';
import type { Field, FormDef, TemplateFile } from '../types';
import { FieldsTable } from './FieldsTable';
import { TemplateEditor } from './TemplateEditor';

interface NewFormPageProps {
  onClose: () => void;
}

type SubTab = 'definition' | 'fields' | 'template';

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

const DRAFT_FORM_ID = '__draft__';

export function NewFormPage({ onClose }: NewFormPageProps) {
  const { forms } = useGdfData();
  const dispatch = useGdfDispatch();

  const [subtab, setSubtab] = useState<SubTab>('definition');

  const [id, setId] = useState('');
  const [name, setName] = useState('');
  const [topic, setTopic] = useState('dbz.gdfkube.requests');
  const [description, setDescription] = useState('');
  const [active, setActive] = useState(true);

  const [draftFields, setDraftFields] = useState<Field[]>([]);
  const [draftTemplates, setDraftTemplates] = useState<TemplateFile[]>([
    { name: 'main.yaml', content: '# New manifest\n' },
  ]);

  const trimmedId = id.trim();
  const idCollision = trimmedId !== '' && forms.some((f) => f.id === trimmedId);
  const canCreate = trimmedId !== '' && name.trim() !== '' && !idCollision;

  const handleCreate = () => {
    if (!canCreate) return;
    const today = todayIso();
    const form: FormDef = {
      id: trimmedId,
      name: name.trim(),
      topic: topic.trim() || 'dbz.gdfkube.requests',
      description: description.trim() || undefined,
      status: active ? 'active' : 'disabled',
      submissions: 0,
      fieldCount: draftFields.length,
      lastEdited: today,
      updated: today,
    };
    dispatch({ type: 'ADD_FORM', form });
    // ADD_FORM seeds an empty fields slice. UPDATE_FIELD upserts by key,
    // so each draft field is appended in one dispatch per field.
    draftFields.forEach((f) => {
      dispatch({
        type: 'UPDATE_FIELD',
        formId: trimmedId,
        key: f.key,
        patch: f,
      });
    });
    if (draftTemplates.length > 0) {
      dispatch({
        type: 'UPDATE_TEMPLATES',
        formId: trimmedId,
        templates: draftTemplates,
      });
    }
    onClose();
  };

  return (
    <div className="new-form-page" style={{ padding: '18px 0 24px' }}>
      <div className="row" style={{ marginBottom: 14, alignItems: 'center', gap: 8 }}>
        <button type="button" className="btn ghost sm" onClick={onClose}>
          ← All forms
        </button>
        <span className="spacer" />
        <button type="button" className="btn sm" onClick={onClose}>
          Cancel
        </button>
        <button
          type="button"
          className="btn primary sm"
          disabled={!canCreate}
          onClick={handleCreate}
          title={
            idCollision
              ? `A form with id "${trimmedId}" already exists`
              : !canCreate
                ? 'Form ID and Display name are required'
                : 'Create form'
          }
        >
          Create form
        </button>
      </div>

      <div role="tablist" aria-label="New form sub-tabs" className="subtabs">
        {(
          [
            { id: 'definition', label: 'Definition' },
            { id: 'fields', label: `Fields · ${draftFields.length}` },
            { id: 'template', label: 'Template' },
          ] as const
        ).map((t) => {
          const a = subtab === t.id;
          return (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={a}
              className={`subtab${a ? ' active' : ''}`}
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
            <label htmlFor="new-form-id">Form ID *</label>
            <input
              id="new-form-id"
              type="text"
              value={id}
              onChange={(e) =>
                setId(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))
              }
              placeholder="e.g. backup-restore"
              aria-invalid={idCollision || undefined}
            />
            <div
              className="help"
              data-testid="new-form-id-help"
              style={idCollision ? { color: 'var(--red-700, #b91c1c)' } : undefined}
            >
              {idCollision
                ? `A form with id "${trimmedId}" already exists.`
                : 'Lowercase, dash-separated. Immutable once created.'}
            </div>
          </div>
          <div className="field">
            <label htmlFor="new-form-name">Display name *</label>
            <input
              id="new-form-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Backup & Restore"
            />
          </div>
          <div className="field">
            <label htmlFor="new-form-topic">Kafka topic</label>
            <input
              id="new-form-topic"
              type="text"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="new-form-status">Status</label>
            <label className="row" style={{ height: 36, alignItems: 'center', gap: 8 }}>
              <input
                id="new-form-status"
                type="checkbox"
                checked={active}
                onChange={(e) => setActive(e.target.checked)}
              />
              <span>Activate immediately on save</span>
            </label>
          </div>
          <div className="field span-2">
            <label htmlFor="new-form-description">Description</label>
            <textarea
              id="new-form-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What does this form provision?"
            />
          </div>
        </div>
      )}

      {subtab === 'fields' && (
        <FieldsTable
          formId={DRAFT_FORM_ID}
          value={draftFields}
          onChange={setDraftFields}
        />
      )}

      {subtab === 'template' && (
        <TemplateEditor
          formId={DRAFT_FORM_ID}
          value={draftTemplates}
          onChange={setDraftTemplates}
        />
      )}
    </div>
  );
}

export default NewFormPage;
