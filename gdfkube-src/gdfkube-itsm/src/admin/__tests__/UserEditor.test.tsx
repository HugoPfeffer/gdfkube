// Component tests for the per-user editor.
//
// Covers spec scenarios from `itsm-admin-users`:
//   - Editor renders inputs for name, username, email, group, role, status,
//     password (set/change), MFA.
//   - Editor renders a "Recent sessions" read-only list.

import { fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { GdfDataProvider, type DataState } from '../../state/dataContext';
import type { Group, User } from '../../types';
import { UserEditor } from '../UserEditor';

function makeUser(overrides: Partial<User> = {}): User {
  return {
    id: '2',
    username: 'maria.costa',
    name: 'Maria Costa',
    email: 'm.costa@setic.gov',
    role: 'admin',
    group: 'setic',
    status: 'active',
    ...overrides,
  };
}

function makeGroup(id: string): Group {
  return {
    id,
    name: id,
    fullName: id,
    users: 0,
    forms: 0,
    repo: `gdfkube-${id}`,
    clusters: 0,
  };
}

function makeState(user: User): DataState {
  return {
    requests: [],
    forms: [],
    fields: {},
    users: [user],
    groups: [makeGroup('saude'), makeGroup('setic'), makeGroup('seguranca')],
    templates: {},
  };
}

function withProvider(state: DataState, ui: ReactNode) {
  return <GdfDataProvider initial={state}>{ui}</GdfDataProvider>;
}

describe('UserEditor', () => {
  it('renders inputs for every editable field', () => {
    const user = makeUser();
    render(
      withProvider(makeState(user), <UserEditor user={user} onClose={vi.fn()} />),
    );
    expect((screen.getByLabelText(/^name$/i) as HTMLInputElement).value).toBe('Maria Costa');
    expect((screen.getByLabelText(/^username$/i) as HTMLInputElement).value).toBe('maria.costa');
    expect((screen.getByLabelText(/^email$/i) as HTMLInputElement).value).toBe('m.costa@setic.gov');
    expect((screen.getByLabelText(/^group$/i) as HTMLSelectElement).value).toBe('setic');
    expect((screen.getByLabelText(/^role$/i) as HTMLSelectElement).value).toBe('admin');
    expect((screen.getByLabelText(/^status$/i) as HTMLSelectElement).value).toBe('active');
    expect(screen.getByLabelText(/password/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/mfa/i)).toBeInTheDocument();
  });

  it('renders a Recent sessions read-only list', () => {
    const user = makeUser();
    render(
      withProvider(makeState(user), <UserEditor user={user} onClose={vi.fn()} />),
    );
    expect(screen.getByText(/recent sessions/i)).toBeInTheDocument();
    const sessions = screen.getByTestId('recent-sessions');
    // synthesized — at least one entry per user
    expect(sessions.querySelectorAll('li').length).toBeGreaterThan(0);
  });

  it('editing the name updates the input value', () => {
    const user = makeUser();
    render(
      withProvider(makeState(user), <UserEditor user={user} onClose={vi.fn()} />),
    );
    const nameInput = screen.getByLabelText(/^name$/i) as HTMLInputElement;
    fireEvent.change(nameInput, { target: { value: 'Maria C.' } });
    expect(nameInput.value).toBe('Maria C.');
  });
});
