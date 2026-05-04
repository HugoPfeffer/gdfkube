// Users admin page.
//
// Top-level tabs: Users (with search + role filter) and Groups. Row click
// opens the corresponding editor; the "+" button on each tab opens the
// matching create page. All data is sourced from the admin reducer in
// useGdfData() — adding or editing here propagates everywhere else.

import { useMemo, useState } from 'react';
import { GroupEditor } from '../../admin/GroupEditor';
import { NewGroupPage } from '../../admin/NewGroupPage';
import { NewUserPage } from '../../admin/NewUserPage';
import { UserEditor } from '../../admin/UserEditor';
import type { Navigate } from '../../router';
import { useGdfData } from '../../state/dataContext';
import type { Group, Role, User } from '../../types';

type Tab = 'users' | 'groups';
type RoleFilter = Role | 'all';
const ROLES: RoleFilter[] = ['all', 'operator', 'approver', 'admin', 'service'];

function avatar(user: User): string {
  return user.name.split(/\s+/).map((n) => n[0] ?? '').join('').slice(0, 2).toUpperCase();
}

export function Users({ navigate: _navigate }: { navigate: Navigate }) {
  void _navigate;
  const data = useGdfData();
  const [tab, setTab] = useState<Tab>('users');
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<RoleFilter>('all');
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [editingGroup, setEditingGroup] = useState<Group | null>(null);
  const [creatingUser, setCreatingUser] = useState(false);
  const [creatingGroup, setCreatingGroup] = useState(false);

  const filteredUsers = useMemo(() => {
    const q = search.trim().toLowerCase();
    return data.users.filter((u) => {
      if (roleFilter !== 'all' && u.role !== roleFilter) return false;
      if (q === '') return true;
      const hay = `${u.name} ${u.username ?? ''} ${u.email}`.toLowerCase();
      return hay.includes(q);
    });
  }, [data.users, search, roleFilter]);

  if (creatingUser) return <div className="page admin-users"><NewUserPage onClose={() => setCreatingUser(false)} /></div>;
  if (creatingGroup) return <div className="page admin-users"><NewGroupPage onClose={() => setCreatingGroup(false)} /></div>;
  if (editingUser) return <div className="page admin-users"><UserEditor user={editingUser} onClose={() => setEditingUser(null)} /></div>;
  if (editingGroup) return <div className="page admin-users"><GroupEditor group={editingGroup} onClose={() => setEditingGroup(null)} /></div>;

  return (
    <div className="page admin-users">
      <div className="page-head" data-testid="users-head">
        <h1 className="page-title">Users & Groups</h1>
        <p className="page-sub">Keycloak users and department groups. Group ID maps to the customer Git repo and Keycloak realm group.</p>
        <div className="row" style={{ marginTop: 8 }}>
          <span className="spacer" />
          {tab === 'users' ? (
            <button type="button" className="btn primary sm" onClick={() => setCreatingUser(true)}>+ New user</button>
          ) : (
            <button type="button" className="btn primary sm" onClick={() => setCreatingGroup(true)}>+ New group</button>
          )}
        </div>
      </div>

      <div role="tablist" aria-label="Admin users tabs" className="tabs">
        {(['users', 'groups'] as const).map((id) => {
          const label = id === 'users' ? 'Users' : 'Groups';
          const active = tab === id;
          return (
            <button key={id} type="button" role="tab" aria-selected={active}
              className={`tab${active ? ' active' : ''}`} onClick={() => setTab(id)}>{label}</button>
          );
        })}
      </div>

      {tab === 'users' && (
        <div className="card">
          <div className="filters">
            <input type="search" placeholder="Search by name, username, or email"
              value={search} onChange={(e) => setSearch(e.target.value)}
              aria-label="Search users" style={{ flex: 1, minWidth: 200 }} />
            <label htmlFor="role-filter" className="muted" style={{ fontSize: 12 }}>Role filter</label>
            <select id="role-filter" value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value as RoleFilter)}>
              {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>
          <div className="table-wrap">
            <table className="list" data-testid="users-table">
              <thead>
                <tr>
                  <th style={{ width: 44 }}></th>
                  <th>Name</th>
                  <th>Username</th>
                  <th>Email</th>
                  <th style={{ width: 120 }}>Group</th>
                  <th style={{ width: 100 }}>Role</th>
                  <th style={{ width: 90 }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {filteredUsers.map((u) => {
                  const open = () => setEditingUser(u);
                  return (
                    <tr key={u.id} role="button" tabIndex={0} onClick={open}
                        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { if (e.key === ' ') e.preventDefault(); open(); } }}>
                      <td><span className="avatar" aria-hidden="true">{avatar(u)}</span></td>
                      <td><strong>{u.name}</strong></td>
                      <td className="mono">{u.username ?? '—'}</td>
                      <td className="muted">{u.email}</td>
                      <td className="mono">{u.group ?? '—'}</td>
                      <td><span className="pill blue">{u.role}</span></td>
                      <td>{u.status === 'disabled'
                        ? <span className="pill gray">Disabled</span>
                        : <span className="pill green">Active</span>}</td>
                    </tr>
                  );
                })}
                {filteredUsers.length === 0 && <tr><td colSpan={7} className="empty">No users match the current filters.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'groups' && (
        <div className="card">
          <div className="table-wrap">
            <table className="list" data-testid="groups-table">
              <thead>
                <tr>
                  <th style={{ width: 140 }}>ID</th>
                  <th>Display name</th>
                  <th style={{ width: 80 }}>Users</th>
                  <th style={{ width: 80 }}>Forms</th>
                  <th>Mapped Git repo</th>
                  <th style={{ width: 90 }}>Clusters</th>
                </tr>
              </thead>
              <tbody>
                {data.groups.map((g) => {
                  const open = () => setEditingGroup(g);
                  return (
                    <tr key={g.id} role="button" tabIndex={0} onClick={open}
                        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { if (e.key === ' ') e.preventDefault(); open(); } }}>
                      <td className="mono"><span className="row-group-id">{g.id}</span></td>
                      <td><strong>{g.name}</strong> <span className="muted">{g.fullName}</span></td>
                      <td className="mono">{g.users}</td>
                      <td className="mono">{g.forms}</td>
                      <td className="mono muted">{g.repo}</td>
                      <td className="mono">{g.clusters ?? '—'}</td>
                    </tr>
                  );
                })}
                {data.groups.length === 0 && <tr><td colSpan={6} className="empty">No groups yet.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

export default Users;
