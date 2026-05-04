// Status pill: maps a RequestStatus to a labeled, color-tinted badge.
//
// The component is a presentational primitive used by the Dashboard's
// Recent Requests table and (later) by RequestsList. The CSS class layout
// matches the spec (`pill pill-<status>`); the secondary color class
// (green/amber/red/blue) hooks into the existing `.pill.<color>` rules in
// styles.css so we don't have to duplicate color tokens here.

import type { RequestStatus } from '../types';

interface StatusPillProps {
  status: RequestStatus;
}

const PILL_MAP: Record<
  RequestStatus,
  { label: string; tone: 'amber' | 'blue' | 'green' | 'red' }
> = {
  approval: { label: 'Approval pending', tone: 'amber' },
  provisioning: { label: 'Provisioning', tone: 'blue' },
  ready: { label: 'Ready', tone: 'green' },
  failed: { label: 'Failed', tone: 'red' },
};

export function StatusPill({ status }: StatusPillProps) {
  const { label, tone } = PILL_MAP[status];
  return (
    <span className={`pill pill-${status} ${tone}`}>
      <span className="dot" />
      {label}
    </span>
  );
}

export default StatusPill;
