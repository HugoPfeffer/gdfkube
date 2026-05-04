// New Form creation page.
//
// Inputs: form id, display name, kafka topic, description, status (default
// active). Create dispatches ADD_FORM (which seeds an empty fields slice)
// and returns to the forms list. Disabled until id and name are non-empty
// and the id does not collide with any existing form. On collision the
// Form ID input shows an inline error.

import { useState } from 'react';
import { useGdfData, useGdfDispatch } from '../state/dataContext';
import type { FormDef } from '../types';

interface NewFormPageProps {
  onClose: () => void;
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export function NewFormPage({ onClose }: NewFormPageProps) {
  const { forms } = useGdfData();
  const dispatch = useGdfDispatch();
  const [id, setId] = useState('');
  const [name, setName] = useState('');
  const [topic, setTopic] = useState('dbz.gdfkube.requests');
  const [description, setDescription] = useState('');
  const [active, setActive] = useState(true);

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
      fieldCount: 0,
      lastEdited: today,
      updated: today,
    };
    dispatch({ type: 'ADD_FORM', form });
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

      <div className="form-grid">
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
    </div>
  );
}

export default NewFormPage;
