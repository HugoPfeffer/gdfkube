import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { Tweaks } from '../../types';
import { TweaksPanel } from '../TweaksPanel';

const baseTweaks: Tweaks = {
  density: 'compact',
  theme: 'light',
  sidebarCollapsed: false,
  pipelineSpeed: 1,
  showDemoBanner: true,
};

function renderPanel(overrides: Partial<Parameters<typeof TweaksPanel>[0]> = {}) {
  const setTweaks = vi.fn();
  const onClose = vi.fn();
  const setRole = vi.fn();
  const navigate = vi.fn();
  const tweaks = overrides.tweaks ?? baseTweaks;
  const role = overrides.role ?? 'operator';
  const open = overrides.open ?? true;
  render(
    <TweaksPanel
      open={open}
      tweaks={tweaks}
      setTweaks={overrides.setTweaks ?? setTweaks}
      onClose={overrides.onClose ?? onClose}
      role={role}
      setRole={overrides.setRole ?? setRole}
      navigate={overrides.navigate ?? navigate}
    />,
  );
  return { setTweaks, onClose, setRole, navigate };
}

// Harness mirroring App.tsx: a trigger button that toggles the panel open.
function PanelHarness({
  initialTweaks = baseTweaks,
}: {
  initialTweaks?: Tweaks;
}) {
  const [open, setOpen] = useState(false);
  const [tweaks, setTweaks] = useState<Tweaks>(initialTweaks);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Tweaks
      </button>
      <TweaksPanel
        open={open}
        tweaks={tweaks}
        setTweaks={(updater) =>
          setTweaks((prev) =>
            typeof updater === 'function' ? updater(prev) : updater,
          )
        }
        onClose={() => setOpen(false)}
        role="operator"
        setRole={() => {}}
        navigate={() => {}}
      />
    </>
  );
}

describe('TweaksPanel', () => {
  it('renders nothing when closed', () => {
    renderPanel({ open: false });
    expect(screen.queryByRole('dialog', { name: 'Tweaks' })).toBeNull();
  });

  it('renders all three sections when open', () => {
    renderPanel();
    expect(screen.getByRole('dialog', { name: 'Tweaks' })).toBeInTheDocument();
    expect(screen.getByText('Appearance')).toBeInTheDocument();
    expect(screen.getByText('Demo')).toBeInTheDocument();
    expect(screen.getByText('Quick actions')).toBeInTheDocument();
  });

  it('selecting Dark theme updates tweaks via functional setter', () => {
    const { setTweaks } = renderPanel();
    fireEvent.change(screen.getByLabelText('Theme'), { target: { value: 'dark' } });
    expect(setTweaks).toHaveBeenCalledTimes(1);
    const updater = setTweaks.mock.calls[0]![0];
    expect(typeof updater).toBe('function');
    expect(updater(baseTweaks)).toEqual({ ...baseTweaks, theme: 'dark' });
  });

  it('changing density updates tweaks', () => {
    const { setTweaks } = renderPanel();
    fireEvent.change(screen.getByLabelText('Density'), {
      target: { value: 'comfortable' },
    });
    const updater = setTweaks.mock.calls[0]![0];
    expect(updater(baseTweaks)).toEqual({ ...baseTweaks, density: 'comfortable' });
  });

  it('toggling sidebar collapsed updates tweaks', () => {
    const { setTweaks } = renderPanel();
    fireEvent.click(screen.getByLabelText('Sidebar collapsed'));
    const updater = setTweaks.mock.calls[0]![0];
    expect(updater(baseTweaks)).toEqual({ ...baseTweaks, sidebarCollapsed: true });
  });

  it('pipeline speed slider updates pipelineSpeed', () => {
    const { setTweaks } = renderPanel();
    const slider = screen.getByLabelText(/Pipeline speed/);
    fireEvent.change(slider, { target: { value: '2.5' } });
    const updater = setTweaks.mock.calls[0]![0];
    expect(updater(baseTweaks)).toEqual({ ...baseTweaks, pipelineSpeed: 2.5 });
  });

  it('toggling demo banner updates tweaks', () => {
    const { setTweaks } = renderPanel();
    fireEvent.click(screen.getByLabelText('Show demo banner'));
    const updater = setTweaks.mock.calls[0]![0];
    expect(updater(baseTweaks)).toEqual({ ...baseTweaks, showDemoBanner: false });
  });

  it('"Switch to Admin" button calls setRole("admin") when role is operator', () => {
    const { setRole } = renderPanel({ role: 'operator' });
    fireEvent.click(screen.getByRole('button', { name: 'Switch to Admin' }));
    expect(setRole).toHaveBeenCalledWith('admin');
  });

  it('"Switch to Operator" button calls setRole("operator") when role is admin', () => {
    const { setRole } = renderPanel({ role: 'admin' });
    fireEvent.click(screen.getByRole('button', { name: 'Switch to Operator' }));
    expect(setRole).toHaveBeenCalledWith('operator');
  });

  it('"Open new request flow" navigates to catalog and closes the panel', () => {
    const { navigate, onClose } = renderPanel();
    fireEvent.click(screen.getByRole('button', { name: 'Open new request flow' }));
    expect(navigate).toHaveBeenCalledWith('catalog');
    expect(onClose).toHaveBeenCalled();
  });

  it('close button invokes onClose', () => {
    const { onClose } = renderPanel();
    fireEvent.click(screen.getByRole('button', { name: 'Close tweaks' }));
    expect(onClose).toHaveBeenCalled();
  });

  it('focuses the theme select when opened', () => {
    render(<PanelHarness />);
    const trigger = screen.getByRole('button', { name: 'Tweaks' });
    trigger.focus();
    fireEvent.click(trigger);
    expect(document.activeElement).toBe(screen.getByLabelText('Theme'));
  });

  it('Escape closes the panel and returns focus to the trigger', () => {
    render(<PanelHarness />);
    const trigger = screen.getByRole('button', { name: 'Tweaks' });
    trigger.focus();
    fireEvent.click(trigger);
    expect(screen.getByRole('dialog', { name: 'Tweaks' })).toBeInTheDocument();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByRole('dialog', { name: 'Tweaks' })).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it('Tab from the last focusable element wraps to the first (close button)', () => {
    render(<PanelHarness />);
    const trigger = screen.getByRole('button', { name: 'Tweaks' });
    trigger.focus();
    fireEvent.click(trigger);
    const closeBtn = screen.getByRole('button', { name: 'Close tweaks' });
    const lastButton = screen.getByRole('button', {
      name: 'Open new request flow',
    });
    lastButton.focus();
    expect(document.activeElement).toBe(lastButton);
    fireEvent.keyDown(lastButton, { key: 'Tab' });
    expect(document.activeElement).toBe(closeBtn);
  });

  it('Shift+Tab from the first focusable element wraps to the last', () => {
    render(<PanelHarness />);
    const trigger = screen.getByRole('button', { name: 'Tweaks' });
    trigger.focus();
    fireEvent.click(trigger);
    const closeBtn = screen.getByRole('button', { name: 'Close tweaks' });
    const lastButton = screen.getByRole('button', {
      name: 'Open new request flow',
    });
    closeBtn.focus();
    expect(document.activeElement).toBe(closeBtn);
    fireEvent.keyDown(closeBtn, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(lastButton);
  });
});
