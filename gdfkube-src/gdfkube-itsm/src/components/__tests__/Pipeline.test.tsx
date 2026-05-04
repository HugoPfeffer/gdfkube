// Smoke tests for the Pipeline component, focused on the per-stage state
// derivation and the active-stage CSS variable plumbing. The full mapping
// matrix is exercised by RequestDetail.test.tsx; this file covers the
// component in isolation so a regression in either consumer is caught.

import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { Request, RequestStatus } from '../../types';
import { Pipeline } from '../Pipeline';

function makeRequest(status: RequestStatus, stage: number): Request {
  return {
    id: 'REQ-TEST',
    formId: 'cluster-request',
    env: 'production',
    requester: {
      id: 'u',
      name: 'u',
      fullName: 'Test User',
      email: 'u@x.gov',
      role: 'operator',
    },
    requesterGroupName: 'saude',
    status,
    stage,
    submittedAt: '2026-04-27 09:14:22',
    vars: {},
    meta: {},
    policyChecks: [],
  };
}

describe('Pipeline', () => {
  it('renders exactly 7 stages', () => {
    const { container } = render(
      <Pipeline request={makeRequest('provisioning', 4)} pipelineSpeed={1} />,
    );
    expect(container.querySelectorAll('.stage').length).toBe(7);
  });

  it('exposes --anim-duration on the active stage scaled by pipelineSpeed', () => {
    const { container } = render(
      <Pipeline request={makeRequest('provisioning', 4)} pipelineSpeed={0.5} />,
    );
    const active = container.querySelector('.stage.stage-active') as HTMLElement;
    expect(active).not.toBeNull();
    // 4 / 0.5 = 8s
    expect(active.getAttribute('style') ?? '').toContain('8s');
  });

  it('does not set --anim-duration on non-active stages', () => {
    const { container } = render(
      <Pipeline request={makeRequest('ready', 7)} pipelineSpeed={2} />,
    );
    const stages = container.querySelectorAll('.stage');
    for (const el of Array.from(stages)) {
      expect((el as HTMLElement).getAttribute('style') ?? '').not.toContain(
        '--anim-duration',
      );
    }
  });
});
