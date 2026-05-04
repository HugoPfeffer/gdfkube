import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { copyToClipboard } from '../clipboard';

describe('copyToClipboard', () => {
  let originalClipboard: typeof navigator.clipboard | undefined;
  let originalExecCommand: typeof document.execCommand;

  beforeEach(() => {
    originalClipboard = navigator.clipboard;
    originalExecCommand = document.execCommand;
  });

  afterEach(() => {
    if (originalClipboard) {
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: originalClipboard,
      });
    } else {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      delete (navigator as any).clipboard;
    }
    document.execCommand = originalExecCommand;
    vi.restoreAllMocks();
  });

  it('uses navigator.clipboard.writeText when available', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });

    await copyToClipboard('hello');
    expect(writeText).toHaveBeenCalledWith('hello');
  });

  it('falls back to textarea + execCommand when writeText rejects', async () => {
    const writeText = vi.fn().mockRejectedValue(new Error('denied'));
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });

    const execCommand = vi.fn().mockReturnValue(true);
    document.execCommand = execCommand as unknown as typeof document.execCommand;

    const appendSpy = vi.spyOn(document.body, 'appendChild');
    const removeSpy = vi.spyOn(document.body, 'removeChild');

    await copyToClipboard('fallback-text');

    expect(writeText).toHaveBeenCalledWith('fallback-text');
    expect(execCommand).toHaveBeenCalledWith('copy');

    // a textarea was appended and then removed
    const appended = appendSpy.mock.calls[0]?.[0] as HTMLTextAreaElement;
    expect(appended).toBeInstanceOf(HTMLTextAreaElement);
    expect(appended.value).toBe('fallback-text');
    expect(removeSpy).toHaveBeenCalledWith(appended);
  });

  it('falls back to textarea path when navigator.clipboard is undefined', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (navigator as any).clipboard;

    const execCommand = vi.fn().mockReturnValue(true);
    document.execCommand = execCommand as unknown as typeof document.execCommand;

    await copyToClipboard('no-api');
    expect(execCommand).toHaveBeenCalledWith('copy');
  });

  it('returns a resolved promise (does not throw) even on fallback', async () => {
    const writeText = vi.fn().mockRejectedValue(new Error('denied'));
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });
    document.execCommand = vi.fn().mockReturnValue(true) as unknown as typeof document.execCommand;

    await expect(copyToClipboard('x')).resolves.toBeUndefined();
  });
});
