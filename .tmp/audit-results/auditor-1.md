## Auditor 1 — App Shell & Tweaks

### Summary
The shell DOM scaffolding (UtilityBand, Sidebar, Topbar) is largely faithful to the reference with sensible accessibility upgrades (button semantics, escape-to-close menu). However, App.tsx introduces an entire parallel layout system (`.app-shell`, `.shell`, `.main-col`, `.density-*`, `.banner`) that has no CSS support and is incompatible with the reference grid (`.app` with named grid-areas). The TweaksPanel is a complete rewrite — it does not implement the documented host-message protocol, the `twk-*` design language, drag-positioning, or any of the typed control helpers (`TweakSlider`, `TweakRadio`, etc.) shipped by the reference. Several minor classes referenced by impl JSX (`menu-check`, `toast-icon`, `toast-close`, `page-placeholder`) are unstyled.

### P0 — Critical (broken or missing core behavior)
- **App shell layout uses non-existent classes** — `App.tsx:166-192` wraps everything in `.app-shell density-* banner` + `.shell` + `.main-col`; ref shell.jsx + styles.css:87-95 expect `.app` grid with `grid-template-areas: "utility utility" "sidebar topbar" "sidebar main"`. Impl `styles.css:87` defines only `.app`, never `.app-shell`/`.shell`/`.main-col` → grid layout is dead and the page won't lay out as designed.
- **Density tweak has no effect** — App.tsx:162 emits `density-compact|comfortable`, but ref styles.css:96 keys density off `.app[data-density="compact"]`; impl styles.css:96 keeps the same selector. No `.density-*` rules exist anywhere.
- **TweaksPanel is a different component** — `TweaksPanel.tsx:42-238` ships a right-edge full-height drawer with hand-rolled `<select>`/`<input>` controls; ref `tweaks-panel.jsx:160-246` is a 280px floating glass panel using `twk-*` classes, drag-to-reposition, and a host postMessage protocol (`__activate_edit_mode`, `__edit_mode_set_keys`, `__edit_mode_dismissed`). Entire visual + behavioral contract diverges.
- **Tweak controls library missing** — Ref exports `TweakSection/Row/Slider/Toggle/Radio/Select/Text/Number/Color/Button` (tweaks-panel.jsx:250-419) and the inline `__TWEAKS_STYLE`. Impl ships none of these and reimplements with native form controls inline.

### P1 — High (clear regression vs reference)
- **Host protocol absent in `useTweaks`** — Ref `tweaks-panel.jsx:139-151` posts `__edit_mode_set_keys` to `window.parent` on every change so the host can rewrite the EDITMODE block. Impl `useTweaks.ts:23-33` persists to localStorage instead — silently drops the host integration the ref doc explicitly calls out.
- **Tweaks toggle button is hand-rolled** — `App.tsx:194-207` adds a fixed "Tweaks" button. Ref expects no in-app trigger; the host toolbar fires `__activate_edit_mode` and the panel reveals itself (`tweaks-panel.jsx:192-201`). The fixed button overlaps the panel's intended position (right:16/bottom:16).
- **Sidebar nav uses `<button>` where ref uses `<div>`** — `Sidebar.tsx:100-112` switches to `<button>` (good a11y) but introduces no parity flag; visual is fine, but several test selectors and bundled CSS hovers depend on `.nav-item` div semantics.
- **Unstyled classes referenced by JSX** — `ToastStack.tsx:41,48` uses `.toast-icon` and `.toast-close`; `Topbar.tsx:137,156` uses `.menu-check`; impl styles.css has no rules for any of them. Toast close button has no styling and `menu-check` produces an unaligned check.
- **Sidebar collapse can't be toggled by user** — Ref shell.jsx accepts `collapsed` from outside but offers no toggle either; impl exposes it only via `tweaks.sidebarCollapsed` checkbox in the (broken) tweaks drawer.

### P2 — Medium (visible drift, content/styling/tokens)
- **`role-switch` becomes a button** — `Topbar.tsx:90-105` renders `<button class="role-switch">`; ref shell.jsx:94-101 uses a `<div onClick>`. The CSS rule at styles.css:250 sets `border` and `padding` assuming a div (no default button reset).
- **Menu items are mixed div/button** — `Topbar.tsx:120-157` uses `<button role="menuitem">` for role choices but `<div className="menu-item">` for Preferences/Sign out (lines 159-165). Inconsistent semantics; ref uses divs throughout (shell.jsx:113-116).
- **Unused `IconName` re-export & `aria-hidden` on icons** — `Icons.tsx:48` adds `aria-hidden="true"` on every svg; ref icons.jsx:3 omits it. Downstream icon-only buttons (Topbar refresh/notifications) rely on `title` alone for SR labels — those buttons have no `aria-label` (`Topbar.tsx:77-88`).
- **`.banner` reused for two purposes** — App.tsx:163 appends `banner` to the shell class for the demo banner toggle, but `.banner` (styles.css:619) is the inline gradient banner component. Class collision; toggling `showDemoBanner` likely produces a navy gradient as the entire app body.
- **Tweaks panel has no focus management** — TweaksPanel.tsx:42-60 sets `role="dialog"` but no focus trap, no return-focus on close, no Escape handler.
- **`page-placeholder` unstyled** — App.tsx:158 renders `<div className="page-placeholder">` for unhandled routes; styles.css has no rule.

### P3 — Low (nits, naming, minor a11y)
- **My Requests badge value drifts from ref** — `Sidebar.tsx:39-47` derives badge from operator's own approval/provisioning count vs ref shell.jsx:19 hardcoded `3`.
- **Approvals badge gating** — `Sidebar.tsx:67` parity ✓ confirmed.
- **`role-switch` open icon doesn't rotate** — Both ref and impl render a static `chevronDown`.
- **Topbar crumb links are `<a href="#">`** — Identical to ref but accessibility-wise unactionable.
- **`ToastStack` uses `role="status"` aria-live="polite"** — Not in ref bundle; reasonable. Auto-dismiss `5000ms` (ToastStack.tsx:26) is a new constant.
- **Brand mark accent bar** — Both share `.brand-mark::after` (styles.css:150). Confirmed parity.

### Out-of-scope observations
- The HTML static export at `/workspace/.tmp/handoff/gdfkube-remix/project/gdfkube ITSM Portal.html` uses the `.app` grid root, confirming `.app-shell` is invented by the React port.
- Reference `tweaks-panel.jsx` describes itself as a host-iframe protocol component; entire iframe-edit-mode workflow is missing from the React app — likely intentional product decision but worth surfacing.
- `useTweaks.ts` storage key (`gdfkube.tweaks`) and shape (`Tweaks` type) are project-specific and don't match the ref's free-form `defaults` object.
