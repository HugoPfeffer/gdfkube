import { describe, it, expect, vi } from 'vitest';
import type { Request, Response, NextFunction } from 'express';
import { demoUser } from '../src/middleware/demoUser.js';
import { DEMO_USERS } from '../src/data/demoUsers.js';

function mockReqRes(headers: Record<string, string> = {}) {
  const req = { headers } as unknown as Request;
  const res = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  } as unknown as Response;
  const next = vi.fn() as NextFunction;
  return { req, res, next };
}

describe('demoUser middleware', () => {
  it('returns 401 when X-Demo-User header is missing', () => {
    const { req, res, next } = mockReqRes();
    demoUser(req, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 401 for unknown user', () => {
    const { req, res, next } = mockReqRes({ 'x-demo-user': 'nobody' });
    demoUser(req, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('populates req.demoUser for known user', () => {
    const { req, res, next } = mockReqRes({ 'x-demo-user': 'joao.silva' });
    demoUser(req, res, next);
    expect(next).toHaveBeenCalled();
    expect(req.demoUser).toBeDefined();
    expect(req.demoUser!.id).toBe('joao.silva');
    expect(req.demoUser!.role).toBe('operator');
    expect(req.demoUser!.group).toBe('saude');
  });

  it('populates admin user correctly', () => {
    const { req, res, next } = mockReqRes({ 'x-demo-user': 'maria.costa' });
    demoUser(req, res, next);
    expect(next).toHaveBeenCalled();
    expect(req.demoUser!.role).toBe('admin');
  });

  it('overrides role to admin via X-Demo-Role for an operator user (cloned)', () => {
    const { req, res, next } = mockReqRes({
      'x-demo-user': 'joao.silva',
      'x-demo-role': 'admin',
    });
    demoUser(req, res, next);
    expect(next).toHaveBeenCalled();
    expect(req.demoUser!.role).toBe('admin');
    expect(req.demoUser).not.toBe(DEMO_USERS['joao.silva']);
    expect(DEMO_USERS['joao.silva']!.role).toBe('operator');
  });

  it('overrides role to operator via X-Demo-Role for an admin user', () => {
    const { req, res, next } = mockReqRes({
      'x-demo-user': 'maria.costa',
      'x-demo-role': 'operator',
    });
    demoUser(req, res, next);
    expect(next).toHaveBeenCalled();
    expect(req.demoUser!.role).toBe('operator');
  });

  it('falls through to stored role for invalid X-Demo-Role value', () => {
    const { req, res, next } = mockReqRes({
      'x-demo-user': 'joao.silva',
      'x-demo-role': 'bogus',
    });
    demoUser(req, res, next);
    expect(next).toHaveBeenCalled();
    expect(req.demoUser!.role).toBe('operator');
  });

  it('falls through to stored role when X-Demo-Role is absent', () => {
    const { req, res, next } = mockReqRes({ 'x-demo-user': 'joao.silva' });
    demoUser(req, res, next);
    expect(next).toHaveBeenCalled();
    expect(req.demoUser!.role).toBe('operator');
    expect(req.demoUser).not.toBe(DEMO_USERS['joao.silva']);
  });
});

describe('DEMO_USERS catalog (operator|admin only)', () => {
  // Regression: the previous catalog included 'approver' and 'service' roles
  // and a service-bot account. Those drove drift between the wire-level role
  // enum and the UI. The catalog is now narrowed to operator|admin only.
  it('does not contain the approver entry', () => {
    expect(DEMO_USERS['lucia.fernandes']).toBeUndefined();
  });

  it('does not contain the service-bot entry', () => {
    expect(DEMO_USERS['platform.bot']).toBeUndefined();
  });

  it('every demo user has role operator or admin', () => {
    for (const user of Object.values(DEMO_USERS)) {
      expect(['operator', 'admin']).toContain(user.role);
    }
  });
});
