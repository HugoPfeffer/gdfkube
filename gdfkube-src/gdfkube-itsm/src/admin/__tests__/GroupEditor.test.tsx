// Component tests for the per-group editor.
//
// Covers spec scenarios from `itsm-admin-users`:
//   - Editor renders inputs for id (read-only), display name, full name,
//     and mapped Git repo.

import { act, fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GdfDataProvider, type DataState } from '../../state/dataContext';
import type { Group } from '../../types';
import { GroupEditor } from '../GroupEditor';
import { itsmApi } from '../../api/itsmApi';

vi.mock('../../api/itsmApi', () => ({
  itsmApi: { groups: { update: vi.fn() } },
}));

const mockUpdate = itsmApi.groups.update as ReturnType<typeof vi.fn>;

beforeEach(() => { mockUpdate.mockResolvedValue({}); });
afterEach(() => { vi.clearAllMocks(); });

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

  it('Save button is disabled when no changes have been made', () => {
    const group = makeGroup();
    render(
      withProvider(makeState(group), <GroupEditor group={group} onClose={vi.fn()} />),
    );
    const saveBtn = screen.getByRole('button', { name: /save changes/i });
    expect(saveBtn).toBeDisabled();
  });

  it('Save button calls itsmApi.groups.update with the current fields', async () => {
    const group = makeGroup();
    const setToast = vi.fn();
    render(
      withProvider(makeState(group), <GroupEditor group={group} onClose={vi.fn()} setToast={setToast} />),
    );
    fireEvent.change(screen.getByLabelText(/display name/i), { target: { value: 'Saúde Pública' } });
    const saveBtn = screen.getByRole('button', { name: /save changes/i });
    expect(saveBtn).not.toBeDisabled();
    await act(async () => { fireEvent.click(saveBtn); });
    expect(mockUpdate).toHaveBeenCalledTimes(1);
    expect(mockUpdate).toHaveBeenCalledWith('saude', {
      name: 'Saúde Pública',
      fullName: 'Department of Health',
      repo: 'gdfkube-saude',
    });
    expect(setToast).toHaveBeenCalledWith(expect.objectContaining({ kind: 'info', title: 'Saved' }));
  });

  it('Save button shows error toast on API failure', async () => {
    mockUpdate.mockRejectedValueOnce(new Error('Network error'));
    const group = makeGroup();
    const setToast = vi.fn();
    render(
      withProvider(makeState(group), <GroupEditor group={group} onClose={vi.fn()} setToast={setToast} />),
    );
    fireEvent.change(screen.getByLabelText(/display name/i), { target: { value: 'Changed' } });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /save changes/i })); });
    expect(setToast).toHaveBeenCalledWith(expect.objectContaining({ kind: 'warn', title: 'Save failed' }));
  });
});
