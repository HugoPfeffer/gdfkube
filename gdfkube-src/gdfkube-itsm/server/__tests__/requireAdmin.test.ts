import { describe, it, expect, vi } from 'vitest';
import type { Request, Response, NextFunction } from 'express';
import { requireAdmin } from '../src/middleware/requireAdmin.js';
import type { DemoUser } from '../src/data/demoUsers.js';

function mockReqRes(demoUser?: Partial<DemoUser>) {
  const req = { demoUser } as unknown as Request;
  const res = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  } as unknown as Response;
  const next = vi.fn() as NextFunction;
  return { req, res, next };
}

describe('requireAdmin middleware', () => {
  it('returns 403 for operator', () => {
    const { req, res, next } = mockReqRes({ role: 'operator' });
    requireAdmin(req, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it('calls next() for admin', () => {
    const { req, res, next } = mockReqRes({ role: 'admin' });
    requireAdmin(req, res, next);
    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  it('returns 403 when demoUser is undefined', () => {
    const { req, res, next } = mockReqRes(undefined);
    requireAdmin(req, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
  });
});
