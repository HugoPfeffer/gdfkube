// Component tests for the Dashboard page.
//
// Covers the spec scenarios for `itsm-dashboard`:
//   - role-aware heading swap (operator vs admin)
//   - exactly three KPI cards inside `.kpi-grid` with the right labels
//   - row click in Recent Requests navigates to request-detail with the id
//   - banner "View activity" CTA navigates to requests
//   - activity entry of type `err` has a leading dot using `var(--red-500)`
//   - pipeline-health card uses `.banner` (not `.card`)
//   - Recent Requests + Activity Stream are inside `.detail-grid`
//   - operator role shows "New cluster request" header CTA
//   - "View all" navigates to `requests`
//   - Submitted column displays time only

import { fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { GdfDataProvider, type DataState } from '../../state/dataContext';
import type { Request, RequestStatus, User } from '../../types';
import { Dashboard } from '../Dashboard';

function makeUser(overrides: Partial<User> = {}): User {
  return {
    id: 'u-test',
    name: 'João Silva',
    fullName: 'João Silva',
    email: 'joao.silva@saude.gov',
    role: 'operator',
    group: 'saude',
    ...overrides,
  };
}

function makeRequest(
  id: string,
  status: RequestStatus,
  submittedAt: string,
  overrides: Partial<Request> = {},
): Request {
  return {
    id,
    formId: 'cluster-request',
    env: 'production',
    requester: makeUser(),
    requesterGroupName: 'saude',
    status,
    stage: 0,
    submittedAt,
    vars: { clusterName: `cluster-${id}` },
    meta: {},
    policyChecks: [],
    ...overrides,
  };
}

function makeState(overrides: Partial<DataState> = {}): DataState {
  return {
    requests: [
      makeRequest('REQ0010251', 'approval', '2026-04-27 11:48:55'),
      makeRequest('REQ0010249', 'approval', '2026-04-27 10:02:18'),
      makeRequest('REQ0010247', 'provisioning', '2026-04-27 09:14:22'),
      makeRequest('REQ0010244', 'ready', '2026-04-27 08:42:01'),
      makeRequest('REQ0010238', 'approval', '2026-04-26 11:30:12'),
    ],
    forms: [],
    fields: {},
    users: [],
    groups: [],
    templates: {},
    ...overrides,
  };
}

function withProvider(state: DataState, ui: ReactNode) {
  return <GdfDataProvider initial={state}>{ui}</GdfDataProvider>;
}

const operatorUser = makeUser();
const adminUser = makeUser({
  id: 'admin-1',
  name: 'Maria Costa',
  fullName: 'Maria Costa',
  email: 'm.costa@setic.gov',
  role: 'admin',
  group: 'setic',
});

describe('Dashboard', () => {
  it('renders the operator title and subtitle when role is operator', () => {
    const navigate = vi.fn();
    render(
      withProvider(
        makeState(),
        <Dashboard role="operator" navigate={navigate} user={operatorUser} />,
      ),
    );
    expect(screen.getByText('Welcome back, João')).toBeInTheDocument();
    expect(
      screen.getByText('Saúde · Department of Health · Operator role'),
    ).toBeInTheDocument();
  });

  it('renders the admin title and subtitle when role is admin', () => {
    const navigate = vi.fn();
    render(
      withProvider(
        makeState(),
        <Dashboard role="admin" navigate={navigate} user={adminUser} />,
      ),
    );
    expect(screen.getByText('Platform Overview')).toBeInTheDocument();
    expect(
      screen.getByText(
        'Fleet health and recent activity across all departments.',
      ),
    ).toBeInTheDocument();
  });

  it('renders exactly three KPI cards with the spec labels', () => {
    const navigate = vi.fn();
    const { container } = render(
      withProvider(
        makeState(),
        <Dashboard role="operator" navigate={navigate} user={operatorUser} />,
      ),
    );
    const grid = container.querySelector('.kpi-grid');
    expect(grid).not.toBeNull();
    const cards = grid!.querySelectorAll('.kpi');
    expect(cards.length).toBe(3);
    const labels = Array.from(cards).map(
      (c) => c.querySelector('.kpi-label')?.textContent ?? '',
    );
    expect(labels).toEqual([
      'Active Clusters',
      'Pending Provisioning',
      'Failed Last 30d',
    ]);
  });

  it('clicking a recent-request row navigates to request-detail with that id', () => {
    const navigate = vi.fn();
    render(
      withProvider(
        makeState(),
        <Dashboard role="operator" navigate={navigate} user={operatorUser} />,
      ),
    );

    // The most recently submitted request (REQ0010251) appears in the table.
    fireEvent.click(screen.getByText('REQ0010251').closest('tr')!);

    expect(navigate).toHaveBeenCalledWith('request-detail', {
      id: 'REQ0010251',
    });
  });

  it('recent-request rows are keyboard accessible (Enter/Space activate)', () => {
    const navigate = vi.fn();
    render(
      withProvider(
        makeState(),
        <Dashboard role="operator" navigate={navigate} user={operatorUser} />,
      ),
    );

    const row = screen.getByText('REQ0010251').closest('tr')!;
    expect(row.getAttribute('tabindex')).toBe('0');
    expect(row.getAttribute('role')).toBe('button');

    fireEvent.keyDown(row, { key: 'Enter' });
    expect(navigate).toHaveBeenLastCalledWith('request-detail', {
      id: 'REQ0010251',
    });

    navigate.mockClear();
    fireEvent.keyDown(row, { key: ' ' });
    expect(navigate).toHaveBeenLastCalledWith('request-detail', {
      id: 'REQ0010251',
    });

    navigate.mockClear();
    fireEvent.keyDown(row, { key: 'Tab' });
    expect(navigate).not.toHaveBeenCalled();
  });

  it('clicking the banner "View activity" button navigates to requests', () => {
    const navigate = vi.fn();
    render(
      withProvider(
        makeState(),
        <Dashboard role="operator" navigate={navigate} user={operatorUser} />,
      ),
    );

    fireEvent.click(screen.getByRole('button', { name: /View activity/ }));
    expect(navigate).toHaveBeenCalledWith('requests');
  });

  it('renders activity entries with type-mapped colored dots (err -> red-500)', () => {
    const navigate = vi.fn();
    const { container } = render(
      withProvider(
        makeState(),
        <Dashboard role="operator" navigate={navigate} user={operatorUser} />,
      ),
    );

    // Find an activity entry whose containing row has a dot styled with red-500.
    const errDot = container.querySelector('.activity-item.err .dot');
    expect(errDot).not.toBeNull();
    const style = (errDot as HTMLElement).getAttribute('style') ?? '';
    expect(style).toContain('--red-500');
  });

  it('Recent Requests table shows up to 4 rows sorted by submittedAt desc', () => {
    const navigate = vi.fn();
    const { container } = render(
      withProvider(
        makeState(),
        <Dashboard role="operator" navigate={navigate} user={operatorUser} />,
      ),
    );

    const card = container.querySelector('[data-testid="recent-requests"]')!;
    // Body rows are queried directly (rather than via role="row") because each
    // body row carries an explicit role="button" for keyboard accessibility,
    // which overrides the implicit `row` role.
    const bodyRows = card.querySelectorAll('tbody tr');
    expect(bodyRows.length).toBe(4);
    const ids = Array.from(bodyRows).map(
      (r) => r.querySelector('.row-id')?.textContent,
    );
    expect(ids).toEqual([
      'REQ0010251',
      'REQ0010249',
      'REQ0010247',
      'REQ0010244',
    ]);
  });

  it('renders the pipeline-health card with class .banner (not .card)', () => {
    const navigate = vi.fn();
    const { container } = render(
      withProvider(
        makeState(),
        <Dashboard role="operator" navigate={navigate} user={operatorUser} />,
      ),
    );

    const banner = container.querySelector('.banner');
    expect(banner).not.toBeNull();
    // The "View activity" CTA lives inside the banner block.
    expect(
      banner!.querySelector('button')?.textContent,
    ).toMatch(/View activity/);
    // The pipeline-health block must NOT carry `.card` (it should use
    // `.banner` only — the dark-gradient block in styles.css).
    expect(banner!.classList.contains('card')).toBe(false);
  });

  it('places Recent Requests and Activity Stream inside .detail-grid', () => {
    const navigate = vi.fn();
    const { container } = render(
      withProvider(
        makeState(),
        <Dashboard role="operator" navigate={navigate} user={operatorUser} />,
      ),
    );

    const grid = container.querySelector('.detail-grid');
    expect(grid).not.toBeNull();
    const recent = grid!.querySelector('[data-testid="recent-requests"]');
    const activity = grid!.querySelector('[data-testid="activity-stream"]');
    expect(recent).not.toBeNull();
    expect(activity).not.toBeNull();
    // Both are direct children of the detail-grid wrapper.
    expect(recent!.parentElement).toBe(grid);
    expect(activity!.parentElement).toBe(grid);
  });

  it('operator role exposes "New cluster request" header CTA → new-request', () => {
    const navigate = vi.fn();
    render(
      withProvider(
        makeState(),
        <Dashboard role="operator" navigate={navigate} user={operatorUser} />,
      ),
    );

    const cta = screen.getByRole('button', { name: /New cluster request/ });
    fireEvent.click(cta);
    expect(navigate).toHaveBeenCalledWith('new-request', {
      formId: 'cluster-request',
    });
  });

  it('admin role does NOT render the "New cluster request" header CTA', () => {
    const navigate = vi.fn();
    render(
      withProvider(
        makeState(),
        <Dashboard role="admin" navigate={navigate} user={adminUser} />,
      ),
    );
    expect(
      screen.queryByRole('button', { name: /New cluster request/ }),
    ).toBeNull();
  });

  it('Recent Requests "View all" button navigates to requests', () => {
    const navigate = vi.fn();
    render(
      withProvider(
        makeState(),
        <Dashboard role="operator" navigate={navigate} user={operatorUser} />,
      ),
    );

    fireEvent.click(screen.getByRole('button', { name: /View all/ }));
    expect(navigate).toHaveBeenCalledWith('requests');
  });

  it('Submitted column shows time only (e.g. "11:48" from "2026-04-27 11:48:55")', () => {
    const navigate = vi.fn();
    const { container } = render(
      withProvider(
        makeState(),
        <Dashboard role="operator" navigate={navigate} user={operatorUser} />,
      ),
    );

    const card = container.querySelector('[data-testid="recent-requests"]')!;
    const firstRow = card.querySelector('tbody tr')!;
    const submittedCell = firstRow.querySelectorAll('td')[4] as HTMLElement;
    // The cell renders only the time portion of the submitted timestamp; the
    // plan specifies `r.submittedAt.split(' ')[1] ?? r.submittedAt`, so for
    // "2026-04-27 11:48:55" the cell text is "11:48:55". The full timestamp
    // is preserved in the `title` attribute for hover.
    expect(submittedCell.textContent).toBe('11:48:55');
    expect(submittedCell.getAttribute('title')).toBe('2026-04-27 11:48:55');
  });
});
