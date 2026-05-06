// New Group creation page.
//
// Form for id, display name, full name, mapped Git repo (auto-suggested
// from id when the repo has not been edited manually), ManagedClusterSet
// binding (seeded select: default / production / staging / internal), and
// an auto-provision toggle. A "Resources that will be created" preview
// block lists the four artifacts the platform will provision in order:
// Keycloak group, AppProject, ManagedClusterSetBinding, Git repo.
// Create disabled until id and display name are non-empty.

import { useState } from 'react';
import { useGdfDispatch } from '../state/dataContext';
import type { Group } from '../types';

interface NewGroupPageProps {
  onClose: () => void;
}

const MANAGED_CLUSTER_SETS = ['default', 'production', 'staging', 'internal'] as const;

export function NewGroupPage({ onClose }: NewGroupPageProps) {
  const dispatch = useGdfDispatch();

  const [id, setId] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [fullName, setFullName] = useState('');
  const [repo, setRepo] = useState('');
  const [repoDirty, setRepoDirty] = useState(false);
  const [managedClusterSet, setManagedClusterSet] = useState<typeof MANAGED_CLUSTER_SETS[number]>('default');
  const [autoProvision, setAutoProvision] = useState(true);

  const onIdChange = (next: string) => {
    const cleaned = next.toLowerCase().replace(/[^a-z0-9-]/g, '');
    setId(cleaned);
    if (!repoDirty) {
      setRepo(cleaned === '' ? '' : `gdfkube-${cleaned}`);
    }
  };

  const onRepoChange = (next: string) => {
    setRepoDirty(true);
    setRepo(next);
  };

  const trimmedId = id.trim();
  const canCreate = trimmedId !== '' && displayName.trim() !== '';

  const handleCreate = () => {
    if (!canCreate) return;
    const group: Group = {
      id: trimmedId,
      name: displayName.trim(),
      fullName: fullName.trim() || displayName.trim(),
      users: 0,
      forms: 0,
      repo: repo.trim() || `gdfkube-${trimmedId}`,
      clusters: 0,
    };
    dispatch({ type: 'ADD_GROUP', group });
    onClose();
  };

  const idDisplay = trimmedId || '{id}';
  const repoDisplay = repo || `gdfkube-${idDisplay}`;

  return (
    <div className="new-group-page" style={{ padding: '18px 0 24px' }}>
      <div className="row" style={{ marginBottom: 14, alignItems: 'center', gap: 8 }}>
        <button type="button" className="btn ghost sm" onClick={onClose}>← All groups</button>
        <span className="spacer" />
        <button type="button" className="btn sm" onClick={onClose}>Cancel</button>
        <button type="button" className="btn primary sm" disabled={!canCreate} onClick={handleCreate}>
          Create group
        </button>
      </div>

      <div className="form-grid">
        <div className="field">
          <label htmlFor="new-group-id">ID</label>
          <input id="new-group-id" type="text" value={id} required
            onChange={(e) => onIdChange(e.target.value)} placeholder="e.g. cultura" />
          <div className="help">Lowercase, dash-separated. Used for Keycloak group, repo, and AppProject names.</div>
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
        <div className="field">
          <label htmlFor="new-group-mcs">ManagedClusterSet</label>
          <select
            id="new-group-mcs"
            name="managedClusterSet"
            value={managedClusterSet}
            onChange={(e) =>
              setManagedClusterSet(e.target.value as typeof MANAGED_CLUSTER_SETS[number])
            }
          >
            {MANAGED_CLUSTER_SETS.map((opt) => (
              <option key={opt} value={opt}>{opt}</option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="new-group-auto">Auto-provision</label>
          <label className="row" style={{ height: 36, alignItems: 'center', gap: 8 }}>
            <input id="new-group-auto" type="checkbox" checked={autoProvision}
              onChange={(e) => setAutoProvision(e.target.checked)} />
            <span>Auto-provision repo + AppProject on save</span>
          </label>
        </div>
      </div>

      <div className="card" data-testid="group-preview" style={{ marginTop: 18 }}>
        <h3 style={{ margin: 0, fontSize: 14 }}>Resources that will be created</h3>
        <ul className="mono" style={{ margin: '8px 0 0', padding: 0, listStyle: 'none', fontSize: 13 }}>
          <li>Keycloak group: gdf-{idDisplay}</li>
          <li>AppProject: {idDisplay}-apps</li>
          <li>ManagedClusterSetBinding: {managedClusterSet} → {idDisplay}</li>
          <li>Git repo: {repoDisplay}</li>
        </ul>
      </div>
    </div>
  );
}

export default NewGroupPage;
