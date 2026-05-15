// Component tests for the New Form creation page.
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
import type { FormDef } from '../../types';
import { NewFormPage } from '../NewFormPage';
import { itsmApi } from '../../api/itsmApi';

vi.mock('../../api/itsmApi', () => ({
  itsmApi: {
    forms: { create: vi.fn() },
  },
}));

const mockCreate = itsmApi.forms.create as ReturnType<typeof vi.fn>;

beforeEach(() => {
  mockCreate.mockImplementation((body: Record<string, unknown>) =>
    Promise.resolve({ id: body.id, ...body }),
  );
});

afterEach(() => { vi.clearAllMocks(); });

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
    fields: { 'cluster-request': [] },
    users: [],
    groups: [],
    templates: {},
    ...overrides,
  };
}

function withProvider(state: DataState, ui: ReactNode) {
  return <GdfDataProvider initial={state}>{ui}</GdfDataProvider>;
}

function FormsProbe({ onState }: { onState: (s: DataState) => void }) {
  const s = useGdfData();
  onState(s);
  return null;
}

const typeName = (v: string) =>
  fireEvent.change(screen.getByLabelText(/display name/i), { target: { value: v } });

describe('NewFormPage', () => {
  it('Create button is disabled when fields are empty', () => {
    render(
      withProvider(makeState(), <NewFormPage onClose={vi.fn()} />),
    );
    const create = screen.getByRole('button', { name: /create form/i });
    expect((create as HTMLButtonElement).disabled).toBe(true);
  });

  it('Create button is enabled when Display name produces a non-colliding slug', () => {
    render(
      withProvider(makeState(), <NewFormPage onClose={vi.fn()} />),
    );
    const idInput = screen.getByLabelText(/form id/i) as HTMLInputElement;
    const create = screen.getByRole('button', { name: /create form/i }) as HTMLButtonElement;

    typeName('Backup & Restore');
    expect(idInput.value).toBe('backup-restore');
    expect(create.disabled).toBe(false);
  });

  it('id collision blocks Create and renders an inline collision error', () => {
    render(
      withProvider(
        makeState({ forms: [makeForm({ id: 'cultura', name: 'Cultura' })] }),
        <NewFormPage onClose={vi.fn()} />,
      ),
    );
    const idInput = screen.getByLabelText(/form id/i) as HTMLInputElement;
    const create = screen.getByRole('button', { name: /create form/i }) as HTMLButtonElement;

    typeName('Cultura');

    expect(idInput.value).toBe('cultura');
    expect(create.disabled).toBe(true);
    const help = screen.getByTestId('new-form-id-help');
    expect(help.textContent).toMatch(/already exists/i);
    expect(idInput.getAttribute('aria-invalid')).toBe('true');
  });

  it('empty slug disables Create', () => {
    render(
      withProvider(makeState(), <NewFormPage onClose={vi.fn()} />),
    );
    const idInput = screen.getByLabelText(/form id/i) as HTMLInputElement;
    const create = screen.getByRole('button', { name: /create form/i }) as HTMLButtonElement;

    typeName('...');
    expect(idInput.value).toBe('');
    expect(create.disabled).toBe(true);
  });

  it('Create dispatches ADD_FORM and seeds an empty fields slice', async () => {
    const observed: DataState[] = [];
    const onClose = vi.fn();
    render(
      withProvider(
        makeState(),
        <>
          <NewFormPage onClose={onClose} />
          <FormsProbe onState={(s) => observed.push(s)} />
        </>,
      ),
    );

    typeName('Backup & Restore');
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /create form/i }));
    });

    expect(mockCreate).toHaveBeenCalledTimes(1);
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'backup-restore' })
    );
    const body = mockCreate.mock.calls[0][0];
    expect(body).not.toHaveProperty('_id');
    const last = observed[observed.length - 1];
    expect(last?.forms.map((f) => f.id)).toContain('backup-restore');
    expect(last?.fields['backup-restore']).toEqual([]);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('clicking Cancel calls onClose without dispatching', () => {
    const observed: DataState[] = [];
    const onClose = vi.fn();
    render(
      withProvider(
        makeState(),
        <>
          <NewFormPage onClose={onClose} />
          <FormsProbe onState={(s) => observed.push(s)} />
        </>,
      ),
    );
    const before = observed[observed.length - 1]!.forms.length;
    fireEvent.click(screen.getByRole('button', { name: /^cancel$/i }));
    expect(onClose).toHaveBeenCalledTimes(1);
    const after = observed[observed.length - 1]!.forms.length;
    expect(after).toBe(before);
  });

  it('renders 3 sub-tabs and lands on Definition by default', () => {
    render(
      withProvider(makeState(), <NewFormPage onClose={vi.fn()} />),
    );
    const definition = screen.getByRole('tab', { name: /Definition/i });
    const fields = screen.getByRole('tab', { name: /Fields/i });
    const template = screen.getByRole('tab', { name: /Template/i });
    expect(definition).toBeInTheDocument();
    expect(fields).toBeInTheDocument();
    expect(template).toBeInTheDocument();
    expect(definition.getAttribute('aria-selected')).toBe('true');
  });

  it('switching to Fields shows the editable list', () => {
    render(
      withProvider(makeState(), <NewFormPage onClose={vi.fn()} />),
    );
    fireEvent.click(screen.getByRole('tab', { name: /Fields/i }));
    expect(screen.getByTestId('fields-table')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /add field/i })).toBeInTheDocument();
  });

  it('Create persists drafts via ADD_FORM + UPDATE_FIELD + UPDATE_TEMPLATES', async () => {
    const observed: DataState[] = [];
    const onClose = vi.fn();
    render(
      withProvider(
        makeState(),
        <>
          <NewFormPage onClose={onClose} />
          <FormsProbe onState={(s) => observed.push(s)} />
        </>,
      ),
    );

    typeName('New Form');

    fireEvent.click(screen.getByRole('tab', { name: /Fields/i }));
    const addField = screen.getByRole('button', { name: /add field/i });
    fireEvent.click(addField);
    fireEvent.click(addField);

    fireEvent.click(screen.getByRole('tab', { name: /Template/i }));
    expect(screen.getByTestId('template-textarea')).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /create form/i }));
    });

    const last = observed[observed.length - 1]!;
    expect(last.forms.map((f) => f.id)).toContain('new-form');
    expect(last.fields['new-form']?.length).toBe(2);
    expect(last.templates['new-form']?.length).toBeGreaterThanOrEqual(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
