// Component tests for the New User creation page.
//
// Covers spec scenarios from `itsm-admin-users`:
//   - Create disabled until name, username, email, group, and role are
//     non-empty.
//   - On Create, ADD_USER is dispatched and onClose is called.

import { fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import {
  GdfDataProvider,
  useGdfData,
  type DataState,
} from '../../state/dataContext';
import type { Group } from '../../types';
import { NewUserPage } from '../NewUserPage';

function makeGroup(id: string): Group {
  return {
    id,
    name: id,
    fullName: id,
    users: 0,
    forms: 0,
    repo: `gdfkube-${id}`,
    clusters: 0,
  };
}

function makeState(): DataState {
  return {
    requests: [],
    forms: [],
    fields: {},
    users: [],
    groups: [makeGroup('saude'), makeGroup('educacao'), makeGroup('setic')],
    templates: {},
  };
}

function withProvider(state: DataState, ui: ReactNode) {
  return <GdfDataProvider initial={state}>{ui}</GdfDataProvider>;
}

function UsersProbe({ onState }: { onState: (s: DataState) => void }) {
  const s = useGdfData();
  onState(s);
  return null;
}

describe('NewUserPage', () => {
  it('Create button is disabled when fields are empty', () => {
    render(withProvider(makeState(), <NewUserPage onClose={vi.fn()} />));
    const create = screen.getByRole('button', {
      name: /create user/i,
    }) as HTMLButtonElement;
    expect(create.disabled).toBe(true);
  });

  it('Create remains disabled until name, username, email, group, role are all set', () => {
    render(withProvider(makeState(), <NewUserPage onClose={vi.fn()} />));
    const create = screen.getByRole('button', {
      name: /create user/i,
    }) as HTMLButtonElement;

    fireEvent.change(screen.getByLabelText(/^name$/i), { target: { value: 'Ana Souza' } });
    expect(create.disabled).toBe(true);

    fireEvent.change(screen.getByLabelText(/^username$/i), { target: { value: 'ana.souza' } });
    expect(create.disabled).toBe(true);

    fireEvent.change(screen.getByLabelText(/^email$/i), { target: { value: 'ana@gov' } });
    expect(create.disabled).toBe(true);

    // group + role both required to enable
    fireEvent.change(screen.getByLabelText(/^group$/i), { target: { value: 'saude' } });
    expect(create.disabled).toBe(true);

    fireEvent.change(screen.getByLabelText(/^role$/i), { target: { value: 'operator' } });
    expect(create.disabled).toBe(false);
  });

  it('Create dispatches ADD_USER and calls onClose', () => {
    const observed: DataState[] = [];
    const onClose = vi.fn();
    render(
      withProvider(
        makeState(),
        <>
          <NewUserPage onClose={onClose} />
          <UsersProbe onState={(s) => observed.push(s)} />
        </>,
      ),
    );

    fireEvent.change(screen.getByLabelText(/^name$/i), { target: { value: 'Ana Souza' } });
    fireEvent.change(screen.getByLabelText(/^username$/i), { target: { value: 'ana.souza' } });
    fireEvent.change(screen.getByLabelText(/^email$/i), { target: { value: 'ana@gov' } });
    fireEvent.change(screen.getByLabelText(/^group$/i), { target: { value: 'saude' } });
    fireEvent.change(screen.getByLabelText(/^role$/i), { target: { value: 'operator' } });
    fireEvent.click(screen.getByRole('button', { name: /create user/i }));

    const last = observed[observed.length - 1];
    expect(last?.users.map((u) => u.username)).toContain('ana.souza');
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
