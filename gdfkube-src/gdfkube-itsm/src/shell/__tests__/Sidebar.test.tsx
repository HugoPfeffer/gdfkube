import { fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { GdfDataProvider, type DataState } from '../../state/dataContext';
import type { Request, RequestStatus, Role, RouteName, User } from '../../types';
import { Sidebar } from '../Sidebar';

function makeUser(overrides: Partial<User> = {}): User {
  return {
    id: 'u-1',
    name: 'Test User',
    email: 'test@example.gov',
    role: 'operator',
    ...overrides,
  };
}

function makeRequest(
  id: string,
  status: RequestStatus,
  requesterRole: Role = 'operator',
): Request {
  return {
    id,
    formId: 'cluster-request',
    env: 'development',
    requester: makeUser({ id: `u-${id}`, role: requesterRole }),
    requesterGroupName: 'saude',
    status,
    stage: 0,
    submittedAt: '2026-04-27 09:00:00',
    vars: {},
    meta: {},
    policyChecks: [],
  };
}

function makeState(requests: Request[] = []): DataState {
  return {
    requests,
    forms: [],
    fields: {},
    users: [],
    groups: [],
    templates: {},
  };
}

function withProvider(initial: DataState, ui: ReactNode) {
  return <GdfDataProvider initial={initial}>{ui}</GdfDataProvider>;
}

describe('Sidebar', () => {
  it('hides admin sections when role is operator', () => {
    const navigate = vi.fn();
    render(
      withProvider(
        makeState(),
        <Sidebar route={'home' as RouteName} navigate={navigate} role="operator" collapsed={false} />,
      ),
    );

    // Workspace section visible
    expect(screen.getByText('Workspace')).toBeInTheDocument();
    expect(screen.getByText('Home')).toBeInTheDocument();
    expect(screen.getByText('Service Catalog')).toBeInTheDocument();
    expect(screen.getByText('My Requests')).toBeInTheDocument();

    // Admin-only sections and items hidden for operator
    expect(screen.queryByText('Operations')).not.toBeInTheDocument();
    expect(screen.queryByText('Administration')).not.toBeInTheDocument();
    expect(screen.queryByText('Approvals')).not.toBeInTheDocument();
    expect(screen.queryByText('Forms')).not.toBeInTheDocument();
    expect(screen.queryByText('Users')).not.toBeInTheDocument();
  });

  it('shows admin sections and Approvals badge equal to approval-status request count for admin', () => {
    const navigate = vi.fn();
    const requests = [
      makeRequest('REQ1', 'approval'),
      makeRequest('REQ2', 'approval'),
      makeRequest('REQ3', 'provisioning'),
      makeRequest('REQ4', 'ready'),
      makeRequest('REQ5', 'approval'),
    ];
    render(
      withProvider(
        makeState(requests),
        <Sidebar route={'home' as RouteName} navigate={navigate} role="admin" collapsed={false} />,
      ),
    );

    expect(screen.getByText('Operations')).toBeInTheDocument();
    expect(screen.getByText('Administration')).toBeInTheDocument();
    expect(screen.getByText('Approvals')).toBeInTheDocument();
    expect(screen.getByText('Forms')).toBeInTheDocument();
    expect(screen.getByText('Users')).toBeInTheDocument();

    // Approvals row with badge "3"
    const approvalsRow = screen.getByText('Approvals').closest('.nav-item');
    expect(approvalsRow).not.toBeNull();
    const badge = approvalsRow?.querySelector('.badge');
    expect(badge).not.toBeNull();
    expect(badge?.textContent).toBe('3');
  });

  it('renders no Approvals badge when zero approval-status requests', () => {
    const navigate = vi.fn();
    const requests = [
      makeRequest('REQ1', 'provisioning'),
      makeRequest('REQ2', 'ready'),
    ];
    render(
      withProvider(
        makeState(requests),
        <Sidebar route={'home' as RouteName} navigate={navigate} role="admin" collapsed={false} />,
      ),
    );

    const approvalsRow = screen.getByText('Approvals').closest('.nav-item');
    expect(approvalsRow?.querySelector('.badge')).toBeNull();
  });

  it('marks the active route with the active class', () => {
    const navigate = vi.fn();
    render(
      withProvider(
        makeState(),
        <Sidebar
          route={'catalog' as RouteName}
          navigate={navigate}
          role="operator"
          collapsed={false}
        />,
      ),
    );

    const catalogRow = screen.getByText('Service Catalog').closest('.nav-item');
    expect(catalogRow).toHaveClass('active');
    const homeRow = screen.getByText('Home').closest('.nav-item');
    expect(homeRow).not.toHaveClass('active');
  });

  it('calls navigate with the item id when clicked', () => {
    const navigate = vi.fn();
    render(
      withProvider(
        makeState(),
        <Sidebar route={'home' as RouteName} navigate={navigate} role="operator" collapsed={false} />,
      ),
    );

    const catalogRow = screen.getByText('Service Catalog').closest('.nav-item');
    fireEvent.click(catalogRow!);
    expect(navigate).toHaveBeenCalledWith('catalog');
  });

  it('collapsed mode hides labels and sets title tooltips on nav items', () => {
    const navigate = vi.fn();
    const { container } = render(
      withProvider(
        makeState([makeRequest('REQ1', 'approval')]),
        <Sidebar route={'home' as RouteName} navigate={navigate} role="admin" collapsed={true} />,
      ),
    );

    // Labels not rendered as text
    expect(screen.queryByText('Home')).not.toBeInTheDocument();
    expect(screen.queryByText('Service Catalog')).not.toBeInTheDocument();
    expect(screen.queryByText('Approvals')).not.toBeInTheDocument();
    expect(screen.queryByText('Compliant · ISO 27001')).not.toBeInTheDocument();

    // Each nav-item has a title attribute equal to its label
    const items = container.querySelectorAll('.nav-item');
    const titles = Array.from(items).map((el) => el.getAttribute('title'));
    expect(titles).toContain('Home');
    expect(titles).toContain('Service Catalog');
    expect(titles).toContain('My Requests');
    expect(titles).toContain('Approvals');

    // Sidebar carries collapsed class
    expect(container.querySelector('.sidebar')).toHaveClass('collapsed');
  });

  it('renders the sidebar foot "Compliant · ISO 27001" when not collapsed', () => {
    const navigate = vi.fn();
    render(
      withProvider(
        makeState(),
        <Sidebar route={'home' as RouteName} navigate={navigate} role="operator" collapsed={false} />,
      ),
    );

    expect(screen.getByText('Compliant · ISO 27001')).toBeInTheDocument();
  });

  it('My Requests badge for operator counts own requests in approval/provisioning', () => {
    const navigate = vi.fn();
    // Operator sees count of requests where requester.role === 'operator'
    // and status in {approval, provisioning}.
    const requests = [
      makeRequest('REQ1', 'approval', 'operator'),
      makeRequest('REQ2', 'provisioning', 'operator'),
      makeRequest('REQ3', 'ready', 'operator'),
      makeRequest('REQ4', 'approval', 'admin'),
    ];
    render(
      withProvider(
        makeState(requests),
        <Sidebar route={'home' as RouteName} navigate={navigate} role="operator" collapsed={false} />,
      ),
    );

    const myReqRow = screen.getByText('My Requests').closest('.nav-item');
    const badge = myReqRow?.querySelector('.badge');
    expect(badge?.textContent).toBe('2');
  });

  it('My Requests has no badge for admin role', () => {
    const navigate = vi.fn();
    const requests = [makeRequest('REQ1', 'approval', 'operator')];
    render(
      withProvider(
        makeState(requests),
        <Sidebar route={'home' as RouteName} navigate={navigate} role="admin" collapsed={false} />,
      ),
    );

    const myReqRow = screen.getByText('My Requests').closest('.nav-item');
    expect(myReqRow?.querySelector('.badge')).toBeNull();
  });
});
