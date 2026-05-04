// Sidebar: workspace + admin navigation. Reads request state from the
// data context to render the Approvals badge and the My Requests badge.
//
// Differs from the bundle (gdfkube-remix/project/shell.jsx) in two ways:
// 1. The Approvals badge count is derived from `useGdfData()` instead of
//    a `window.GDF_DATA` global, since the React app has no globals.
// 2. The "My Requests" badge is role-scoped (operator: own approval/
//    provisioning requests; admin: omitted) instead of hardcoded `3`.
//    The bundle's hardcoded `3` was demo-mock; this matches the spec.

import { Icons, type IconName } from '../icons/Icons';
import { useGdfData } from '../state/dataContext';
import type { Role, RouteName } from '../types';

type Section = { kind: 'section'; label: string; adminOnly?: boolean };
type Item = {
  kind: 'item';
  id: RouteName;
  label: string;
  icon: IconName;
  adminOnly?: boolean;
  badge?: number | null;
};
type Entry = Section | Item;

interface SidebarProps {
  route: RouteName;
  navigate: (id: RouteName) => void;
  role: Role;
  collapsed: boolean;
}

export function Sidebar({ route, navigate, role, collapsed }: SidebarProps) {
  const { requests } = useGdfData();

  const approvalCount = requests.filter((r) => r.status === 'approval').length;

  // Operator: count own requests (requester.role === 'operator') in approval
  // or provisioning. Admin: badge omitted (admin uses the Approvals row).
  const myRequestsBadge =
    role === 'admin'
      ? null
      : requests.filter(
          (r) =>
            r.requester.role === 'operator' &&
            (r.status === 'approval' || r.status === 'provisioning'),
        ).length || null;

  const entries: Entry[] = [
    { kind: 'section', label: 'Workspace' },
    { kind: 'item', id: 'home', label: 'Home', icon: 'home' },
    { kind: 'item', id: 'catalog', label: 'Service Catalog', icon: 'catalog' },
    {
      kind: 'item',
      id: 'requests',
      label: 'My Requests',
      icon: 'list',
      badge: myRequestsBadge,
    },
    { kind: 'section', label: 'Operations', adminOnly: true },
    {
      kind: 'item',
      id: 'approvals',
      label: 'Approvals',
      icon: 'doc',
      adminOnly: true,
      badge: role === 'admin' && approvalCount > 0 ? approvalCount : null,
    },
    { kind: 'section', label: 'Administration', adminOnly: true },
    { kind: 'item', id: 'admin-forms', label: 'Forms', icon: 'form', adminOnly: true },
    { kind: 'item', id: 'admin-users', label: 'Users', icon: 'users', adminOnly: true },
  ];

  return (
    <aside className={'sidebar' + (collapsed ? ' collapsed' : '')}>
      <div className="brand">
        <div className="brand-mark">g</div>
        {!collapsed && (
          <div>
            <div className="brand-name">gdfkube</div>
            <div className="brand-sub">IT Service Portal</div>
          </div>
        )}
      </div>
      <nav className="nav">
        {entries.map((entry, i) => {
          if (entry.kind === 'section') {
            if (entry.adminOnly && role !== 'admin') return null;
            return collapsed ? (
              <div key={`sec-${i}`} style={{ height: 8 }} />
            ) : (
              <div key={`sec-${i}`} className="nav-section">
                {entry.label}
              </div>
            );
          }
          if (entry.adminOnly && role !== 'admin') return null;
          const Ic = Icons[entry.icon];
          return (
            <div
              key={entry.id}
              className={'nav-item' + (route === entry.id ? ' active' : '')}
              onClick={() => navigate(entry.id)}
              title={collapsed ? entry.label : ''}
            >
              <Ic className="icon" />
              {!collapsed && <span>{entry.label}</span>}
              {!collapsed && entry.badge != null && (
                <span className="badge">{entry.badge}</span>
              )}
            </div>
          );
        })}
      </nav>
      <div className="sidebar-foot">
        <Icons.info />
        {!collapsed && <span>Compliant · ISO 27001</span>}
      </div>
    </aside>
  );
}

export default Sidebar;
