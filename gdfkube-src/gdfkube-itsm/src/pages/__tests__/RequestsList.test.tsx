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

  describe('role-aware tabs', () => {
    function tabsState(): DataState {
      // 3 mine (joao), 4 in joao's group (saude — including joao's own 3),
      // 8 total. So Mine=3, Department=4, All=8.
      const mine1 = makeRequest('REQ-MINE-1', 'ready', joao);
      const mine2 = makeRequest('REQ-MINE-2', 'provisioning', joao);
      const mine3 = makeRequest('REQ-MINE-3', 'approval', joao);
      const sameDept = makeRequest('REQ-DEPT-1', 'ready', maria, {
        requesterGroupName: 'saude',
      });
      const otherDept1 = makeRequest('REQ-OTHER-1', 'ready', maria);
      const otherDept2 = makeRequest('REQ-OTHER-2', 'provisioning', carlos);
      const otherDept3 = makeRequest('REQ-OTHER-3', 'failed', carlos);
      const otherDept4 = makeRequest('REQ-OTHER-4', 'approval', maria);
      return {
        requests: [
          mine1,
          mine2,
          mine3,
          sameDept,
          otherDept1,
          otherDept2,
          otherDept3,
          otherDept4,
        ],
        forms: [],
        fields: {},
        users: [],
        groups: [],
        templates: {},
      };
    }

    it('admin sees three tabs with the correct count badges', () => {
      const navigate = vi.fn();
      const adminInSaude = makeUser({
        id: 'admin-saude',
        username: 'joao.silva',
        name: 'joao.silva',
        fullName: 'João Silva',
        role: 'admin',
        group: 'saude',
      });
      const { container } = render(
        withProvider(
          tabsState(),
          <RequestsList role="admin" user={adminInSaude} navigate={navigate} />,
        ),
      );

      const tabs = container.querySelectorAll('.tabs .tab');
      expect(tabs.length).toBe(3);

      const mineTab = Array.from(tabs).find((t) =>
        t.textContent?.startsWith('Mine'),
      ) as HTMLElement | undefined;
      const deptTab = Array.from(tabs).find((t) =>
        t.textContent?.startsWith('Department'),
      ) as HTMLElement | undefined;
      const allTab = Array.from(tabs).find((t) =>
        t.textContent?.startsWith('All'),
      ) as HTMLElement | undefined;

      expect(mineTab?.querySelector('.count')?.textContent).toBe('3');
      expect(deptTab?.querySelector('.count')?.textContent).toBe('4');
      expect(allTab?.querySelector('.count')?.textContent).toBe('8');
    });

    it('clicking the Department tab narrows the table to same-group requests', () => {
      const navigate = vi.fn();
      const adminInSaude = makeUser({
        id: 'admin-saude',
        username: 'joao.silva',
        name: 'joao.silva',
        fullName: 'João Silva',
        role: 'admin',
        group: 'saude',
      });
      const { container } = render(
        withProvider(
          tabsState(),
          <RequestsList role="admin" user={adminInSaude} navigate={navigate} />,
        ),
      );

      const tabs = container.querySelectorAll('.tabs .tab');
      const deptTab = Array.from(tabs).find((t) =>
        t.textContent?.startsWith('Department'),
      ) as HTMLElement;
      fireEvent.click(deptTab);

      expect(deptTab.classList.contains('active')).toBe(true);

      const rows = container.querySelectorAll('tbody tr');
      expect(rows.length).toBe(4);
      // Every visible row's department cell should map to the saude group
      // (either via the seeded Org name or the raw group id).
      const ids = Array.from(rows).map(
        (r) => r.querySelector('.row-id')?.textContent,
      );
      expect(ids).toEqual(
        expect.arrayContaining([
          'REQ-MINE-1',
          'REQ-MINE-2',
          'REQ-MINE-3',
          'REQ-DEPT-1',
        ]),
      );
    });

    it('operator sees only the Mine tab', () => {
      const navigate = vi.fn();
      const { container } = render(
        withProvider(
          tabsState(),
          <RequestsList role="operator" user={joao} navigate={navigate} />,
        ),
      );

      const tabs = container.querySelectorAll('.tabs .tab');
      expect(tabs.length).toBe(1);
      expect(tabs[0]?.textContent?.startsWith('Mine')).toBe(true);
      expect(tabs[0]?.querySelector('.count')?.textContent).toBe('3');
    });
  });
});
