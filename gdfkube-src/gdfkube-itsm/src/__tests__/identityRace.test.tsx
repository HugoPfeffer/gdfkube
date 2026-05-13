// Regression test for the original Settings-Forbidden bug.
//
// Root cause: the previous `useEffect([user])` block updated the
// `setDemoUserResolver` AFTER child effects had already fired, so the first
// `itsmApi.settings.get()` call after a role flip carried the previous user's
// X-Demo-User header (operator → 403 from /api/itsm/settings).
//
// The fix replaced the resolver pattern with module-level refs mutated
// synchronously in render (`setDemoUser` + `setDemoRole` in the render body).
// After the user/role split, switching role no longer changes the active user
// — instead the X-Demo-Role header is updated, and the server honors the
// override via the cloned demoUser. These tests verify that the headers are
// updated synchronously after a role flip.

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from '../App';
import { GdfDataProvider, type DataState } from '../state/dataContext';
import type { FormDef, User } from '../types';

function makeUser(overrides: Partial<User> = {}): User {
  return {
    id: 'u-test',
    name: 'Test User',
    email: 'test@example.gov',
    role: 'operator',
    ...overrides,
  };
}

function makeForm(overrides: Partial<FormDef> = {}): FormDef {
  return {
    id: 'cluster-request',
    name: 'OpenShift Cluster Request',
    topic: 'dbz.gdfkube.requests',
    status: 'active',
    ...overrides,
  };
}

function makeState(overrides: Partial<DataState> = {}): DataState {
  return {
    requests: [],
    forms: [makeForm()],
    fields: {},
    users: [
      makeUser({
        id: '1',
        username: 'joao.silva',
        name: 'João Silva',
        fullName: 'João Silva',
        email: 'joao.silva@saude.gov',
        role: 'operator',
        group: 'saude',
      }),
      makeUser({
        id: '2',
        username: 'maria.costa',
        name: 'Maria Costa',
        fullName: 'Maria Costa',
        email: 'm.costa@setic.gov',
        role: 'admin',
        group: 'setic',
      }),
    ],
    groups: [],
    templates: {},
    ...overrides,
  };
}

function withProvider(state: DataState, ui: ReactNode) {
  return <GdfDataProvider initial={state}>{ui}</GdfDataProvider>;
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn();
  fetchMock.mockImplementation((url: string) => {
    const body: unknown = url.includes('/api/itsm/settings')
      ? { endpoint: '', owner: '', token: '' }
      : [];
    return Promise.resolve({
      ok: true,
      status: 200,
      json: () => Promise.resolve(body),
    } as Response);
  });
  vi.stubGlobal('fetch', fetchMock);
  localStorage.clear();
  document.documentElement.removeAttribute('data-theme');
});

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
  document.documentElement.removeAttribute('data-theme');
});

function findSettingsCall(): { url: string; init: RequestInit } | undefined {
  for (const call of fetchMock.mock.calls) {
    const url = call[0] as string;
    if (url.startsWith('/api/itsm/settings')) {
      return { url, init: call[1] as RequestInit };
    }
  }
  return undefined;
}

describe('Demo-user identity race (regression: Settings Forbidden)', () => {
  it('switching role operator -> admin synchronously updates X-Demo-Role so the next /settings fetch carries admin', async () => {
    render(withProvider(makeState(), <App />));

    fireEvent.click(document.querySelector('.role-switch')!);
    fireEvent.click(screen.getByText('Admin perspective'));

    fireEvent.click(document.querySelector('.role-switch')!);
    fireEvent.click(screen.getByRole('menuitem', { name: /Settings/ }));

    await waitFor(() => {
      expect(findSettingsCall()).toBeDefined();
    });

    const call = findSettingsCall()!;
    const headers = call.init.headers as Record<string, string>;
    expect(headers['X-Demo-User']).toBe('joao.silva');
    expect(headers['X-Demo-Role']).toBe('admin');
  });

  it('every fetch after a role flip carries X-Demo-Role: admin (no stale header)', async () => {
    render(withProvider(makeState(), <App />));

    fireEvent.click(document.querySelector('.role-switch')!);
    fireEvent.click(screen.getByText('Admin perspective'));

    fireEvent.click(screen.getByRole('button', { name: /Approvals/ }));
    fireEvent.click(screen.getByRole('button', { name: /^Forms$/ }));
    fireEvent.click(document.querySelector('.role-switch')!);
    fireEvent.click(screen.getByRole('menuitem', { name: /Settings/ }));

    await waitFor(() => {
      expect(findSettingsCall()).toBeDefined();
    });

    for (const call of fetchMock.mock.calls) {
      const url = call[0] as string;
      if (url.startsWith('/api/itsm/settings')) {
        const init = call[1] as RequestInit;
        const headers = init?.headers as Record<string, string> | undefined;
        expect(headers?.['X-Demo-User']).toBe('joao.silva');
        expect(headers?.['X-Demo-Role']).toBe('admin');
      }
    }
  });
});
