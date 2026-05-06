// Component tests for the multi-file YAML template editor.
//
// Covers spec scenarios from `itsm-admin-forms`:
//   - Inner-tab file management: add (+), rename, and remove a file. The
//     remove control disappears when only one file is left.
//   - "Rendered preview" toggle interpolates `{{ bucket.key }}` for the
//     active file only.
//   - Available variables panel includes the System group with all eight
//     auto-injected meta.* tokens and a "From form fields" group derived
//     from the form's fields.
//   - Copy-token MUST go through the clipboard fallback when
//     navigator.clipboard.writeText rejects: document.execCommand('copy')
//     is invoked.

import { fireEvent, render, screen, within, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GdfDataProvider, type DataState } from '../../state/dataContext';
import type { Field, TemplateFile } from '../../types';
import { TemplateEditor } from '../TemplateEditor';

function makeField(key: string, overrides: Partial<Field> = {}): Field {
  return { key, label: key, type: 'text', bucket: 'vars', ...overrides };
}

function makeState(
  templates: TemplateFile[],
  fields: Field[] = [],
): DataState {
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
    templates: { 'cluster-request': templates },
  };
}

function withProvider(state: DataState, ui: ReactNode) {
  return <GdfDataProvider initial={state}>{ui}</GdfDataProvider>;
}

describe('TemplateEditor', () => {
  let originalClipboard: typeof navigator.clipboard | undefined;
  let originalExecCommand: typeof document.execCommand;

  beforeEach(() => {
    originalClipboard = navigator.clipboard;
    originalExecCommand = document.execCommand;
  });

  afterEach(() => {
    if (originalClipboard) {
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: originalClipboard,
      });
    } else {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      delete (navigator as any).clipboard;
    }
    document.execCommand = originalExecCommand;
    vi.restoreAllMocks();
  });

  it('renders the active file content in the textarea', () => {
    const tpl: TemplateFile[] = [
      { name: 'hostedcluster.yaml', content: 'apiVersion: v1\n' },
      { name: 'applicationset.yaml', content: '# appset\n' },
    ];
    render(
      withProvider(makeState(tpl), <TemplateEditor formId="cluster-request" />),
    );

    const textarea = screen.getByTestId('template-textarea') as HTMLTextAreaElement;
    expect(textarea.value).toBe('apiVersion: v1\n');
    expect(screen.getByTestId('template-tab-hostedcluster.yaml')).toBeInTheDocument();
    expect(screen.getByTestId('template-tab-applicationset.yaml')).toBeInTheDocument();
  });

  it('switching the inner tab swaps the textarea content', () => {
    const tpl: TemplateFile[] = [
      { name: 'a.yaml', content: 'one' },
      { name: 'b.yaml', content: 'two' },
    ];
    render(
      withProvider(makeState(tpl), <TemplateEditor formId="cluster-request" />),
    );

    fireEvent.click(screen.getByTestId('template-tab-b.yaml'));
    expect((screen.getByTestId('template-textarea') as HTMLTextAreaElement).value).toBe(
      'two',
    );
  });

  it('Add manifest appends a new file with a unique name', () => {
    const tpl: TemplateFile[] = [{ name: 'main.yaml', content: '' }];
    const { container } = render(
      withProvider(makeState(tpl), <TemplateEditor formId="cluster-request" />),
    );

    fireEvent.click(screen.getByRole('button', { name: /add manifest/i }));

    const tabs = container.querySelectorAll<HTMLElement>('[data-testid^="template-tab-"]');
    expect(tabs.length).toBe(2);
    // Active idx jumps to the new tab.
    expect(tabs[1]?.dataset.testid).toMatch(/template-tab-manifest-/);
  });

  it('renaming the active file updates the inner tab label', () => {
    const tpl: TemplateFile[] = [{ name: 'main.yaml', content: 'x' }];
    render(
      withProvider(makeState(tpl), <TemplateEditor formId="cluster-request" />),
    );

    const renameInput = screen.getByLabelText(/active file name/i) as HTMLInputElement;
    fireEvent.change(renameInput, { target: { value: 'nodepool.yaml' } });
    expect(screen.getByTestId('template-tab-nodepool.yaml')).toBeInTheDocument();
  });

  it('Remove deletes a file when more than one remains; hidden when only one', () => {
    const tpl: TemplateFile[] = [
      { name: 'a.yaml', content: 'one' },
      { name: 'b.yaml', content: 'two' },
    ];
    const { container } = render(
      withProvider(makeState(tpl), <TemplateEditor formId="cluster-request" />),
    );

    fireEvent.click(screen.getByRole('button', { name: /remove a\.yaml/i }));

    expect(screen.queryByTestId('template-tab-a.yaml')).toBeNull();
    expect(screen.getByTestId('template-tab-b.yaml')).toBeInTheDocument();
    // Only one file left → no Remove button shown.
    expect(within(container).queryByLabelText(/remove b\.yaml/i)).toBeNull();
  });

  it('Rendered preview toggle interpolates {{ vars.x }} tokens for active file', () => {
    const tpl: TemplateFile[] = [
      { name: 'a.yaml', content: 'name: {{ vars.clusterName }}\n' },
    ];
    render(
      withProvider(makeState(tpl), <TemplateEditor formId="cluster-request" />),
    );

    fireEvent.click(screen.getByLabelText(/rendered preview/i));
    expect(screen.getByTestId('template-preview').textContent).toContain('vacinacao');
    expect(screen.getByTestId('template-preview').textContent).not.toContain(
      '{{ vars.clusterName }}',
    );
  });

  it('System group lists exactly the 8 auto-injected meta variables', () => {
    render(
      withProvider(
        makeState([{ name: 'a.yaml', content: '' }]),
        <TemplateEditor formId="cluster-request" />,
      ),
    );

    const expected = [
      '{{ meta.requestId }}',
      '{{ meta.correlationId }}',
      '{{ meta.requesterName }}',
      '{{ meta.requesterFullName }}',
      '{{ meta.requesterEmail }}',
      '{{ meta.requesterRole }}',
      '{{ meta.submittedAt }}',
      '{{ meta.formId }}',
    ];
    expected.forEach((token) => {
      expect(
        screen.getByRole('button', { name: new RegExp(`Copy ${escapeRegex(token)}`) }),
      ).toBeInTheDocument();
    });
  });

  it('"From form fields" group lists user-defined fields as {{ bucket.key }}', () => {
    const fields = [
      makeField('clusterName', { type: 'text', bucket: 'vars' }),
      makeField('requesterGroupName', { type: 'select', bucket: 'meta' }),
    ];
    render(
      withProvider(
        makeState([{ name: 'a.yaml', content: '' }], fields),
        <TemplateEditor formId="cluster-request" />,
      ),
    );

    expect(
      screen.getByRole('button', { name: /Copy \{\{ vars\.clusterName \}\}/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', {
        name: /Copy \{\{ meta\.requesterGroupName \}\}/,
      }),
    ).toBeInTheDocument();
  });

  it('renders an info banner reading "reconciled by Camel" above the file tabs', () => {
    render(
      withProvider(
        makeState([{ name: 'a.yaml', content: '' }]),
        <TemplateEditor formId="cluster-request" />,
      ),
    );
    const banner = screen.getByTestId('template-info-banner');
    expect(banner.textContent).toMatch(/reconciled by Camel/i);
  });

  it('renders a line counter caption near the active file name', () => {
    // 37 newline characters → 38 lines (newlines + 1).
    const content = `${'line\n'.repeat(37)}line`;
    expect(content.split('\n').length).toBe(38);
    render(
      withProvider(
        makeState([{ name: 'a.yaml', content }]),
        <TemplateEditor formId="cluster-request" />,
      ),
    );
    const counter = screen.getByTestId('template-line-count');
    expect(counter.textContent).toMatch(/38\s*lines/);
  });

  it('renders a "Download all" ghost button in the editor header', () => {
    render(
      withProvider(
        makeState([
          { name: 'a.yaml', content: 'one' },
          { name: 'b.yaml', content: 'two' },
        ]),
        <TemplateEditor formId="cluster-request" />,
      ),
    );
    expect(screen.getByRole('button', { name: /download all/i })).toBeInTheDocument();
  });

  it('copy via fallback path: navigator.clipboard.writeText rejects → document.execCommand("copy") fires', async () => {
    const writeText = vi.fn().mockRejectedValue(new Error('denied'));
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });
    const execCommand = vi.fn().mockReturnValue(true);
    document.execCommand =
      execCommand as unknown as typeof document.execCommand;

    render(
      withProvider(
        makeState([{ name: 'a.yaml', content: '' }]),
        <TemplateEditor formId="cluster-request" />,
      ),
    );

    fireEvent.click(
      screen.getByRole('button', { name: /Copy \{\{ meta\.requestId \}\}/ }),
    );

    await waitFor(() => {
      expect(writeText).toHaveBeenCalledWith('{{ meta.requestId }}');
    });
    await waitFor(() => {
      expect(execCommand).toHaveBeenCalledWith('copy');
    });
  });
});

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
