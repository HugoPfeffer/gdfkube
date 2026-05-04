// New User creation page.
//
// Inputs: name, username, email, group, role, status, MFA, optional
// invite-email toggle. Create disabled until name, username, email, group,
// and role are non-empty. On Create dispatches ADD_USER and calls onClose.

import { useState } from 'react';
import { useGdfData, useGdfDispatch } from '../state/dataContext';
import type { Role, User } from '../types';

interface NewUserPageProps {
  onClose: () => void;
}

const ROLES: Role[] = ['operator', 'approver', 'admin', 'service'];

export function NewUserPage({ onClose }: NewUserPageProps) {
  const { groups } = useGdfData();
  const dispatch = useGdfDispatch();

  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [group, setGroup] = useState('');
  const [role, setRole] = useState<Role | ''>('');
  const [status, setStatus] = useState<'active' | 'disabled'>('active');
  const [mfa, setMfa] = useState('none');
  const [invite, setInvite] = useState(true);

  const canCreate =
    name.trim() !== '' &&
    username.trim() !== '' &&
    email.trim() !== '' &&
    group !== '' &&
    role !== '';

  const handleCreate = () => {
    if (!canCreate) return;
    const user: User = {
      id: `user-${Date.now()}`,
      name: name.trim(),
      fullName: name.trim(),
      username: username.trim(),
      email: email.trim(),
      group,
      role: role as Role,
      status,
      mfa,
      active: status === 'active',
    };
    dispatch({ type: 'ADD_USER', user });
    onClose();
  };

  return (
    <div className="new-user-page" style={{ padding: '18px 0 24px' }}>
      <div className="row" style={{ marginBottom: 14, alignItems: 'center', gap: 8 }}>
        <button type="button" className="btn ghost sm" onClick={onClose}>← All users</button>
        <span className="spacer" />
        <button type="button" className="btn sm" onClick={onClose}>Cancel</button>
        <button type="button" className="btn primary sm" disabled={!canCreate} onClick={handleCreate}>
          Create user
        </button>
      </div>

      <div className="form-grid">
        <div className="field">
          <label htmlFor="new-user-name">Name</label>
          <input id="new-user-name" type="text" value={name}
            onChange={(e) => setName(e.target.value)} placeholder="e.g. Ana Souza" />
        </div>
        <div className="field">
          <label htmlFor="new-user-username">Username</label>
          <input id="new-user-username" type="text" value={username}
            onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/\s+/g, '.'))}
            placeholder="e.g. ana.souza" />
        </div>
        <div className="field">
          <label htmlFor="new-user-email">Email</label>
          <input id="new-user-email" type="email" value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="ana.souza@dept.gov" />
        </div>
        <div className="field">
          <label htmlFor="new-user-group">Group</label>
          <select id="new-user-group" value={group}
            onChange={(e) => setGroup(e.target.value)}>
            <option value="">— Select a group —</option>
            {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
          </select>
        </div>
        <div className="field">
          <label htmlFor="new-user-role">Role</label>
          <select id="new-user-role" value={role}
            onChange={(e) => setRole(e.target.value as Role | '')}>
            <option value="">— Select a role —</option>
            {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
        </div>
        <div className="field">
          <label htmlFor="new-user-status">Status</label>
          <select id="new-user-status" value={status}
            onChange={(e) => setStatus(e.target.value as 'active' | 'disabled')}>
            <option value="active">active</option>
            <option value="disabled">disabled</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor="new-user-mfa">MFA method</label>
          <select id="new-user-mfa" value={mfa}
            onChange={(e) => setMfa(e.target.value)}>
            <option value="none">None</option>
            <option value="totp">TOTP</option>
            <option value="webauthn">WebAuthn</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor="new-user-invite">Invite email</label>
          <label className="row" style={{ height: 36, alignItems: 'center', gap: 8 }}>
            <input id="new-user-invite" type="checkbox" checked={invite}
              onChange={(e) => setInvite(e.target.checked)} />
            <span>Send Keycloak invitation email</span>
          </label>
        </div>
      </div>
    </div>
  );
}

export default NewUserPage;
