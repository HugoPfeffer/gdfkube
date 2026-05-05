// Requests list page — role-scoped table of submitted requests.
//
// Operators see only their own requests (matched by username on the
// `requester` user object); admins see every request. A row of filter
// chips scopes the table to a single status, with single-active state.
// Provisioning rows render an inline progress indicator under the
// status pill, mapping `request.stage` to a label from PIPELINE_STAGES.

import { useMemo, useState } from 'react';
import { StatusPill } from '../components/StatusPill';
import { ORGS } from '../data/seeds';
import { Icons } from '../icons/Icons';
import type { Navigate } from '../router';
import { useGdfData } from '../state/dataContext';
import type { Request, RequestStatus, Role, User } from '../types';

interface RequestsListProps {
  role: Role;
  user: User;
  navigate: Navigate;
}

type ChipValue = 'all' | RequestStatus;
type TabValue = 'mine' | 'department' | 'all';

const CHIPS: { value: ChipValue; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'provisioning', label: 'Provisioning' },
  { value: 'approval', label: 'Awaiting approval' },
  { value: 'ready', label: 'Ready' },
  { value: 'failed', label: 'Failed' },
];

function ownsRequest(req: Request, user: User): boolean {
  const requester = req.requester as Request['requester'] | string;
  if (typeof requester === 'string') {
    return requester === user.username;
  }
  if (requester && typeof requester === 'object') {
    return (
      requester.username === user.username ||
      requester.id === user.id ||
      requester.name === user.username
    );
  }
  return false;
}

function inDepartment(req: Request, user: User): boolean {
  return Boolean(user.group) && req.requesterGroupName === user.group;
}

export function RequestsList({ role, user, navigate }: RequestsListProps) {
  const { requests } = useGdfData();
  const [activeChip, setActiveChip] = useState<ChipValue>('all');
  const isAdmin = role === 'admin';
  const [activeTab, setActiveTab] = useState<TabValue>(isAdmin ? 'all' : 'mine');

  const title = isAdmin ? 'All Requests' : 'My Requests';
  const subtitle = 'Cluster provisioning requests submitted through the IT service portal.';

  const mineCount = useMemo(
    () => requests.filter((r) => ownsRequest(r, user)).length,
    [requests, user],
  );
  const departmentCount = useMemo(
    () => requests.filter((r) => inDepartment(r, user)).length,
    [requests, user],
  );
  const allCount = requests.length;

  const tabs: { value: TabValue; label: string; count: number }[] = isAdmin
    ? [
        { value: 'mine', label: 'Mine', count: mineCount },
        { value: 'department', label: 'Department', count: departmentCount },
        { value: 'all', label: 'All', count: allCount },
      ]
    : [{ value: 'mine', label: 'Mine', count: mineCount }];

  const tabScoped = useMemo(() => {
    if (!isAdmin) {
      return requests.filter((r) => ownsRequest(r, user));
    }
    if (activeTab === 'mine') {
      return requests.filter((r) => ownsRequest(r, user));
    }
    if (activeTab === 'department') {
      return requests.filter((r) => inDepartment(r, user));
    }
    return requests;
  }, [requests, isAdmin, user, activeTab]);

  const visible = useMemo(() => {
    const filtered =
      activeChip === 'all'
        ? tabScoped
        : tabScoped.filter((r) => r.status === activeChip);
    return [...filtered].sort((a, b) =>
      a.submittedAt < b.submittedAt ? 1 : -1,
    );
  }, [tabScoped, activeChip]);

  const totalCount = tabScoped.length;

  return (
    <div className="page">
      <div className="page-head">
        <div className="page-head-row">
          <div>
            <h1 className="page-title">{title}</h1>
            <p className="page-sub">{subtitle}</p>
          </div>
          <div className="row">
            <button type="button" className="btn ghost"><Icons.download /> CSV</button>
            <button
              type="button"
              className="btn primary"
              onClick={() => navigate('new-request', { formId: 'cluster-request' })}
            >
              <Icons.plus /> New request
            </button>
          </div>
        </div>
      </div>

      <div className="card" data-testid="requests-list">
        <div className="tabs" role="tablist">
          {tabs.map((tab) => {
            const active = activeTab === tab.value;
            const className = `tab${active ? ' active' : ''}`;
            return (
              <button
                key={tab.value}
                type="button"
                role="tab"
                aria-selected={active}
                className={className}
                onClick={() => setActiveTab(tab.value)}
              >
                {tab.label}
                <span className="count">{tab.count}</span>
              </button>
            );
          })}
        </div>
        <div className="filters">
          <span style={{ color: 'var(--ink-500)' }}><Icons.filter /></span>
          {CHIPS.map((chip) => {
            const active = activeChip === chip.value;
            const className = `filter-chip${active ? ' active' : ''}`;
            return (
              <button
                key={chip.value}
                type="button"
                className={className}
                onClick={() => setActiveChip(chip.value)}
              >
                {chip.label}
              </button>
            );
          })}
          <span className="spacer" />
          <span style={{ fontSize: 12, color: 'var(--ink-500)' }}>Showing {visible.length} of {totalCount}</span>
        </div>
        <div className="table-wrap">
          <table className="list">
            <thead>
              <tr>
                <th style={{ width: 110 }}>Number</th>
                <th>Cluster</th>
                <th style={{ width: 130 }}>Department</th>
                <th style={{ width: 110 }}>Environment</th>
                <th style={{ width: 80 }}>Nodes</th>
                <th style={{ width: 130 }}>Requester</th>
                <th style={{ width: 160 }}>Status</th>
                <th style={{ width: 150 }}>Submitted</th>
                <th style={{ width: 40 }} />
              </tr>
            </thead>
            <tbody>
              {visible.map((r) => {
                const progress = r.progress ?? 0;
                const isProvisioning = r.status === 'provisioning';
                const envColor = r.env === 'production' ? 'var(--red-700)' : r.env === 'staging' ? 'var(--amber-700)' : 'var(--green-700)';
                const requesterFull = r.requester?.fullName || r.requester?.name || '';
                return (
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
                    <td><strong>{String(r.vars.clusterName ?? '')}</strong></td>
                    <td className="muted">{ORGS.find((o) => o.id === r.requesterGroupName)?.name ?? r.requesterGroupName}</td>
                    <td>
                      <span className="mono" style={{ color: envColor }}>{r.env}</span>
                    </td>
                    <td className="mono">{String(r.vars.nodeCount ?? '—')}</td>
                    <td className="muted">{requesterFull}</td>
                    <td>
                      <StatusPill status={r.status} />
                      {isProvisioning && (
                        <div className="progress" style={{ marginTop: 6, width: 100 }}>
                          <div style={{ width: `${progress}%` }} />
                        </div>
                      )}
                    </td>
                    <td className="muted mono">{r.submittedAt}</td>
                    <td><span style={{ color: 'var(--ink-400)' }}><Icons.chevronRight /></span></td>
                  </tr>
                );
              })}
              {visible.length === 0 && (
                <tr>
                  <td colSpan={9} className="empty">
                    No requests match the current filter.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export default RequestsList;
