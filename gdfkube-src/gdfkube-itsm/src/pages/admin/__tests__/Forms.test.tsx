// Component tests for the Forms admin page.
//
// Covers spec scenarios from `itsm-admin-forms`:
//   - Forms tab lists every entry regardless of `status` (active + disabled).
//   - Form Fields tab is global (aggregates fields across all forms).
//   - The Form Fields tab MUST NOT render a "New field" button.
//   - Clicking a row opens the per-form editor (FormEditor).

import { fireEvent, render, screen, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { GdfDataProvider, type DataState } from '../../../state/dataContext';
import type { Field, FormDef } from '../../../types';
import { Forms } from '../Forms';

vi.mock('../../../api/itsmApi', () => ({
  itsmApi: {
    forms: { create: vi.fn().mockResolvedValue({}), update: vi.fn().mockResolvedValue({}) },
  },
}));

function makeForm(overrides: Partial<FormDef> = {}): FormDef {
  return {
    id: 'cluster-request',
    name: 'OpenShift Cluster Request',
    topic: 'dbz.gdfkube.requests',
    status: 'active',
    submissions: 47,
    fieldCount: 4,
    updated: '2026-04-22',
    lastEdited: '2026-04-22',
    ...overrides,
  };
}

function makeField(key: string, overrides: Partial<Field> = {}): Field {
  return {
    key,
    label: key,
    type: 'text',
    bucket: 'vars',
    ...overrides,
  };
}

function makeState(overrides: Partial<DataState> = {}): DataState {
  return {
    requests: [],
    forms: [
      makeForm({ id: 'cluster-request', name: 'OpenShift Cluster Request' }),
      makeForm({
        id: 'namespace-request',
        name: 'Namespace Onboarding',
        status: 'active',
        fieldCount: 6,
      }),
      makeForm({
        id: 'legacy-form',
        name: 'Legacy Form',
        status: 'disabled',
        fieldCount: 1,
      }),
    ],
    fields: {
      'cluster-request': [
        makeField('clusterName', { type: 'text', validation: '^[a-z]+$' }),
        makeField('environment', { type: 'select', options: 'dev|Dev; prod|Prod' }),
      ],
      'namespace-request': [
        makeField('namespaceName', { type: 'text' }),
        makeField('cpuQuota', { type: 'number', min: 1, max: 32 }),
      ],
      'legacy-form': [makeField('purpose', { type: 'textarea', required: true })],
    },
    users: [],
    groups: [],
    templates: {},
    ...overrides,
  };
}

function withProvider(state: DataState, ui: ReactNode) {
  return <GdfDataProvider initial={state}>{ui}</GdfDataProvider>;
}

describe('Forms admin page', () => {
  it('Forms tab lists every form including disabled ones', () => {
    const navigate = vi.fn();
    const { container } = render(
      withProvider(makeState(), <Forms navigate={navigate} />),
    );

    const rows = container.querySelectorAll('tbody tr');
    expect(rows.length).toBe(3);
    const ids = Array.from(rows).map(
      (r) => r.querySelector('.row-form-id')?.textContent,
    );
    expect(ids).toEqual(['cluster-request', 'namespace-request', 'legacy-form']);
  });

  it('renders top-level Forms / Form Fields tabs', () => {
    const navigate = vi.fn();
    render(withProvider(makeState(), <Forms navigate={navigate} />));
    expect(screen.getByRole('tab', { name: 'Forms' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Form Fields' })).toBeInTheDocument();
  });

  it('Form Fields tab aggregates fields from every form', () => {
    const navigate = vi.fn();
    const { container } = render(
      withProvider(makeState(), <Forms navigate={navigate} />),
    );

    fireEvent.click(screen.getByRole('tab', { name: 'Form Fields' }));

    const rows = container.querySelectorAll('tbody tr');
    // 2 cluster-request + 2 namespace-request + 1 legacy-form = 5
    expect(rows.length).toBe(5);
    const formIds = Array.from(rows).map(
      (r) => r.querySelector('.row-source-form-id')?.textContent,
    );
    expect(formIds).toEqual([
      'cluster-request',
      'cluster-request',
      'namespace-request',
      'namespace-request',
      'legacy-form',
    ]);
  });

  it('Form Fields tab does NOT render a "New field" button', () => {
    const navigate = vi.fn();
    render(withProvider(makeState(), <Forms navigate={navigate} />));
    fireEvent.click(screen.getByRole('tab', { name: 'Form Fields' }));
    expect(screen.queryByRole('button', { name: /new field/i })).toBeNull();
  });

  it('clicking a Forms row opens the per-form editor for that form', () => {
    const navigate = vi.fn();
    render(withProvider(makeState(), <Forms navigate={navigate} />));

    const row = screen.getByText('namespace-request').closest('tr')!;
    fireEvent.click(row);

    // Editor renders the form's display name in an input.
    const nameInput = screen.getByLabelText(/display name/i) as HTMLInputElement;
    expect(nameInput.value).toBe('Namespace Onboarding');
    // Editor sub-tabs are visible (Definition is active by default).
    expect(screen.getByRole('tab', { name: /Definition/i })).toBeInTheDocument();
  });

  it('Forms tab shows status pill text for both active and disabled forms', () => {
    const navigate = vi.fn();
    const { container } = render(
      withProvider(makeState(), <Forms navigate={navigate} />),
    );

    const legacyRow = Array.from(container.querySelectorAll('tbody tr')).find(
      (r) => r.querySelector('.row-form-id')?.textContent === 'legacy-form',
    );
    expect(legacyRow?.textContent).toMatch(/disabled/i);

    const clusterRow = Array.from(container.querySelectorAll('tbody tr')).find(
      (r) => r.querySelector('.row-form-id')?.textContent === 'cluster-request',
    );
    expect(clusterRow?.textContent).toMatch(/active/i);
  });

  it('"New form" button on Forms tab navigates the user to the create page', () => {
    const navigate = vi.fn();
    render(withProvider(makeState(), <Forms navigate={navigate} />));
    const head = screen.getByTestId('forms-head');
    fireEvent.click(within(head).getByRole('button', { name: /new form/i }));
    // Page renders the create form (its specific input shows up).
    expect(screen.getByLabelText(/form id/i)).toBeInTheDocument();
  });

  it('Forms tab renders a Submissions column showing each form\'s count', () => {
    const navigate = vi.fn();
    const { container } = render(
      withProvider(
        makeState({
          forms: [
            makeForm({ id: 'cluster-request', submissions: 12 }),
          ],
          fields: { 'cluster-request': [] },
        }),
        <Forms navigate={navigate} />,
      ),
    );
    const headers = Array.from(container.querySelectorAll('thead th')).map(
      (th) => th.textContent?.trim(),
    );
    expect(headers).toContain('Submissions');

    const row = container.querySelector('tbody tr')!;
    const cells = Array.from(row.querySelectorAll('td')).map(
      (td) => td.textContent?.trim(),
    );
    expect(cells).toContain('12');
  });
});
