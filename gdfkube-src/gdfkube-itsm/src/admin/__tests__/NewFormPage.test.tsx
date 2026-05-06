// Component tests for the New Form creation page.
//
// Covers spec scenarios from `itsm-admin-forms`:
//   - Create button is disabled until both Form ID and Display name are
//     non-empty AND the id does not collide with an existing form.
//   - Typing a colliding id renders an inline collision error.
//   - On Create the page dispatches ADD_FORM and the new form lands in
//     `state.forms`. The page also calls onClose to navigate back.

import { fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import {
  GdfDataProvider,
  useGdfData,
  type DataState,
} from '../../state/dataContext';
import type { FormDef } from '../../types';
import { NewFormPage } from '../NewFormPage';

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

describe('NewFormPage', () => {
  it('Create button is disabled when fields are empty', () => {
    render(
      withProvider(makeState(), <NewFormPage onClose={vi.fn()} />),
    );
    const create = screen.getByRole('button', { name: /create form/i });
    expect((create as HTMLButtonElement).disabled).toBe(true);
  });

  it('Create button is disabled until both id and name are non-empty', () => {
    render(
      withProvider(makeState(), <NewFormPage onClose={vi.fn()} />),
    );
    const idInput = screen.getByLabelText(/form id/i) as HTMLInputElement;
    const nameInput = screen.getByLabelText(/display name/i) as HTMLInputElement;
    const create = screen.getByRole('button', { name: /create form/i }) as HTMLButtonElement;

    fireEvent.change(idInput, { target: { value: 'backup-restore' } });
    expect(create.disabled).toBe(true);

    fireEvent.change(nameInput, { target: { value: 'Backup & Restore' } });
    expect(create.disabled).toBe(false);
  });

  it('id collision blocks Create and renders an inline collision error', () => {
    render(
      withProvider(makeState(), <NewFormPage onClose={vi.fn()} />),
    );
    const idInput = screen.getByLabelText(/form id/i) as HTMLInputElement;
    const nameInput = screen.getByLabelText(/display name/i) as HTMLInputElement;
    const create = screen.getByRole('button', { name: /create form/i }) as HTMLButtonElement;

    fireEvent.change(nameInput, { target: { value: 'Cluster v2' } });
    fireEvent.change(idInput, { target: { value: 'cluster-request' } });

    expect(create.disabled).toBe(true);
    const help = screen.getByTestId('new-form-id-help');
    expect(help.textContent).toMatch(/already exists/i);
    expect(idInput.getAttribute('aria-invalid')).toBe('true');
  });

  it('Create dispatches ADD_FORM and seeds an empty fields slice', () => {
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

    const idInput = screen.getByLabelText(/form id/i) as HTMLInputElement;
    const nameInput = screen.getByLabelText(/display name/i) as HTMLInputElement;

    fireEvent.change(idInput, { target: { value: 'backup-restore' } });
    fireEvent.change(nameInput, { target: { value: 'Backup & Restore' } });
    fireEvent.click(screen.getByRole('button', { name: /create form/i }));

    const last = observed[observed.length - 1];
    expect(last?.forms.map((f) => f.id)).toContain('backup-restore');
    expect(last?.fields['backup-restore']).toEqual([]);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('id input lowercases and strips invalid characters as the user types', () => {
    render(
      withProvider(makeState(), <NewFormPage onClose={vi.fn()} />),
    );
    const idInput = screen.getByLabelText(/form id/i) as HTMLInputElement;
    fireEvent.change(idInput, { target: { value: 'Backup_Restore!' } });
    expect(idInput.value).toBe('backuprestore');
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
    // Add field button is visible in the draft Fields tab.
    expect(screen.getByRole('button', { name: /add field/i })).toBeInTheDocument();
  });

  it('Create persists drafts via ADD_FORM + UPDATE_FIELD + UPDATE_TEMPLATES', () => {
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

    // Definition
    fireEvent.change(screen.getByLabelText(/form id/i), {
      target: { value: 'newform' },
    });
    fireEvent.change(screen.getByLabelText(/display name/i), {
      target: { value: 'New Form' },
    });

    // Fields tab — add 2 draft fields.
    fireEvent.click(screen.getByRole('tab', { name: /Fields/i }));
    const addField = screen.getByRole('button', { name: /add field/i });
    fireEvent.click(addField);
    fireEvent.click(addField);

    // Template tab — add a draft template (default file already provided; add a new manifest).
    fireEvent.click(screen.getByRole('tab', { name: /Template/i }));
    // The template editor renders at least one default file.
    expect(screen.getByTestId('template-textarea')).toBeInTheDocument();

    // Click Create.
    fireEvent.click(screen.getByRole('button', { name: /create form/i }));

    const last = observed[observed.length - 1]!;
    expect(last.forms.map((f) => f.id)).toContain('newform');
    expect(last.fields['newform']?.length).toBe(2);
    expect(last.templates['newform']?.length).toBeGreaterThanOrEqual(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
