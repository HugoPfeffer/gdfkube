// Component tests for the New Group creation page.
//
// Covers spec scenarios from `itsm-admin-users` (incl. fix-itsm-portal-design-drift):
//   - Typing into the id input auto-populates Git repo as `gdfkube-{id}`.
//   - Manual edit of Git repo persists; subsequent id changes do NOT
//     overwrite once the user has edited the repo (dirty flag).
//   - Live preview block renders four lines: Keycloak group, AppProject,
//     ManagedClusterSetBinding, Git repo.
//   - Create disabled until id and displayName are non-empty.
//   - ManagedClusterSet is a `<select>` with seeded options
//     `default`, `production`, `staging`, `internal`.

import { act, fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  GdfDataProvider,
  useGdfData,
  type DataState,
} from '../../state/dataContext';
import { NewGroupPage } from '../NewGroupPage';
import { itsmApi } from '../../api/itsmApi';

vi.mock('../../api/itsmApi', () => ({
  itsmApi: { groups: { create: vi.fn() } },
}));

const mockCreate = itsmApi.groups.create as ReturnType<typeof vi.fn>;

beforeEach(() => {
  mockCreate.mockImplementation((body: Record<string, unknown>) =>
    Promise.resolve({ id: body._id, ...body }),
  );
});

afterEach(() => { vi.clearAllMocks(); });

function makeState(overrides: Partial<DataState> = {}): DataState {
  return {
    requests: [],
    forms: [],
    fields: {},
    users: [],
    groups: [],
    templates: {},
    ...overrides,
  };
}

function withProvider(state: DataState, ui: ReactNode) {
  return <GdfDataProvider initial={state}>{ui}</GdfDataProvider>;
}

function GroupsProbe({ onState }: { onState: (s: DataState) => void }) {
  const s = useGdfData();
  onState(s);
  return null;
}

describe('NewGroupPage', () => {
  it('typing into id auto-populates Git repo as gdfkube-{id}', () => {
    render(withProvider(makeState(), <NewGroupPage onClose={vi.fn()} />));
    const idInput = screen.getByLabelText(/^id$/i) as HTMLInputElement;
    const repoInput = screen.getByLabelText(/git repo/i) as HTMLInputElement;
    fireEvent.change(idInput, { target: { value: 'cultura' } });
    expect(repoInput.value).toBe('gdfkube-cultura');
  });

  it('manual edit of Git repo persists; later id changes do NOT overwrite', () => {
    render(withProvider(makeState(), <NewGroupPage onClose={vi.fn()} />));
    const idInput = screen.getByLabelText(/^id$/i) as HTMLInputElement;
    const repoInput = screen.getByLabelText(/git repo/i) as HTMLInputElement;

    fireEvent.change(idInput, { target: { value: 'cultura' } });
    expect(repoInput.value).toBe('gdfkube-cultura');

    fireEvent.change(repoInput, { target: { value: 'custom-repo' } });
    expect(repoInput.value).toBe('custom-repo');

    fireEvent.change(idInput, { target: { value: 'turismo' } });
    expect(repoInput.value).toBe('custom-repo');
  });

  it('ManagedClusterSet is a <select> with seeded options', () => {
    render(withProvider(makeState(), <NewGroupPage onClose={vi.fn()} />));
    const select = screen.getByLabelText(/managedclusterset/i) as HTMLSelectElement;
    expect(select.tagName).toBe('SELECT');
    const optionValues = Array.from(select.options).map((o) => o.value);
    expect(optionValues).toEqual(
      expect.arrayContaining(['default', 'production', 'staging', 'internal']),
    );
  });

  it('preview block renders four lines: Keycloak group / AppProject / ManagedClusterSetBinding / Git repo', () => {
    render(withProvider(makeState(), <NewGroupPage onClose={vi.fn()} />));
    const idInput = screen.getByLabelText(/^id$/i) as HTMLInputElement;
    const select = screen.getByLabelText(/managedclusterset/i) as HTMLSelectElement;
    fireEvent.change(idInput, { target: { value: 'cultura' } });
    fireEvent.change(select, { target: { value: 'staging' } });

    const preview = screen.getByTestId('group-preview');
    expect(preview.textContent).toMatch(/Keycloak group:\s*gdf-cultura/);
    expect(preview.textContent).toMatch(/AppProject:\s*cultura-apps/);
    expect(preview.textContent).toMatch(/ManagedClusterSetBinding:\s*staging\s*→\s*cultura/);
    expect(preview.textContent).toMatch(/Git repo:\s*gdfkube-cultura/);
  });

  it('Create disabled until id and displayName are non-empty', () => {
    render(withProvider(makeState(), <NewGroupPage onClose={vi.fn()} />));
    const create = screen.getByRole('button', {
      name: /create group/i,
    }) as HTMLButtonElement;
    expect(create.disabled).toBe(true);

    const idInput = screen.getByLabelText(/^id$/i) as HTMLInputElement;
    fireEvent.change(idInput, { target: { value: 'cultura' } });
    expect(create.disabled).toBe(true);

    const displayName = screen.getByLabelText(/display name/i) as HTMLInputElement;
    fireEvent.change(displayName, { target: { value: 'Cultura' } });
    expect(create.disabled).toBe(false);
  });

  it('Create dispatches ADD_GROUP and calls onClose', async () => {
    const observed: DataState[] = [];
    const onClose = vi.fn();
    render(
      withProvider(
        makeState(),
        <>
          <NewGroupPage onClose={onClose} />
          <GroupsProbe onState={(s) => observed.push(s)} />
        </>,
      ),
    );

    fireEvent.change(screen.getByLabelText(/^id$/i), { target: { value: 'cultura' } });
    fireEvent.change(screen.getByLabelText(/display name/i), {
      target: { value: 'Cultura' },
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /create group/i }));
    });

    expect(mockCreate).toHaveBeenCalledTimes(1);
    const last = observed[observed.length - 1];
    expect(last?.groups.map((g) => g.id)).toContain('cultura');
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
