// Component tests for the Requests list page.
//
// Covers the spec scenarios for `itsm-requests-list`:
//   - role-scoped data: operator sees only own; admin sees all
//   - status filter chips with single-active behavior (Provisioning case)
//   - inline progress indicator on `provisioning` rows
//   - page title swaps between "My requests" (operator) and "All requests" (admin)

import { fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { GdfDataProvider, type DataState } from '../../state/dataContext';
import type { Request, RequestStatus, User } from '../../types';
import { RequestsList } from '../RequestsList';

function makeUser(overrides: Partial<User> = {}): User {
  return {
    id: 'joao.silva',
    username: 'joao.silva',
    name: 'joao.silva',
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
  requester: User,
  overrides: Partial<Request> = {},
): Request {
  return {
    id,
    formId: 'cluster-request',
    env: 'production',
    requester,
    requesterGroupName: requester.group ?? 'saude',
    status,
    stage: 0,
    submittedAt: '2026-04-27 09:14:22',
    vars: { clusterName: `cluster-${id}` },
    meta: {},
    policyChecks: [],
    formLabel: 'OpenShift Cluster',
    ...overrides,
  };
}

const joao = makeUser();
const maria = makeUser({
  id: 'maria.costa',
  username: 'maria.costa',
  name: 'maria.costa',
  fullName: 'Maria Costa',
  email: 'maria.costa@educacao.gov',
  role: 'operator',
  group: 'educacao',
});
const carlos = makeUser({
  id: 'carlos.mendes',
  username: 'carlos.mendes',
  name: 'carlos.mendes',
  fullName: 'Carlos Mendes',
  email: 'carlos.mendes@transportes.gov',
  role: 'operator',
  group: 'transportes',
});

const adminUser = makeUser({
  id: 'admin-1',
  username: 'maria.costa',
  name: 'Maria Costa',
  fullName: 'Maria Costa',
  email: 'm.costa@setic.gov',
  role: 'admin',
  group: 'setic',
});

function makeState(overrides: Partial<DataState> = {}): DataState {
  return {
    requests: [
      makeRequest('REQ0010247', 'provisioning', joao, {
        stage: 4,
        progress: 58,
        submittedAt: '2026-04-27 09:14:22',
      }),
      makeRequest('REQ0010244', 'ready', maria, {
        stage: 7,
        progress: 100,
        submittedAt: '2026-04-27 08:42:01',
      }),
      makeRequest('REQ0010241', 'approval', carlos, {
        stage: 0,
        progress: 5,
        submittedAt: '2026-04-26 16:08:55',
      }),
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

describe('RequestsList', () => {
  it('operator sees only requests they own', () => {
    const navigate = vi.fn();
    const { container } = render(
      withProvider(
        makeState(),
        <RequestsList role="operator" user={joao} navigate={navigate} />,
      ),
    );

    const rows = container.querySelectorAll('tbody tr');
    expect(rows.length).toBe(1);
    const ids = Array.from(rows).map(
      (r) => r.querySelector('.row-id')?.textContent,
    );
    expect(ids).toEqual(['REQ0010247']);
  });

  it('admin sees all requests', () => {
    const navigate = vi.fn();
    const { container } = render(
      withProvider(
        makeState(),
        <RequestsList role="admin" user={adminUser} navigate={navigate} />,
      ),
    );

    const rows = container.querySelectorAll('tbody tr');
    expect(rows.length).toBe(3);
  });

  it('clicking the Provisioning chip filters to provisioning rows and the chip is active', () => {
    const navigate = vi.fn();
    const { container } = render(
      withProvider(
        makeState(),
        <RequestsList role="admin" user={adminUser} navigate={navigate} />,
      ),
    );

    const chips = container.querySelectorAll('.filters .filter-chip');
    const provChip = Array.from(chips).find(
      (el) => el.textContent === 'Provisioning',
    ) as HTMLElement | null;
    expect(provChip).not.toBeNull();
    fireEvent.click(provChip!);

    expect(provChip!.classList.contains('active')).toBe(true);

    const allChip = Array.from(chips).find(
      (el) => el.textContent === 'All',
    ) as HTMLElement | null;
    expect(allChip).not.toBeNull();
    expect(allChip!.classList.contains('active')).toBe(false);

    const rows = container.querySelectorAll('tbody tr');
    expect(rows.length).toBe(1);
    expect(rows[0]?.querySelector('.row-id')?.textContent).toBe('REQ0010247');
    expect(rows.length).toBe(1);
    expect(rows[0]?.querySelector('.row-id')?.textContent).toBe('REQ0010247');
  });

  it('provisioning row shows an inline progress bar', () => {
    const navigate = vi.fn();
    const { container } = render(
      withProvider(
        makeState(),
        <RequestsList role="admin" user={adminUser} navigate={navigate} />,
      ),
    );

    const provRow = Array.from(container.querySelectorAll('tbody tr')).find(
      (r) => r.querySelector('.row-id')?.textContent === 'REQ0010247',
    ) as HTMLElement | undefined;
    expect(provRow).toBeDefined();

    const progressDiv = provRow!.querySelector('.progress') as HTMLElement | null;
    expect(progressDiv).not.toBeNull();
    const bar = progressDiv!.querySelector('div') as HTMLElement | null;
    expect(bar).not.toBeNull();
    expect(bar!.getAttribute('style') ?? '').toContain('width: 58%');
  });

  it('non-provisioning rows do not render the progress indicator', () => {
    const navigate = vi.fn();
    const { container } = render(
      withProvider(
        makeState(),
        <RequestsList role="admin" user={adminUser} navigate={navigate} />,
      ),
    );

    const readyRow = Array.from(container.querySelectorAll('tbody tr')).find(
      (r) => r.querySelector('.row-id')?.textContent === 'REQ0010244',
    ) as HTMLElement | undefined;
    expect(readyRow).toBeDefined();
    expect(readyRow!.querySelector('.progress')).toBeNull();
  });

  it('page title is "My Requests" for operator', () => {
    const navigate = vi.fn();
    render(
      withProvider(
        makeState(),
        <RequestsList role="operator" user={joao} navigate={navigate} />,
      ),
    );
    expect(screen.getByText('My Requests')).toBeInTheDocument();
  });

  it('page title is "All Requests" for admin', () => {
    const navigate = vi.fn();
    render(
      withProvider(
        makeState(),
        <RequestsList role="admin" user={adminUser} navigate={navigate} />,
      ),
    );
    expect(screen.getByText('All Requests')).toBeInTheDocument();
  });

  it('clicking a row navigates to request-detail with that id', () => {
    const navigate = vi.fn();
    render(
      withProvider(
        makeState(),
        <RequestsList role="admin" user={adminUser} navigate={navigate} />,
      ),
    );

    fireEvent.click(screen.getByText('REQ0010244').closest('tr')!);
    expect(navigate).toHaveBeenCalledWith('request-detail', { id: 'REQ0010244' });
  });

  it('rows are keyboard accessible (Enter/Space activate)', () => {
    const navigate = vi.fn();
    render(
      withProvider(
        makeState(),
        <RequestsList role="admin" user={adminUser} navigate={navigate} />,
      ),
    );

    const row = screen.getByText('REQ0010247').closest('tr')!;
    expect(row.getAttribute('tabindex')).toBe('0');
    expect(row.getAttribute('role')).toBe('button');

    fireEvent.keyDown(row, { key: 'Enter' });
    expect(navigate).toHaveBeenLastCalledWith('request-detail', {
      id: 'REQ0010247',
    });

    navigate.mockClear();
    fireEvent.keyDown(row, { key: ' ' });
    expect(navigate).toHaveBeenLastCalledWith('request-detail', {
      id: 'REQ0010247',
    });
  });
});
