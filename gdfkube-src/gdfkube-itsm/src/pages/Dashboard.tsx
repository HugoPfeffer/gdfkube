// Dashboard page — the home route landing page.
//
// Renders four sections:
//   1. `.page-head` with a role-aware title + subtitle. Operators get a
//      `.page-head-row` with a primary "New cluster request" CTA.
//   2. A "Pipeline operating normally" `.banner` block (dark gradient, see
//      styles.css `:619`) with an info icon and a "View activity" CTA that
//      navigates to the requests list.
//   3. `.kpi-grid` with exactly three KPI cards (Active Clusters, Pending
//      Provisioning, Failed Last 30d). Cards with a `trend` of up/down show
//      a directional triangle prefix in the delta line.
//   4. A `.detail-grid` (2.2fr / 1fr) hosting a "Recent Requests" card (top
//      4 requests by submittedAt desc; rows navigate to `request-detail`;
//      "View all" header CTA → `requests`) and an "Activity Stream" card
//      with RECENT_ACTIVITY entries (type-mapped colored leading dots) and
//      a decorative "Refresh" header CTA that surfaces an info toast.
//
// KPIS and RECENT_ACTIVITY are not part of the reducer state, so they are
// imported directly from `@/data/seeds`.

import { KPIS, RECENT_ACTIVITY } from '../data/seeds';
import { Icons } from '../icons/Icons';
import type { Navigate } from '../router';
import { useGdfData } from '../state/dataContext';
import type { ActivityEntry, Role, User } from '../types';
import { StatusPill } from '../components/StatusPill';
import type { Toast } from '../shell/ToastStack';

interface DashboardProps {
  role: Role;
  navigate: Navigate;
  user: User;
  setToast?: (toast: Toast | null) => void;
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

export function Dashboard({ role, navigate, user, setToast }: DashboardProps) {
  const { requests } = useGdfData();

  const isAdmin = role === 'admin';
  const isOperator = role === 'operator';
  const title = isAdmin ? 'Platform Overview' : `Welcome back, ${firstName(user)}`;
  const subtitle = isAdmin
    ? 'Fleet health and recent activity across all departments.'
    : 'Saúde · Department of Health · Operator role';

  const recent = [...requests]
    .sort((a, b) => (a.submittedAt < b.submittedAt ? 1 : -1))
    .slice(0, 4);

  const handleRefresh = () => {
    setToast?.({
      id: `dashboard-refresh-${Date.now()}`,
      kind: 'info',
      title: 'Activity refreshed',
      body: 'Demo: activity stream is static.',
    });
  };

  return (
    <div className="page">
      <div className="page-head">
        <div className="page-head-row">
          <div>
            <h1 className="page-title">{title}</h1>
            <p className="page-sub">{subtitle}</p>
          </div>
          {isOperator && (
            <button
              type="button"
              className="btn primary"
              onClick={() =>
                navigate('new-request', { formId: 'cluster-request' })
              }
            >
              New cluster request
            </button>
          )}
        </div>
      </div>

      <div className="banner">
        <span className="icn" aria-hidden="true">
          <Icons.info size={18} />
        </span>
        <div style={{ flex: 1 }}>
          <h4>Pipeline operating normally</h4>
          <p>
            Last 24h: 12 clusters provisioned · median time-to-ready 2m 18s · 0 manual interventions.
          </p>
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

      <div className="detail-grid">
        <div className="card" data-testid="recent-requests">
          <div className="card-head">
            <h2 className="card-title">Recent Requests</h2>
            <button
              type="button"
              className="btn ghost sm"
              onClick={() => navigate('requests')}
            >
              View all
            </button>
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
                    <td className="muted" title={r.submittedAt}>
                      {r.submittedAt.split(' ')[1] ?? r.submittedAt}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="card" data-testid="activity-stream">
          <div className="card-head">
            <h2 className="card-title">Activity Stream</h2>
            <button
              type="button"
              className="btn ghost sm"
              onClick={handleRefresh}
            >
              Refresh
            </button>
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
    </div>
  );
}

export default Dashboard;
