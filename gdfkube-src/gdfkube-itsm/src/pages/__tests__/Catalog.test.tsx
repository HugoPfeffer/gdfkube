// Component tests for the Service Catalog page.
//
// Covers the spec scenarios for `itsm-service-catalog`:
//   - only `active` forms render (disabled forms are hidden)
//   - the cluster-request tile carries the `featured` modifier class
//   - clicking a tile navigates to `new-request` with `formId`
//   - an unknown form id falls back to generic chrome (icon + description copy)
//   - no filter chips and no Knowledge Base section render
//   - each tile renders a `.meta` row with a clock icon + duration string
//   - empty state renders when no active forms exist

import { fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { GdfDataProvider, type DataState } from '../../state/dataContext';
import type { FormDef } from '../../types';
import { Catalog } from '../Catalog';

function makeForm(overrides: Partial<FormDef> & { id: string; name: string }): FormDef {
  return {
    topic: 'dbz.gdfkube.requests',
    status: 'active',
    ...overrides,
  };
}

function makeState(forms: FormDef[]): DataState {
  return {
    requests: [],
    forms,
    fields: {},
    users: [],
    groups: [],
    templates: {},
  };
}

function withProvider(state: DataState, ui: ReactNode) {
  return <GdfDataProvider initial={state}>{ui}</GdfDataProvider>;
}

describe('Catalog', () => {
  it('renders only active forms (disabled forms are hidden)', () => {
    const navigate = vi.fn();
    const state = makeState([
      makeForm({ id: 'cluster-request', name: 'OpenShift Cluster Request' }),
      makeForm({
        id: 'namespace-request',
        name: 'Namespace Onboarding',
        status: 'disabled',
      }),
      makeForm({ id: 'scale-request', name: 'Cluster Scale Change' }),
    ]);

    render(withProvider(state, <Catalog navigate={navigate} />));

    expect(screen.getByText('OpenShift Cluster Request')).toBeInTheDocument();
    expect(screen.getByText('Cluster Scale Change')).toBeInTheDocument();
    expect(screen.queryByText('Namespace Onboarding')).not.toBeInTheDocument();
  });

  it('marks the cluster-request tile with the `featured` modifier class', () => {
    const navigate = vi.fn();
    const state = makeState([
      makeForm({ id: 'cluster-request', name: 'OpenShift Cluster Request' }),
      makeForm({ id: 'namespace-request', name: 'Namespace Onboarding' }),
    ]);

    const { container } = render(
      withProvider(state, <Catalog navigate={navigate} />),
    );

    const featured = container.querySelector('.cat-tile.featured');
    expect(featured).not.toBeNull();
    expect(featured!.textContent).toContain('OpenShift Cluster Request');

    // The non-featured tile should not have the modifier class.
    const tiles = container.querySelectorAll('.cat-tile');
    const nsTile = Array.from(tiles).find((t) =>
      t.textContent?.includes('Namespace Onboarding'),
    );
    expect(nsTile).toBeDefined();
    expect(nsTile!.classList.contains('featured')).toBe(false);
  });

  it('clicking a tile navigates to new-request with the form id', () => {
    const navigate = vi.fn();
    const state = makeState([
      makeForm({ id: 'cluster-request', name: 'OpenShift Cluster Request' }),
      makeForm({ id: 'namespace-request', name: 'Namespace Onboarding' }),
    ]);

    render(withProvider(state, <Catalog navigate={navigate} />));

    fireEvent.click(screen.getByText('Namespace Onboarding').closest('.cat-tile')!);

    expect(navigate).toHaveBeenCalledWith('new-request', {
      formId: 'namespace-request',
    });
  });

  it('unknown form id falls back to generic icon and generic description', () => {
    const navigate = vi.fn();
    const state = makeState([
      makeForm({ id: 'secret-rotation-v2', name: 'Secret Rotation v2' }),
    ]);

    render(withProvider(state, <Catalog navigate={navigate} />));

    const tile = screen
      .getByText('Secret Rotation v2')
      .closest('.cat-tile') as HTMLElement;
    expect(tile).not.toBeNull();

    // Generic icon present (an svg is rendered inside the icon box).
    expect(tile.querySelector('.icn-box svg')).not.toBeNull();

    // Generic description is derived from the form's name.
    expect(tile.textContent).toContain('Self-service request for Secret Rotation v2');

    // Clicking still routes to new-request with the form id.
    fireEvent.click(tile);
    expect(navigate).toHaveBeenCalledWith('new-request', {
      formId: 'secret-rotation-v2',
    });
  });

  it('does not render filter chips or a Knowledge Base section', () => {
    const navigate = vi.fn();
    const state = makeState([
      makeForm({ id: 'cluster-request', name: 'OpenShift Cluster Request' }),
    ]);

    const { container } = render(
      withProvider(state, <Catalog navigate={navigate} />),
    );

    expect(container.querySelector('.chip')).toBeNull();
    expect(container.querySelector('.filter-chip')).toBeNull();
    expect(screen.queryByText(/Knowledge Base/i)).toBeNull();
  });

  it('renders a `.meta` row with a clock icon and per-id duration string on each tile', () => {
    const navigate = vi.fn();
    const state = makeState([
      makeForm({ id: 'cluster-request', name: 'OpenShift Cluster Request' }),
      makeForm({ id: 'namespace-request', name: 'Namespace Onboarding' }),
      makeForm({ id: 'scale-request', name: 'Cluster Scale Change' }),
      makeForm({ id: 'secret-rotation-v2', name: 'Secret Rotation v2' }),
    ]);

    const { container } = render(
      withProvider(state, <Catalog navigate={navigate} />),
    );

    const tiles = Array.from(
      container.querySelectorAll<HTMLElement>('.cat-tile'),
    );
    expect(tiles).toHaveLength(4);

    const expected: Record<string, string> = {
      'OpenShift Cluster Request': '~3 min',
      'Namespace Onboarding': '~30 sec',
      'Cluster Scale Change': '~1 min',
      'Secret Rotation v2': 'Self-service · varies',
    };

    for (const tile of tiles) {
      const meta = tile.querySelector('.meta');
      expect(meta).not.toBeNull();
      // The meta row contains a clock icon (svg).
      expect(meta!.querySelector('svg')).not.toBeNull();

      const matchingName = Object.keys(expected).find((name) =>
        tile.textContent?.includes(name),
      );
      expect(matchingName).toBeDefined();
      expect(meta!.textContent).toContain(expected[matchingName!]);
    }
  });

  it('renders an empty-state block (and no tiles) when no active forms exist', () => {
    const navigate = vi.fn();
    const state = makeState([
      makeForm({
        id: 'cluster-request',
        name: 'OpenShift Cluster Request',
        status: 'disabled',
      }),
    ]);

    const { container } = render(
      withProvider(state, <Catalog navigate={navigate} />),
    );

    expect(container.querySelector('.cat-tile')).toBeNull();
    expect(
      screen.getByText(/No active forms\. Create a form in the admin portal/i),
    ).toBeInTheDocument();
  });

  it('renders the empty state when state.forms is empty', () => {
    const navigate = vi.fn();
    const state = makeState([]);

    const { container } = render(
      withProvider(state, <Catalog navigate={navigate} />),
    );

    expect(container.querySelector('.cat-tile')).toBeNull();
    expect(screen.getByText(/No active forms/i)).toBeInTheDocument();
  });
});
