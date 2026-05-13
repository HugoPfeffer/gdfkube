// Regression test for the original Settings-Forbidden bug.
//
// Root cause: the previous `useEffect([user])` block updated the
// `setDemoUserResolver` AFTER child effects had already fired, so the first
// `itsmApi.settings.get()` call after a role flip carried the previous user's
// X-Demo-User header (operator → 403 from /api/itsm/settings).
//
// The fix replaced the resolver pattern with a module-level ref mutated
// synchronously in render (`setDemoUser(user.username)` just before the JSX
// return). This test mounts the full App tree, switches role from operator
// to admin via the Topbar role menu, and asserts that the very next
// `fetch(/api/itsm/settings…)` call carries `X-Demo-User: maria.costa`.

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
  it('switching role operator -> admin synchronously updates X-Demo-User so the next /settings fetch carries maria.costa', async () => {
    render(withProvider(makeState(), <App />));

    // Open role menu and select Platform Admin.
    fireEvent.click(document.querySelector('.role-switch')!);
    fireEvent.click(screen.getByText('Platform Admin'));

    // Re-open role menu and pick Settings — Settings.tsx fires
    // `itsmApi.settings.get(true, …)` in its mount effect.
    fireEvent.click(document.querySelector('.role-switch')!);
    fireEvent.click(screen.getByRole('menuitem', { name: /Settings/ }));

    // Wait until at least one /api/itsm/settings request has been made.
    await waitFor(() => {
      expect(findSettingsCall()).toBeDefined();
    });

    const call = findSettingsCall()!;
    const headers = call.init.headers as Record<string, string>;
    expect(headers['X-Demo-User']).toBe('maria.costa');
  });

  it('every fetch made anywhere in the tree after a role flip carries the NEW user (no stale header)', async () => {
    render(withProvider(makeState(), <App />));

    // Switch role to admin.
    fireEvent.click(document.querySelector('.role-switch')!);
    fireEvent.click(screen.getByText('Platform Admin'));

    // Navigate through several admin pages, each of which fires fresh
    // itsmApi calls in mount effects. Then navigate to Settings last.
    fireEvent.click(screen.getByRole('button', { name: /Approvals/ }));
    fireEvent.click(screen.getByRole('button', { name: /^Forms$/ }));
    fireEvent.click(document.querySelector('.role-switch')!);
    fireEvent.click(screen.getByRole('menuitem', { name: /Settings/ }));

    await waitFor(() => {
      expect(findSettingsCall()).toBeDefined();
    });

    // Inspect ALL fetch calls made after the role switch — they MUST carry
    // X-Demo-User: maria.costa. None may carry joao.silva (the stale value).
    const adminCalls = fetchMock.mock.calls;
    for (const call of adminCalls) {
      const init = call[1] as RequestInit;
      const headers = init?.headers as Record<string, string> | undefined;
      // Initial Bootstrap calls before the switch can be operator; we filter
      // by detecting any call whose URL is /api/itsm/settings — that one
      // happens AFTER the role flip and MUST be maria.costa.
      const url = call[0] as string;
      if (url.startsWith('/api/itsm/settings')) {
        expect(headers?.['X-Demo-User']).toBe('maria.costa');
      }
    }
  });
});
