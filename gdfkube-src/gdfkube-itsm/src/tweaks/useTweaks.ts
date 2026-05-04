import { useCallback, useState } from 'react';
import type { Tweaks } from '../types';

const STORAGE_KEY = 'gdfkube.tweaks';

export type TweaksUpdater = Tweaks | ((prev: Tweaks) => Tweaks);

/**
 * React hook that exposes the user's UI tweaks (density, theme, etc).
 *
 * On first mount, reads `localStorage["gdfkube.tweaks"]`, JSON-parses it, and
 * shallow-merges the result over `defaults`. Invalid/missing storage falls
 * back to `defaults` unchanged.
 *
 * The setter accepts either a value or a functional updater (mirroring
 * React's `setState`). The resolved final value is persisted to localStorage.
 */
export function useTweaks(
  defaults: Tweaks,
): [Tweaks, (next: TweaksUpdater) => void] {
  const [tweaks, setTweaksState] = useState<Tweaks>(() => readInitial(defaults));

  const setTweaks = useCallback((next: TweaksUpdater) => {
    setTweaksState((prev) => {
      const resolved = typeof next === 'function' ? next(prev) : next;
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(resolved));
      } catch {
        // ignore quota / serialization errors — in-memory state still updates
      }
      return resolved;
    });
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
