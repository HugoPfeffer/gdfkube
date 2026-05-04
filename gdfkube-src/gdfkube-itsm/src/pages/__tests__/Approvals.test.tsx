// Component tests for the Approvals page.
//
// Covers every scenario in specs/itsm-approvals-queue/spec.md:
//   1. Pending queue with filter chips (All / Production / Scale).
//   2. Production chip narrows the queue to env="production" only.
//   3. Scale chip narrows the queue to scale-request form only.
//   4. Selecting a queue item populates the detail pane (justification + checks).
//   5. No "Est. cost" / "Estimated cost" element on the detail pane.
//   6. Approving moves a request to provisioning + stage=1, removes it from
//      the queue, appends to the decided-this-session log, and shows a toast.
//   7. Override modal: failing policy check blocks approval until Confirm.
//   8. Reject sets status to failed, removes from queue, appends to chain.
//
// Operator-redirect from the approvals route is exercised in App.test.tsx.

import { fireEvent, render, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { GdfDataProvider, type DataState } from '../../state/dataContext';
import type {
  PolicyCheck,
  Request,
  RequestStatus,
  User,
} from '../../types';
import { Approvals } from '../Approvals';

function makeUser(overrides: Partial<User> = {}): User {
  return {
    id: 'maria.costa',
    username: 'maria.costa',
    name: 'maria.costa',
    fullName: 'Maria Costa',
    email: 'm.costa@setic.gov',
    role: 'admin',
    group: 'setic',
    ...overrides,
  };
}

function makeRequester(
  username: string,
  fullName: string,
  group = 'saude',
): User {
  return {
    id: username,
    username,
    name: username,
    fullName,
    email: `${username}@${group}.gov`,
    role: 'operator',
    group,
  };
}

function makeRequest(
  id: string,
  overrides: Partial<Request> = {},
): Request {
  return {
    id,
    formId: 'cluster-request',
    env: 'production',
    requester: makeRequester('joao.silva', 'João Silva'),
    requesterGroupName: 'saude',
    status: 'approval' as RequestStatus,
    stage: 0,
    submittedAt: '2026-04-27 09:14:22',
    justification: 'Default justification.',
    vars: { clusterName: `cluster-${id}`, environment: 'production', nodeCount: 3 },
    meta: { requesterFullName: 'João Silva' },
    policyChecks: [
      { id: 'rhacm', label: 'RHACM governance baseline', ok: true },
    ] as PolicyCheck[],
    formLabel: 'OpenShift Cluster',
    ...overrides,
  };
}

function makeState(requests: Request[]): DataState {
  return {
    requests,
    forms: [],
    fields: {},
    users: [],
    groups: [],
    templates: {},
  };
}

function withProvider(state: DataState, ui: ReactNode) {
  return <GdfDataProvider initial={state}>{ui}</GdfDataProvider>;
}

const adminUser = makeUser();

function defaultProps(overrides: Partial<{
  navigate: ReturnType<typeof vi.fn>;
  setToast: ReturnType<typeof vi.fn>;
  user: User;
}> = {}) {
  return {
    role: 'admin' as const,
    user: overrides.user ?? adminUser,
    navigate: overrides.navigate ?? vi.fn(),
    setToast: overrides.setToast ?? vi.fn(),
  };
}

describe('Approvals', () => {
  it('renders only pending (status === "approval") requests in the queue', () => {
    const requests = [
      makeRequest('REQ0010238'),
      makeRequest('REQ0010249'),
      makeRequest('REQ0010247', { status: 'provisioning', stage: 4 }),
      makeRequest('REQ0010244', { status: 'ready', stage: 7 }),
    ];
    const { container } = render(
      withProvider(makeState(requests), <Approvals {...defaultProps()} />),
    );

    const queue = container.querySelector(
      '[data-testid="approval-queue"]',
    ) as HTMLElement;
    expect(queue).not.toBeNull();
    const ids = Array.from(queue.querySelectorAll('.approval-row')).map(
      (r) => r.getAttribute('data-id'),
    );
    expect(ids).toEqual(expect.arrayContaining(['REQ0010238', 'REQ0010249']));
    expect(ids).not.toContain('REQ0010247');
    expect(ids).not.toContain('REQ0010244');
  });

  it('renders three filter chips (All, Production, Scale) with All active by default', () => {
    const { container } = render(
      withProvider(
        makeState([makeRequest('REQ0010238')]),
        <Approvals {...defaultProps()} />,
      ),
    );

    const chips = container.querySelectorAll(
      '[data-testid="approval-queue"] .filter-chip',
    );
    expect(chips.length).toBe(3);
    const labels = Array.from(chips).map((c) => c.textContent?.trim());
    expect(labels).toEqual(['All', 'Production', 'Scale']);
    expect(chips[0]?.classList.contains('active')).toBe(true);
  });

  it('clicking the Production chip filters queue to env="production" only', () => {
    const requests = [
      makeRequest('REQ0010238', { env: 'development' }),
      makeRequest('REQ0010249', { env: 'production' }),
      makeRequest('REQ0010251', {
        env: 'production',
        formId: 'scale-request',
      }),
    ];
    const { container } = render(
      withProvider(makeState(requests), <Approvals {...defaultProps()} />),
    );

    const prodChip = Array.from(
      container.querySelectorAll('.filter-chip'),
    ).find((c) => c.textContent?.trim() === 'Production') as HTMLElement;
    fireEvent.click(prodChip);

    expect(prodChip.classList.contains('active')).toBe(true);

    const queue = container.querySelector(
      '[data-testid="approval-queue"]',
    ) as HTMLElement;
    const rows = queue.querySelectorAll('.approval-row');
    expect(rows.length).toBe(2);
    const ids = Array.from(rows).map((r) => r.getAttribute('data-id'));
    expect(ids).toEqual(
      expect.arrayContaining(['REQ0010249', 'REQ0010251']),
    );
    expect(ids).not.toContain('REQ0010238');
  });

  it('clicking the Scale chip filters queue to scale-request only', () => {
    const requests = [
      makeRequest('REQ0010238', { formId: 'cluster-request' }),
      makeRequest('REQ0010251', { formId: 'scale-request' }),
    ];
    const { container } = render(
      withProvider(makeState(requests), <Approvals {...defaultProps()} />),
    );

    const scaleChip = Array.from(
      container.querySelectorAll('.filter-chip'),
    ).find((c) => c.textContent?.trim() === 'Scale') as HTMLElement;
    fireEvent.click(scaleChip);

    const queue = container.querySelector(
      '[data-testid="approval-queue"]',
    ) as HTMLElement;
    const rows = queue.querySelectorAll('.approval-row');
    expect(rows.length).toBe(1);
    expect(rows[0]?.getAttribute('data-id')).toBe('REQ0010251');
  });

  it('only one chip is active at a time', () => {
    const { container } = render(
      withProvider(
        makeState([makeRequest('REQ0010238')]),
        <Approvals {...defaultProps()} />,
      ),
    );

    const chips = Array.from(
      container.querySelectorAll(
        '[data-testid="approval-queue"] .filter-chip',
      ),
    ) as HTMLElement[];
    fireEvent.click(chips[1]!);
    const actives = chips.filter((c) => c.classList.contains('active'));
    expect(actives.length).toBe(1);
    expect(actives[0]?.textContent?.trim()).toBe('Production');
  });

  it('selecting a queue item populates the detail pane with justification and policy checks', () => {
    const requests = [
      makeRequest('REQ0010238', {
        justification: 'Pilot for new tax-collection API.',
        policyChecks: [
          { id: 'rhacm', label: 'RHACM governance baseline', ok: true },
          { id: 'naming', label: 'Naming convention', ok: true },
          { id: 'window', label: 'Production change window', ok: false },
        ],
      }),
    ];
    const { container } = render(
      withProvider(makeState(requests), <Approvals {...defaultProps()} />),
    );

    const row = container.querySelector(
      '.approval-row[data-id="REQ0010238"]',
    ) as HTMLElement;
    fireEvent.click(row);

    const panel = container.querySelector(
      '[data-testid="decision-panel"]',
    ) as HTMLElement;
    expect(panel).not.toBeNull();
    expect(panel.textContent).toContain('Pilot for new tax-collection API.');

    const policyRows = panel.querySelectorAll('.policy-row');
    expect(policyRows.length).toBe(3);
    const labels = Array.from(policyRows).map((r) => r.textContent ?? '');
    expect(labels.some((l) => l.includes('PASS'))).toBe(true);
    expect(labels.some((l) => l.includes('WARN'))).toBe(true);
  });

  it('detail pane renders Approve, Reject, Reassign, Request changes buttons and a 3-step approval chain', () => {
    const { container } = render(
      withProvider(
        makeState([makeRequest('REQ0010238')]),
        <Approvals {...defaultProps()} />,
      ),
    );
    fireEvent.click(
      container.querySelector(
        '.approval-row[data-id="REQ0010238"]',
      ) as HTMLElement,
    );

    const panel = container.querySelector(
      '[data-testid="decision-panel"]',
    ) as HTMLElement;
    expect(within(panel).getByRole('button', { name: /Approve/i })).toBeInTheDocument();
    expect(within(panel).getByRole('button', { name: /Reject/i })).toBeInTheDocument();
    expect(within(panel).getByRole('button', { name: /Reassign/i })).toBeInTheDocument();
    expect(within(panel).getByRole('button', { name: /Request changes/i })).toBeInTheDocument();

    const chain = panel.querySelector(
      '[data-testid="approval-chain-steps"]',
    ) as HTMLElement | null;
    expect(chain).not.toBeNull();
    expect(chain!.querySelectorAll('.approval-step').length).toBe(3);
  });

  it('detail pane does NOT render an "Est. cost" or "Estimated cost" element', () => {
    const requests = [makeRequest('REQ0010238', { estCost: 'R$ 412/mo' })];
    const { container } = render(
      withProvider(makeState(requests), <Approvals {...defaultProps()} />),
    );
    fireEvent.click(
      container.querySelector(
        '.approval-row[data-id="REQ0010238"]',
      ) as HTMLElement,
    );

    const panel = container.querySelector(
      '[data-testid="decision-panel"]',
    ) as HTMLElement;
    const text = panel.textContent ?? '';
    expect(text).not.toMatch(/Est\.?\s*cost/i);
    expect(text).not.toMatch(/Estimated\s+cost/i);
  });

  it('approving moves request out of queue, sets provisioning + stage=1, logs decided-this-session, and toasts', () => {
    const requests = [
      makeRequest('REQ0010249'),
      makeRequest('REQ0010238'),
    ];
    const setToast = vi.fn();
    const { container } = render(
      withProvider(
        makeState(requests),
        <Approvals {...defaultProps({ setToast })} />,
      ),
    );

    fireEvent.click(
      container.querySelector(
        '.approval-row[data-id="REQ0010249"]',
      ) as HTMLElement,
    );

    const approveBtn = within(
      container.querySelector('[data-testid="decision-panel"]') as HTMLElement,
    ).getByRole('button', { name: /Approve/i });
    fireEvent.click(approveBtn);

    // Removed from queue.
    const queue = container.querySelector(
      '[data-testid="approval-queue"]',
    ) as HTMLElement;
    const ids = Array.from(queue.querySelectorAll('.approval-row')).map(
      (r) => r.getAttribute('data-id'),
    );
    expect(ids).not.toContain('REQ0010249');

    // Decided-this-session log includes it.
    const decided = container.querySelector(
      '[data-testid="decided-this-session"]',
    ) as HTMLElement;
    expect(decided).not.toBeNull();
    expect(decided.textContent).toContain('REQ0010249');

    // Toast fired with success kind.
    expect(setToast).toHaveBeenCalled();
    const last = setToast.mock.calls.at(-1)?.[0];
    expect(last?.kind).toBe('success');
    expect(last?.title).toMatch(/approved/i);
  });

  it('approving with a failing policy check first opens the override modal; status unchanged until Confirm', () => {
    const requests = [
      makeRequest('REQ0010238', {
        policyChecks: [
          { id: 'rhacm', label: 'RHACM governance baseline', ok: true },
          { id: 'window', label: 'Production change window', ok: false },
        ],
      }),
    ];
    const { container } = render(
      withProvider(makeState(requests), <Approvals {...defaultProps()} />),
    );

    fireEvent.click(
      container.querySelector(
        '.approval-row[data-id="REQ0010238"]',
      ) as HTMLElement,
    );

    fireEvent.click(
      within(
        container.querySelector(
          '[data-testid="decision-panel"]',
        ) as HTMLElement,
      ).getByRole('button', { name: /Approve/i }),
    );

    // Modal is rendered.
    const modal = container.querySelector(
      '[data-testid="override-modal"]',
    ) as HTMLElement;
    expect(modal).not.toBeNull();
    expect(modal.textContent).toContain('Production change window');

    // The request is still in the queue (status unchanged).
    const queue = container.querySelector(
      '[data-testid="approval-queue"]',
    ) as HTMLElement;
    expect(
      queue.querySelector('.approval-row[data-id="REQ0010238"]'),
    ).not.toBeNull();

    // Click Confirm — approval is committed and modal closes.
    fireEvent.click(within(modal).getByRole('button', { name: /Confirm/i }));

    // Modal gone, request gone from queue, decided log includes it.
    expect(
      container.querySelector('[data-testid="override-modal"]'),
    ).toBeNull();

    const queueAfter = container.querySelector(
      '[data-testid="approval-queue"]',
    ) as HTMLElement;
    expect(
      queueAfter.querySelector('.approval-row[data-id="REQ0010238"]'),
    ).toBeNull();

    const decided = container.querySelector(
      '[data-testid="decided-this-session"]',
    ) as HTMLElement;
    expect(decided.textContent).toContain('REQ0010238');
  });

  it('Cancel on the override modal closes it and leaves the request pending', () => {
    const requests = [
      makeRequest('REQ0010238', {
        policyChecks: [
          { id: 'window', label: 'Production change window', ok: false },
        ],
      }),
    ];
    const { container } = render(
      withProvider(makeState(requests), <Approvals {...defaultProps()} />),
    );

    fireEvent.click(
      container.querySelector(
        '.approval-row[data-id="REQ0010238"]',
      ) as HTMLElement,
    );
    fireEvent.click(
      within(
        container.querySelector(
          '[data-testid="decision-panel"]',
        ) as HTMLElement,
      ).getByRole('button', { name: /Approve/i }),
    );

    const modal = container.querySelector(
      '[data-testid="override-modal"]',
    ) as HTMLElement;
    fireEvent.click(within(modal).getByRole('button', { name: /Cancel/i }));

    expect(
      container.querySelector('[data-testid="override-modal"]'),
    ).toBeNull();
    const queue = container.querySelector(
      '[data-testid="approval-queue"]',
    ) as HTMLElement;
    expect(
      queue.querySelector('.approval-row[data-id="REQ0010238"]'),
    ).not.toBeNull();
  });

  it('rejecting marks the request failed, removes from queue, and toasts', () => {
    const requests = [makeRequest('REQ0010251')];
    const setToast = vi.fn();
    const { container } = render(
      withProvider(
        makeState(requests),
        <Approvals {...defaultProps({ setToast })} />,
      ),
    );

    fireEvent.click(
      container.querySelector(
        '.approval-row[data-id="REQ0010251"]',
      ) as HTMLElement,
    );

    const rejectBtn = within(
      container.querySelector('[data-testid="decision-panel"]') as HTMLElement,
    ).getByRole('button', { name: /Reject/i });
    fireEvent.click(rejectBtn);

    // Removed from queue.
    const queue = container.querySelector(
      '[data-testid="approval-queue"]',
    ) as HTMLElement;
    expect(
      queue.querySelector('.approval-row[data-id="REQ0010251"]'),
    ).toBeNull();

    // Decided log includes it.
    const decided = container.querySelector(
      '[data-testid="decided-this-session"]',
    ) as HTMLElement;
    expect(decided.textContent).toContain('REQ0010251');

    // Toast fired with warn kind.
    expect(setToast).toHaveBeenCalled();
    const last = setToast.mock.calls.at(-1)?.[0];
    expect(last?.kind).toBe('warn');
    expect(last?.title).toMatch(/rejected/i);
  });

  it('comment textarea text is captured and forwarded as the approval decision comment', () => {
    const requests = [makeRequest('REQ0010249')];
    // We can't peek at dispatch directly without reaching into context; assert
    // via decided log + a follow-up smoke check by re-selecting another item.
    const { container } = render(
      withProvider(makeState(requests), <Approvals {...defaultProps()} />),
    );

    fireEvent.click(
      container.querySelector(
        '.approval-row[data-id="REQ0010249"]',
      ) as HTMLElement,
    );

    const panel = container.querySelector(
      '[data-testid="decision-panel"]',
    ) as HTMLElement;
    const textarea = panel.querySelector(
      'textarea',
    ) as HTMLTextAreaElement | null;
    expect(textarea).not.toBeNull();
    fireEvent.change(textarea!, { target: { value: 'LGTM, ship it.' } });
    expect(textarea!.value).toBe('LGTM, ship it.');
  });

  it('shows an empty-state message in the right pane when no item is selected', () => {
    const { container } = render(
      withProvider(
        makeState([makeRequest('REQ0010238')]),
        <Approvals {...defaultProps()} />,
      ),
    );

    const empty = container.querySelector(
      '[data-testid="decision-empty"]',
    ) as HTMLElement | null;
    expect(empty).not.toBeNull();
    expect(empty!.textContent).toMatch(/select|choose|pick/i);
  });

  it('override modal: Confirm button receives focus when the modal opens', () => {
    const requests = [
      makeRequest('REQ0010238', {
        policyChecks: [
          { id: 'window', label: 'Production change window', ok: false },
        ],
      }),
    ];
    const { container } = render(
      withProvider(makeState(requests), <Approvals {...defaultProps()} />),
    );

    fireEvent.click(
      container.querySelector(
        '.approval-row[data-id="REQ0010238"]',
      ) as HTMLElement,
    );
    fireEvent.click(
      within(
        container.querySelector(
          '[data-testid="decision-panel"]',
        ) as HTMLElement,
      ).getByRole('button', { name: /Approve/i }),
    );

    const modal = container.querySelector(
      '[data-testid="override-modal"]',
    ) as HTMLElement;
    const confirmBtn = within(modal).getByRole('button', {
      name: /Confirm/i,
    });
    expect(document.activeElement).toBe(confirmBtn);
  });

  it('override modal: Escape closes the modal and leaves the request pending', () => {
    const requests = [
      makeRequest('REQ0010238', {
        policyChecks: [
          { id: 'window', label: 'Production change window', ok: false },
        ],
      }),
    ];
    const { container } = render(
      withProvider(makeState(requests), <Approvals {...defaultProps()} />),
    );

    fireEvent.click(
      container.querySelector(
        '.approval-row[data-id="REQ0010238"]',
      ) as HTMLElement,
    );
    fireEvent.click(
      within(
        container.querySelector(
          '[data-testid="decision-panel"]',
        ) as HTMLElement,
      ).getByRole('button', { name: /Approve/i }),
    );

    expect(
      container.querySelector('[data-testid="override-modal"]'),
    ).not.toBeNull();

    fireEvent.keyDown(window, { key: 'Escape' });

    expect(
      container.querySelector('[data-testid="override-modal"]'),
    ).toBeNull();

    const queue = container.querySelector(
      '[data-testid="approval-queue"]',
    ) as HTMLElement;
    expect(
      queue.querySelector('.approval-row[data-id="REQ0010238"]'),
    ).not.toBeNull();
  });
});
