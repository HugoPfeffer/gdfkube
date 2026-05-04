// Topbar: breadcrumbs, search, refresh/notifications, role switcher menu.
//
// The bundle (gdfkube-remix/project/shell.jsx) reads `user.org` and
// `user.initials`. The React app's User type doesn't include those fields
// (initials are derived; org maps to user.group), so:
//   - initials are computed from fullName (falling back to name)
//   - org displayed in the switcher line is user.group ?? ''

import { Fragment, useEffect, useRef, useState } from 'react';
import { Icons } from '../icons/Icons';
import type { Role, User } from '../types';

interface TopbarProps {
  crumbs: string[];
  role: Role;
  setRole: (r: Role) => void;
  user: User;
  onNotify?: () => void;
}

function initialsOf(user: User): string {
  const source = user.fullName || user.name || '';
  const parts = source.trim().split(/\s+/).slice(0, 2);
  return parts.map((p) => p.charAt(0).toUpperCase()).join('');
}

function roleLabel(role: Role): string {
  return role === 'admin' ? 'Platform Admin' : 'Operator';
}

export function Topbar({ crumbs, role, setRole, user, onNotify }: TopbarProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const initials = initialsOf(user);
  const org = user.group ?? '';

  return (
    <header className="topbar">
      <nav className="crumbs">
        {crumbs.map((c, i) => (
          <Fragment key={`${i}-${c}`}>
            {i > 0 && <span className="sep">/</span>}
            {i === crumbs.length - 1 ? (
              <span className="current">{c}</span>
            ) : (
              <a href="#">{c}</a>
            )}
          </Fragment>
        ))}
      </nav>
      <div className="search">
        <span className="ico">
          <Icons.search />
        </span>
        <input placeholder="Search requests, clusters, policies, users…" />
        <kbd>⌘K</kbd>
      </div>
      <div className="topbar-spacer" />
      <button className="icon-btn" title="Refresh" type="button">
        <Icons.refresh />
      </button>
      <button
        className="icon-btn"
        title="Notifications"
        type="button"
        onClick={onNotify}
      >
        <Icons.bell />
        <span className="pip"></span>
      </button>
      <div ref={ref} style={{ position: 'relative' }}>
        <div className="role-switch" onClick={() => setOpen((v) => !v)}>
          <div className="avatar">{initials}</div>
          <div className="who">
            <span className="name">{user.name}</span>
            <span className="role">
              {org} · {roleLabel(role)}
            </span>
          </div>
          <Icons.chevronDown />
        </div>
        {open && (
          <div className="menu" style={{ right: 0, top: 44 }}>
            <div
              style={{
                padding: '10px 10px 6px',
                fontSize: 11,
                color: 'var(--ink-500)',
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                fontWeight: 600,
              }}
            >
              Switch role
            </div>
            <div
              className={'menu-item' + (role === 'operator' ? ' active' : '')}
              onClick={() => {
                setRole('operator');
                setOpen(false);
              }}
            >
              <Icons.user />
              <div>
                <div>Operator</div>
                <div style={{ fontSize: 11, color: 'var(--ink-500)' }}>
                  joao.silva @ saude
                </div>
              </div>
              {role === 'operator' && (
                <Icons.check className="menu-check" />
              )}
            </div>
            <div
              className={'menu-item' + (role === 'admin' ? ' active' : '')}
              onClick={() => {
                setRole('admin');
                setOpen(false);
              }}
            >
              <Icons.shield />
              <div>
                <div>Platform Admin</div>
                <div style={{ fontSize: 11, color: 'var(--ink-500)' }}>
                  m.costa @ setic
                </div>
              </div>
              {role === 'admin' && <Icons.check className="menu-check" />}
            </div>
            <div className="menu-sep"></div>
            <div className="menu-item">
              <Icons.cog /> Preferences
            </div>
            <div className="menu-sep"></div>
            <div className="menu-item">
              <Icons.x /> Sign out
            </div>
          </div>
        )}
      </div>
    </header>
  );
}

export default Topbar;
