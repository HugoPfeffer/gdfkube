// Override modal — confirms an approval when one or more policy checks
// have `ok: false`. The modal lists the failing checks and requires an
// explicit Confirm before the parent commits the approval.
//
// A11y: when the modal opens we move focus to the Confirm button so a
// keyboard user can act without tabbing past the dialog chrome, and we
// register a window-level keydown listener that calls `onCancel()` on
// Escape so the modal behaves like any standard system dialog.

import { useEffect, useRef } from 'react';
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
  const confirmRef = useRef<HTMLButtonElement | null>(null);

  // Focus the Confirm button when the modal opens. Re-runs whenever `open`
  // toggles to true so reopens after a Cancel still land focus correctly.
  useEffect(() => {
    if (open) confirmRef.current?.focus();
  }, [open]);

  // Escape-to-close. Only attach the listener while the modal is open so we
  // don't intercept keystrokes meant for the page underneath.
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onCancel]);

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
          <button
            ref={confirmRef}
            type="button"
            className="btn primary"
            onClick={onConfirm}
          >
            Confirm override
          </button>
        </div>
      </div>
    </div>
  );
}

export default OverrideModal;
