// Per-group editor.
//
// Inputs for id, display name, full name, mapped Git repo (auto-suggested
// from id when the user has not edited the repo manually), the
// ManagedClusterSet binding, and an auto-provision toggle.

import { useState } from 'react';
import { useGdfData, useGdfDispatch } from '../state/dataContext';
import type { Group } from '../types';

interface GroupEditorProps {
  group: Group;
  onClose: () => void;
}

export function GroupEditor({ group: initial, onClose }: GroupEditorProps) {
  const { groups } = useGdfData();
  const dispatch = useGdfDispatch();
  // Read the live group from state so dispatched edits round-trip into the
  // input values. The `group` prop only seeds the initial selection.
  const group = groups.find((g) => g.id === initial.id) ?? initial;
  const [binding, setBinding] = useState('');
  const [autoProvision, setAutoProvision] = useState(true);

  const patch = (p: Partial<Group>) =>
    dispatch({ type: 'UPDATE_GROUP', id: group.id, patch: p });

  return (
    <div className="group-editor" style={{ padding: '18px 0 24px' }}>
      <div className="row" style={{ marginBottom: 14, alignItems: 'center', gap: 8 }}>
        <button type="button" className="btn ghost sm" onClick={onClose}>← All groups</button>
        <span className="spacer" />
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
        <div className="field">
          <label htmlFor="group-binding">ManagedClusterSet binding</label>
          <input id="group-binding" type="text" value={binding}
            placeholder="e.g. tier-a"
            onChange={(e) => setBinding(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="group-auto">Auto-provision</label>
          <label className="row" style={{ height: 36, alignItems: 'center', gap: 8 }}>
            <input id="group-auto" type="checkbox" checked={autoProvision}
              onChange={(e) => setAutoProvision(e.target.checked)} />
            <span>Auto-provision repo + AppProject on save</span>
          </label>
        </div>
      </div>
    </div>
  );
}

export default GroupEditor;
