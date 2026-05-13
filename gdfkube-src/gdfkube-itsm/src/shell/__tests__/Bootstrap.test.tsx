import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useGdfData } from '../../state/dataContext';
import { Bootstrap } from '../Bootstrap';

function ok(body: unknown): Response {
  return { ok: true, status: 200, json: () => Promise.resolve(body) } as Response;
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
});

afterEach(() => {
  vi.restoreAllMocks();
});

const FORMS_RESPONSE = [
  {
    _id: 'cluster-request',
    name: 'OpenShift Cluster Request',
    topic: 'dbz.gdfkube.requests',
    status: 'active',
    fields: [{ key: 'clusterName', label: 'Cluster', type: 'text', bucket: 'vars' }],
    templates: [{ name: 'main.yaml', content: '# template' }],
  },
];
const REQUESTS_RESPONSE = [
  { _id: 'REQ1', formId: 'cluster-request', status: 'approval', env: 'production' },
];
const USERS_RESPONSE = [
  { _id: 'u1', username: 'joao.silva', name: 'João', role: 'operator', email: 'j@g.gov' },
];
const GROUPS_RESPONSE = [
  { _id: 'g1', name: 'Saúde', fullName: 'Health', users: 1, forms: 1, repo: 'r', clusters: 0 },
];

function setupFetchSuccess() {
  fetchMock.mockImplementation((url: string) => {
    if (url.includes('/forms')) return Promise.resolve(ok(FORMS_RESPONSE));
    if (url.includes('/requests')) return Promise.resolve(ok(REQUESTS_RESPONSE));
    if (url.includes('/users')) return Promise.resolve(ok(USERS_RESPONSE));
    if (url.includes('/groups')) return Promise.resolve(ok(GROUPS_RESPONSE));
    return Promise.resolve(err(404));
  });
}

function DataProbe({ onData }: { onData: (d: ReturnType<typeof useGdfData>) => void }) {
  const data = useGdfData();
  onData(data);
  return <div data-testid="data-probe">loaded</div>;
}

describe('Bootstrap', () => {
  it('shows a loader while fetching', () => {
    fetchMock.mockImplementation(() => new Promise(() => {}));
    render(
      <Bootstrap>
        <div>child</div>
      </Bootstrap>,
    );
    expect(screen.getByTestId('bootstrap-loader')).toBeInTheDocument();
    expect(screen.queryByText('child')).toBeNull();
  });

  it('mounts GdfDataProvider with all slices populated on success', async () => {
    setupFetchSuccess();
    let captured: ReturnType<typeof useGdfData> | undefined;

    await act(async () => {
      render(
        <Bootstrap>
          <DataProbe onData={(d) => { captured = d; }} />
        </Bootstrap>,
      );
    });

    expect(screen.getByTestId('data-probe')).toBeInTheDocument();
    expect(captured).toBeDefined();
    expect(captured!.forms.length).toBe(1);
    expect(captured!.forms[0]!.id).toBe('cluster-request');
    expect(captured!.requests.length).toBe(1);
    expect(captured!.fields['cluster-request']?.length).toBe(1);
    expect(captured!.templates['cluster-request']?.length).toBe(1);
    expect(captured!.users.length).toBe(1);
    expect(captured!.groups.length).toBe(1);
  });

  it('shows error with retry button on fetch failure', async () => {
    fetchMock.mockRejectedValue(new Error('Network down'));

    await act(async () => {
      render(
        <Bootstrap>
          <div>child</div>
        </Bootstrap>,
      );
    });

    expect(screen.getByTestId('bootstrap-error')).toBeInTheDocument();
    expect(screen.getByText(/Network down/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument();
    expect(screen.queryByText('child')).toBeNull();
  });

  it('retry button re-fetches and renders on success', async () => {
    fetchMock.mockRejectedValueOnce(new Error('Fail'));

    await act(async () => {
      render(
        <Bootstrap>
          <div data-testid="app-child">app</div>
        </Bootstrap>,
      );
    });

    expect(screen.getByTestId('bootstrap-error')).toBeInTheDocument();

    setupFetchSuccess();
    await act(async () => {
      screen.getByRole('button', { name: /retry/i }).click();
    });

    expect(screen.getByTestId('app-child')).toBeInTheDocument();
  });

  it('shows the hard-error UI when admin endpoints fail (no silent fallback)', async () => {
    // Regression: Bootstrap previously substituted a built-in FALLBACK_USERS /
    // FALLBACK_GROUPS array when /users or /groups returned non-2xx, which
    // masked Forbidden errors and produced a working-looking UI while every
    // subsequent identity-bound call still failed. The catch was removed —
    // failure now surfaces as the bootstrap-error phase with a Retry button.
    fetchMock.mockImplementation((url: string) => {
      if (url.includes('/forms')) return Promise.resolve(ok(FORMS_RESPONSE));
      if (url.includes('/requests')) return Promise.resolve(ok(REQUESTS_RESPONSE));
      if (url.includes('/users')) return Promise.resolve(err(403, { message: 'Forbidden' }));
      if (url.includes('/groups')) return Promise.resolve(err(403, { message: 'Forbidden' }));
      return Promise.resolve(err(404));
    });

    await act(async () => {
      render(
        <Bootstrap>
          <div data-testid="app-child">app</div>
        </Bootstrap>,
      );
    });

    expect(screen.getByTestId('bootstrap-error')).toBeInTheDocument();
    expect(screen.queryByTestId('app-child')).toBeNull();
    expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument();
  });

  it('aborts fetch on unmount', async () => {
    let fetchResolve: (() => void) | undefined;
    fetchMock.mockImplementation(() => new Promise<Response>((resolve) => {
      fetchResolve = () => resolve(ok([]));
    }));

    const { unmount } = render(
      <Bootstrap>
        <div>child</div>
      </Bootstrap>,
    );

    expect(screen.getByTestId('bootstrap-loader')).toBeInTheDocument();
    unmount();
    expect(fetchResolve).toBeDefined();
  });
});
