// Component tests for the Users admin page.
//
// Covers spec scenarios from `itsm-admin-users`:
//   - Users tab lists every user with role visible.
//   - Groups tab lists every department group (saude, educacao,
//     transportes, fazenda, agricultura, seguranca).
//   - Search input narrows the table by name / username / email.
//   - Role filter narrows the table to a single role.

import { fireEvent, render, screen, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { GdfDataProvider, type DataState } from '../../../state/dataContext';
import type { Group, User } from '../../../types';
import { Users } from '../Users';

vi.mock('../../../api/itsmApi', () => ({
  itsmApi: {
    users: { create: vi.fn().mockResolvedValue({}), update: vi.fn().mockResolvedValue({}) },
    groups: { create: vi.fn().mockResolvedValue({}), update: vi.fn().mockResolvedValue({}) },
  },
}));

function makeUser(overrides: Partial<User> = {}): User {
  return {
    id: 'u1',
    username: 'joao.silva',
    name: 'João Silva',
    email: 'joao.silva@saude.gov',
    group: 'saude',
    role: 'operator',
    status: 'active',
    ...overrides,
  };
}

function makeGroup(overrides: Partial<Group> = {}): Group {
  return {
    id: 'saude',
    name: 'Saúde',
    fullName: 'Department of Health',
    users: 8,
    forms: 4,
    repo: 'gdfkube-saude',
    clusters: 2,
    ...overrides,
  };
}

function makeState(): DataState {
  return {
    requests: [],
    forms: [],
    fields: {},
    users: [
      makeUser({ id: '1', username: 'joao.silva', name: 'João Silva', email: 'joao.silva@saude.gov', role: 'operator', group: 'saude' }),
      makeUser({ id: '2', username: 'maria.costa', name: 'Maria Costa', email: 'm.costa@setic.gov', role: 'admin', group: 'setic' }),
      makeUser({ id: '3', username: 'carlos.mendes', name: 'Carlos Mendes', email: 'c.mendes@transportes.gov', role: 'operator', group: 'transportes' }),
      makeUser({ id: '4', username: 'lucia.fernandes', name: 'Lúcia Fernandes', email: 'l.fernandes@seguranca.gov', role: 'approver', group: 'seguranca' }),
      makeUser({ id: '5', username: 'platform.bot', name: 'Platform Service', email: 'platform@setic.gov', role: 'service', group: 'setic' }),
    ],
    groups: [
      makeGroup({ id: 'saude', name: 'Saúde' }),
      makeGroup({ id: 'educacao', name: 'Educação', repo: 'gdfkube-educacao' }),
      makeGroup({ id: 'transportes', name: 'Transportes', repo: 'gdfkube-transportes' }),
      makeGroup({ id: 'fazenda', name: 'Fazenda', repo: 'gdfkube-fazenda' }),
      makeGroup({ id: 'agricultura', name: 'Agricultura', repo: 'gdfkube-agricultura' }),
      makeGroup({ id: 'seguranca', name: 'Segurança', repo: 'gdfkube-seguranca' }),
      makeGroup({ id: 'setic', name: 'SETIC', repo: 'gdfkube-infra', clusters: null }),
    ],
    templates: {},
  };
}

function withProvider(state: DataState, ui: ReactNode) {
  return <GdfDataProvider initial={state}>{ui}</GdfDataProvider>;
}

describe('Users admin page', () => {
  it('Users tab lists every user with role visible', () => {
    const navigate = vi.fn();
    const { container } = render(
      withProvider(makeState(), <Users navigate={navigate} />),
    );
    const rows = container.querySelectorAll('[data-testid="users-table"] tbody tr');
    expect(rows.length).toBe(5);
    // role column visible
    const text = container.textContent ?? '';
    expect(text).toMatch(/operator/);
    expect(text).toMatch(/admin/);
    expect(text).toMatch(/approver/);
    expect(text).toMatch(/service/);
  });

  it('renders Users / Groups tabs', () => {
    const navigate = vi.fn();
    render(withProvider(makeState(), <Users navigate={navigate} />));
    expect(screen.getByRole('tab', { name: 'Users' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Groups' })).toBeInTheDocument();
  });

  it('Groups tab lists every department group', () => {
    const navigate = vi.fn();
    const { container } = render(
      withProvider(makeState(), <Users navigate={navigate} />),
    );
    fireEvent.click(screen.getByRole('tab', { name: 'Groups' }));
    const rows = container.querySelectorAll('[data-testid="groups-table"] tbody tr');
    const ids = Array.from(rows).map((r) => r.querySelector('.row-group-id')?.textContent);
    expect(ids).toEqual(
      expect.arrayContaining([
        'saude',
        'educacao',
        'transportes',
        'fazenda',
        'agricultura',
        'seguranca',
      ]),
    );
  });

  it('search input narrows users by name / username / email', () => {
    const navigate = vi.fn();
    const { container } = render(
      withProvider(makeState(), <Users navigate={navigate} />),
    );
    const search = screen.getByPlaceholderText(/search/i) as HTMLInputElement;

    fireEvent.change(search, { target: { value: 'maria' } });
    let rows = container.querySelectorAll('[data-testid="users-table"] tbody tr');
    expect(rows.length).toBe(1);
    expect(rows[0]?.textContent).toMatch(/Maria Costa/);

    fireEvent.change(search, { target: { value: 'transportes.gov' } });
    rows = container.querySelectorAll('[data-testid="users-table"] tbody tr');
    expect(rows.length).toBe(1);
    expect(rows[0]?.textContent).toMatch(/Carlos Mendes/);

    fireEvent.change(search, { target: { value: 'joao.silva' } });
    rows = container.querySelectorAll('[data-testid="users-table"] tbody tr');
    expect(rows.length).toBe(1);
    expect(rows[0]?.textContent).toMatch(/João Silva/);
  });

  it('role filter narrows users to a single role', () => {
    const navigate = vi.fn();
    const { container } = render(
      withProvider(makeState(), <Users navigate={navigate} />),
    );
    const select = screen.getByLabelText(/role filter/i) as HTMLSelectElement;
    fireEvent.change(select, { target: { value: 'admin' } });
    const rows = container.querySelectorAll('[data-testid="users-table"] tbody tr');
    expect(rows.length).toBe(1);
    expect(rows[0]?.textContent).toMatch(/Maria Costa/);
  });

  it('clicking a user row opens the user editor', () => {
    const navigate = vi.fn();
    render(withProvider(makeState(), <Users navigate={navigate} />));
    const row = screen.getByText('Maria Costa').closest('tr')!;
    fireEvent.click(row);
    const nameInput = screen.getByLabelText(/^name$/i) as HTMLInputElement;
    expect(nameInput.value).toBe('Maria Costa');
    expect(screen.getByText(/recent sessions/i)).toBeInTheDocument();
  });

  it('clicking a group row opens the group editor', () => {
    const navigate = vi.fn();
    render(withProvider(makeState(), <Users navigate={navigate} />));
    fireEvent.click(screen.getByRole('tab', { name: 'Groups' }));
    const row = screen.getByText('Educação').closest('tr')!;
    fireEvent.click(row);
    const idInput = screen.getByLabelText(/^id$/i) as HTMLInputElement;
    expect(idInput.value).toBe('educacao');
  });

  it('"+ New user" button opens the create page', () => {
    const navigate = vi.fn();
    render(withProvider(makeState(), <Users navigate={navigate} />));
    const head = screen.getByTestId('users-head');
    fireEvent.click(within(head).getByRole('button', { name: /new user/i }));
    expect(screen.getByLabelText(/^name$/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /create user/i })).toBeInTheDocument();
  });

  it('"+ New group" button opens the create page on Groups tab', () => {
    const navigate = vi.fn();
    render(withProvider(makeState(), <Users navigate={navigate} />));
    fireEvent.click(screen.getByRole('tab', { name: 'Groups' }));
    const head = screen.getByTestId('users-head');
    fireEvent.click(within(head).getByRole('button', { name: /new group/i }));
    expect(screen.getByRole('button', { name: /create group/i })).toBeInTheDocument();
  });
});
