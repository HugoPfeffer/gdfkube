export class ApiError extends Error {
  status: number;
  details?: unknown;
  constructor(status: number, message: string, details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.details = details;
  }
}

// The current X-Demo-User identity is held in a module-level ref that callers
// mutate synchronously via `setDemoUser`. The previous getter-resolver pattern
// was driven by a `useEffect([user])` in App.tsx, which fired AFTER child
// effects — meaning the first `itsmApi.settings.get()` call after a role flip
// carried the stale operator username and returned 403. The ref pattern lets
// `App.tsx` update the identity in its render body, before any child effect
// can fire a fetch.
//
// The default is the seeded admin (`maria.costa`) because `Bootstrap` runs
// before `App` mounts and fetches admin-gated data: `/users`, `/groups`, and
// `/forms?include=disabled`. With an operator default Bootstrap deadlocks on
// 403 and `App` never mounts, so the topbar role switcher can never recover.
// App.tsx synchronously overrides this in its render body the moment it
// mounts (operator role → `joao.silva`), so the admin grace only spans the
// Bootstrap phase.
import type { Role } from '../types';

const demoUserRef = { current: 'maria.costa' };
const demoRoleRef: { current: Role } = { current: 'admin' };

export function setDemoUser(username: string) {
  demoUserRef.current = username;
}

export function setDemoRole(role: Role) {
  demoRoleRef.current = role;
}

function mapId<T extends Record<string, unknown>>(doc: T): T {
  if ('_id' in doc) {
    const { _id, ...rest } = doc as T & { _id: unknown };
    return { ...rest, id: _id } as unknown as T;
  }
  return doc;
}

async function api<T>(
  path: string,
  init: RequestInit & { signal?: AbortSignal } = {},
): Promise<T> {
  const headers: Record<string, string> = {
    'X-Demo-User': demoUserRef.current,
    'X-Demo-Role': demoRoleRef.current,
  };
  if (init.body) {
    headers['Content-Type'] = 'application/json';
  }

  const res = await fetch(path, {
    ...init,
    headers: { ...headers, ...(init.headers as Record<string, string>) },
  });

  if (!res.ok) {
    let details: unknown;
    try {
      details = await res.json();
    } catch {
      /* non-JSON error body */
    }
    const msg =
      typeof details === 'object' && details && 'message' in details
        ? (details as { message: string }).message
        : res.statusText;
    throw new ApiError(res.status, msg, details);
  }

  return res.json() as Promise<T>;
}

type ListParams = Record<string, string>;

function qs(params?: ListParams): string {
  if (!params || Object.keys(params).length === 0) return '';
  return '?' + new URLSearchParams(params).toString();
}

export const itsmApi = {
  requests: {
    list(signal?: AbortSignal) {
      return api<Record<string, unknown>[]>('/api/itsm/requests', { signal }).then(
        (docs) => docs.map(mapId),
      );
    },
    get(id: string, signal?: AbortSignal) {
      return api<Record<string, unknown>>(`/api/itsm/requests/${id}`, { signal }).then(
        mapId,
      );
    },
    create(body: Record<string, unknown>, signal?: AbortSignal) {
      return api<{ id: string }>('/api/itsm/requests', {
        method: 'POST',
        body: JSON.stringify(body),
        signal,
      });
    },
    decide(id: string, body: Record<string, unknown>, signal?: AbortSignal) {
      return api<Record<string, unknown>>(
        `/api/itsm/requests/${id}/approvals`,
        { method: 'POST', body: JSON.stringify(body), signal },
      ).then(mapId);
    },
  },

  forms: {
    list(params?: ListParams, signal?: AbortSignal) {
      return api<Record<string, unknown>[]>(`/api/itsm/forms${qs(params)}`, {
        signal,
      }).then((docs) => docs.map(mapId));
    },
    get(id: string, signal?: AbortSignal) {
      return api<Record<string, unknown>>(`/api/itsm/forms/${id}`, { signal }).then(
        mapId,
      );
    },
    create(body: Record<string, unknown>, signal?: AbortSignal) {
      return api<Record<string, unknown>>('/api/itsm/forms', {
        method: 'POST',
        body: JSON.stringify(body),
        signal,
      }).then(mapId);
    },
    update(id: string, body: Record<string, unknown>, signal?: AbortSignal) {
      return api<Record<string, unknown>>(`/api/itsm/forms/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(body),
        signal,
      }).then(mapId);
    },
  },

  users: {
    list(signal?: AbortSignal) {
      return api<Record<string, unknown>[]>('/api/itsm/users', { signal }).then(
        (docs) => docs.map(mapId),
      );
    },
    get(id: string, signal?: AbortSignal) {
      return api<Record<string, unknown>>(`/api/itsm/users/${id}`, { signal }).then(
        mapId,
      );
    },
    create(body: Record<string, unknown>, signal?: AbortSignal) {
      return api<Record<string, unknown>>('/api/itsm/users', {
        method: 'POST',
        body: JSON.stringify(body),
        signal,
      }).then(mapId);
    },
    update(id: string, body: Record<string, unknown>, signal?: AbortSignal) {
      return api<Record<string, unknown>>(`/api/itsm/users/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(body),
        signal,
      }).then(mapId);
    },
  },

  settings: {
    get(reveal?: boolean, signal?: AbortSignal) {
      const q = reveal ? '?reveal=1' : '';
      return api<Record<string, unknown>>(`/api/itsm/settings${q}`, { signal });
    },
    update(
      body: { endpoint: string; owner: string; token: string },
      signal?: AbortSignal,
    ) {
      return api<Record<string, unknown>>('/api/itsm/settings', {
        method: 'PATCH',
        body: JSON.stringify(body),
        signal,
      });
    },
  },

  groups: {
    list(signal?: AbortSignal) {
      return api<Record<string, unknown>[]>('/api/itsm/groups', { signal }).then(
        (docs) => docs.map(mapId),
      );
    },
    get(id: string, signal?: AbortSignal) {
      return api<Record<string, unknown>>(`/api/itsm/groups/${id}`, { signal }).then(
        mapId,
      );
    },
    create(body: Record<string, unknown>, signal?: AbortSignal) {
      return api<Record<string, unknown>>('/api/itsm/groups', {
        method: 'POST',
        body: JSON.stringify(body),
        signal,
      }).then(mapId);
    },
    update(id: string, body: Record<string, unknown>, signal?: AbortSignal) {
      return api<Record<string, unknown>>(`/api/itsm/groups/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(body),
        signal,
      }).then(mapId);
    },
  },
};
