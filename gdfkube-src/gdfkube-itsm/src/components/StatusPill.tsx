// Status pill: maps a status to a labeled, color-tinted badge.
//
// The component is a presentational primitive used by the Dashboard's
// Recent Requests table, RequestsList, and detail/approval panels. Output
// is `pill <tone>` where `<tone>` is one of green/amber/red/blue —
// hooking into the existing `.pill.<color>` rules in `styles.css:386-391`.
// The accepted status union is wider than `RequestStatus` so callers can
// display synthetic states (cluster health: pending/healthy/degraded)
// without polluting the canonical Request status.

import type { RequestStatus } from '../types';

export type StatusPillStatus =
  | RequestStatus
  | 'pending'
  | 'healthy'
  | 'degraded';

interface StatusPillProps {
  status: StatusPillStatus;
}

const PILL_MAP: Record<
  StatusPillStatus,
  { label: string; tone: 'amber' | 'blue' | 'green' | 'red' }
> = {
  approval: { label: 'Awaiting approval', tone: 'blue' },
  provisioning: { label: 'Provisioning', tone: 'amber' },
  ready: { label: 'Ready', tone: 'green' },
  failed: { label: 'Failed', tone: 'red' },
  pending: { label: 'Pending', tone: 'amber' },
  healthy: { label: 'Healthy', tone: 'green' },
  degraded: { label: 'Degraded', tone: 'amber' },
};

export function StatusPill({ status }: StatusPillProps) {
  const { label, tone } = PILL_MAP[status];
  return (
    <span className={`pill ${tone}`}>
      <span className="dot" />
      {label}
    </span>
  );
}

export default StatusPill;
