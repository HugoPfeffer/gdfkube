// Component tests for the Fields table inside the per-form editor.
//
// Covers spec scenarios from `itsm-admin-forms`:
//   - Drag-and-drop reorder via the `⋮⋮` handle. Dragging from index N to
//     index M dispatches REORDER_FIELDS with `{from: N, to: M}` and the
//     resulting visible order matches.
//   - Visual feedback during drag: the dragged row receives 50% opacity
//     (asserted via inline style) and a `dragging` class; the drop target
//     receives a `drop-target` class plus a 2px civic-blue border on the
//     edge that indicates the insertion direction.

import { fireEvent, render, screen, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it } from 'vitest';
import { GdfDataProvider, type DataState } from '../../state/dataContext';
import type { Field } from '../../types';
import { FieldsTable } from '../FieldsTable';

function makeField(key: string, overrides: Partial<Field> = {}): Field {
  return { key, label: key, type: 'text', bucket: 'vars', ...overrides };
}

function makeState(fields: Field[]): DataState {
  return {
    requests: [],
    forms: [
      {
        id: 'cluster-request',
        name: 'Cluster',
        topic: 'dbz.gdfkube.requests',
        status: 'active',
      },
    ],
    fields: { 'cluster-request': fields },
    users: [],
    groups: [],
    templates: {},
  };
}

function withProvider(state: DataState, ui: ReactNode) {
  return <GdfDataProvider initial={state}>{ui}</GdfDataProvider>;
}

function rowFor(container: HTMLElement, key: string): HTMLElement {
  return within(container).getByTestId(`field-row-${key}`);
}

function fakeDataTransfer(): DataTransfer {
  // jsdom doesn't always implement DataTransfer; fake the parts we use.
  return {
    setData: () => {},
    getData: () => '',
    dropEffect: 'move',
    effectAllowed: 'move',
  } as unknown as DataTransfer;
}

describe('FieldsTable', () => {
  it('renders one row per field in declared order', () => {
    const fields = [
      makeField('clusterName'),
      makeField('environment', { type: 'select', options: 'dev|Dev' }),
      makeField('nodes', { type: 'number', min: 1, max: 10 }),
      makeField('requesterGroupName', { type: 'select' }),
    ];
    const { container } = render(
      withProvider(makeState(fields), <FieldsTable formId="cluster-request" />),
    );

    const rows = Array.from(
      container.querySelectorAll<HTMLElement>('[data-testid^="field-row-"]'),
    );
    expect(rows.map((r) => r.dataset.testid)).toEqual([
      'field-row-clusterName',
      'field-row-environment',
      'field-row-nodes',
      'field-row-requesterGroupName',
    ]);
  });

  it('drag from index 2 to index 0 reorders the field list', () => {
    const fields = [
      makeField('clusterName'),
      makeField('environment'),
      makeField('nodes'),
      makeField('requesterGroupName'),
    ];
    const { container } = render(
      withProvider(makeState(fields), <FieldsTable formId="cluster-request" />),
    );

    const source = rowFor(container, 'nodes');
    const target = rowFor(container, 'clusterName');
    const dt = fakeDataTransfer();

    fireEvent.dragStart(source, { dataTransfer: dt });
    fireEvent.dragOver(target, { dataTransfer: dt });
    fireEvent.drop(target, { dataTransfer: dt });

    const rowsAfter = Array.from(
      container.querySelectorAll<HTMLElement>('[data-testid^="field-row-"]'),
    );
    expect(rowsAfter.map((r) => r.dataset.testid)).toEqual([
      'field-row-nodes',
      'field-row-clusterName',
      'field-row-environment',
      'field-row-requesterGroupName',
    ]);
  });

  it('drag from index 0 to index 3 also reorders correctly', () => {
    const fields = [
      makeField('a'),
      makeField('b'),
      makeField('c'),
      makeField('d'),
    ];
    const { container } = render(
      withProvider(makeState(fields), <FieldsTable formId="cluster-request" />),
    );

    const source = rowFor(container, 'a');
    const target = rowFor(container, 'd');
    const dt = fakeDataTransfer();

    fireEvent.dragStart(source, { dataTransfer: dt });
    fireEvent.dragOver(target, { dataTransfer: dt });
    fireEvent.drop(target, { dataTransfer: dt });

    const rowsAfter = Array.from(
      container.querySelectorAll<HTMLElement>('[data-testid^="field-row-"]'),
    );
    expect(rowsAfter.map((r) => r.dataset.testid)).toEqual([
      'field-row-b',
      'field-row-c',
      'field-row-d',
      'field-row-a',
    ]);
  });

  it('applies dragging visual class + 50% opacity while dragging', () => {
    const fields = [makeField('a'), makeField('b')];
    const { container } = render(
      withProvider(makeState(fields), <FieldsTable formId="cluster-request" />),
    );

    const source = rowFor(container, 'a');
    const dt = fakeDataTransfer();

    fireEvent.dragStart(source, { dataTransfer: dt });
    expect(source.classList.contains('dragging')).toBe(true);
    expect((source.style.opacity || '').toString()).toBe('0.5');
  });

  it('applies drop-target class and a 2px civic-blue border on dragOver', () => {
    const fields = [makeField('a'), makeField('b'), makeField('c')];
    const { container } = render(
      withProvider(makeState(fields), <FieldsTable formId="cluster-request" />),
    );

    const source = rowFor(container, 'c');
    const target = rowFor(container, 'a');
    const dt = fakeDataTransfer();

    fireEvent.dragStart(source, { dataTransfer: dt });
    fireEvent.dragOver(target, { dataTransfer: dt });

    expect(target.classList.contains('drop-target')).toBe(true);
    // Source index 2 > target index 0 → insertion goes ABOVE target → top border.
    expect(target.style.borderTop).toContain('var(--civic-500)');
  });

  it('dragEnd clears the dragging visual state', () => {
    const fields = [makeField('a'), makeField('b')];
    const { container } = render(
      withProvider(makeState(fields), <FieldsTable formId="cluster-request" />),
    );

    const source = rowFor(container, 'a');
    const dt = fakeDataTransfer();

    fireEvent.dragStart(source, { dataTransfer: dt });
    fireEvent.dragEnd(source, { dataTransfer: dt });
    expect(source.classList.contains('dragging')).toBe(false);
    expect((source.style.opacity || '1').toString()).toBe('1');
  });

  it('renders the type-specific Validation/options control per row', () => {
    const fields = [
      makeField('a', { type: 'text' }),
      makeField('b', { type: 'number' }),
      makeField('c', { type: 'select', options: 'x|X' }),
      makeField('d', { type: 'checkbox' }),
    ];
    render(
      withProvider(makeState(fields), <FieldsTable formId="cluster-request" />),
    );

    expect(screen.getByLabelText(/Validation for a/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Min for b/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Max for b/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Options for c/i)).toBeInTheDocument();
    expect(screen.getByTestId('validation-na-d')).toBeInTheDocument();
  });

  it('clicking "Add field" appends a new row and brings it into edit mode', () => {
    const fields = [
      makeField('a'),
      makeField('b'),
      makeField('c'),
      makeField('d'),
    ];
    const { container } = render(
      withProvider(makeState(fields), <FieldsTable formId="cluster-request" />),
    );

    const before = container.querySelectorAll('[data-testid^="field-row-"]').length;
    expect(before).toBe(4);

    fireEvent.click(screen.getByRole('button', { name: /add field/i }));

    const after = container.querySelectorAll('[data-testid^="field-row-"]').length;
    expect(after).toBe(5);
    // The new row's key is the synthesized "newField" — its inputs should be visible.
    expect(screen.getByLabelText(/label for newField/i)).toBeInTheDocument();
  });

  it('renders a MongoDB document shape preview block with the form\'s field keys', () => {
    const fields = [
      makeField('clusterName', { bucket: 'vars' }),
      makeField('requesterGroupName', { bucket: 'meta' }),
    ];
    render(
      withProvider(makeState(fields), <FieldsTable formId="cluster-request" />),
    );

    expect(screen.getByText(/MongoDB document shape/i)).toBeInTheDocument();
    const pre = screen.getByTestId('mongo-shape-preview');
    expect(pre.textContent).toContain('clusterName');
    expect(pre.textContent).toContain('requesterGroupName');
  });
});
