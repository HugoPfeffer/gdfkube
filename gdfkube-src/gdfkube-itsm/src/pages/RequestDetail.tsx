import { useEffect, useRef } from 'react';
import { Pipeline } from '../components/Pipeline';
import { StatusPill } from '../components/StatusPill';
import { ORGS } from '../data/seeds';
import { Icons } from '../icons/Icons';
import { itsmApi } from '../api/itsmApi';
import type { Navigate } from '../router';
import { useGdfData, useGdfDispatch } from '../state/dataContext';
import type { ApprovalDecision, Request, RequestStatus, Tweaks } from '../types';

interface RequestDetailProps {
  id: string | undefined;
  navigate: Navigate;
  tweaks: Tweaks;
  role?: 'operator' | 'admin';
}

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

export function RequestDetail({ id, navigate, tweaks, role }: RequestDetailProps) {
  const { requests } = useGdfData();
  const dispatch = useGdfDispatch();
  const request = id ? requests.find((r) => r.id === id) : undefined;
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!request || request.status !== 'provisioning') {
      if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
      return;
    }
    const poll = () => {
      itsmApi.requests.get(request.id).then((raw) => {
        const doc = raw as Record<string, unknown>;
        const newStage = typeof doc.stage === 'number' ? doc.stage : undefined;
        const newStatus = doc.status as RequestStatus;
        if (newStage !== request.stage || newStatus !== request.status) {
          dispatch({ type: 'UPDATE_REQUEST_STATUS', id: request.id, status: newStatus, stage: newStage });
        }
      }).catch(() => {});
    };
    poll();
    pollRef.current = setInterval(poll, 3000);
    return () => { if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; } };
  }, [request?.id, request?.status, request?.stage, dispatch]);

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
  const orgName =
    ORGS.find((o) => o.id === request.requesterGroupName)?.fullName ??
    request.requesterGroupName;
  const cn = clusterName(request);
  const varStr = (key: string): string | undefined => {
    const v = request.vars?.[key];
    return typeof v === 'string' && v ? v : undefined;
  };
  const apiUrl =
    varStr('apiUrl') ?? `https://api.${cn}.${request.requesterGroupName}.gov.local:6443`;
  const consoleUrl =
    varStr('consoleUrl') ??
    `https://console-openshift-console.apps.${cn}.${request.requesterGroupName}.gov.local`;
  const ocpVersion = varStr('ocpVersion') ?? 'OpenShift 4.16.7';

  return (
    <div className="page">
      <div className="page-head">
        <div className="page-head-row">
          <div>
            <div className="row" style={{ gap: 10, marginBottom: 6 }}>
              <span className="row-id" style={{ fontSize: 14 }}>{request.id}</span>
              <StatusPill status={request.status} />
            </div>
            <h1 className="page-title">Cluster {cn} · {orgName}</h1>
            <p className="page-sub">Submitted by {requesterName(request)}</p>
          </div>
          <div className="row">
            <button type="button" className="btn ghost" onClick={() => navigate('requests')}>← Back</button>
            <button type="button" className="btn"><Icons.link /> Open in Gitea</button>
            {role === 'admin' && request.status === 'approval' && (
              <button
                type="button"
                className="btn primary"
                onClick={() => navigate('approvals', { id: request.id })}
              >
                <Icons.check /> Approve
              </button>
            )}
            {ready && <button type="button" className="btn"><Icons.download /> kubeconfig</button>}
          </div>
        </div>
      </div>

      <Pipeline request={request} pipelineSpeed={tweaks.pipelineSpeed} />

      <div className="detail-grid" style={{ marginTop: 18 }}>
        <div className="col">
          <section className="card" data-testid="request-details">
            <div className="card-head"><h2 className="card-title">Request Details</h2></div>
            <div className="card-body">
              <dl className="dl">
                <dt>Number</dt><dd className="row-id">{request.id}</dd>
                <dt>ULID</dt><dd className="mono" style={{ fontSize: 11 }}>{request.requestId ?? '—'}</dd>
                <dt>Form</dt><dd className="mono">{request.formLabel ?? request.formId}</dd>
                <dt>Department</dt><dd>{orgName} <span className="muted">({request.requesterGroupName})</span></dd>
                <dt>Cluster</dt><dd><strong>{clusterName(request)}</strong></dd>
                <dt>Namespace</dt><dd className="mono">hc-{request.requesterGroupName}-{String(request.vars.clusterName ?? '')}</dd>
                <dt>Environment</dt><dd><span className="pill blue">{request.env}</span></dd>
                <dt>Nodes</dt><dd>{nodeCount(request)} × KubeVirt</dd>
                <dt>Requester</dt><dd>{requesterName(request)}</dd>
                <dt>Submitted</dt><dd className="mono" style={{ fontSize: 12 }}>{request.submittedAt}</dd>
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

          {ready && (
            <section className="card" data-testid="cluster-access">
              <div className="card-head"><h2 className="card-title">Cluster Access</h2></div>
              <div className="card-body">
                <dl className="dl">
                  <dt>API URL</dt><dd className="mono" style={{ fontSize: 11 }}>{apiUrl}</dd>
                  <dt>Console URL</dt><dd className="mono" style={{ fontSize: 11 }}>{consoleUrl}</dd>
                  <dt>OpenShift Version</dt><dd>{ocpVersion}</dd>
                </dl>
                <button
                  type="button"
                  className="btn primary"
                  style={{ width: '100%', marginTop: 12, justifyContent: 'center' }}
                >
                  <Icons.download /> Download kubeconfig
                </button>
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}

export default RequestDetail;
