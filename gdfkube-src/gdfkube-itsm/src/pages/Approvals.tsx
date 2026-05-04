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
// pending queue.

import { useMemo, useState } from 'react';
import type { Toast } from '../shell/ToastStack';
import type { Navigate } from '../router';
import {
  useGdfData,
  useGdfDispatch,
} from '../state/dataContext';
import type {
  ApprovalDecision,
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

export function Approvals({ user, setToast }: ApprovalsProps) {
  const { requests } = useGdfData();
  const dispatch = useGdfDispatch();

  const [chip, setChip] = useState<ChipValue>('all');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [comment, setComment] = useState('');
  const [decidedThisSession, setDecidedThisSession] = useState<string[]>([]);
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
        .map((id) => requests.find((r) => r.id === id))
        .filter((r): r is Request => Boolean(r)),
    [decidedThisSession, requests],
  );

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
      prev.includes(req.id) ? prev : [...prev, req.id],
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

  const handleReject = () => {
    if (!selected) return;
    const at = formatNow();
    const decision: ApprovalDecision = {
      actor: decisionActor(user),
      action: 'rejected',
      comment: comment || undefined,
      at,
    };
    dispatch({
      type: 'UPDATE_REQUEST_STATUS',
      id: selected.id,
      status: 'failed',
      decision,
    });
    setDecidedThisSession((prev) =>
      prev.includes(selected.id) ? prev : [...prev, selected.id],
    );
    setSelectedId(null);
    setComment('');
    setToast({
      id: `reject-${selected.id}-${at}`,
      kind: 'warn',
      title: 'Request rejected',
      body: `${selected.id} moved to failed.`,
    });
  };

  const failingChecks = selected
    ? selected.policyChecks.filter((c) => !c.ok)
    : [];

  return (
    <div className="page approvals-page">
      <div className="page-head">
        <h1 className="page-title">Approvals</h1>
        <p className="page-sub">
          Review and decide on pending requests across every department.
        </p>
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
            <div className="filters" style={{ padding: '10px 18px 0' }}>
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
                      <div className="approval-row-title mono">{r.id}</div>
                      <div className="approval-row-meta">
                        <span>{r.formLabel ?? r.formId}</span>
                        <span className="dot-sep">·</span>
                        <span>{r.requesterGroupName}</span>
                        <span className="dot-sep">·</span>
                        <span>{r.env}</span>
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
