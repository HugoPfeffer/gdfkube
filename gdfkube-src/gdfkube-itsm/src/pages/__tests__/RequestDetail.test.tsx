// Component tests for the Request Detail page.
//
// Covers the spec scenarios for `itsm-request-detail`:
//   - 7-stage pipeline class mapping for provisioning / failed
//   - active stage's --anim-duration scales with pipelineSpeed (4 / speed)
//   - Cluster Access kubeconfig button disabled until status === "ready"
//   - No "Generated Manifests" / "Pipeline Activity" elements
//   - Not-found message when the id doesn't resolve

import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { GdfDataProvider, type DataState } from '../../state/dataContext';
import type { Request, RequestStatus, Tweaks, User } from '../../types';
import { RequestDetail } from '../RequestDetail';

function makeUser(overrides: Partial<User> = {}): User {
  return {
    id: 'joao.silva',
    username: 'joao.silva',
    name: 'joao.silva',
    fullName: 'João Silva',
    email: 'joao.silva@saude.gov',
    role: 'operator',
    group: 'saude',
    ...overrides,
  };
}

function makeRequest(
  id: string,
  status: RequestStatus,
  stage: number,
  overrides: Partial<Request> = {},
): Request {
  return {
    id,
    formId: 'cluster-request',
    env: 'production',
    requester: makeUser(),
    requesterGroupName: 'saude',
    status,
    stage,
    submittedAt: '2026-04-27 09:14:22',
    vars: { clusterName: `cluster-${id}`, environment: 'production', nodeCount: 3 },
    meta: { requesterFullName: 'João Silva' },
    policyChecks: [],
    formLabel: 'OpenShift Cluster',
    ...overrides,
  };
}

const DEFAULT_TWEAKS: Tweaks = {
  density: 'compact',
  theme: 'light',
  sidebarCollapsed: false,
  pipelineSpeed: 1,
  showDemoBanner: true,
};

function makeState(req: Request): DataState {
  return {
    requests: [req],
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

describe('RequestDetail', () => {
  it('renders 7 stages and maps provisioning/stage=4 to 4 done, 1 active, 2 pending', () => {
    const navigate = vi.fn();
    const req = makeRequest('REQ0010247', 'provisioning', 4);
    const { container } = render(
      withProvider(
        makeState(req),
        <RequestDetail id="REQ0010247" navigate={navigate} tweaks={DEFAULT_TWEAKS} />,
      ),
    );

    const stages = container.querySelectorAll('.stage');
    expect(stages.length).toBe(7);
    const states = Array.from(stages).map((el) => {
      const cls = el.className;
      if (cls.includes('stage-done')) return 'done';
      if (cls.includes('stage-active')) return 'active';
      if (cls.includes('stage-failed')) return 'failed';
      if (cls.includes('stage-pending')) return 'pending';
      return 'unknown';
    });
    expect(states).toEqual([
      'done',
      'done',
      'done',
      'done',
      'active',
      'pending',
      'pending',
    ]);
  });

  it('failed status maps stage to "failed", later stages to "pending", earlier to "done"', () => {
    const navigate = vi.fn();
    const req = makeRequest('REQ0010235', 'failed', 5);
    const { container } = render(
      withProvider(
        makeState(req),
        <RequestDetail id="REQ0010235" navigate={navigate} tweaks={DEFAULT_TWEAKS} />,
      ),
    );

    const stages = container.querySelectorAll('.stage');
    const states = Array.from(stages).map((el) => {
      const cls = el.className;
      if (cls.includes('stage-done')) return 'done';
      if (cls.includes('stage-active')) return 'active';
      if (cls.includes('stage-failed')) return 'failed';
      if (cls.includes('stage-pending')) return 'pending';
      return 'unknown';
    });
    expect(states).toEqual([
      'done',
      'done',
      'done',
      'done',
      'done',
      'failed',
      'pending',
    ]);
  });

  it('ready status marks all 7 stages done', () => {
    const navigate = vi.fn();
    const req = makeRequest('REQ0010244', 'ready', 7);
    const { container } = render(
      withProvider(
        makeState(req),
        <RequestDetail id="REQ0010244" navigate={navigate} tweaks={DEFAULT_TWEAKS} />,
      ),
    );

    const stages = container.querySelectorAll('.stage');
    const states = Array.from(stages).map((el) => {
      if (el.className.includes('stage-done')) return 'done';
      return 'other';
    });
    expect(states).toEqual([
      'done',
      'done',
      'done',
      'done',
      'done',
      'done',
      'done',
    ]);
  });

  it('approval status marks all 7 stages pending', () => {
    const navigate = vi.fn();
    const req = makeRequest('REQ0010238', 'approval', 0);
    const { container } = render(
      withProvider(
        makeState(req),
        <RequestDetail id="REQ0010238" navigate={navigate} tweaks={DEFAULT_TWEAKS} />,
      ),
    );

    const stages = container.querySelectorAll('.stage');
    const states = Array.from(stages).map((el) => {
      if (el.className.includes('stage-pending')) return 'pending';
      return 'other';
    });
    expect(states).toEqual(Array(7).fill('pending'));
  });

  it('active stage --anim-duration is 4s at pipelineSpeed=1 and 2s at pipelineSpeed=2', () => {
    const navigate = vi.fn();
    const req = makeRequest('REQ0010247', 'provisioning', 4);

    const first = render(
      withProvider(
        makeState(req),
        <RequestDetail id="REQ0010247" navigate={navigate} tweaks={DEFAULT_TWEAKS} />,
      ),
    );
    const active1 = first.container.querySelector(
      '.stage.stage-active',
    ) as HTMLElement | null;
    expect(active1).not.toBeNull();
    const style1 = active1!.getAttribute('style') ?? '';
    expect(style1).toContain('--anim-duration');
    expect(style1).toContain('4s');
    first.unmount();

    const second = render(
      withProvider(
        makeState(req),
        <RequestDetail
          id="REQ0010247"
          navigate={navigate}
          tweaks={{ ...DEFAULT_TWEAKS, pipelineSpeed: 2 }}
        />,
      ),
    );
    const active2 = second.container.querySelector(
      '.stage.stage-active',
    ) as HTMLElement | null;
    expect(active2).not.toBeNull();
    const style2 = active2!.getAttribute('style') ?? '';
    expect(style2).toContain('--anim-duration');
    expect(style2).toContain('2s');
  });

  it('cluster access section is hidden when status is provisioning', () => {
    const navigate = vi.fn();
    const req = makeRequest('REQ0010247', 'provisioning', 4);
    const { container } = render(
      withProvider(
        makeState(req),
        <RequestDetail id="REQ0010247" navigate={navigate} tweaks={DEFAULT_TWEAKS} />,
      ),
    );

    expect(container.querySelector('[data-testid="cluster-access"]')).toBeNull();
  });

  it('cluster access section is hidden when status is approval', () => {
    const navigate = vi.fn();
    const req = makeRequest('REQ0010238', 'approval', 0);
    const { container } = render(
      withProvider(
        makeState(req),
        <RequestDetail id="REQ0010238" navigate={navigate} tweaks={DEFAULT_TWEAKS} />,
      ),
    );

    expect(container.querySelector('[data-testid="cluster-access"]')).toBeNull();
  });

  it('kubeconfig download button is shown and enabled when status is ready', () => {
    const navigate = vi.fn();
    const req = makeRequest('REQ0010244', 'ready', 7);
    const { container } = render(
      withProvider(
        makeState(req),
        <RequestDetail id="REQ0010244" navigate={navigate} tweaks={DEFAULT_TWEAKS} />,
      ),
    );

    const accessCard = container.querySelector('[data-testid="cluster-access"]') as HTMLElement;
    expect(accessCard).not.toBeNull();
    const btn = accessCard.querySelector('button');
    expect(btn).not.toBeNull();
    expect(btn!.textContent).toMatch(/kubeconfig/i);
    expect(btn!).not.toBeDisabled();
  });
  it('does not render a "Generated Manifests" element', () => {
    const navigate = vi.fn();
    const req = makeRequest('REQ0010247', 'provisioning', 4);
    const { container } = render(
      withProvider(
        makeState(req),
        <RequestDetail id="REQ0010247" navigate={navigate} tweaks={DEFAULT_TWEAKS} />,
      ),
    );
    expect(container.textContent ?? '').not.toMatch(/Generated Manifests/);
  });

  it('does not render a "Pipeline Activity" element', () => {
    const navigate = vi.fn();
    const req = makeRequest('REQ0010247', 'provisioning', 4);
    const { container } = render(
      withProvider(
        makeState(req),
        <RequestDetail id="REQ0010247" navigate={navigate} tweaks={DEFAULT_TWEAKS} />,
      ),
    );
    expect(container.textContent ?? '').not.toMatch(/Pipeline Activity/);
  });

  it('renders Request Details panel with id, requester, cluster, environment, nodes, submittedAt and a status pill', () => {
    const navigate = vi.fn();
    const req = makeRequest('REQ0010247', 'provisioning', 4, {
      vars: {
        clusterName: 'vacinacao',
        environment: 'production',
        nodeCount: 3,
      },
    });
    const { container } = render(
      withProvider(
        makeState(req),
        <RequestDetail id="REQ0010247" navigate={navigate} tweaks={DEFAULT_TWEAKS} />,
      ),
    );

    const detailsPanel = container.querySelector(
      '[data-testid="request-details"]',
    ) as HTMLElement | null;
    expect(detailsPanel).not.toBeNull();
    const text = detailsPanel!.textContent ?? '';
    expect(text).toContain('REQ0010247');
    expect(text).toContain('João Silva');
    expect(text).toContain('vacinacao');
    expect(text).toContain('production');
    expect(text).toContain('3');
    expect(text).toContain('2026-04-27 09:14:22');
    // Status pill renders the "Provisioning" label.
    expect(detailsPanel!.querySelector('.pill')).not.toBeNull();
  });

  it('renders the Approvals chain entries from request.approvalChain', () => {
    const navigate = vi.fn();
    const req = makeRequest('REQ0010244', 'ready', 7, {
      approvalChain: [
        {
          actor: 'Maria Costa',
          action: 'approved',
          comment: 'Looks good — proceed.',
          at: '2026-04-27 08:50:00',
        },
      ],
    });
    const { container } = render(
      withProvider(
        makeState(req),
        <RequestDetail id="REQ0010244" navigate={navigate} tweaks={DEFAULT_TWEAKS} />,
      ),
    );

    const chain = container.querySelector(
      '[data-testid="approval-chain"]',
    ) as HTMLElement | null;
    expect(chain).not.toBeNull();
    const text = chain!.textContent ?? '';
    expect(text).toContain('Maria Costa');
    expect(text).toContain('approved');
    expect(text).toContain('Looks good — proceed.');
  });

  it('renders a not-found message when the id does not match any request', () => {
    const navigate = vi.fn();
    const req = makeRequest('REQ0010247', 'provisioning', 4);
    render(
      withProvider(
        makeState(req),
        <RequestDetail id="DOES-NOT-EXIST" navigate={navigate} tweaks={DEFAULT_TWEAKS} />,
      ),
    );
    expect(screen.getByText(/not found/i)).toBeInTheDocument();
  });
});
