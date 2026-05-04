// ToastStack: single-slot, controlled toast surface.
//
// The bundle's App owns the toast state and clears it via a setTimeout.
// We move the auto-dismiss timer into ToastStack itself but keep state
// outside (parent passes `toast` and `onDismiss`). This keeps App logic
// simple while letting ToastStack reset its timer when the toast id
// changes.

import { useEffect } from 'react';
import { Icons } from '../icons/Icons';

export type ToastKind = 'info' | 'success' | 'warn' | 'error';

export interface Toast {
  id?: string;
  kind: ToastKind;
  title: string;
  body?: string;
}

interface ToastStackProps {
  toast: Toast | null;
  onDismiss: () => void;
}

const AUTO_DISMISS_MS = 5000;

export function ToastStack({ toast, onDismiss }: ToastStackProps) {
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(onDismiss, AUTO_DISMISS_MS);
    return () => clearTimeout(timer);
    // Re-arm timer when the toast identity (or the dismiss callback) changes.
  }, [toast?.id, toast, onDismiss]);

  if (!toast) return null;

  return (
    <div className="toast-stack">
      <div className={'toast ' + toast.kind}>
        <div className="toast-icon" aria-hidden="true">
          {toast.kind === 'success' ? <Icons.check /> : <Icons.info />}
        </div>
        <div style={{ flex: 1 }}>
          <strong>{toast.title}</strong>
          {toast.body && <span>{toast.body}</span>}
        </div>
        <button
          type="button"
          className="toast-close"
          aria-label="Dismiss notification"
          onClick={onDismiss}
        >
          <Icons.x />
        </button>
      </div>
    </div>
  );
}

export default ToastStack;
