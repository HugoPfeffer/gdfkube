import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError, itsmApi, setDemoUserResolver } from '../itsmApi';

function ok(body: unknown, status = 200): Response {
  return {
    ok: true,
    status,
    json: () => Promise.resolve(body),
  } as Response;
}

function err(status: number, body?: unknown): Response {
  return {
    ok: false,
    status,
    statusText: 'Error',
    json: () => (body ? Promise.resolve(body) : Promise.reject(new Error('no body'))),
  } as Response;
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
  setDemoUserResolver(() => 'maria.costa');
});

afterEach(() => {
  vi.restoreAllMocks();
});

function lastCallInit(): RequestInit {
  return fetchMock.mock.calls[0]![1] as RequestInit;
}

function lastCallPath(): string {
  return fetchMock.mock.calls[0]![0] as string;
}

describe('itsmApi', () => {
  describe('requests namespace', () => {
    it('list fetches /api/itsm/requests and maps _id to id', async () => {
      fetchMock.mockResolvedValueOnce(ok([{ _id: 'REQ1', status: 'approval' }]));
      const result = await itsmApi.requests.list();
      expect(lastCallPath()).toBe('/api/itsm/requests');
      expect(result).toEqual([{ id: 'REQ1', status: 'approval' }]);
    });

    it('get fetches /api/itsm/requests/:id and maps _id to id', async () => {
      fetchMock.mockResolvedValueOnce(ok({ _id: 'REQ1', status: 'approval' }));
      const result = await itsmApi.requests.get('REQ1');
      expect(lastCallPath()).toBe('/api/itsm/requests/REQ1');
      expect(result).toEqual({ id: 'REQ1', status: 'approval' });
    });

    it('create POSTs thin body and returns { id }', async () => {
      fetchMock.mockResolvedValueOnce(ok({ id: 'REQ-NEW' }));
      const body = { formId: 'cluster-request', env: 'production', vars: {} };
      const result = await itsmApi.requests.create(body);
      expect(lastCallPath()).toBe('/api/itsm/requests');
      expect(lastCallInit().method).toBe('POST');
      expect(JSON.parse(lastCallInit().body as string)).toEqual(body);
      expect(result).toEqual({ id: 'REQ-NEW' });
    });

    it('decide POSTs to /api/itsm/requests/:id/approvals and maps _id', async () => {
      fetchMock.mockResolvedValueOnce(ok({ _id: 'REQ1', status: 'provisioning' }));
      const result = await itsmApi.requests.decide('REQ1', { action: 'approved' });
      expect(lastCallPath()).toBe('/api/itsm/requests/REQ1/approvals');
      expect(lastCallInit().method).toBe('POST');
      expect(result).toEqual({ id: 'REQ1', status: 'provisioning' });
    });
  });

  describe('forms namespace', () => {
    it('list fetches /api/itsm/forms and maps _id', async () => {
      fetchMock.mockResolvedValueOnce(ok([{ _id: 'f1', name: 'Form A' }]));
      const result = await itsmApi.forms.list();
      expect(lastCallPath()).toBe('/api/itsm/forms');
      expect(result).toEqual([{ id: 'f1', name: 'Form A' }]);
    });

    it('list passes query params', async () => {
      fetchMock.mockResolvedValueOnce(ok([]));
      await itsmApi.forms.list({ include: 'disabled' });
      expect(lastCallPath()).toBe('/api/itsm/forms?include=disabled');
    });

    it('get fetches /api/itsm/forms/:id', async () => {
      fetchMock.mockResolvedValueOnce(ok({ _id: 'f1', name: 'Form A' }));
      const result = await itsmApi.forms.get('f1');
      expect(lastCallPath()).toBe('/api/itsm/forms/f1');
      expect(result).toEqual({ id: 'f1', name: 'Form A' });
    });

    it('create POSTs and maps _id', async () => {
      fetchMock.mockResolvedValueOnce(ok({ _id: 'f2', name: 'New' }));
      const result = await itsmApi.forms.create({ name: 'New', topic: 't' });
      expect(lastCallInit().method).toBe('POST');
      expect(result).toEqual({ id: 'f2', name: 'New' });
    });

    it('update PATCHes /api/itsm/forms/:id', async () => {
      fetchMock.mockResolvedValueOnce(ok({ _id: 'f1', name: 'Updated' }));
      const result = await itsmApi.forms.update('f1', { name: 'Updated' });
      expect(lastCallPath()).toBe('/api/itsm/forms/f1');
      expect(lastCallInit().method).toBe('PATCH');
      expect(result).toEqual({ id: 'f1', name: 'Updated' });
    });
  });

  describe('users namespace', () => {
    it('list fetches and maps _id', async () => {
      fetchMock.mockResolvedValueOnce(ok([{ _id: 'u1', name: 'A' }]));
      const result = await itsmApi.users.list();
      expect(result).toEqual([{ id: 'u1', name: 'A' }]);
    });

    it('get fetches and maps _id', async () => {
      fetchMock.mockResolvedValueOnce(ok({ _id: 'u1', name: 'A' }));
      const result = await itsmApi.users.get('u1');
      expect(result).toEqual({ id: 'u1', name: 'A' });
    });

    it('create POSTs and maps _id', async () => {
      fetchMock.mockResolvedValueOnce(ok({ _id: 'u2', name: 'B' }));
      const result = await itsmApi.users.create({ name: 'B' });
      expect(lastCallInit().method).toBe('POST');
      expect(result).toEqual({ id: 'u2', name: 'B' });
    });

    it('update PATCHes and maps _id', async () => {
      fetchMock.mockResolvedValueOnce(ok({ _id: 'u1', name: 'C' }));
      const result = await itsmApi.users.update('u1', { name: 'C' });
      expect(lastCallInit().method).toBe('PATCH');
      expect(result).toEqual({ id: 'u1', name: 'C' });
    });
  });

  describe('groups namespace', () => {
    it('list fetches and maps _id', async () => {
      fetchMock.mockResolvedValueOnce(ok([{ _id: 'g1', name: 'G' }]));
      const result = await itsmApi.groups.list();
      expect(result).toEqual([{ id: 'g1', name: 'G' }]);
    });

    it('get fetches and maps _id', async () => {
      fetchMock.mockResolvedValueOnce(ok({ _id: 'g1', name: 'G' }));
      const result = await itsmApi.groups.get('g1');
      expect(result).toEqual({ id: 'g1', name: 'G' });
    });

    it('create POSTs and maps _id', async () => {
      fetchMock.mockResolvedValueOnce(ok({ _id: 'g2', name: 'H' }));
      const result = await itsmApi.groups.create({ name: 'H' });
      expect(lastCallInit().method).toBe('POST');
      expect(result).toEqual({ id: 'g2', name: 'H' });
    });

    it('update PATCHes and maps _id', async () => {
      fetchMock.mockResolvedValueOnce(ok({ _id: 'g1', name: 'I' }));
      const result = await itsmApi.groups.update('g1', { name: 'I' });
      expect(lastCallInit().method).toBe('PATCH');
      expect(result).toEqual({ id: 'g1', name: 'I' });
    });
  });

  describe('X-Demo-User header', () => {
    it('sends X-Demo-User from the configured resolver', async () => {
      setDemoUserResolver(() => 'joao.silva');
      fetchMock.mockResolvedValueOnce(ok([]));
      await itsmApi.requests.list();
      const headers = lastCallInit().headers as Record<string, string>;
      expect(headers['X-Demo-User']).toBe('joao.silva');
    });

    it('picks up resolver changes between calls', async () => {
      let user = 'joao.silva';
      setDemoUserResolver(() => user);
      fetchMock.mockResolvedValue(ok([]));

      await itsmApi.requests.list();
      expect((fetchMock.mock.calls[0]![1] as RequestInit).headers).toHaveProperty(
        'X-Demo-User',
        'joao.silva',
      );

      user = 'maria.costa';
      await itsmApi.requests.list();
      expect((fetchMock.mock.calls[1]![1] as RequestInit).headers).toHaveProperty(
        'X-Demo-User',
        'maria.costa',
      );
    });
  });

  describe('Content-Type header', () => {
    it('sets Content-Type: application/json on write methods', async () => {
      fetchMock.mockResolvedValueOnce(ok({ id: 'x' }));
      await itsmApi.requests.create({ formId: 'f' });
      expect((lastCallInit().headers as Record<string, string>)['Content-Type']).toBe(
        'application/json',
      );
    });

    it('does NOT set Content-Type on read methods', async () => {
      fetchMock.mockResolvedValueOnce(ok([]));
      await itsmApi.requests.list();
      expect((lastCallInit().headers as Record<string, string>)['Content-Type']).toBeUndefined();
    });
  });

  describe('error handling', () => {
    it('non-2xx throws ApiError with status and details', async () => {
      fetchMock.mockResolvedValueOnce(
        err(422, { message: 'Validation failed', errors: [{ field: 'name' }] }),
      );
      try {
        await itsmApi.forms.create({ name: '' });
        expect.fail('should have thrown');
      } catch (e) {
        expect(e).toBeInstanceOf(ApiError);
        const ae = e as ApiError;
        expect(ae.status).toBe(422);
        expect(ae.message).toBe('Validation failed');
        expect(ae.details).toEqual({ message: 'Validation failed', errors: [{ field: 'name' }] });
      }
    });

    it('non-2xx with no JSON body still throws ApiError', async () => {
      fetchMock.mockResolvedValueOnce(err(500));
      try {
        await itsmApi.requests.list();
        expect.fail('should have thrown');
      } catch (e) {
        expect(e).toBeInstanceOf(ApiError);
        expect((e as ApiError).status).toBe(500);
      }
    });
  });

  describe('AbortController', () => {
    it('surfaces abort as AbortError', async () => {
      const ac = new AbortController();
      fetchMock.mockImplementationOnce((_url: string, init?: RequestInit) => {
        return new Promise((_resolve, reject) => {
          if (init?.signal?.aborted) {
            reject(new DOMException('Aborted', 'AbortError'));
            return;
          }
          init?.signal?.addEventListener('abort', () =>
            reject(new DOMException('Aborted', 'AbortError')),
          );
        });
      });
      const p = itsmApi.requests.list(ac.signal);
      ac.abort();
      try {
        await p;
        expect.fail('should have thrown');
      } catch (e) {
        expect((e as Error).name).toBe('AbortError');
      }
    });
  });
});
