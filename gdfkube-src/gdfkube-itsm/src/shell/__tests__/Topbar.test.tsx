import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Role, User } from '../../types';
import { Topbar } from '../Topbar';

function makeUser(overrides: Partial<User> = {}): User {
  return {
    id: 'u-1',
    name: 'João Silva',
    fullName: 'João Silva',
    email: 'joao.silva@example.gov',
    role: 'operator',
    group: 'saude',
    ...overrides,
  };
}

const defaultUsers: User[] = [
  makeUser(),
  makeUser({
    id: 'u-2',
    name: 'Maria Costa',
    fullName: 'Maria Costa',
    email: 'm.costa@setic.gov',
    role: 'admin',
    group: 'setic',
    username: 'maria.costa',
  }),
];

describe('Topbar', () => {
  const navigate = vi.fn();
  const setRole = vi.fn();
  const setUser = vi.fn();

  beforeEach(() => {
    navigate.mockClear();
    setRole.mockClear();
    setUser.mockClear();
  });

  function renderTopbar(overrides: Partial<Parameters<typeof Topbar>[0]> = {}) {
    return render(
      <Topbar
        crumbs={['Home']}
        role="operator"
        setRole={setRole}
        user={makeUser()}
        users={defaultUsers}
        setUser={setUser}
        navigate={navigate}
        {...overrides}
      />,
    );
  }

  it('renders breadcrumbs from prop with separators and marks last as current', () => {
    const { container } = renderTopbar({
      crumbs: ['Home', 'Service Catalog', 'OpenShift Cluster'],
    });

    const crumbs = container.querySelector('.crumbs');
    expect(crumbs).not.toBeNull();
    const current = crumbs!.querySelector('.current');
    expect(current?.textContent).toBe('OpenShift Cluster');
    const anchors = crumbs!.querySelectorAll('a');
    expect(anchors).toHaveLength(2);
    expect(anchors[0]?.textContent).toBe('Home');
    expect(anchors[1]?.textContent).toBe('Service Catalog');
    const seps = crumbs!.querySelectorAll('.sep');
    expect(seps).toHaveLength(2);
  });

  it('does not render the role menu by default', () => {
    renderTopbar();
    expect(screen.queryByText('Switch role')).not.toBeInTheDocument();
  });

  it('opens the menu with Switch user and Switch role sections', () => {
    const { container } = renderTopbar();

    fireEvent.click(container.querySelector('.role-switch')!);
    expect(screen.getByText('Switch user')).toBeInTheDocument();
    expect(screen.getByText('Switch role')).toBeInTheDocument();
    expect(screen.getByText('Operator perspective')).toBeInTheDocument();
    expect(screen.getByText('Admin perspective')).toBeInTheDocument();
  });

  it('clicking a role menu item calls setRole and closes the menu', () => {
    const { container } = renderTopbar();

    fireEvent.click(container.querySelector('.role-switch')!);
    fireEvent.click(screen.getByText('Admin perspective'));
    expect(setRole).toHaveBeenCalledWith('admin' satisfies Role);
    expect(screen.queryByText('Switch role')).not.toBeInTheDocument();
  });

  it('pressing Escape closes the role menu', () => {
    const { container } = renderTopbar();

    fireEvent.click(container.querySelector('.role-switch')!);
    expect(screen.getByText('Switch role')).toBeInTheDocument();

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByText('Switch role')).not.toBeInTheDocument();
  });

  it('clicking outside closes the role menu', () => {
    const { container } = renderTopbar();

    fireEvent.click(container.querySelector('.role-switch')!);
    expect(screen.getByText('Switch role')).toBeInTheDocument();

    fireEvent.mouseDown(document.body);
    expect(screen.queryByText('Switch role')).not.toBeInTheDocument();
  });

  it('shows admin-aware role label and user.group in the switcher line', () => {
    const { container, rerender } = renderTopbar({
      user: makeUser({ group: 'saude' }),
    });
    const opRoleLine = container.querySelector('.role-switch .who .role');
    expect(opRoleLine?.textContent).toContain('saude');
    expect(opRoleLine?.textContent).toContain('Operator');

    rerender(
      <Topbar
        crumbs={['Home']}
        role="admin"
        setRole={setRole}
        user={makeUser({ role: 'admin', group: 'setic' })}
        users={defaultUsers}
        setUser={setUser}
        navigate={navigate}
      />,
    );
    const adminRoleLine = container.querySelector('.role-switch .who .role');
    expect(adminRoleLine?.textContent).toContain('setic');
    expect(adminRoleLine?.textContent).toContain('Platform Admin');
  });

  it('renders avatar initials from fullName (first letter of first two words)', () => {
    const { container } = renderTopbar({
      user: makeUser({ fullName: 'João Silva' }),
    });

    const avatar = container.querySelector('.avatar');
    expect(avatar?.textContent).toBe('JS');
  });

  it('falls back to name when fullName is absent for initials', () => {
    const u = makeUser({ name: 'Maria Costa' });
    delete (u as { fullName?: string }).fullName;
    const { container } = renderTopbar({ user: u });

    const avatar = container.querySelector('.avatar');
    expect(avatar?.textContent).toBe('MC');
  });

  it('calls onNotify when the bell icon button is clicked', () => {
    const onNotify = vi.fn();
    const { container } = renderTopbar({ onNotify });

    const bellBtn = container.querySelector('button[title="Notifications"]')!;
    fireEvent.click(bellBtn);
    expect(onNotify).toHaveBeenCalled();
  });

  it('renders search input with ⌘K hint', () => {
    const { container } = renderTopbar();

    const input = container.querySelector('.search input');
    expect(input).not.toBeNull();
    const kbd = container.querySelector('.search kbd');
    expect(kbd?.textContent).toBe('⌘K');
  });

  it('shows Settings item with cog icon in the user dropdown', () => {
    const { container } = renderTopbar();

    fireEvent.click(container.querySelector('.role-switch')!);
    expect(screen.getByText('Settings')).toBeInTheDocument();
    expect(screen.queryByText('Preferences')).not.toBeInTheDocument();
  });

  it('clicking Settings calls navigate("settings") and closes the dropdown', () => {
    const { container } = renderTopbar();

    fireEvent.click(container.querySelector('.role-switch')!);
    const settingsBtn = screen.getByRole('menuitem', { name: /settings/i });
    fireEvent.click(settingsBtn);
    expect(navigate).toHaveBeenCalledOnce();
    expect(navigate).toHaveBeenCalledWith('settings');
    expect(screen.queryByText('Settings')).not.toBeInTheDocument();
  });

  it('Settings button has role="menuitem"', () => {
    const { container } = renderTopbar();

    fireEvent.click(container.querySelector('.role-switch')!);
    const settingsBtn = screen.getByRole('menuitem', { name: /settings/i });
    expect(settingsBtn).toBeInTheDocument();
  });
});
