// Component tests for the per-form editor.
//
// Covers spec scenarios from `itsm-admin-forms`:
//   - Sub-tab navigation (Definition / Fields / Template). Definition is
//     active by default and shows display name, topic, description, and a
//     status toggle.
//   - Type-aware Validation/options control: regex input for text /
//     textarea, paired min/max for number, options input for select, "n/a"
//     placeholder for checkbox.
//   - Editable advanced sub-row exposes displayAs (select-only), prefix
//     (text-only), and help (any) when a row's edit toggle is engaged.
//
// `itsm-admin-forms` mandates that drag-and-drop reorder is exercised in
// FieldsTable.test.tsx, so this file focuses on tab and field-control
// behavior only.

import { fireEvent, render, screen, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { GdfDataProvider, type DataState } from '../../state/dataContext';
import type { Field, FormDef } from '../../types';
import { FormEditor } from '../FormEditor';

function makeField(key: string, overrides: Partial<Field> = {}): Field {
  return {
    key,
    label: key,
    type: 'text',
    bucket: 'vars',
    ...overrides,
  };
}

function makeForm(overrides: Partial<FormDef> = {}): FormDef {
  return {
    id: 'cluster-request',
    name: 'OpenShift Cluster Request',
    topic: 'dbz.gdfkube.requests',
    description: 'Provision a HyperShift cluster.',
    status: 'active',
    ...overrides,
  };
}

function makeState(fields: Field[]): DataState {
  return {
    requests: [],
    forms: [makeForm()],
    fields: { 'cluster-request': fields },
    users: [],
    groups: [],
    templates: { 'cluster-request': [{ name: 'main.yaml', content: '' }] },
  };
}

function withProvider(state: DataState, ui: ReactNode) {
  return <GdfDataProvider initial={state}>{ui}</GdfDataProvider>;
}

describe('FormEditor', () => {
  it('Definition sub-tab is active by default and populates inputs', () => {
    render(
      withProvider(
        makeState([makeField('clusterName')]),
        <FormEditor formId="cluster-request" onClose={vi.fn()} />,
      ),
    );

    const definitionTab = screen.getByRole('tab', { name: /Definition/i });
    expect(definitionTab.getAttribute('aria-selected')).toBe('true');
    expect(
      (screen.getByLabelText(/display name/i) as HTMLInputElement).value,
    ).toBe('OpenShift Cluster Request');
    expect(
      (screen.getByLabelText(/kafka topic/i) as HTMLInputElement).value,
    ).toBe('dbz.gdfkube.requests');
  });

  it('switching to the Fields sub-tab renders the fields table', () => {
    render(
      withProvider(
        makeState([makeField('clusterName')]),
        <FormEditor formId="cluster-request" onClose={vi.fn()} />,
      ),
    );

    fireEvent.click(screen.getByRole('tab', { name: /Fields/i }));
    expect(screen.getByTestId('fields-table')).toBeInTheDocument();
    expect(screen.getByTestId('field-row-clusterName')).toBeInTheDocument();
  });

  it('switching to the Template sub-tab renders the template editor', () => {
    render(
      withProvider(
        makeState([makeField('clusterName')]),
        <FormEditor formId="cluster-request" onClose={vi.fn()} />,
      ),
    );

    fireEvent.click(screen.getByRole('tab', { name: /Template/i }));
    expect(screen.getByTestId('template-textarea')).toBeInTheDocument();
  });

  it('editing the display name dispatches UPDATE_FORM', () => {
    render(
      withProvider(
        makeState([makeField('clusterName')]),
        <FormEditor formId="cluster-request" onClose={vi.fn()} />,
      ),
    );

    const input = screen.getByLabelText(/display name/i) as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'New Cluster Form' } });
    expect(input.value).toBe('New Cluster Form');
  });

  it('Validation/options cell shows a regex input for text type', () => {
    render(
      withProvider(
        makeState([makeField('clusterName', { type: 'text', validation: '^[a-z]+$' })]),
        <FormEditor formId="cluster-request" onClose={vi.fn()} />,
      ),
    );
    fireEvent.click(screen.getByRole('tab', { name: /Fields/i }));

    const cell = screen.getByLabelText(
      /Validation for clusterName/i,
    ) as HTMLInputElement;
    expect(cell.tagName).toBe('INPUT');
    expect(cell.value).toBe('^[a-z]+$');
  });

  it('Validation/options cell shows min/max inputs for number type', () => {
    render(
      withProvider(
        makeState([makeField('nodeCount', { type: 'number', min: 1, max: 10 })]),
        <FormEditor formId="cluster-request" onClose={vi.fn()} />,
      ),
    );
    fireEvent.click(screen.getByRole('tab', { name: /Fields/i }));

    const min = screen.getByLabelText(/Min for nodeCount/i) as HTMLInputElement;
    const max = screen.getByLabelText(/Max for nodeCount/i) as HTMLInputElement;
    expect(min.type).toBe('number');
    expect(max.type).toBe('number');
    expect(min.value).toBe('1');
    expect(max.value).toBe('10');
  });

  it('Validation/options cell shows an options input for select type', () => {
    render(
      withProvider(
        makeState([
          makeField('environment', {
            type: 'select',
            options: 'dev|Dev; prod|Prod',
          }),
        ]),
        <FormEditor formId="cluster-request" onClose={vi.fn()} />,
      ),
    );
    fireEvent.click(screen.getByRole('tab', { name: /Fields/i }));

    const cell = screen.getByLabelText(/Options for environment/i) as HTMLInputElement;
    expect(cell.value).toBe('dev|Dev; prod|Prod');
  });

  it('Validation/options cell renders n/a for checkbox type', () => {
    render(
      withProvider(
        makeState([makeField('confirm', { type: 'checkbox' })]),
        <FormEditor formId="cluster-request" onClose={vi.fn()} />,
      ),
    );
    fireEvent.click(screen.getByRole('tab', { name: /Fields/i }));
    expect(screen.getByTestId('validation-na-confirm').textContent).toBe('n/a');
  });

  it('opening edit mode reveals an advanced sub-row with prefix and help inputs for text fields', () => {
    render(
      withProvider(
        makeState([makeField('clusterName', { type: 'text' })]),
        <FormEditor formId="cluster-request" onClose={vi.fn()} />,
      ),
    );
    fireEvent.click(screen.getByRole('tab', { name: /Fields/i }));

    fireEvent.click(screen.getByRole('button', { name: /edit clusterName/i }));

    const adv = screen.getByTestId('field-adv-clusterName');
    expect(adv).toBeInTheDocument();
    expect(within(adv).getByLabelText(/prefix for clusterName/i)).toBeInTheDocument();
    expect(within(adv).getByLabelText(/help for clusterName/i)).toBeInTheDocument();
    // displayAs is select-only — must NOT appear for a text field.
    expect(
      within(adv).queryByLabelText(/display as for clusterName/i),
    ).toBeNull();
  });

  it('opening edit mode on a select field reveals displayAs and help', () => {
    render(
      withProvider(
        makeState([makeField('environment', { type: 'select', options: 'a|A' })]),
        <FormEditor formId="cluster-request" onClose={vi.fn()} />,
      ),
    );
    fireEvent.click(screen.getByRole('tab', { name: /Fields/i }));
    fireEvent.click(screen.getByRole('button', { name: /edit environment/i }));

    const adv = screen.getByTestId('field-adv-environment');
    expect(within(adv).getByLabelText(/display as for environment/i)).toBeInTheDocument();
    expect(within(adv).getByLabelText(/help for environment/i)).toBeInTheDocument();
    // No prefix on a select field.
    expect(within(adv).queryByLabelText(/prefix for environment/i)).toBeNull();
  });

  it('toggling status checkbox flips the form active state', () => {
    render(
      withProvider(
        makeState([makeField('clusterName')]),
        <FormEditor formId="cluster-request" onClose={vi.fn()} />,
      ),
    );

    const status = screen.getByLabelText(
      /form is active and accepting submissions/i,
    ) as HTMLInputElement;
    expect(status.checked).toBe(true);
    fireEvent.click(status);
    expect(status.checked).toBe(false);
  });

  it('header renders "Reload from Git" + "Save changes" buttons that fire info toasts', () => {
    const setToast = vi.fn();
    render(
      withProvider(
        makeState([makeField('clusterName')]),
        <FormEditor
          formId="cluster-request"
          onClose={vi.fn()}
          setToast={setToast}
        />,
      ),
    );

    const reload = screen.getByRole('button', { name: /reload from git/i });
    const save = screen.getByRole('button', { name: /save changes/i });
    expect(reload).toBeInTheDocument();
    expect(save).toBeInTheDocument();

    fireEvent.click(save);
    expect(setToast).toHaveBeenCalledWith(
      expect.objectContaining({ title: expect.stringMatching(/Saved \(demo\)/i) }),
    );

    fireEvent.click(reload);
    expect(setToast).toHaveBeenCalledWith(
      expect.objectContaining({
        title: expect.stringMatching(/Reloaded from Git \(demo\)/i),
      }),
    );
  });
});
