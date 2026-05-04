// Requests list page — role-scoped table of submitted requests.
//
// Operators see only their own requests (matched by username on the
// `requester` user object); admins see every request. A row of filter
// chips scopes the table to a single status, with single-active state.
// Provisioning rows render an inline progress indicator under the
// status pill, mapping `request.stage` to a label from PIPELINE_STAGES.

import { useMemo, useState } from 'react';
import { StatusPill } from '../components/StatusPill';
import { PIPELINE_STAGES } from '../data/seeds';
import type { Navigate } from '../router';
import { useGdfData } from '../state/dataContext';
import type { Request, RequestStatus, Role, User } from '../types';

interface RequestsListProps {
  role: Role;
  user: User;
  navigate: Navigate;
}

type ChipValue = 'all' | RequestStatus;

const CHIPS: { value: ChipValue; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'approval', label: 'Approval' },
  { value: 'provisioning', label: 'Provisioning' },
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

export function RequestsList({ role, user, navigate }: RequestsListProps) {
  const { requests } = useGdfData();
  const [activeChip, setActiveChip] = useState<ChipValue>('all');

  const isAdmin = role === 'admin';
  const title = isAdmin ? 'All requests' : 'My requests';
  const subtitle = isAdmin
    ? 'Every request submitted across all departments.'
    : 'Requests you submitted, across every department you operate.';

  const visible = useMemo(() => {
    const scoped = isAdmin
      ? requests
      : requests.filter((r) => ownsRequest(r, user));
    const filtered =
      activeChip === 'all'
        ? scoped
        : scoped.filter((r) => r.status === activeChip);
    return [...filtered].sort((a, b) =>
      a.submittedAt < b.submittedAt ? 1 : -1,
    );
  }, [requests, isAdmin, user, activeChip]);

  return (
    <div className="page">
      <div className="page-head">
        <h1 className="page-title">{title}</h1>
        <p className="page-sub">{subtitle}</p>
      </div>

      <div className="card" data-testid="requests-list">
        <div className="filters">
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
        </div>

        <div className="table-wrap">
          <table className="list">
            <thead>
              <tr>
                <th>Number</th>
                <th>Form</th>
                <th>Department</th>
                <th>Status</th>
                <th>Submitted</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((r) => {
                const stage = PIPELINE_STAGES[r.stage];
                const stageLabel = stage?.label ?? '';
                const progress = r.progress ?? 0;
                const isProvisioning = r.status === 'provisioning';
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
                    <td>{r.formLabel ?? r.formId}</td>
                    <td>{r.requesterGroupName}</td>
                    <td>
                      <StatusPill status={r.status} />
                      {isProvisioning && (
                        <div
                          className="progress-row"
                          style={{ marginTop: 6, minWidth: 160 }}
                        >
                          <div className="progress">
                            <div
                              className="progress-bar"
                              style={{ width: `${progress}%` }}
                            />
                          </div>
                          <span
                            className="muted"
                            style={{ fontSize: 12, marginTop: 2, display: 'block' }}
                          >
                            {progress}% · {stageLabel}
                          </span>
                        </div>
                      )}
                    </td>
                    <td className="muted">{r.submittedAt}</td>
                  </tr>
                );
              })}
              {visible.length === 0 && (
                <tr>
                  <td colSpan={5} className="empty">
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
