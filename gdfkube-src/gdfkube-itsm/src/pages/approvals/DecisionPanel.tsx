// DecisionPanel — right-pane detail view for a selected approval request.
//
// Renders:
//   - Request header (id + form label + requester + env)
//   - Quoted justification (block-quote)
//   - Payload summary (`vars` + `meta` JSON)
//   - Policy / governance checks (PASS or WARN labels)
//   - Comment textarea
//   - Primary Approve + Reject buttons; secondary Reassign + Request changes
//   - 3-step approval-chain visualization derived from approvalChain length

import { Icons } from '../../icons/Icons';
import type { Request } from '../../types';

interface DecisionPanelProps {
  request: Request;
  comment: string;
  setComment: (s: string) => void;
  onApprove: () => void;
  onReject: () => void;
  onReassign?: () => void;
  onRequestChanges?: () => void;
}

const APPROVAL_STEPS = ['Operator submitted', 'Group lead', 'SETIC'] as const;

function requesterName(r: Request): string {
  const u = r.requester;
  return u ? u.fullName || u.name || u.username || u.id || '' : '';
}

export function DecisionPanel({
  request,
  comment,
  setComment,
  onApprove,
  onReject,
  onReassign,
  onRequestChanges,
}: DecisionPanelProps) {
  const chainLength = request.approvalChain?.length ?? 0;
  // Step 0 ("Operator submitted") is always done because the request is in
  // the queue. Each appended decision advances to the next step.
  const currentStep = Math.min(chainLength + 1, APPROVAL_STEPS.length - 1);

  return (
    <div
      className="approvals-detail"
      data-testid="decision-panel"
    >
      <section className="card approval-header-card">
        <div className="card-body">
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
            <div>
              <h2 className="card-title mono" style={{ marginBottom: 4 }}>
                {request.id}
              </h2>
              <div className="muted" style={{ fontSize: 12 }}>
                {request.formLabel ?? request.formId} ·{' '}
                {requesterName(request)} · {request.requesterGroupName} ·{' '}
                {request.env}
              </div>
            </div>
            <div className="muted" style={{ fontSize: 12 }}>
              Submitted {request.submittedAt}
            </div>
          </div>
        </div>
      </section>

      <div className="approval-detail-grid">
        <div className="col">
          <section className="card">
            <div className="card-head">
              <h3 className="card-title">Justification</h3>
            </div>
            <div className="card-body">
              {request.justification ? (
                <blockquote
                  data-testid="justification"
                  style={{
                    margin: 0,
                    padding: '8px 12px',
                    borderLeft: '3px solid var(--civic-300)',
                    background: 'var(--civic-50)',
                    fontStyle: 'italic',
                    color: 'var(--ink-800)',
                  }}
                >
                  {request.justification}
                </blockquote>
              ) : (
                <p className="muted" style={{ margin: 0, fontSize: 13 }}>
                  No justification provided.
                </p>
              )}
            </div>
          </section>

          <section className="card">
            <div className="card-head">
              <h3 className="card-title">Payload</h3>
            </div>
            <div className="card-body">
              <pre
                className="mono"
                data-testid="payload"
                style={{
                  margin: 0,
                  fontSize: 12,
                  background: 'var(--ink-50)',
                  padding: 10,
                  borderRadius: 4,
                  overflow: 'auto',
                  maxHeight: 220,
                }}
              >
                {JSON.stringify(
                  { vars: request.vars, meta: request.meta },
                  null,
                  2,
                )}
              </pre>
            </div>
          </section>

          <section className="card">
            <div className="card-head">
              <h3 className="card-title">Policy &amp; governance checks</h3>
            </div>
            <div className="card-body" data-testid="policy-checks">
              {request.policyChecks.length === 0 ? (
                <p className="muted" style={{ margin: 0, fontSize: 13 }}>
                  No checks reported.
                </p>
              ) : (
                request.policyChecks.map((c) => (
                  <div key={c.id} className="policy-row">
                    <span
                      className={`policy-icon ${c.ok ? 'ok' : 'warn'}`}
                      aria-hidden="true"
                    >
                      {c.ok ? <Icons.check size={14} /> : <Icons.alert size={14} />}
                    </span>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 500 }}>{c.label}</div>
                      {c.detail && (
                        <div className="muted" style={{ fontSize: 12 }}>
                          {c.detail}
                        </div>
                      )}
                    </div>
                    <span
                      className={`pill ${c.ok ? 'green' : 'amber'}`}
                      style={{ alignSelf: 'flex-start' }}
                    >
                      {c.ok ? 'PASS' : 'WARN'}
                    </span>
                  </div>
                ))
              )}
            </div>
          </section>
        </div>

        <div className="col">
          <section className="card decision-card">
            <div className="card-head">
              <h3 className="card-title">Decision</h3>
            </div>
            <div className="card-body">
              <label
                className="muted"
                style={{ display: 'block', fontSize: 12, marginBottom: 6 }}
                htmlFor="approval-comment"
              >
                Comment (optional)
              </label>
              <textarea
                id="approval-comment"
                className="approval-comment"
                placeholder="Leave a note for the requester or the audit log…"
                value={comment}
                onChange={(e) => setComment(e.target.value)}
              />
              <div
                style={{
                  display: 'flex',
                  gap: 8,
                  marginTop: 12,
                  flexWrap: 'wrap',
                }}
              >
                <button
                  type="button"
                  className="btn primary"
                  onClick={onApprove}
                >
                  Approve
                </button>
                <button
                  type="button"
                  className="btn danger"
                  onClick={onReject}
                >
                  Reject
                </button>
                <button
                  type="button"
                  className="btn ghost"
                  onClick={onReassign}
                  disabled={!onReassign}
                >
                  Reassign
                </button>
                <button
                  type="button"
                  className="btn ghost"
                  onClick={onRequestChanges}
                  disabled={!onRequestChanges}
                >
                  Request changes
                </button>
              </div>
            </div>
          </section>

          <section className="card">
            <div className="card-head">
              <h3 className="card-title">Approval chain</h3>
            </div>
            <div className="card-body" data-testid="approval-chain-steps">
              {APPROVAL_STEPS.map((label, idx) => {
                const cls =
                  idx < chainLength + 1
                    ? idx === currentStep && idx !== 0
                      ? 'approval-step current'
                      : 'approval-step done'
                    : 'approval-step';
                return (
                  <div key={label} className={cls}>
                    <span className="step-dot">
                      {idx < chainLength + 1 && idx !== currentStep ? (
                        <Icons.check size={12} />
                      ) : idx === currentStep ? (
                        <span className="pulse" />
                      ) : (
                        <span style={{ fontSize: 11 }}>{idx + 1}</span>
                      )}
                    </span>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, fontWeight: 500 }}>{label}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

export default DecisionPanel;
