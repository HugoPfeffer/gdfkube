import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
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

describe('Topbar', () => {
  it('renders breadcrumbs from prop with separators and marks last as current', () => {
    const setRole = vi.fn();
    const { container } = render(
      <Topbar
        crumbs={['Home', 'Service Catalog', 'OpenShift Cluster']}
        role="operator"
        setRole={setRole}
        user={makeUser()}
      />,
    );

    const crumbs = container.querySelector('.crumbs');
    expect(crumbs).not.toBeNull();
    // Last item is .current
    const current = crumbs!.querySelector('.current');
    expect(current?.textContent).toBe('OpenShift Cluster');
    // Earlier items are anchors
    const anchors = crumbs!.querySelectorAll('a');
    expect(anchors).toHaveLength(2);
    expect(anchors[0]?.textContent).toBe('Home');
    expect(anchors[1]?.textContent).toBe('Service Catalog');
    // Two separators between three crumbs
    const seps = crumbs!.querySelectorAll('.sep');
    expect(seps).toHaveLength(2);
  });

  it('does not render the role menu by default', () => {
    const setRole = vi.fn();
    render(
      <Topbar
        crumbs={['Home']}
        role="operator"
        setRole={setRole}
        user={makeUser()}
      />,
    );

    expect(screen.queryByText('Switch role')).not.toBeInTheDocument();
  });

  it('opens the role menu when the role switcher is clicked', () => {
    const setRole = vi.fn();
    const { container } = render(
      <Topbar
        crumbs={['Home']}
        role="operator"
        setRole={setRole}
        user={makeUser()}
      />,
    );

    fireEvent.click(container.querySelector('.role-switch')!);
    expect(screen.getByText('Switch role')).toBeInTheDocument();
    expect(screen.getByText('Operator')).toBeInTheDocument();
    expect(screen.getByText('Platform Admin')).toBeInTheDocument();
  });

  it('clicking a role menu item calls setRole and closes the menu', () => {
    const setRole = vi.fn();
    const { container } = render(
      <Topbar
        crumbs={['Home']}
        role="operator"
        setRole={setRole}
        user={makeUser()}
      />,
    );

    fireEvent.click(container.querySelector('.role-switch')!);
    fireEvent.click(screen.getByText('Platform Admin'));
    expect(setRole).toHaveBeenCalledWith('admin' satisfies Role);
    // Menu closed
    expect(screen.queryByText('Switch role')).not.toBeInTheDocument();
  });

  it('pressing Escape closes the role menu', () => {
    const setRole = vi.fn();
    const { container } = render(
      <Topbar
        crumbs={['Home']}
        role="operator"
        setRole={setRole}
        user={makeUser()}
      />,
    );

    fireEvent.click(container.querySelector('.role-switch')!);
    expect(screen.getByText('Switch role')).toBeInTheDocument();

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByText('Switch role')).not.toBeInTheDocument();
  });

  it('clicking outside closes the role menu', () => {
    const setRole = vi.fn();
    const { container } = render(
      <Topbar
        crumbs={['Home']}
        role="operator"
        setRole={setRole}
        user={makeUser()}
      />,
    );

    fireEvent.click(container.querySelector('.role-switch')!);
    expect(screen.getByText('Switch role')).toBeInTheDocument();

    // Outside click via mousedown on document body (matches component handler).
    fireEvent.mouseDown(document.body);
    expect(screen.queryByText('Switch role')).not.toBeInTheDocument();
  });

  it('shows admin-aware role label and user.group in the switcher line', () => {
    const setRole = vi.fn();
    const { container, rerender } = render(
      <Topbar
        crumbs={['Home']}
        role="operator"
        setRole={setRole}
        user={makeUser({ group: 'saude' })}
      />,
    );
    const opRoleLine = container.querySelector('.role-switch .who .role');
    expect(opRoleLine?.textContent).toContain('saude');
    expect(opRoleLine?.textContent).toContain('Operator');

    rerender(
      <Topbar
        crumbs={['Home']}
        role="admin"
        setRole={setRole}
        user={makeUser({ role: 'admin', group: 'setic' })}
      />,
    );
    const adminRoleLine = container.querySelector('.role-switch .who .role');
    expect(adminRoleLine?.textContent).toContain('setic');
    expect(adminRoleLine?.textContent).toContain('Platform Admin');
  });

  it('renders avatar initials from fullName (first letter of first two words)', () => {
    const setRole = vi.fn();
    const { container } = render(
      <Topbar
        crumbs={['Home']}
        role="operator"
        setRole={setRole}
        user={makeUser({ fullName: 'João Silva' })}
      />,
    );

    const avatar = container.querySelector('.avatar');
    expect(avatar?.textContent).toBe('JS');
  });

  it('falls back to name when fullName is absent for initials', () => {
    const setRole = vi.fn();
    const u = makeUser({ name: 'Maria Costa' });
    delete (u as { fullName?: string }).fullName;
    const { container } = render(
      <Topbar crumbs={['Home']} role="operator" setRole={setRole} user={u} />,
    );

    const avatar = container.querySelector('.avatar');
    expect(avatar?.textContent).toBe('MC');
  });

  it('calls onNotify when the bell icon button is clicked', () => {
    const setRole = vi.fn();
    const onNotify = vi.fn();
    const { container } = render(
      <Topbar
        crumbs={['Home']}
        role="operator"
        setRole={setRole}
        user={makeUser()}
        onNotify={onNotify}
      />,
    );

    const bellBtn = container.querySelector('button[title="Notifications"]')!;
    fireEvent.click(bellBtn);
    expect(onNotify).toHaveBeenCalled();
  });

  it('renders search input with ⌘K hint', () => {
    const setRole = vi.fn();
    const { container } = render(
      <Topbar
        crumbs={['Home']}
        role="operator"
        setRole={setRole}
        user={makeUser()}
      />,
    );

    const input = container.querySelector('.search input');
    expect(input).not.toBeNull();
    const kbd = container.querySelector('.search kbd');
    expect(kbd?.textContent).toBe('⌘K');
  });
});
