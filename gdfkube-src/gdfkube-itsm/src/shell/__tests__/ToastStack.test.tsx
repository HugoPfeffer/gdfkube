import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastStack, type Toast } from '../ToastStack';

const baseToast: Toast = {
  id: 't1',
  kind: 'info',
  title: 'Request submitted',
  body: 'Pending review',
};

describe('ToastStack', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders nothing when toast prop is null', () => {
    const onDismiss = vi.fn();
    const { container } = render(<ToastStack toast={null} onDismiss={onDismiss} />);
    expect(container.querySelector('.toast-stack')).toBeNull();
  });

  it('renders the toast title and body when toast is provided', () => {
    const onDismiss = vi.fn();
    render(<ToastStack toast={baseToast} onDismiss={onDismiss} />);
    expect(screen.getByText('Request submitted')).toBeInTheDocument();
    expect(screen.getByText('Pending review')).toBeInTheDocument();
  });

  it('auto-dismisses after 5s by calling onDismiss', () => {
    const onDismiss = vi.fn();
    render(<ToastStack toast={baseToast} onDismiss={onDismiss} />);

    expect(onDismiss).not.toHaveBeenCalled();
    vi.advanceTimersByTime(4999);
    expect(onDismiss).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('dismisses immediately when the close icon is clicked', () => {
    const onDismiss = vi.fn();
    const { container } = render(<ToastStack toast={baseToast} onDismiss={onDismiss} />);

    const closeBtn = container.querySelector('.toast-close');
    expect(closeBtn).not.toBeNull();
    fireEvent.click(closeBtn!);
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('applies kind class to the toast element', () => {
    const onDismiss = vi.fn();
    const { container, rerender } = render(
      <ToastStack toast={{ ...baseToast, kind: 'success' }} onDismiss={onDismiss} />,
    );
    expect(container.querySelector('.toast.success')).not.toBeNull();

    rerender(<ToastStack toast={{ ...baseToast, kind: 'error' }} onDismiss={onDismiss} />);
    expect(container.querySelector('.toast.error')).not.toBeNull();
  });

  it('only renders a single active toast', () => {
    const onDismiss = vi.fn();
    const { container } = render(<ToastStack toast={baseToast} onDismiss={onDismiss} />);
    expect(container.querySelectorAll('.toast')).toHaveLength(1);
  });

  it('resets the auto-dismiss timer when toast id changes', () => {
    const onDismiss = vi.fn();
    const { rerender } = render(<ToastStack toast={baseToast} onDismiss={onDismiss} />);

    vi.advanceTimersByTime(4000);
    expect(onDismiss).not.toHaveBeenCalled();

    // Replace with a new toast id; previous timer should be cleared.
    rerender(
      <ToastStack
        toast={{ ...baseToast, id: 't2', title: 'Second' }}
        onDismiss={onDismiss}
      />,
    );

    vi.advanceTimersByTime(4999);
    expect(onDismiss).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});
