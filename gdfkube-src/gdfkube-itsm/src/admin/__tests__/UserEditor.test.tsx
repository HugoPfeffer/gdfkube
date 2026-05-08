// Component tests for the per-user editor.
//
// Covers spec scenarios from `itsm-admin-users` (incl. fix-itsm-portal-design-drift):
//   - Editor renders inputs for name, username, email, group, role, status,
//     password (set/change), MFA.
//   - Editor renders a "Recent sessions" read-only list.
//   - Editor renders a `.user-banner` block at the top with initials avatar
//     (32px), full name, and `username · email`.
//   - Role and status are radio-cards (one per role / status). Cards are
//     keyboard-activatable (Enter/Space). Clicking dispatches UPDATE_USER.
//   - "Disable account" red ghost button at the bottom; clicking it sets
//     status to disabled and emits a confirmation toast.

import { act, fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GdfDataProvider, type DataState } from '../../state/dataContext';
import type { Group, User } from '../../types';
import { UserEditor } from '../UserEditor';
import { itsmApi } from '../../api/itsmApi';

vi.mock('../../api/itsmApi', () => ({
  itsmApi: { users: { update: vi.fn() } },
}));

const mockUpdate = itsmApi.users.update as ReturnType<typeof vi.fn>;

beforeEach(() => {
  mockUpdate.mockResolvedValue({});
});

afterEach(() => { vi.clearAllMocks(); });

function makeUser(overrides: Partial<User> = {}): User {
  return {
    id: '2',
    username: 'maria.costa',
    name: 'Maria Costa',
    fullName: 'Maria Costa',
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
    // Role and status are radio-cards now: assert the selected card's aria-checked.
    expect(screen.getByRole('radio', { name: /admin/i }).getAttribute('aria-checked')).toBe('true');
    expect(screen.getByRole('radio', { name: /^active$/i }).getAttribute('aria-checked')).toBe('true');
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

  it('renders a .user-banner block with initials avatar, fullName, and username · email', () => {
    const user = makeUser({
      username: 'm.costa',
      fullName: 'Maria Costa',
      email: 'm.costa@gdf.gov.br',
    });
    const { container } = render(
      withProvider(makeState(user), <UserEditor user={user} onClose={vi.fn()} />),
    );
    const banner = container.querySelector('.user-banner');
    expect(banner).not.toBeNull();
    // Initials avatar
    const avatar = banner!.querySelector('.avatar');
    expect(avatar).not.toBeNull();
    expect(avatar!.textContent).toBe('MC');
    // fullName text
    expect(banner!.textContent).toMatch(/Maria Costa/);
    // username · email line
    expect(banner!.textContent).toMatch(/m\.costa\s*·\s*m\.costa@gdf\.gov\.br/);
  });

  it('renders role as radio-cards with all four roles', () => {
    const user = makeUser();
    render(
      withProvider(makeState(user), <UserEditor user={user} onClose={vi.fn()} />),
    );
    expect(screen.getByRole('radio', { name: /operator/i })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /approver/i })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /admin/i })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /service/i })).toBeInTheDocument();
  });

  it('clicking a role radio-card dispatches UPDATE_USER with the new role', () => {
    const user = makeUser({ role: 'admin' });
    render(
      withProvider(makeState(user), <UserEditor user={user} onClose={vi.fn()} />),
    );
    fireEvent.click(screen.getByRole('radio', { name: /approver/i }));
    // The role card for approver should now be checked.
    expect(screen.getByRole('radio', { name: /approver/i }).getAttribute('aria-checked')).toBe('true');
    expect(screen.getByRole('radio', { name: /admin/i }).getAttribute('aria-checked')).toBe('false');
  });

  it('role radio-cards are keyboard activatable via Enter and Space', () => {
    const user = makeUser({ role: 'admin' });
    render(
      withProvider(makeState(user), <UserEditor user={user} onClose={vi.fn()} />),
    );
    const operatorCard = screen.getByRole('radio', { name: /operator/i });
    fireEvent.keyDown(operatorCard, { key: 'Enter' });
    expect(operatorCard.getAttribute('aria-checked')).toBe('true');

    const approverCard = screen.getByRole('radio', { name: /approver/i });
    fireEvent.keyDown(approverCard, { key: ' ' });
    expect(approverCard.getAttribute('aria-checked')).toBe('true');
  });

  it('renders status as radio-cards (active / disabled)', () => {
    const user = makeUser({ status: 'active' });
    render(
      withProvider(makeState(user), <UserEditor user={user} onClose={vi.fn()} />),
    );
    const active = screen.getByRole('radio', { name: /^active$/i });
    const disabled = screen.getByRole('radio', { name: /^disabled$/i });
    expect(active.getAttribute('aria-checked')).toBe('true');
    expect(disabled.getAttribute('aria-checked')).toBe('false');

    fireEvent.click(disabled);
    expect(screen.getByRole('radio', { name: /^disabled$/i }).getAttribute('aria-checked')).toBe('true');
  });

  it('renders a red ghost "Disable account" button at the editor footer', () => {
    const user = makeUser({ status: 'active' });
    const { container } = render(
      withProvider(makeState(user), <UserEditor user={user} onClose={vi.fn()} />),
    );
    const btn = screen.getByRole('button', { name: /disable account/i });
    expect(btn).toBeInTheDocument();
    expect(btn.className).toMatch(/btn/);
    expect(btn.className).toMatch(/ghost/);
    expect(btn.className).toMatch(/danger|red/);
    // Footer placement: should be inside the editor and below the form-grid.
    const editor = container.querySelector('.user-editor');
    expect(editor?.contains(btn)).toBe(true);
  });

  it('clicking "Disable account" sets status to disabled and emits a confirmation toast', async () => {
    const user = makeUser({ status: 'active' });
    const setToast = vi.fn();
    render(
      withProvider(
        makeState(user),
        <UserEditor user={user} onClose={vi.fn()} setToast={setToast} />,
      ),
    );
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /disable account/i }));
    });
    expect(screen.getByRole('radio', { name: /^disabled$/i }).getAttribute('aria-checked')).toBe('true');
    expect(setToast).toHaveBeenCalledTimes(1);
    const toast = setToast.mock.calls[0]![0];
    expect(toast.title).toMatch(/disabled/i);
  });
});
