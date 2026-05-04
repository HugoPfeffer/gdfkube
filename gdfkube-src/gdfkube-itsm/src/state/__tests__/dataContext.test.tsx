import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it } from 'vitest';
import {
  GdfDataProvider,
  dataReducer,
  useGdfData,
  useGdfDispatch,
  type DataState,
} from '../dataContext';
import type {
  ApprovalDecision,
  Field,
  FormDef,
  Group,
  Request,
  TemplateFile,
  User,
} from '../../types';

function makeUser(overrides: Partial<User> = {}): User {
  return {
    id: 'u-test',
    name: 'Test User',
    email: 'test@example.gov',
    role: 'operator',
    ...overrides,
  };
}

function makeRequest(overrides: Partial<Request> = {}): Request {
  return {
    id: 'REQ0000001',
    formId: 'cluster-request',
    env: 'development',
    requester: makeUser(),
    requesterGroupName: 'saude',
    status: 'approval',
    stage: 0,
    submittedAt: '2026-04-27 09:00:00',
    vars: {},
    meta: {},
    policyChecks: [],
    ...overrides,
  };
}

function makeForm(overrides: Partial<FormDef> = {}): FormDef {
  return {
    id: 'cluster-request',
    name: 'OpenShift Cluster Request',
    topic: 'dbz.gdfkube.requests',
    status: 'active',
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

function baseState(): DataState {
  const form = makeForm();
  const fields: Field[] = [
    makeField('a', { id: 1 }),
    makeField('b', { id: 2 }),
    makeField('c', { id: 3 }),
  ];
  const templates: TemplateFile[] = [{ name: 'a.yaml', content: 'x: 1\n' }];
  return {
    requests: [makeRequest()],
    forms: [form],
    fields: { 'cluster-request': fields },
    users: [makeUser({ id: '1', username: 'joao.silva' })],
    groups: [
      {
        id: 'saude',
        name: 'Saúde',
        fullName: 'Department of Health',
        users: 1,
        forms: 1,
        repo: 'gdfkube-saude',
        clusters: 1,
      } satisfies Group,
    ],
    templates: { 'cluster-request': templates },
  };
}

describe('dataReducer', () => {
  it('ADD_REQUEST appends a request and preserves prior ones', () => {
    const state = baseState();
    const next = makeRequest({ id: 'REQ0000002' });
    const result = dataReducer(state, { type: 'ADD_REQUEST', request: next });
    expect(result.requests).toHaveLength(2);
    expect(result.requests[0]?.id).toBe('REQ0000001');
    expect(result.requests[1]?.id).toBe('REQ0000002');
    // prior state untouched
    expect(state.requests).toHaveLength(1);
  });

  it('UPDATE_REQUEST_STATUS mutates matching request and appends approval decision', () => {
    const state = baseState();
    const decision: ApprovalDecision = {
      actor: 'maria.costa',
      action: 'approved',
      at: '2026-04-27T10:00:00Z',
    };
    const result = dataReducer(state, {
      type: 'UPDATE_REQUEST_STATUS',
      id: 'REQ0000001',
      status: 'provisioning',
      stage: 4,
      decision,
    });
    const updated = result.requests[0];
    expect(updated?.status).toBe('provisioning');
    expect(updated?.stage).toBe(4);
    expect(updated?.approvalChain).toEqual([decision]);
    // baseline was untouched
    expect(state.requests[0]?.status).toBe('approval');
    expect(state.requests[0]?.approvalChain).toBeUndefined();
  });

  it('UPDATE_REQUEST_STATUS leaves untargeted requests unchanged', () => {
    const state: DataState = {
      ...baseState(),
      requests: [
        makeRequest({ id: 'REQ-A' }),
        makeRequest({ id: 'REQ-B', status: 'ready' }),
      ],
    };
    const result = dataReducer(state, {
      type: 'UPDATE_REQUEST_STATUS',
      id: 'REQ-A',
      status: 'failed',
    });
    expect(result.requests[0]?.status).toBe('failed');
    expect(result.requests[1]?.status).toBe('ready');
  });

  it('REORDER_FIELDS moves a field from index 2 to index 0', () => {
    const state = baseState();
    const result = dataReducer(state, {
      type: 'REORDER_FIELDS',
      formId: 'cluster-request',
      from: 2,
      to: 0,
    });
    const keys = result.fields['cluster-request']?.map((f) => f.key);
    expect(keys).toEqual(['c', 'a', 'b']);
    // original untouched
    expect(state.fields['cluster-request']?.map((f) => f.key)).toEqual(['a', 'b', 'c']);
  });

  it('UPDATE_FIELD patches a single field by key without touching siblings', () => {
    const state = baseState();
    const result = dataReducer(state, {
      type: 'UPDATE_FIELD',
      formId: 'cluster-request',
      key: 'b',
      patch: { label: 'Beta', required: true },
    });
    const fields = result.fields['cluster-request']!;
    expect(fields[0]).toEqual(state.fields['cluster-request']?.[0]);
    expect(fields[1]?.label).toBe('Beta');
    expect(fields[1]?.required).toBe(true);
    expect(fields[1]?.key).toBe('b');
    expect(fields[2]).toEqual(state.fields['cluster-request']?.[2]);
  });

  it('ADD_FORM adds a new form and seeds an empty fields slice if absent', () => {
    const state = baseState();
    const newForm = makeForm({ id: 'namespace-request', name: 'Namespace Onboarding' });
    const result = dataReducer(state, { type: 'ADD_FORM', form: newForm });
    expect(result.forms.map((f) => f.id)).toEqual(['cluster-request', 'namespace-request']);
    expect(result.fields['namespace-request']).toEqual([]);
    // existing form untouched
    expect(result.fields['cluster-request']?.map((f) => f.key)).toEqual(['a', 'b', 'c']);
  });

  it('UPDATE_FORM patches a form without losing other forms or fields', () => {
    const state: DataState = {
      ...baseState(),
      forms: [makeForm(), makeForm({ id: 'namespace-request', name: 'Namespace Onboarding' })],
      fields: {
        'cluster-request': baseState().fields['cluster-request']!,
        'namespace-request': [makeField('foo')],
      },
    };
    const result = dataReducer(state, {
      type: 'UPDATE_FORM',
      id: 'cluster-request',
      patch: { name: 'Renamed', status: 'disabled' },
    });
    expect(result.forms[0]?.name).toBe('Renamed');
    expect(result.forms[0]?.status).toBe('disabled');
    expect(result.forms[1]?.name).toBe('Namespace Onboarding');
    expect(result.fields['namespace-request']?.map((f) => f.key)).toEqual(['foo']);
  });

  it('UPDATE_TEMPLATES replaces the template list for a form id', () => {
    const state = baseState();
    const next: TemplateFile[] = [
      { name: 'a.yaml', content: 'updated' },
      { name: 'b.yaml', content: 'new' },
    ];
    const result = dataReducer(state, {
      type: 'UPDATE_TEMPLATES',
      formId: 'cluster-request',
      templates: next,
    });
    expect(result.templates['cluster-request']).toEqual(next);
    // original untouched
    expect(state.templates['cluster-request']).toHaveLength(1);
  });

  it('ADD_USER appends a user and UPDATE_USER patches by id', () => {
    const state = baseState();
    const created = makeUser({ id: '99', username: 'new.user', name: 'New User' });
    const added = dataReducer(state, { type: 'ADD_USER', user: created });
    expect(added.users.map((u) => u.id)).toEqual(['1', '99']);

    const patched = dataReducer(added, {
      type: 'UPDATE_USER',
      id: '99',
      patch: { role: 'admin', status: 'disabled' },
    });
    const target = patched.users.find((u) => u.id === '99');
    expect(target?.role).toBe('admin');
    expect(target?.status).toBe('disabled');
    expect(patched.users[0]?.id).toBe('1');
  });

  it('ADD_GROUP and UPDATE_GROUP work', () => {
    const state = baseState();
    const newGroup: Group = {
      id: 'educacao',
      name: 'Educação',
      fullName: 'Department of Education',
      users: 0,
      forms: 0,
      repo: 'gdfkube-educacao',
      clusters: 0,
    };
    const added = dataReducer(state, { type: 'ADD_GROUP', group: newGroup });
    expect(added.groups.map((g) => g.id)).toEqual(['saude', 'educacao']);

    const patched = dataReducer(added, {
      type: 'UPDATE_GROUP',
      id: 'educacao',
      patch: { users: 12 },
    });
    expect(patched.groups.find((g) => g.id === 'educacao')?.users).toBe(12);
  });

  it('UPDATE_REQUEST_STATUS against an unknown id leaves the requests array unchanged', () => {
    const state = baseState();
    const result = dataReducer(state, {
      type: 'UPDATE_REQUEST_STATUS',
      id: 'REQ-DOES-NOT-EXIST',
      status: 'failed',
    });
    expect(result.requests).toHaveLength(state.requests.length);
    expect(result.requests).toEqual(state.requests);
  });

  it('UPDATE_FORM and UPDATE_USER against unknown ids leave their slices unchanged', () => {
    const state = baseState();
    const formResult = dataReducer(state, {
      type: 'UPDATE_FORM',
      id: 'no-such-form',
      patch: { name: 'Should not apply' },
    });
    expect(formResult.forms).toEqual(state.forms);

    const userResult = dataReducer(state, {
      type: 'UPDATE_USER',
      id: 'no-such-user',
      patch: { role: 'admin' },
    });
    expect(userResult.users).toEqual(state.users);
  });

  it('UPDATE_FIELD against an unknown formId leaves state unchanged', () => {
    const state = baseState();
    const result = dataReducer(state, {
      type: 'UPDATE_FIELD',
      formId: 'no-such-form',
      key: 'a',
      patch: { label: 'Should not apply' },
    });
    expect(result).toBe(state);
    expect(result.fields).toEqual(state.fields);
  });

  it('REORDER_FIELDS with from out of bounds leaves state unchanged', () => {
    const state = baseState();
    const result = dataReducer(state, {
      type: 'REORDER_FIELDS',
      formId: 'cluster-request',
      from: 99,
      to: 0,
    });
    expect(result).toBe(state);
    expect(result.fields['cluster-request']?.map((f) => f.key)).toEqual(['a', 'b', 'c']);
  });
});

describe('GdfDataProvider', () => {
  function wrapper(initial: DataState) {
    return ({ children }: { children: ReactNode }) => (
      <GdfDataProvider initial={initial}>{children}</GdfDataProvider>
    );
  }

  it('useGdfData returns the seeded initial state', () => {
    const initial = baseState();
    const { result } = renderHook(() => useGdfData(), { wrapper: wrapper(initial) });
    expect(result.current.requests).toHaveLength(1);
    expect(result.current.forms[0]?.id).toBe('cluster-request');
    expect(result.current.fields['cluster-request']?.map((f) => f.key)).toEqual(['a', 'b', 'c']);
  });

  it('dispatch through a single provider updates state observed by useGdfData', () => {
    const initial = baseState();
    const Provider = wrapper(initial);
    const { result } = renderHook(
      () => ({ state: useGdfData(), dispatch: useGdfDispatch() }),
      { wrapper: Provider },
    );
    expect(result.current.state.requests).toHaveLength(1);
    act(() => {
      result.current.dispatch({
        type: 'ADD_REQUEST',
        request: makeRequest({ id: 'REQ-NEW' }),
      });
    });
    expect(result.current.state.requests).toHaveLength(2);
    expect(result.current.state.requests[1]?.id).toBe('REQ-NEW');
  });
});
