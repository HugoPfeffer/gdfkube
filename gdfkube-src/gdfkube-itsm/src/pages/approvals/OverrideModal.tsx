// Override modal — confirms an approval when one or more policy checks
// have `ok: false`. The modal lists the failing checks and requires an
// explicit Confirm before the parent commits the approval.

import { Icons } from '../../icons/Icons';
import type { PolicyCheck } from '../../types';

interface OverrideModalProps {
  open: boolean;
  failingChecks: PolicyCheck[];
  onConfirm: () => void;
  onCancel: () => void;
}

export function OverrideModal({
  open,
  failingChecks,
  onConfirm,
  onCancel,
}: OverrideModalProps) {
  if (!open) return null;
  return (
    <div
      className="modal-backdrop"
      data-testid="override-modal"
      role="dialog"
      aria-modal="true"
      aria-labelledby="override-modal-title"
    >
      <div className="modal">
        <div className="modal-head">
          <span className="policy-icon warn" aria-hidden="true">
            <Icons.alert size={14} />
          </span>
          <strong id="override-modal-title">
            Override failing policy checks?
          </strong>
        </div>
        <div className="modal-body">
          <p style={{ margin: '0 0 10px' }}>
            Approving this request will bypass the following policy checks.
            The decision will be recorded in the approval chain.
          </p>
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            {failingChecks.map((c) => (
              <li key={c.id} style={{ marginBottom: 4 }}>
                <strong>{c.label}</strong>
                {c.detail ? <span className="muted"> — {c.detail}</span> : null}
              </li>
            ))}
          </ul>
        </div>
        <div className="modal-foot">
          <button type="button" className="btn ghost" onClick={onCancel}>
            Cancel
          </button>
          <button type="button" className="btn primary" onClick={onConfirm}>
            Confirm override
          </button>
        </div>
      </div>
    </div>
  );
}

export default OverrideModal;
