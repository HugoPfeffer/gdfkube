import { useCallback, useState } from 'react';
import type { Tweaks } from '../types';

const STORAGE_KEY = 'gdfkube.tweaks';

/**
 * React hook that exposes the user's UI tweaks (density, theme, etc).
 *
 * On first mount, reads `localStorage["gdfkube.tweaks"]`, JSON-parses it, and
 * shallow-merges the result over `defaults`. Invalid/missing storage falls
 * back to `defaults` unchanged.
 *
 * The setter writes the next value back to localStorage.
 */
export function useTweaks(
  defaults: Tweaks,
): [Tweaks, (next: Tweaks) => void] {
  const [tweaks, setTweaksState] = useState<Tweaks>(() => readInitial(defaults));

  const setTweaks = useCallback((next: Tweaks) => {
    setTweaksState(next);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // ignore quota / serialization errors — in-memory state still updates
    }
  }, []);

  return [tweaks, setTweaks];
}

function readInitial(defaults: Tweaks): Tweaks {
  if (typeof localStorage === 'undefined') return defaults;
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return defaults;
  try {
    const parsed = JSON.parse(raw) as Partial<Tweaks>;
    if (parsed && typeof parsed === 'object') {
      return { ...defaults, ...parsed };
    }
    return defaults;
  } catch {
    return defaults;
  }
}
