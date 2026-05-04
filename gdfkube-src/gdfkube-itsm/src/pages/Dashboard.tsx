// Dashboard page — the home route landing page.
//
// Renders four sections:
//   1. `.page-head` with a role-aware title + subtitle.
//   2. A "Pipeline operating normally" banner card with an info icon and a
//      "View activity" CTA that navigates to the requests list.
//   3. `.kpi-grid` with exactly three KPI cards (Active Clusters, Pending
//      Provisioning, Failed Last 30d). Cards with a `trend` of up/down show
//      a directional triangle prefix in the delta line.
//   4. A "Recent Requests" card (top 4 requests by submittedAt desc; rows
//      navigate to `request-detail`) and an "Activity Stream" card listing
//      RECENT_ACTIVITY entries with a type-mapped colored leading dot.
//
// KPIS and RECENT_ACTIVITY are not part of the reducer state, so they are
// imported directly from `@/data/seeds`.

import { KPIS, RECENT_ACTIVITY } from '../data/seeds';
import { Icons } from '../icons/Icons';
import type { Navigate } from '../router';
import { useGdfData } from '../state/dataContext';
import type { ActivityEntry, Role, User } from '../types';
import { StatusPill } from '../components/StatusPill';

interface DashboardProps {
  role: Role;
  navigate: Navigate;
  user: User;
}

const ACTIVITY_DOT_COLOR: Record<NonNullable<ActivityEntry['type']>, string> = {
  ok: 'var(--green-500)',
  warn: 'var(--amber-500)',
  err: 'var(--red-500)',
  info: 'var(--civic-500)',
};

function firstName(user: User): string {
  const source = user.fullName || user.name || '';
  return source.trim().split(/\s+/)[0] || '';
}

export function Dashboard({ role, navigate, user }: DashboardProps) {
  const { requests } = useGdfData();

  const isAdmin = role === 'admin';
  const title = isAdmin ? 'Platform Overview' : `Welcome back, ${firstName(user)}`;
  const subtitle = isAdmin
    ? 'Fleet health and recent activity across all departments.'
    : 'Saúde · Department of Health · Operator role';

  const recent = [...requests]
    .sort((a, b) => (a.submittedAt < b.submittedAt ? 1 : -1))
    .slice(0, 4);

  return (
    <div className="page">
      <div className="page-head">
        <h1 className="page-title">{title}</h1>
        <p className="page-sub">{subtitle}</p>
      </div>

      <div
        className="card"
        style={{ marginBottom: 18, display: 'flex', alignItems: 'center', gap: 14, padding: 14 }}
      >
        <span style={{ color: 'var(--civic-500)', display: 'inline-flex' }}>
          <Icons.info size={20} />
        </span>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 600, fontSize: 13.5, color: 'var(--ink-800)' }}>
            Pipeline operating normally
          </div>
          <div style={{ fontSize: 12.5, color: 'var(--ink-500)' }}>
            Last 24h: 12 clusters provisioned · median time-to-ready 2m 18s · 0 manual interventions.
          </div>
        </div>
        <button
          type="button"
          className="btn"
          onClick={() => navigate('requests')}
        >
          View activity
        </button>
      </div>

      <div className="kpi-grid" style={{ marginBottom: 18 }}>
        {KPIS.map((kpi) => (
          <div
            key={kpi.id}
            className="kpi"
            style={kpi.accent ? { ['--accent' as 'color']: kpi.accent } : undefined}
          >
            <div className="kpi-label">{kpi.label}</div>
            <div className="kpi-value">{kpi.value}</div>
            {kpi.delta && (
              <div className="kpi-delta">
                {kpi.trend === 'up' && <span className="up">▲ </span>}
                {kpi.trend === 'down' && <span className="down">▼ </span>}
                {kpi.delta}
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="card" data-testid="recent-requests" style={{ marginBottom: 18 }}>
        <div className="card-head">
          <h2 className="card-title">Recent Requests</h2>
        </div>
        <div className="table-wrap">
          <table className="list">
            <thead>
              <tr>
                <th>Number</th>
                <th>Cluster</th>
                <th>Department</th>
                <th>Status</th>
                <th>Submitted</th>
              </tr>
            </thead>
            <tbody>
              {recent.map((r) => (
                <tr
                  key={r.id}
                  tabIndex={0}
                  role="button"
                  onClick={() => navigate('request-detail', { id: r.id })}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      if (e.key === ' ') e.preventDefault();
                      navigate('request-detail', { id: r.id });
                    }
                  }}
                >
                  <td>
                    <span className="row-id">{r.id}</span>
                  </td>
                  <td className="mono">
                    {String(r.vars.clusterName ?? '')}
                  </td>
                  <td>{r.requesterGroupName}</td>
                  <td>
                    <StatusPill status={r.status} />
                  </td>
                  <td className="muted">{r.submittedAt}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card">
        <div className="card-head">
          <h2 className="card-title">Activity Stream</h2>
        </div>
        <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {RECENT_ACTIVITY.map((a) => {
            const kind = a.type ?? 'info';
            return (
              <div
                key={a.id}
                className={`activity-item ${kind}`}
                style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}
              >
                <span
                  className="dot"
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: '50%',
                    marginTop: 6,
                    background: ACTIVITY_DOT_COLOR[kind],
                    flex: '0 0 auto',
                  }}
                />
                <div style={{ flex: 1, fontSize: 13 }}>
                  <div style={{ color: 'var(--ink-800)' }}>
                    {a.detail ?? a.verb}
                  </div>
                  <div style={{ color: 'var(--ink-500)', fontSize: 12 }}>
                    {a.at} · {a.actor}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export default Dashboard;
