// Approvals page — admin-only review queue.
//
// Two-pane layout:
//   - Left: pending-queue list (status === "approval") with All/Production/
//     Scale filter chips and a "Decided this session" log below.
//   - Right: DecisionPanel for the selected request, plus an OverrideModal
//     that gates approval when one or more policy checks have ok=false.
//
// The page reads requests from the GdfData reducer and dispatches
// UPDATE_REQUEST_STATUS on Approve/Reject. The decided-this-session log is
// kept in local state so the row stays visible after the request leaves the
// pending queue, and so the page-head KPI tiles can compute counts.

import { useMemo, useState } from 'react';
import type { Toast } from '../shell/ToastStack';
import type { Navigate } from '../router';
import {
  useGdfData,
  useGdfDispatch,
} from '../state/dataContext';
import type {
  ApprovalDecision,
  Env,
  Request,
  Role,
  User,
} from '../types';
import { DecisionPanel } from './approvals/DecisionPanel';
import { OverrideModal } from './approvals/OverrideModal';

interface ApprovalsProps {
  role: Role;
  user: User;
  navigate: Navigate;
  setToast: (t: Toast | null) => void;
}

type ChipValue = 'all' | 'production' | 'scale';

type DecidedEntry = {
  id: string;
  action: 'approved' | 'rejected';
};

const CHIPS: { value: ChipValue; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'production', label: 'Production' },
  { value: 'scale', label: 'Scale' },
];

function isScale(req: Request): boolean {
  // The seed bundle stores the form tag as either "scale" or the canonical
  // "scale-request" id. Match both so existing seeds and operator-submitted
  // requests both filter correctly.
  return req.formId === 'scale-request' || req.formId === 'scale';
}

function decisionActor(user: User): string {
  return user.fullName || user.username || user.name || user.id;
}

function formatNow(): string {
  return new Date().toISOString();
}

function envColor(env: Env): string {
  if (env === 'production') return 'var(--red-700)';
  if (env === 'staging') return 'var(--amber-700)';
  return 'var(--green-700)';
}

function requesterDisplayName(req: Request): string {
  const u = req.requester;
  if (!u) return '';
  return u.fullName ?? u.username ?? u.name ?? u.id ?? '';
}

export function Approvals({ user, setToast }: ApprovalsProps) {
  const { requests } = useGdfData();
  const dispatch = useGdfDispatch();

  const [chip, setChip] = useState<ChipValue>('all');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [comment, setComment] = useState('');
  const [decidedThisSession, setDecidedThisSession] = useState<DecidedEntry[]>(
    [],
  );
  const [overrideOpen, setOverrideOpen] = useState(false);

  const pending = useMemo(
    () => requests.filter((r) => r.status === 'approval'),
    [requests],
  );

  const filtered = useMemo(() => {
    if (chip === 'production') {
      return pending.filter((r) => r.env === 'production');
    }
    if (chip === 'scale') {
      return pending.filter(isScale);
    }
    return pending;
  }, [pending, chip]);

  const selected = selectedId
    ? requests.find((r) => r.id === selectedId)
    : undefined;

  const decidedRequests = useMemo(
    () =>
      decidedThisSession
        .map((d) => requests.find((r) => r.id === d.id))
        .filter((r): r is Request => Boolean(r)),
    [decidedThisSession, requests],
  );

  const approvedCount = decidedThisSession.filter(
    (d) => d.action === 'approved',
  ).length;
  const rejectedCount = decidedThisSession.filter(
    (d) => d.action === 'rejected',
  ).length;

  const commitApproval = (req: Request) => {
    const at = formatNow();
    const decision: ApprovalDecision = {
      actor: decisionActor(user),
      action: 'approved',
      comment: comment || undefined,
      at,
    };
    dispatch({
      type: 'UPDATE_REQUEST_STATUS',
      id: req.id,
      status: 'provisioning',
      stage: 1,
      decision,
    });
    setDecidedThisSession((prev) =>
      prev.some((d) => d.id === req.id)
        ? prev
        : [...prev, { id: req.id, action: 'approved' }],
    );
    setSelectedId(null);
    setComment('');
    setToast({
      id: `approve-${req.id}-${at}`,
      kind: 'success',
      title: 'Request approved',
      body: `${req.id} moved to provisioning.`,
    });
  };

  const handleApprove = () => {
    if (!selected) return;
    const failing = selected.policyChecks.filter((c) => !c.ok);
    if (failing.length > 0) {
      setOverrideOpen(true);
      return;
    }
    commitApproval(selected);
  };

  const handleConfirmOverride = () => {
    if (!selected) return;
    setOverrideOpen(false);
    commitApproval(selected);
  };

  const commitReject = (req: Request) => {
    if (comment.trim() === '') return;
    const at = formatNow();
    const decision: ApprovalDecision = {
      actor: decisionActor(user),
      action: 'rejected',
      comment: comment || undefined,
      at,
    };
    dispatch({
      type: 'UPDATE_REQUEST_STATUS',
      id: req.id,
      status: 'failed',
      decision,
    });
    setDecidedThisSession((prev) =>
      prev.some((d) => d.id === req.id)
        ? prev
        : [...prev, { id: req.id, action: 'rejected' }],
    );
    setSelectedId(null);
    setComment('');
    setToast({
      id: `reject-${req.id}-${at}`,
      kind: 'warn',
      title: 'Request rejected',
      body: `${req.id} moved to failed.`,
    });
  };

  const handleReject = () => {
    if (!selected) return;
    commitReject(selected);
  };

  const failingChecks = selected
    ? selected.policyChecks.filter((c) => !c.ok)
    : [];

  return (
    <div className="page approvals-page">
      <div className="page-head">
        <div className="page-head-row">
          <div>
            <h1 className="page-title">Approvals</h1>
            <p className="page-sub">
              Review and decide on pending requests across every department.
            </p>
          </div>
          <div
            className="kpi-grid"
            style={{ gridTemplateColumns: 'repeat(3, minmax(140px, 180px))' }}
          >
            <div className="kpi">
              <div className="kpi-label">In queue</div>
              <div className="kpi-value">{pending.length}</div>
            </div>
            <div
              className="kpi"
              style={{ ['--accent' as 'color']: 'var(--green-700)' }}
            >
              <div className="kpi-label">Approved today</div>
              <div className="kpi-value">{approvedCount}</div>
            </div>
            <div
              className="kpi"
              style={{ ['--accent' as 'color']: 'var(--red-700)' }}
            >
              <div className="kpi-label">Rejected today</div>
              <div className="kpi-value">{rejectedCount}</div>
            </div>
          </div>
        </div>
      </div>

      <div className="approvals-grid">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, minWidth: 0 }}>
          <section
            className="card approvals-queue"
            data-testid="approval-queue"
          >
            <div className="card-head">
              <h2 className="card-title">Pending queue</h2>
            </div>
            <div className="filters">
              {CHIPS.map((c) => {
                const active = chip === c.value;
                return (
                  <button
                    key={c.value}
                    type="button"
                    className={`filter-chip${active ? ' active' : ''}`}
                    onClick={() => setChip(c.value)}
                  >
                    {c.label}
                  </button>
                );
              })}
            </div>
            <div className="approval-list">
              {filtered.length === 0 ? (
                <div className="empty">Nothing pending in this view.</div>
              ) : (
                filtered.map((r) => {
                  const active = r.id === selectedId;
                  const failing = r.policyChecks.filter((c) => !c.ok).length;
                  const reqName = requesterDisplayName(r);
                  return (
                    <div
                      key={r.id}
                      className={`approval-row${active ? ' active' : ''}`}
                      data-id={r.id}
                      role="button"
                      tabIndex={0}
                      onClick={() => setSelectedId(r.id)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          if (e.key === ' ') e.preventDefault();
                          setSelectedId(r.id);
                        }
                      }}
                    >
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          gap: 8,
                        }}
                      >
                        <div className="approval-row-title mono">{r.id}</div>
                        {failing > 0 && (
                          <span
                            className="pill amber"
                            data-testid="failing-checks-badge"
                            style={{ fontSize: 11 }}
                          >
                            {failing} failing
                          </span>
                        )}
                      </div>
                      <div className="approval-row-meta">
                        <span>{r.formLabel ?? r.formId}</span>
                        <span className="dot-sep">·</span>
                        <span>{reqName}</span>
                        <span className="dot-sep">·</span>
                        <span>{r.requesterGroupName}</span>
                        <span className="dot-sep">·</span>
                        <span
                          data-testid="row-env"
                          style={{ color: envColor(r.env), fontWeight: 500 }}
                        >
                          {r.env}
                        </span>
                      </div>
                      {r.waiting && (
                        <div className="approval-row-foot">
                          <span className="muted">Waiting {r.waiting}</span>
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </section>

          {decidedRequests.length > 0 && (
            <section
              className="card"
              data-testid="decided-this-session"
            >
              <div className="card-head">
                <h2 className="card-title">Decided this session</h2>
              </div>
              <div className="approval-list compact">
                {decidedRequests.map((r) => (
                  <div
                    key={r.id}
                    className="approval-row decided"
                    data-id={r.id}
                  >
                    <div className="approval-row-title mono">{r.id}</div>
                    <div className="approval-row-meta">
                      <span>{r.formLabel ?? r.formId}</span>
                      <span className="dot-sep">·</span>
                      <span>
                        {r.status === 'failed' ? 'Rejected' : 'Approved'}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>

        {selected ? (
          <DecisionPanel
            request={selected}
            comment={comment}
            setComment={setComment}
            onApprove={handleApprove}
            onReject={handleReject}
          />
        ) : (
          <section
            className="card"
            data-testid="decision-empty"
            style={{ minHeight: 320 }}
          >
            <div className="card-body">
              <p className="muted" style={{ margin: 0, fontSize: 13 }}>
                Select a request from the queue to review its details.
              </p>
            </div>
          </section>
        )}
      </div>

      <OverrideModal
        open={overrideOpen}
        failingChecks={failingChecks}
        onConfirm={handleConfirmOverride}
        onCancel={() => setOverrideOpen(false)}
      />
    </div>
  );
}

export default Approvals;
