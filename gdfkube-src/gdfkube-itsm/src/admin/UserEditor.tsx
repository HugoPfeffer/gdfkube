// Per-user editor.
//
// Renders a `.user-banner` block (initials avatar + fullName + username · email)
// at the top, then inputs for every editable user attribute. Role and status
// are radio-cards (button[role=radio], aria-checked, keyboard-activatable via
// Enter/Space). A red ghost "Disable account" button at the footer sets the
// user to `disabled` and emits a confirmation toast. A "Recent sessions"
// list synthesized deterministically from the user's id provides demo content.

import { useMemo, useState, type KeyboardEvent } from 'react';
import { itsmApi } from '../api/itsmApi';
import { useGdfData, useGdfDispatch } from '../state/dataContext';
import type { Toast } from '../shell/ToastStack';
import type { Role, User } from '../types';

interface UserEditorProps {
  user: User;
  onClose: () => void;
  setToast?: (t: Toast) => void;
}

type Session = { at: string; ip: string; device: string };

function synthesizeSessions(user: User): Session[] {
  // Deterministic per-user sessions — no random, no time. Demo content only.
  const base = user.id.charCodeAt(0) || 1;
  const dev = ['Linux · Chrome 130', 'macOS · Safari 18', 'Windows · Edge 130'];
  return [
    { at: `${user.last ?? 'now'}`, ip: `10.0.${base % 50}.12`, device: dev[base % dev.length]! },
    { at: 'yesterday', ip: `10.0.${base % 50}.45`, device: dev[(base + 1) % dev.length]! },
    { at: '3d ago', ip: `10.0.${base % 50}.78`, device: dev[(base + 2) % dev.length]! },
  ];
}

const ROLES: Role[] = ['operator', 'admin'];
const STATUSES: Array<'active' | 'disabled'> = ['active', 'disabled'];

function initials(name: string): string {
  return name.split(/\s+/).map((n) => n[0] ?? '').join('').slice(0, 2).toUpperCase();
}

interface RadioCardProps<T extends string> {
  value: T;
  label: string;
  selected: boolean;
  onSelect: (next: T) => void;
}

function RadioCard<T extends string>({ value, label, selected, onSelect }: RadioCardProps<T>) {
  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onSelect(value);
    }
  };
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      aria-label={label}
      className={'radio-card' + (selected ? ' selected' : '')}
      onClick={() => onSelect(value)}
      onKeyDown={onKeyDown}
    >
      <div className="rc-title">
        <span>{label}</span>
      </div>
    </button>
  );
}

export function UserEditor({ user: initial, onClose, setToast }: UserEditorProps) {
  const { groups, users } = useGdfData();
  const dispatch = useGdfDispatch();
  // Read the live user from state so dispatched edits round-trip into the
  // input values. The `user` prop only seeds the initial selection.
  const user = users.find((u) => u.id === initial.id) ?? initial;
  const sessions = useMemo(() => synthesizeSessions(user), [user]);
  const [isSaving, setIsSaving] = useState(false);
  const [saved, setSaved] = useState(initial);

  const isDirty =
    user.name !== saved.name ||
    (user.username ?? '') !== (saved.username ?? '') ||
    user.email !== saved.email ||
    (user.group ?? '') !== (saved.group ?? '') ||
    user.role !== saved.role ||
    (user.status ?? 'active') !== (saved.status ?? 'active') ||
    (user.mfa ?? 'none') !== (saved.mfa ?? 'none');

  const patch = (p: Partial<User>) =>
    dispatch({ type: 'UPDATE_USER', id: user.id, patch: p });

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const changes: Record<string, unknown> = {
        name: user.name,
        username: user.username,
        email: user.email,
        group: user.group,
        role: user.role,
        status: user.status ?? 'active',
        mfa: user.mfa ?? 'none',
      };
      await itsmApi.users.update(user.id, changes);
      setSaved({ ...user });
      setToast?.({
        id: `save-${Date.now()}`,
        kind: 'info',
        title: 'Saved',
        body: 'User changes persisted to the API.',
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

  const handleDisable = async () => {
    setIsSaving(true);
    try {
      await itsmApi.users.update(user.id, { status: 'disabled', active: false } as Record<string, unknown>);
      patch({ status: 'disabled', active: false });
      setSaved((prev) => ({ ...prev, status: 'disabled', active: false }));
      setToast?.({
        id: `user-disabled-${user.id}-${Date.now()}`,
        kind: 'info',
        title: 'Account disabled',
        body: `${user.fullName ?? user.name} can no longer sign in.`,
      });
    } catch (err) {
      setToast?.({
        id: `user-disable-err-${user.id}-${Date.now()}`,
        kind: 'warn',
        title: 'Failed to disable',
        body: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setIsSaving(false);
    }
  };

  const fullName = user.fullName ?? user.name;
  const status = user.status ?? 'active';

  return (
    <div className="user-editor" style={{ padding: '18px 0 24px' }}>
      <div className="row" style={{ marginBottom: 14, alignItems: 'center', gap: 8 }}>
        <button type="button" className="btn ghost sm" onClick={onClose}>← All users</button>
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

      <div className="user-banner" style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <span
          className="avatar"
          aria-hidden="true"
          style={{ width: 32, height: 32, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
        >
          {initials(fullName)}
        </span>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <strong className="user-banner-name">{fullName}</strong>
          <span className="muted mono user-banner-meta" style={{ fontSize: 12 }}>
            {(user.username ?? '—')} · {user.email}
          </span>
        </div>
      </div>

      <div className="form-grid">
        <div className="field">
          <label htmlFor="user-name">Name</label>
          <input id="user-name" type="text" value={user.name}
            onChange={(e) => patch({ name: e.target.value })} />
        </div>
        <div className="field">
          <label htmlFor="user-username">Username</label>
          <input id="user-username" type="text" value={user.username ?? ''}
            onChange={(e) => patch({ username: e.target.value })} />
        </div>
        <div className="field">
          <label htmlFor="user-email">Email</label>
          <input id="user-email" type="email" value={user.email}
            onChange={(e) => patch({ email: e.target.value })} />
        </div>
        <div className="field">
          <label htmlFor="user-group">Group</label>
          <select id="user-group" value={user.group ?? ''}
            onChange={(e) => patch({ group: e.target.value })}>
            <option value="">—</option>
            {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
          </select>
        </div>
        <div className="field" style={{ gridColumn: '1 / -1' }}>
          <span className="field-label">Role</span>
          <div className="radio-group" role="radiogroup" aria-label="Role">
            {ROLES.map((r) => (
              <RadioCard
                key={r}
                value={r}
                label={r.charAt(0).toUpperCase() + r.slice(1)}
                selected={user.role === r}
                onSelect={(next) => patch({ role: next })}
              />
            ))}
          </div>
        </div>
        <div className="field" style={{ gridColumn: '1 / -1' }}>
          <span className="field-label">Status</span>
          <div className="radio-group" role="radiogroup" aria-label="Status">
            {STATUSES.map((s) => (
              <RadioCard
                key={s}
                value={s}
                label={s.charAt(0).toUpperCase() + s.slice(1)}
                selected={status === s}
                onSelect={(next) => patch({ status: next, active: next === 'active' })}
              />
            ))}
          </div>
        </div>
        <div className="field">
          <label htmlFor="user-password">Password</label>
          <input id="user-password" type="password" placeholder="Set a new password" />
        </div>
        <div className="field">
          <label htmlFor="user-mfa">MFA method</label>
          <select id="user-mfa" value={user.mfa ?? 'none'}
            onChange={(e) => patch({ mfa: e.target.value })}>
            <option value="none">None</option>
            <option value="totp">TOTP</option>
            <option value="webauthn">WebAuthn</option>
          </select>
        </div>
      </div>

      <div className="card" style={{ marginTop: 18 }}>
        <h3 style={{ margin: 0, fontSize: 14 }}>Recent sessions</h3>
        <ul data-testid="recent-sessions" className="sessions" style={{ margin: '8px 0 0', padding: 0, listStyle: 'none' }}>
          {sessions.map((s, i) => (
            <li key={i} className="row" style={{ padding: '6px 0', gap: 12, fontSize: 13 }}>
              <span className="muted mono" style={{ width: 100 }}>{s.at}</span>
              <span className="mono" style={{ width: 110 }}>{s.ip}</span>
              <span className="muted">{s.device}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="row" style={{ marginTop: 18, alignItems: 'center', justifyContent: 'flex-end' }}>
        <button
          type="button"
          className="btn ghost sm danger"
          onClick={handleDisable}
          disabled={status === 'disabled'}
        >
          Disable account
        </button>
      </div>
    </div>
  );
}

export default UserEditor;
