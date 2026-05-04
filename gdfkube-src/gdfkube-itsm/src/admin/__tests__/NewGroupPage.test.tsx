// Component tests for the New Group creation page.
//
// Covers spec scenarios from `itsm-admin-users`:
//   - Typing into the id input auto-populates Git repo as `gdfkube-{id}`.
//   - Manual edit of Git repo persists; subsequent id changes do NOT
//     overwrite once the user has edited the repo (dirty flag).
//   - Live preview block renders Keycloak group, Git repo, AppProject and
//     ManagedClusterSet binding lines.
//   - Create disabled until id and displayName are non-empty.

import { fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import {
  GdfDataProvider,
  useGdfData,
  type DataState,
} from '../../state/dataContext';
import { NewGroupPage } from '../NewGroupPage';

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

describe('NewGroupPage', () => {
  it('typing into id auto-populates Git repo as gdfkube-{id}', () => {
    render(withProvider(makeState(), <NewGroupPage onClose={vi.fn()} />));
    const idInput = screen.getByLabelText(/^id$/i) as HTMLInputElement;
    const repoInput = screen.getByLabelText(/git repo/i) as HTMLInputElement;
    fireEvent.change(idInput, { target: { value: 'cultura' } });
    expect(repoInput.value).toBe('gdfkube-cultura');
  });

  it('manual edit of Git repo persists; later id changes do NOT overwrite', () => {
    render(withProvider(makeState(), <NewGroupPage onClose={vi.fn()} />));
    const idInput = screen.getByLabelText(/^id$/i) as HTMLInputElement;
    const repoInput = screen.getByLabelText(/git repo/i) as HTMLInputElement;

    fireEvent.change(idInput, { target: { value: 'cultura' } });
    expect(repoInput.value).toBe('gdfkube-cultura');

    fireEvent.change(repoInput, { target: { value: 'custom-repo' } });
    expect(repoInput.value).toBe('custom-repo');

    fireEvent.change(idInput, { target: { value: 'turismo' } });
    expect(repoInput.value).toBe('custom-repo');
  });

  it('live preview shows Keycloak group, repo, AppProject, and binding lines', () => {
    render(withProvider(makeState(), <NewGroupPage onClose={vi.fn()} />));
    const idInput = screen.getByLabelText(/^id$/i) as HTMLInputElement;
    const bindingInput = screen.getByLabelText(
      /managedclusterset/i,
    ) as HTMLInputElement;
    fireEvent.change(idInput, { target: { value: 'cultura' } });
    fireEvent.change(bindingInput, { target: { value: 'tier-a' } });

    const preview = screen.getByTestId('group-preview');
    expect(preview.textContent).toMatch(/Keycloak group:\s*gdf-cultura/);
    expect(preview.textContent).toMatch(/Git repo:\s*gdfkube-cultura/);
    expect(preview.textContent).toMatch(/AppProject:\s*appproj-cultura/);
    expect(preview.textContent).toMatch(/Binding:\s*tier-a/);
  });

  it('Create disabled until id and displayName are non-empty', () => {
    render(withProvider(makeState(), <NewGroupPage onClose={vi.fn()} />));
    const create = screen.getByRole('button', {
      name: /create group/i,
    }) as HTMLButtonElement;
    expect(create.disabled).toBe(true);

    const idInput = screen.getByLabelText(/^id$/i) as HTMLInputElement;
    fireEvent.change(idInput, { target: { value: 'cultura' } });
    expect(create.disabled).toBe(true);

    const displayName = screen.getByLabelText(/display name/i) as HTMLInputElement;
    fireEvent.change(displayName, { target: { value: 'Cultura' } });
    expect(create.disabled).toBe(false);
  });

  it('Create dispatches ADD_GROUP and calls onClose', () => {
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

    fireEvent.change(screen.getByLabelText(/^id$/i), { target: { value: 'cultura' } });
    fireEvent.change(screen.getByLabelText(/display name/i), {
      target: { value: 'Cultura' },
    });
    fireEvent.click(screen.getByRole('button', { name: /create group/i }));

    const last = observed[observed.length - 1];
    expect(last?.groups.map((g) => g.id)).toContain('cultura');
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
