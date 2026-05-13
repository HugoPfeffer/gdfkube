// Component tests for the New Group creation page.
//
// ID is now read-only, derived from Display name via slugify().
// All tests drive the Display name input and assert on the ID output.

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

const typeName = (v: string) =>
  fireEvent.change(screen.getByLabelText(/display name/i), { target: { value: v } });

describe('NewGroupPage', () => {
  it('typing into Display name auto-populates ID and Git repo', () => {
    render(withProvider(makeState(), <NewGroupPage onClose={vi.fn()} />));
    typeName('Cultura');
    const idInput = screen.getByLabelText(/^id$/i) as HTMLInputElement;
    const repoInput = screen.getByLabelText(/git repo/i) as HTMLInputElement;
    expect(idInput.value).toBe('cultura');
    expect(repoInput.value).toBe('gdfkube-cultura');
  });

  it('manual edit of Git repo persists; later Display name changes do NOT overwrite', () => {
    render(withProvider(makeState(), <NewGroupPage onClose={vi.fn()} />));
    const repoInput = screen.getByLabelText(/git repo/i) as HTMLInputElement;

    typeName('Cultura');
    expect(repoInput.value).toBe('gdfkube-cultura');

    fireEvent.change(repoInput, { target: { value: 'custom-repo' } });
    expect(repoInput.value).toBe('custom-repo');

    typeName('Turismo');
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
    const select = screen.getByLabelText(/managedclusterset/i) as HTMLSelectElement;
    typeName('Cultura');
    fireEvent.change(select, { target: { value: 'staging' } });

    const preview = screen.getByTestId('group-preview');
    expect(preview.textContent).toMatch(/Keycloak group:\s*gdf-cultura/);
    expect(preview.textContent).toMatch(/AppProject:\s*cultura-apps/);
    expect(preview.textContent).toMatch(/ManagedClusterSetBinding:\s*staging\s*→\s*cultura/);
    expect(preview.textContent).toMatch(/Git repo:\s*gdfkube-cultura/);
  });

  it('Create disabled when Display name empty, disabled when slug empty, enabled when slug non-empty', () => {
    render(withProvider(makeState(), <NewGroupPage onClose={vi.fn()} />));
    const create = screen.getByRole('button', {
      name: /create group/i,
    }) as HTMLButtonElement;
    const idInput = screen.getByLabelText(/^id$/i) as HTMLInputElement;

    expect(create.disabled).toBe(true);

    typeName('...');
    expect(idInput.value).toBe('');
    expect(create.disabled).toBe(true);

    typeName('Cultura');
    expect(idInput.value).toBe('cultura');
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

    typeName('Cultura');
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /create group/i }));
    });

    expect(mockCreate).toHaveBeenCalledTimes(1);
    const last = observed[observed.length - 1];
    expect(last?.groups.map((g) => g.id)).toContain('cultura');
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('Display name with spaces and punctuation derives kebab-case ID', () => {
    render(withProvider(makeState(), <NewGroupPage onClose={vi.fn()} />));
    typeName('Min. da fazenda');
    const idInput = screen.getByLabelText(/^id$/i) as HTMLInputElement;
    const repoInput = screen.getByLabelText(/git repo/i) as HTMLInputElement;
    const preview = screen.getByTestId('group-preview');

    expect(idInput.value).toBe('min-da-fazenda');
    expect(repoInput.value).toBe('gdfkube-min-da-fazenda');
    expect(preview.textContent).toMatch(/Keycloak group:\s*gdf-min-da-fazenda/);
  });
});
