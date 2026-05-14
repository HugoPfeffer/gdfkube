// Per-group editor.
//
// Inputs for id (read-only), display name, full name, and mapped Git repo.
// Persisted via PATCH /api/itsm/groups/:id with the {name, fullName, repo} whitelist.

import { useState } from 'react';
import { itsmApi } from '../api/itsmApi';
import { useGdfData, useGdfDispatch } from '../state/dataContext';
import type { Toast } from '../shell/ToastStack';
import type { Group } from '../types';

interface GroupEditorProps {
  group: Group;
  onClose: () => void;
  setToast?: (t: Toast) => void;
}

export function GroupEditor({ group: initial, onClose, setToast }: GroupEditorProps) {
  const { groups } = useGdfData();
  const dispatch = useGdfDispatch();
  // Read the live group from state so dispatched edits round-trip into the
  // input values. The `group` prop only seeds the initial selection.
  const group = groups.find((g) => g.id === initial.id) ?? initial;
  const [isSaving, setIsSaving] = useState(false);
  const [saved, setSaved] = useState(initial);

  const isDirty =
    group.name !== saved.name ||
    group.fullName !== saved.fullName ||
    group.repo !== saved.repo;

  const patch = (p: Partial<Group>) =>
    dispatch({ type: 'UPDATE_GROUP', id: group.id, patch: p });

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const changes: Record<string, unknown> = {
        name: group.name,
        fullName: group.fullName,
        repo: group.repo,
      };
      await itsmApi.groups.update(group.id, changes);
      setSaved({ ...group });
      setToast?.({
        id: `save-${Date.now()}`,
        kind: 'info',
        title: 'Saved',
        body: 'Group changes persisted to the API.',
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
  };

  return (
    <div className="group-editor" style={{ padding: '18px 0 24px' }}>
      <div className="row" style={{ marginBottom: 14, alignItems: 'center', gap: 8 }}>
        <button type="button" className="btn ghost sm" onClick={onClose}>← All groups</button>
        <span className="spacer" />
        <button
          type="button"
          className="btn primary sm"
          disabled={isSaving || !isDirty}
          onClick={handleSave}
        >
          {isSaving ? 'Saving…' : 'Save changes'}
        </button>
      </div>

      <div className="form-grid">
        <div className="field">
          <label htmlFor="group-id">ID</label>
          <input id="group-id" type="text" value={group.id} disabled readOnly />
        </div>
        <div className="field">
          <label htmlFor="group-name">Display name</label>
          <input id="group-name" type="text" value={group.name}
            onChange={(e) => patch({ name: e.target.value })} />
        </div>
        <div className="field">
          <label htmlFor="group-full">Full name</label>
          <input id="group-full" type="text" value={group.fullName}
            onChange={(e) => patch({ fullName: e.target.value })} />
        </div>
        <div className="field">
          <label htmlFor="group-repo">Git repo</label>
          <input id="group-repo" type="text" value={group.repo}
            onChange={(e) => patch({ repo: e.target.value })} />
        </div>
      </div>
    </div>
  );
}

export default GroupEditor;
