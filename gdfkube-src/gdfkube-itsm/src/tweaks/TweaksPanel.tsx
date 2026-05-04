// Tweaks panel — a fixed-position drawer for in-demo UI tweaks.
//
// Sections:
//   - Appearance: theme, density, sidebar collapsed
//   - Demo: pipeline speed slider, demo banner toggle
//   - Quick actions: role toggle, jump to catalog
//
// The panel only mutates state passed in via props; the App's existing
// `data-theme` effect picks up theme changes automatically.

import { Icons } from '../icons/Icons';
import type { Navigate } from '../router';
import type { Role, Tweaks } from '../types';
import type { TweaksUpdater } from './useTweaks';

interface TweaksPanelProps {
  open: boolean;
  tweaks: Tweaks;
  setTweaks: (next: TweaksUpdater) => void;
  onClose: () => void;
  role: Role;
  setRole: (r: Role) => void;
  navigate: Navigate;
}

export function TweaksPanel({
  open,
  tweaks,
  setTweaks,
  onClose,
  role,
  setRole,
  navigate,
}: TweaksPanelProps) {
  if (!open) return null;

  const switchTo: Role = role === 'admin' ? 'operator' : 'admin';
  const switchLabel =
    switchTo === 'admin' ? 'Switch to Admin' : 'Switch to Operator';

  return (
    <aside
      role="dialog"
      aria-label="Tweaks"
      className="tweaks-panel"
      style={{
        position: 'fixed',
        top: 0,
        right: 0,
        bottom: 0,
        width: 320,
        background: 'var(--paper)',
        borderLeft: '1px solid var(--ink-200)',
        boxShadow: '-8px 0 24px rgba(15, 38, 77, 0.08)',
        zIndex: 300,
        display: 'flex',
        flexDirection: 'column',
        overflowY: 'auto',
      }}
    >
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '14px 16px',
          borderBottom: '1px solid var(--ink-200)',
        }}
      >
        <strong style={{ fontSize: 14, color: 'var(--ink-900)' }}>
          Tweaks
        </strong>
        <button
          type="button"
          className="icon-btn"
          aria-label="Close tweaks"
          onClick={onClose}
        >
          <Icons.x />
        </button>
      </header>

      <section style={{ padding: '14px 16px' }}>
        <h4
          style={{
            margin: '0 0 10px',
            fontSize: 11,
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
            color: 'var(--ink-500)',
            fontWeight: 600,
          }}
        >
          Appearance
        </h4>
        <div className="field" style={{ marginBottom: 10 }}>
          <label htmlFor="tweaks-theme">Theme</label>
          <select
            id="tweaks-theme"
            value={tweaks.theme}
            onChange={(e) => {
              const next = e.target.value as Tweaks['theme'];
              setTweaks((prev) => ({ ...prev, theme: next }));
            }}
          >
            <option value="light">Light</option>
            <option value="dark">Dark</option>
          </select>
        </div>
        <div className="field" style={{ marginBottom: 10 }}>
          <label htmlFor="tweaks-density">Density</label>
          <select
            id="tweaks-density"
            value={tweaks.density}
            onChange={(e) => {
              const next = e.target.value as Tweaks['density'];
              setTweaks((prev) => ({ ...prev, density: next }));
            }}
          >
            <option value="compact">Compact</option>
            <option value="comfortable">Comfortable</option>
          </select>
        </div>
        <label
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            fontSize: 13,
            color: 'var(--ink-800)',
          }}
        >
          <input
            type="checkbox"
            checked={tweaks.sidebarCollapsed}
            onChange={(e) => {
              const next = e.target.checked;
              setTweaks((prev) => ({ ...prev, sidebarCollapsed: next }));
            }}
          />
          Sidebar collapsed
        </label>
      </section>

      <section
        style={{
          padding: '14px 16px',
          borderTop: '1px solid var(--ink-200)',
        }}
      >
        <h4
          style={{
            margin: '0 0 10px',
            fontSize: 11,
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
            color: 'var(--ink-500)',
            fontWeight: 600,
          }}
        >
          Demo
        </h4>
        <div className="field" style={{ marginBottom: 10 }}>
          <label htmlFor="tweaks-pipeline-speed">
            Pipeline speed ({tweaks.pipelineSpeed.toFixed(1)}x)
          </label>
          <input
            id="tweaks-pipeline-speed"
            type="range"
            min={0.5}
            max={4}
            step={0.1}
            value={tweaks.pipelineSpeed}
            onChange={(e) => {
              const next = Number(e.target.value);
              setTweaks((prev) => ({ ...prev, pipelineSpeed: next }));
            }}
          />
        </div>
        <label
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            fontSize: 13,
            color: 'var(--ink-800)',
          }}
        >
          <input
            type="checkbox"
            checked={tweaks.showDemoBanner}
            onChange={(e) => {
              const next = e.target.checked;
              setTweaks((prev) => ({ ...prev, showDemoBanner: next }));
            }}
          />
          Show demo banner
        </label>
      </section>

      <section
        style={{
          padding: '14px 16px',
          borderTop: '1px solid var(--ink-200)',
        }}
      >
        <h4
          style={{
            margin: '0 0 10px',
            fontSize: 11,
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
            color: 'var(--ink-500)',
            fontWeight: 600,
          }}
        >
          Quick actions
        </h4>
        <button
          type="button"
          className="btn"
          style={{ width: '100%', marginBottom: 8 }}
          onClick={() => setRole(switchTo)}
        >
          {switchLabel}
        </button>
        <button
          type="button"
          className="btn"
          style={{ width: '100%' }}
          onClick={() => {
            navigate('catalog');
            onClose();
          }}
        >
          Open new request flow
        </button>
      </section>
    </aside>
  );
}

export default TweaksPanel;
