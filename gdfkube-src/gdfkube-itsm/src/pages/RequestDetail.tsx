// Request Detail page — renders the seven-stage CDC pipeline visualization
// plus three side panels for a single request:
//
//   1. Request Details: id, requester, cluster, environment, nodes, submitted
//      timestamp, current status pill.
//   2. Approvals: the approvalChain entries (actor, action, optional comment).
//   3. Cluster Access: a kubeconfig download button, disabled until the
//      request reaches `status === "ready"`.
//
// Per spec the page does NOT render a "Generated Manifests" card or any
// "Pipeline Activity" log. Manifests live in Git only; the activity log was
// part of the design bundle's prototype and was pruned for the production
// portal.

import { Pipeline } from '../components/Pipeline';
import { StatusPill } from '../components/StatusPill';
import type { Navigate } from '../router';
import { useGdfData } from '../state/dataContext';
import type { ApprovalDecision, Request, Tweaks } from '../types';

interface RequestDetailProps {
  id: string | undefined;
  navigate: Navigate;
  tweaks: Tweaks;
}

const GRID_STYLE = {
  display: 'grid',
  gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
  gap: 16,
  marginTop: 18,
} as const;

function requesterName(req: Request): string {
  const r = req.requester;
  return r ? r.fullName || r.name || r.username || r.id || '' : '';
}

function clusterName(req: Request): string {
  const formData = (req.meta as Record<string, unknown>)?.formData as
    | Record<string, unknown>
    | undefined;
  const fromForm = formData?.clusterName;
  if (typeof fromForm === 'string' && fromForm) return fromForm;
  const fromVars = req.vars?.clusterName;
  return typeof fromVars === 'string' ? fromVars : '';
}

function nodeCount(req: Request): string {
  const v = req.vars?.nodeCount;
  if (typeof v === 'number' || typeof v === 'string') return String(v);
  return '—';
}

const ACTION_TONE: Record<ApprovalDecision['action'], string> = {
  approved: 'green',
  rejected: 'red',
  requested_changes: 'amber',
};
const ACTION_LABEL: Record<ApprovalDecision['action'], string> = {
  approved: 'approved',
  rejected: 'rejected',
  requested_changes: 'requested changes',
};

export function RequestDetail({ id, navigate, tweaks }: RequestDetailProps) {
  const { requests } = useGdfData();
  const request = id ? requests.find((r) => r.id === id) : undefined;

  if (!request) {
    return (
      <div className="page">
        <div className="page-head">
          <h1 className="page-title">Request not found</h1>
          <p className="page-sub">
            No request matches <code className="mono">{id ?? '(no id)'}</code>.{' '}
            <button
              type="button"
              className="btn link"
              onClick={() => navigate('requests')}
            >
              Back to requests
            </button>
          </p>
        </div>
      </div>
    );
  }

  const chain = request.approvalChain ?? [];
  const ready = request.status === 'ready';

  return (
    <div className="page">
      <div className="page-head">
        <h1 className="page-title mono">{request.id}</h1>
        <p className="page-sub">{request.formLabel ?? request.formId}</p>
      </div>

      <Pipeline request={request} pipelineSpeed={tweaks.pipelineSpeed} />

      <div className="detail-grid" style={GRID_STYLE}>
        <section className="card" data-testid="request-details">
          <div className="card-head"><h2 className="card-title">Request Details</h2></div>
          <div className="card-body">
            <dl className="kv">
              <dt>ID</dt><dd className="mono">{request.id}</dd>
              <dt>Requester</dt><dd>{requesterName(request)}</dd>
              <dt>Cluster</dt><dd className="mono">{clusterName(request)}</dd>
              <dt>Environment</dt><dd>{request.env}</dd>
              <dt>Nodes</dt><dd>{nodeCount(request)}</dd>
              <dt>Submitted</dt><dd className="muted">{request.submittedAt}</dd>
              <dt>Status</dt><dd><StatusPill status={request.status} /></dd>
            </dl>
          </div>
        </section>

        <section className="card" data-testid="approval-chain">
          <div className="card-head"><h2 className="card-title">Approvals</h2></div>
          <div className="card-body">
            {chain.length === 0 ? (
              <p className="muted" style={{ fontSize: 13 }}>
                No approval decisions recorded yet.
              </p>
            ) : (
              <ul className="approval-chain">
                {chain.map((entry, idx) => (
                  <li key={`${entry.actor}-${entry.at}-${idx}`} className="approval-step">
                    <div className="approval-step-head">
                      <strong>{entry.actor}</strong>
                      <span className={`pill ${ACTION_TONE[entry.action]}`}>
                        {ACTION_LABEL[entry.action]}
                      </span>
                      <span className="muted approval-step-at">{entry.at}</span>
                    </div>
                    {entry.comment && (
                      <p className="muted approval-step-comment">{entry.comment}</p>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>

        <section className="card" data-testid="cluster-access">
          <div className="card-head"><h2 className="card-title">Cluster Access</h2></div>
          <div className="card-body">
            <p className="muted" style={{ fontSize: 12.5, margin: '0 0 10px' }}>
              {ready
                ? 'Cluster is ready. Download the kubeconfig to authenticate.'
                : 'Kubeconfig will become available once the cluster reaches the ready state.'}
            </p>
            <button
              type="button"
              className="btn primary"
              disabled={!ready}
              aria-disabled={!ready}
            >
              Download kubeconfig
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}

export default RequestDetail;
