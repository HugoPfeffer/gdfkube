import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { useTweaks } from '../useTweaks';
import type { Tweaks } from '../../types';

const defaults: Tweaks = {
  density: 'comfortable',
  theme: 'light',
  sidebarCollapsed: false,
  pipelineSpeed: 1,
  showDemoBanner: true,
};

describe('useTweaks', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('applies defaults on first mount when localStorage is empty', () => {
    const { result } = renderHook(() => useTweaks(defaults));
    expect(result.current[0]).toEqual(defaults);
  });

  it('reads previously stored tweaks from localStorage on mount and shallow-merges over defaults', () => {
    localStorage.setItem(
      'gdfkube.tweaks',
      JSON.stringify({ theme: 'dark', sidebarCollapsed: true }),
    );

    const { result } = renderHook(() => useTweaks(defaults));
    expect(result.current[0]).toEqual({
      ...defaults,
      theme: 'dark',
      sidebarCollapsed: true,
    });
  });

  it('writes the next value back to localStorage when the setter is called', () => {
    const { result } = renderHook(() => useTweaks(defaults));

    act(() => {
      const [, setTweaks] = result.current;
      setTweaks({ ...defaults, theme: 'dark', pipelineSpeed: 2 });
    });

    expect(result.current[0]).toEqual({
      ...defaults,
      theme: 'dark',
      pipelineSpeed: 2,
    });

    const stored = JSON.parse(localStorage.getItem('gdfkube.tweaks') ?? '{}');
    expect(stored).toEqual({ ...defaults, theme: 'dark', pipelineSpeed: 2 });
  });

  it('survives a localStorage round-trip across a fresh hook instance', () => {
    const first = renderHook(() => useTweaks(defaults));
    act(() => {
      first.result.current[1]({ ...defaults, theme: 'dark' });
    });

    const second = renderHook(() => useTweaks(defaults));
    expect(second.result.current[0].theme).toBe('dark');
  });

  it('falls back to defaults if localStorage contains invalid JSON', () => {
    localStorage.setItem('gdfkube.tweaks', '{not-json');
    const { result } = renderHook(() => useTweaks(defaults));
    expect(result.current[0]).toEqual(defaults);
  });
});
