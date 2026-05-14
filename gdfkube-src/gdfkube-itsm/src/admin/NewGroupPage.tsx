// New Group creation page.
//
// Form for id, display name, full name, mapped Git repo (auto-suggested
// from id when the repo has not been edited manually). A "Resources that
// will be created" preview block lists the four artifacts the Camel
// automation will provision: Keycloak group, AppProject,
// ManagedClusterSetBinding ({id} → {id}), Git repo.
// Create disabled until id and display name are non-empty.

import { useState } from 'react';
import { itsmApi } from '../api/itsmApi';
import { useGdfDispatch } from '../state/dataContext';
import type { Toast } from '../shell/ToastStack';
import type { Group } from '../types';
import { slugify } from '../utils/slug';

interface NewGroupPageProps {
  onClose: () => void;
  setToast?: (t: Toast) => void;
}

export function NewGroupPage({ onClose, setToast }: NewGroupPageProps) {
  const dispatch = useGdfDispatch();

  const [displayName, setDisplayName] = useState('');
  const [fullName, setFullName] = useState('');
  const [manualRepo, setManualRepo] = useState('');
  const [repoDirty, setRepoDirty] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const id = slugify(displayName);
  const repo = repoDirty ? manualRepo : (id === '' ? '' : `gdfkube-${id}`);

  const onRepoChange = (next: string) => {
    setRepoDirty(true);
    setManualRepo(next);
  };

  const canCreate = id !== '' && displayName.trim() !== '';

  const handleCreate = async () => {
    if (!canCreate || isSaving) return;
    setIsSaving(true);
    try {
      const body: Record<string, unknown> = {
        _id: id,
        name: displayName.trim(),
        fullName: fullName.trim() || displayName.trim(),
        repo: repo.trim() || `gdfkube-${id}`,
      };
      const created = await itsmApi.groups.create(body);
      const group: Group = {
        id: (created.id as string) ?? id,
        name: (created.name as string) ?? displayName.trim(),
        fullName: (created.fullName as string) ?? (fullName.trim() || displayName.trim()),
        users: 0,
        forms: 0,
        repo: (created.repo as string) ?? (repo.trim() || `gdfkube-${id}`),
        clusters: 0,
      };
      dispatch({ type: 'ADD_GROUP', group });
      setToast?.({
        id: `create-${Date.now()}`,
        kind: 'info',
        title: 'Created',
        body: `Group "${group.name}" created.`,
      });
      onClose();
    } catch (err) {
      setToast?.({
        id: `create-err-${Date.now()}`,
        kind: 'warn',
        title: 'Create failed',
        body: err instanceof Error ? err.message : String(err),
      });
      setIsSaving(false);
    }
  };

  const idDisplay = id || '{id}';
  const repoDisplay = repo || `gdfkube-${idDisplay}`;

  return (
    <div className="new-group-page" style={{ padding: '18px 0 24px' }}>
      <div className="row" style={{ marginBottom: 14, alignItems: 'center', gap: 8 }}>
        <button type="button" className="btn ghost sm" onClick={onClose}>← All groups</button>
        <span className="spacer" />
        <button type="button" className="btn sm" onClick={onClose}>Cancel</button>
        <button type="button" className="btn primary sm" disabled={!canCreate || isSaving} onClick={handleCreate}>
          {isSaving ? 'Creating…' : 'Create group'}
        </button>
      </div>

      <div className="form-grid">
        <div className="field">
          <label htmlFor="new-group-id">ID</label>
          <input id="new-group-id" type="text" value={id} disabled readOnly />
          <div className="help">Auto-derived from Display name. Used for Keycloak group, repo, and AppProject names.</div>
        </div>
        <div className="field">
          <label htmlFor="new-group-name">Display name</label>
          <input id="new-group-name" type="text" value={displayName} required
            onChange={(e) => setDisplayName(e.target.value)} placeholder="e.g. Cultura" />
        </div>
        <div className="field">
          <label htmlFor="new-group-full">Full name</label>
          <input id="new-group-full" type="text" value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            placeholder="e.g. Department of Culture" />
        </div>
        <div className="field">
          <label htmlFor="new-group-repo">Git repo</label>
          <input id="new-group-repo" type="text" value={repo}
            onChange={(e) => onRepoChange(e.target.value)}
            placeholder="gdfkube-{id}" />
          <div className="help">Auto-suggested from id; edit to override.</div>
        </div>
      </div>

      <div className="card" data-testid="group-preview" style={{ marginTop: 18 }}>
        <h3 style={{ margin: 0, fontSize: 14 }}>Resources that will be created</h3>
        <ul className="mono" style={{ margin: '8px 0 0', padding: 0, listStyle: 'none', fontSize: 13 }}>
          <li>Keycloak group: gdf-{idDisplay}</li>
          <li>AppProject: {idDisplay}-apps</li>
          <li>ManagedClusterSetBinding: {idDisplay} → {idDisplay}</li>
          <li>Git repo: {repoDisplay}</li>
        </ul>
      </div>
    </div>
  );
}

export default NewGroupPage;
