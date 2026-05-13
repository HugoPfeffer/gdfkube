// Tests for GenericRequest — the schema-driven form runner.
//
// Covers spec scenarios in itsm-request-submission/spec.md using synthetic
// field sets so the tests don't depend on seed data.

import { fireEvent, render, screen, act } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  GdfDataProvider,
  useGdfData,
  type DataState,
} from '../../state/dataContext';
import type { Field, FormDef, User } from '../../types';
import { GenericRequest } from '../GenericRequest';
import { itsmApi } from '../../api/itsmApi';

function makeUser(overrides: Partial<User> = {}): User {
  return {
    id: 'u1',
    name: 'João Silva',
    fullName: 'João Silva',
    email: 'joao.silva@saude.gov',
    role: 'operator',
    group: 'saude',
    username: 'joao.silva',
    ...overrides,
  };
}

function RequestsSpy({
  onState,
}: {
  onState: (state: DataState) => void;
}) {
  const state = useGdfData();
  onState(state);
  return null;
}

function renderWithFields(
  formId: string,
  fields: Field[],
  options: {
    formName?: string;
    user?: User;
    navigate?: ReturnType<typeof vi.fn>;
    setToast?: ReturnType<typeof vi.fn>;
    onState?: (state: DataState) => void;
  } = {},
) {
  const form: FormDef = {
    id: formId,
    name: options.formName ?? 'Test Form',
    topic: 'dbz.gdfkube.requests',
    status: 'active',
  };
  const initial: DataState = {
    requests: [],
    forms: [form],
    fields: { [formId]: fields },
    users: [],
    groups: [],
    templates: {},
  };
  const navigate = options.navigate ?? vi.fn();
  const setToast = options.setToast ?? vi.fn();
  const user = options.user ?? makeUser();
  const ui: ReactNode = (
    <GdfDataProvider initial={initial}>
      <GenericRequest
        formId={formId}
        navigate={navigate}
        setToast={setToast}
        user={user}
        role="operator"
      />
      {options.onState && <RequestsSpy onState={options.onState} />}
    </GdfDataProvider>
  );
  return { ...render(ui), navigate, setToast, user };
}

vi.mock('../../api/itsmApi', () => ({
  itsmApi: {
    requests: {
      create: vi.fn(),
      get: vi.fn(),
    },
  },
}));

const mockCreate = itsmApi.requests.create as ReturnType<typeof vi.fn>;
const mockGet = itsmApi.requests.get as ReturnType<typeof vi.fn>;

beforeEach(() => {
  mockCreate.mockResolvedValue({ id: 'REQ-API-1' });
  mockGet.mockResolvedValue({
    id: 'REQ-API-1',
    formId: 'cluster-request',
    env: 'development',
    requester: { id: 'u1', username: 'joao.silva', name: 'João Silva', fullName: 'João Silva', email: 'joao.silva@saude.gov', role: 'operator', group: 'saude' },
    requesterGroupName: 'saude',
    status: 'approval',
    stage: 0,
    submittedAt: new Date().toISOString(),
    vars: { clusterName: 'vacinacao' },
    meta: {},
    policyChecks: [{ id: 'baseline', label: 'Baseline policies', ok: true }],
    approvalChain: [],
  });
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('GenericRequest', () => {
  it('renders cluster-request through the generic runner with no ClusterRequest component', () => {
    const fields: Field[] = [
      {
        key: 'clusterName',
        label: 'Cluster name',
        type: 'text',
        required: true,
        bucket: 'vars',
      },
    ];
    const { container } = renderWithFields('cluster-request', fields, {
      formName: 'OpenShift Cluster Request',
    });

    // The generic runner mounts a known root.
    expect(container.querySelector('.new-request-page')).not.toBeNull();
    // No bespoke ClusterRequest component (no element with that data-testid
    // and no class hint either).
    expect(container.querySelector('[data-testid="ClusterRequest"]')).toBeNull();
    expect(screen.getByLabelText(/Cluster name/)).toBeInTheDocument();
  });

  it('parses pipe-grammar select options into structured radio cards', () => {
    const fields: Field[] = [
      {
        key: 'environment',
        label: 'Environment',
        type: 'select',
        bucket: 'vars',
        displayAs: 'radio-cards',
        // Use `;` separator so the description containing a comma is preserved.
        options: 'production | Production | Live traffic, fully governed | red',
      },
    ];
    // First, give the runner a definition that uses a single option with a
    // comma in its description — uses ; as the top-level separator.
    const fieldsWithSemi: Field[] = [
      {
        ...fields[0]!,
        options: 'production | Production | Live traffic, fully governed | red;',
      },
    ];
    const { container } = renderWithFields('cluster-request', fieldsWithSemi);

    const cards = container.querySelectorAll('.radio-card');
    expect(cards.length).toBe(1);
    // Label rendered.
    expect(cards[0]!.textContent).toContain('Production');
    // Description rendered.
    expect(cards[0]!.textContent).toContain('Live traffic, fully governed');
    // Dot present with the dotColor.
    const dot = cards[0]!.querySelector(
      'span[aria-hidden="true"]',
    ) as HTMLElement | null;
    expect(dot).not.toBeNull();
    expect(dot!.getAttribute('style') ?? '').toContain('red');
  });

  it('falls back to comma-split for plain select option lists', () => {
    const fields: Field[] = [
      {
        key: 'requesterGroupName',
        label: 'Department',
        type: 'select',
        bucket: 'meta',
        options: 'saude, educacao, transportes',
      },
    ];
    renderWithFields('cluster-request', fields);

    const select = screen.getByLabelText(/Department/) as HTMLSelectElement;
    const optionValues = Array.from(select.options).map((o) => o.value);
    expect(optionValues).toEqual(['', 'saude', 'educacao', 'transportes']);
  });

  it('environment field with displayAs:"radio-cards" renders 3 dotted cards', () => {
    const fields: Field[] = [
      {
        key: 'environment',
        label: 'Environment',
        type: 'select',
        bucket: 'vars',
        displayAs: 'radio-cards',
        options:
          'development|Development|Dev sandbox|#16a34a; staging|Staging|Pre-prod|#f59e0b; production|Production|Strict|#dc2626',
      },
    ];
    const { container } = renderWithFields('cluster-request', fields);

    const cards = container.querySelectorAll('.radio-card');
    expect(cards.length).toBe(3);
    cards.forEach((card) => {
      expect(card.querySelector('span[aria-hidden="true"]')).not.toBeNull();
    });
  });

  it('prefix interpolates a sibling field value (hc-{requesterGroupName}-)', () => {
    const fields: Field[] = [
      {
        key: 'requesterGroupName',
        label: 'Department',
        type: 'select',
        bucket: 'meta',
        options: 'saude, educacao',
        required: true,
      },
      {
        key: 'clusterName',
        label: 'Cluster name',
        type: 'text',
        required: true,
        bucket: 'vars',
        prefix: 'hc-{requesterGroupName}-',
      },
    ];
    const { container } = renderWithFields('cluster-request', fields);

    // The select seeds its first parsed option (`saude`), so the prefix
    // interpolates immediately on first render.
    expect(container.querySelector('.input-prefix .pre')!.textContent).toBe(
      'hc-saude-',
    );

    // Switch the sibling to a different value.
    const dept = screen.getByLabelText(/Department/) as HTMLSelectElement;
    fireEvent.change(dept, { target: { value: 'educacao' } });

    expect(container.querySelector('.input-prefix .pre')!.textContent).toBe(
      'hc-educacao-',
    );
  });

  it('help text reflects live values via token interpolation', () => {
    const fields: Field[] = [
      {
        key: 'requesterGroupName',
        label: 'Department',
        type: 'select',
        bucket: 'meta',
        options: 'saude, educacao',
      },
      {
        key: 'clusterName',
        label: 'Cluster name',
        type: 'text',
        bucket: 'vars',
        help: 'namespace will be hc-{requesterGroupName}-{clusterName}',
      },
    ];
    renderWithFields('cluster-request', fields);

    fireEvent.change(screen.getByLabelText(/Department/), {
      target: { value: 'saude' },
    });
    fireEvent.change(screen.getByLabelText(/Cluster name/), {
      target: { value: 'vacinacao' },
    });

    expect(
      screen.getByText('namespace will be hc-saude-vacinacao'),
    ).toBeInTheDocument();
  });

  it('disables Submit when a required field is empty', () => {
    const fields: Field[] = [
      {
        key: 'clusterName',
        label: 'Cluster name',
        type: 'text',
        required: true,
        bucket: 'vars',
      },
    ];
    renderWithFields('cluster-request', fields);

    const submit = screen.getByRole('button', { name: /Submit/i });
    expect(submit).toBeDisabled();

    fireEvent.change(screen.getByLabelText(/Cluster name/), {
      target: { value: 'vacinacao' },
    });
    expect(submit).not.toBeDisabled();
  });

  it('disables Submit when a number field is out of [min,max]', () => {
    const fields: Field[] = [
      {
        key: 'nodeCount',
        label: 'Worker node count',
        type: 'number',
        required: true,
        bucket: 'vars',
        min: 1,
        max: 10,
      },
    ];
    renderWithFields('cluster-request', fields);

    const submit = screen.getByRole('button', { name: /Submit/i });
    const input = screen.getByLabelText(/Worker node count/) as HTMLInputElement;

    fireEvent.change(input, { target: { value: '20' } });
    expect(submit).toBeDisabled();

    fireEvent.change(input, { target: { value: '5' } });
    expect(submit).not.toBeDisabled();
  });

  it('Submit calls API create+get, dispatches ADD_REQUEST, navigates, and toasts', async () => {
    const navigate = vi.fn();
    const setToast = vi.fn();
    const fields: Field[] = [
      {
        key: 'requesterGroupName',
        label: 'Department',
        type: 'select',
        bucket: 'meta',
        options: 'saude, educacao',
        required: true,
      },
      {
        key: 'clusterName',
        label: 'Cluster name',
        type: 'text',
        required: true,
        bucket: 'vars',
      },
      {
        key: 'environment',
        label: 'Environment',
        type: 'select',
        bucket: 'vars',
        displayAs: 'radio-cards',
        options:
          'development|Development|d|#16a34a; production|Production|p|#dc2626',
        required: true,
      },
    ];
    renderWithFields('cluster-request', fields, { navigate, setToast });

    fireEvent.change(screen.getByLabelText(/Department/), {
      target: { value: 'saude' },
    });
    fireEvent.change(screen.getByLabelText(/Cluster name/), {
      target: { value: 'vacinacao' },
    });
    const cards = document.querySelectorAll('.radio-card');
    fireEvent.click(cards[0]!);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Submit/i }));
    });

    expect(mockCreate).toHaveBeenCalledTimes(1);
    const body = mockCreate.mock.calls[0]![0] as Record<string, unknown>;
    expect(body.formId).toBe('cluster-request');
    expect(body.vars).toBeDefined();
    expect(mockGet).toHaveBeenCalledWith('REQ-API-1');

    expect(setToast).toHaveBeenCalledTimes(1);
    const toastArg = setToast.mock.calls[0]![0];
    expect(toastArg.kind).toBe('info');
    expect(toastArg.title).toBe('Request submitted for approval');

    expect(navigate).toHaveBeenCalledTimes(1);
    expect(navigate.mock.calls[0]![0]).toBe('request-detail');
    const navParams = navigate.mock.calls[0]![1];
    expect(navParams.id).toBe('REQ-API-1');
    expect(navParams.submitted).toBe(true);
  });

  it('shows error toast when API rejects', async () => {
    mockCreate.mockRejectedValueOnce(new Error('Validation failed'));
    const setToast = vi.fn();
    const fields: Field[] = [
      { key: 'clusterName', label: 'Cluster name', type: 'text', required: true, bucket: 'vars' },
    ];
    renderWithFields('cluster-request', fields, { setToast });

    fireEvent.change(screen.getByLabelText(/Cluster name/), { target: { value: 'vacinacao' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Submit/i }));
    });

    expect(setToast).toHaveBeenCalledTimes(1);
    expect(setToast.mock.calls[0]![0].kind).toBe('warn');
    expect(setToast.mock.calls[0]![0].body).toContain('Validation failed');
  });

  it('disables submit button while in-flight', async () => {
    let resolveCreate: ((v: { id: string }) => void) | undefined;
    mockCreate.mockImplementationOnce(() => new Promise((resolve) => { resolveCreate = resolve; }));
    const fields: Field[] = [
      { key: 'clusterName', label: 'Cluster name', type: 'text', required: true, bucket: 'vars' },
    ];
    renderWithFields('cluster-request', fields);

    fireEvent.change(screen.getByLabelText(/Cluster name/), { target: { value: 'vacinacao' } });
    const submitBtn = screen.getByRole('button', { name: /Submit/i });
    expect(submitBtn).not.toBeDisabled();

    await act(async () => {
      fireEvent.click(submitBtn);
    });
    expect(screen.getByRole('button', { name: /Submitting/i })).toBeDisabled();

    await act(async () => {
      resolveCreate!({ id: 'REQ-API-1' });
    });
  });

  it('live payload preview reflects every input change', () => {
    const fields: Field[] = [
      {
        key: 'requesterGroupName',
        label: 'Department',
        type: 'select',
        bucket: 'meta',
        options: 'saude, educacao',
      },
      {
        key: 'clusterName',
        label: 'Cluster name',
        type: 'text',
        bucket: 'vars',
      },
    ];
    const { container } = renderWithFields('cluster-request', fields);

    const pre = container.querySelector('pre.payload-preview');
    expect(pre).not.toBeNull();

    fireEvent.change(screen.getByLabelText(/Cluster name/), {
      target: { value: 'vacinacao' },
    });
    expect(pre!.textContent).toContain('"clusterName": "vacinacao"');

    fireEvent.change(screen.getByLabelText(/Department/), {
      target: { value: 'saude' },
    });
    expect(pre!.textContent).toContain('"requesterGroupName": "saude"');
  });

  it('Cancel navigates back to the catalog', () => {
    const navigate = vi.fn();
    const fields: Field[] = [
      {
        key: 'clusterName',
        label: 'Cluster name',
        type: 'text',
        bucket: 'vars',
      },
    ];
    renderWithFields('cluster-request', fields, { navigate });

    fireEvent.click(screen.getByRole('button', { name: /Cancel/i }));
    expect(navigate).toHaveBeenCalledWith('catalog');
  });

  it('seeds default values from the schema on first render', () => {
    const fields: Field[] = [
      {
        key: 'environment',
        label: 'Environment',
        type: 'select',
        bucket: 'vars',
        options: 'development|Development; staging|Staging; production|Production',
      },
      {
        key: 'nodes',
        label: 'Nodes',
        type: 'number',
        bucket: 'vars',
        min: 3,
      },
      {
        key: 'autoscale',
        label: 'Autoscale',
        type: 'checkbox',
        bucket: 'vars',
      },
      {
        key: 'clusterName',
        label: 'Cluster name',
        type: 'text',
        bucket: 'vars',
      },
    ];
    const { container } = renderWithFields('cluster-request', fields);

    const pre = container.querySelector('pre.payload-preview');
    expect(pre).not.toBeNull();
    const text = pre!.textContent ?? '';
    expect(text).toContain('"environment": "development"');
    expect(text).toContain('"nodes": 3');
    expect(text).toContain('"autoscale": false');
  });

  it('renders an inline field-error below an invalid required field', () => {
    const fields: Field[] = [
      {
        key: 'clusterName',
        label: 'Cluster name',
        type: 'text',
        required: true,
        bucket: 'vars',
        validation: '^[a-z][a-z0-9-]{2,30}$',
      },
    ];
    const { container } = renderWithFields('cluster-request', fields);

    fireEvent.change(screen.getByLabelText(/Cluster name/), {
      target: { value: 'X' },
    });

    const err = container.querySelector('small.field-error');
    expect(err).not.toBeNull();
    const errText = err!.textContent ?? '';
    expect(
      errText.startsWith('Invalid format') || errText.startsWith('Must match'),
    ).toBe(true);
  });

  it('renders a "What happens next" sidebar with 6 numbered steps for cluster-request', () => {
    const fields: Field[] = [
      {
        key: 'clusterName',
        label: 'Cluster name',
        type: 'text',
        bucket: 'vars',
      },
    ];
    const { container } = renderWithFields('cluster-request', fields);

    const sidebar = container.querySelector('aside.next-steps');
    expect(sidebar).not.toBeNull();
    expect(sidebar!.textContent).toContain('What happens next');

    const steps = sidebar!.querySelectorAll('ol > li');
    expect(steps.length).toBe(6);
  });

  it('renders a 5-step "What happens next" sidebar for non-cluster forms', () => {
    const fields: Field[] = [
      {
        key: 'namespaceName',
        label: 'Namespace name',
        type: 'text',
        bucket: 'vars',
      },
    ];
    const { container } = renderWithFields('namespace-request', fields);

    const sidebar = container.querySelector('aside.next-steps');
    expect(sidebar).not.toBeNull();
    const steps = sidebar!.querySelectorAll('ol > li');
    expect(steps.length).toBe(5);
  });

  it('renders a Kafka topic footer with shield icon and topic text', () => {
    const fields: Field[] = [
      {
        key: 'clusterName',
        label: 'Cluster name',
        type: 'text',
        bucket: 'vars',
      },
    ];
    const { container } = renderWithFields('cluster-request', fields);

    const sidebar = container.querySelector('aside.next-steps');
    expect(sidebar).not.toBeNull();

    const footer = sidebar!.querySelector('.kafka-topic');
    expect(footer).not.toBeNull();
    expect(footer!.textContent).toContain(
      'Routed via Kafka topic dbz.gdfkube.requests',
    );
    expect(footer!.querySelector('svg')).not.toBeNull();
  });

  it('env defaults to development when no environment field exists', async () => {
    let latestState: DataState | undefined;
    const fields: Field[] = [
      {
        key: 'clusterName',
        label: 'Cluster name',
        type: 'text',
        required: true,
        bucket: 'vars',
      },
    ];
    renderWithFields('cluster-request', fields, {
      onState: (s) => {
        latestState = s;
      },
    });

    fireEvent.change(screen.getByLabelText(/Cluster name/), {
      target: { value: 'vacinacao' },
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Submit/i }));
    });

    expect(latestState).toBeDefined();
    expect(latestState!.requests).toHaveLength(1);
    expect(latestState!.requests[0]!.env).toBe('development');
  });
});
