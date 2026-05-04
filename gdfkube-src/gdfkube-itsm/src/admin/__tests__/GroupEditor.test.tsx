// Component tests for the per-group editor.
//
// Covers spec scenarios from `itsm-admin-users`:
//   - Editor renders inputs for id, display name, full name, mapped Git
//     repo, ManagedClusterSet binding, and an auto-provision toggle.

import { fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { GdfDataProvider, type DataState } from '../../state/dataContext';
import type { Group } from '../../types';
import { GroupEditor } from '../GroupEditor';

function makeGroup(overrides: Partial<Group> = {}): Group {
  return {
    id: 'saude',
    name: 'Saúde',
    fullName: 'Department of Health',
    users: 8,
    forms: 4,
    repo: 'gdfkube-saude',
    clusters: 2,
    ...overrides,
  };
}

function makeState(group: Group): DataState {
  return {
    requests: [],
    forms: [],
    fields: {},
    users: [],
    groups: [group],
    templates: {},
  };
}

function withProvider(state: DataState, ui: ReactNode) {
  return <GdfDataProvider initial={state}>{ui}</GdfDataProvider>;
}

describe('GroupEditor', () => {
  it('renders inputs for every editable field', () => {
    const group = makeGroup();
    render(
      withProvider(
        makeState(group),
        <GroupEditor group={group} onClose={vi.fn()} />,
      ),
    );
    expect((screen.getByLabelText(/^id$/i) as HTMLInputElement).value).toBe('saude');
    expect((screen.getByLabelText(/display name/i) as HTMLInputElement).value).toBe('Saúde');
    expect((screen.getByLabelText(/full name/i) as HTMLInputElement).value).toBe('Department of Health');
    expect((screen.getByLabelText(/git repo/i) as HTMLInputElement).value).toBe('gdfkube-saude');
    expect(screen.getByLabelText(/managedclusterset/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/auto.?provision/i)).toBeInTheDocument();
  });

  it('editing display name updates the input value', () => {
    const group = makeGroup();
    render(
      withProvider(
        makeState(group),
        <GroupEditor group={group} onClose={vi.fn()} />,
      ),
    );
    const input = screen.getByLabelText(/display name/i) as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'Saúde Pública' } });
    expect(input.value).toBe('Saúde Pública');
  });
});
