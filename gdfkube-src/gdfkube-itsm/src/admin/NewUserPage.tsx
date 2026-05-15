// New User creation page.
//
// Inputs: name, username, email, group, role (radio-cards), status, MFA, and
// an "Initial credentials" subsection with the "Send invite email" toggle.
// An info banner above the form fields summarizes what each role does.
// Create disabled until name, username, email, group, and role are non-empty.
// On Create dispatches ADD_USER and calls onClose.

import { useState, type KeyboardEvent } from 'react';
import { itsmApi } from '../api/itsmApi';
import { useGdfData, useGdfDispatch } from '../state/dataContext';
import type { Role, User } from '../types';

interface NewUserPageProps {
  onClose: () => void;
}

const ROLES: Role[] = ['operator', 'admin'];

const ROLE_DESCRIPTIONS: Record<Role, string> = {
  operator: 'Operator submits requests',
  admin: 'Admin manages forms and users',
};

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
  const [isSaving, setIsSaving] = useState(false);

  const canCreate =
    name.trim() !== '' &&
    username.trim() !== '' &&
    email.trim() !== '' &&
    group !== '' &&
    role !== '';

  const handleCreate = async () => {
    if (!canCreate || isSaving) return;
    setIsSaving(true);
    try {
      const body: Record<string, unknown> = {
        id: username.trim(),
        name: name.trim(),
        fullName: name.trim(),
        username: username.trim(),
        email: email.trim(),
        group,
        role,
        status,
        mfa,
      };
      const created = await itsmApi.users.create(body);
      const user: User = {
        id: (created.id as string) ?? `user-${Date.now()}`,
        name: (created.name as string) ?? name.trim(),
        fullName: (created.fullName as string) ?? name.trim(),
        username: (created.username as string) ?? username.trim(),
        email: (created.email as string) ?? email.trim(),
        group: (created.group as string) ?? group,
        role: (created.role as Role) ?? (role as Role),
        status: (created.status as 'active' | 'disabled') ?? status,
        mfa: (created.mfa as string) ?? mfa,
        active: status === 'active',
      };
      dispatch({ type: 'ADD_USER', user });
      onClose();
    } catch {
      setIsSaving(false);
    }
  };

  const onRoleKeyDown = (e: KeyboardEvent<HTMLButtonElement>, r: Role) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      setRole(r);
    }
  };

  return (
    <div className="new-user-page" style={{ padding: '18px 0 24px' }}>
      <div className="row" style={{ marginBottom: 14, alignItems: 'center', gap: 8 }}>
        <button type="button" className="btn ghost sm" onClick={onClose}>← All users</button>
        <span className="spacer" />
        <button type="button" className="btn sm" onClick={onClose}>Cancel</button>
        <button type="button" className="btn primary sm" disabled={!canCreate || isSaving} onClick={handleCreate}>
          {isSaving ? 'Creating…' : 'Create user'}
        </button>
      </div>

      <div
        className="info-banner banner-info"
        data-testid="role-info-banner"
        role="note"
        style={{
          padding: '8px 12px',
          marginBottom: 14,
          border: '1px solid var(--ink-200)',
          borderRadius: 'var(--radius)',
          background: 'var(--paper)',
          fontSize: 12,
        }}
      >
        Operator submits requests · Admin manages forms and users
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
        <div className="field" style={{ gridColumn: '1 / -1' }}>
          <span className="field-label">Role</span>
          <div className="radio-group" role="radiogroup" aria-label="Role">
            {ROLES.map((r) => {
              const selected = role === r;
              return (
                <button
                  key={r}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  aria-label={r.charAt(0).toUpperCase() + r.slice(1)}
                  className={'radio-card' + (selected ? ' selected' : '')}
                  onClick={() => setRole(r)}
                  onKeyDown={(e) => onRoleKeyDown(e, r)}
                >
                  <div className="rc-title">
                    <span>{r.charAt(0).toUpperCase() + r.slice(1)}</span>
                  </div>
                  <div className="rc-sub">{ROLE_DESCRIPTIONS[r]}</div>
                </button>
              );
            })}
          </div>
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
      </div>

      <section className="card" style={{ marginTop: 18 }} data-testid="initial-credentials">
        <h3 style={{ margin: 0, fontSize: 14 }}>Initial credentials</h3>
        <label className="row" style={{ height: 36, alignItems: 'center', gap: 8, marginTop: 8 }}>
          <input
            id="new-user-invite"
            type="checkbox"
            checked={invite}
            onChange={(e) => setInvite(e.target.checked)}
          />
          <span>Send invite email</span>
        </label>
        <p className="muted" style={{ margin: '6px 0 0', fontSize: 12 }}>
          When checked, the user receives an email with a one-time link to set their password.
        </p>
      </section>
    </div>
  );
}

export default NewUserPage;
