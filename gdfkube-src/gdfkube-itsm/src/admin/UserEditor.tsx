// Per-user editor.
//
// Renders inputs for every editable user attribute (name, username, email,
// group, role, status, password, MFA) and a read-only "Recent sessions"
// list synthesized deterministically from the user's id so the demo has
// content without needing real session storage.

import { useMemo } from 'react';
import { useGdfData, useGdfDispatch } from '../state/dataContext';
import type { Role, User } from '../types';

interface UserEditorProps {
  user: User;
  onClose: () => void;
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

const ROLES: Role[] = ['operator', 'approver', 'admin', 'service'];

export function UserEditor({ user: initial, onClose }: UserEditorProps) {
  const { groups, users } = useGdfData();
  const dispatch = useGdfDispatch();
  // Read the live user from state so dispatched edits round-trip into the
  // input values. The `user` prop only seeds the initial selection.
  const user = users.find((u) => u.id === initial.id) ?? initial;
  const sessions = useMemo(() => synthesizeSessions(user), [user]);

  const patch = (p: Partial<User>) =>
    dispatch({ type: 'UPDATE_USER', id: user.id, patch: p });

  return (
    <div className="user-editor" style={{ padding: '18px 0 24px' }}>
      <div className="row" style={{ marginBottom: 14, alignItems: 'center', gap: 8 }}>
        <button type="button" className="btn ghost sm" onClick={onClose}>← All users</button>
        <span className="spacer" />
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
        <div className="field">
          <label htmlFor="user-role">Role</label>
          <select id="user-role" value={user.role}
            onChange={(e) => patch({ role: e.target.value as Role })}>
            {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
        </div>
        <div className="field">
          <label htmlFor="user-status">Status</label>
          <select id="user-status" value={user.status ?? 'active'}
            onChange={(e) => patch({ status: e.target.value as 'active' | 'disabled' })}>
            <option value="active">active</option>
            <option value="disabled">disabled</option>
          </select>
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
    </div>
  );
}

export default UserEditor;
