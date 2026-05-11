import { describe, it, expect, vi } from 'vitest';
import request from 'supertest';
import { buildApp } from '../src/app.js';

vi.mock('../src/db.js', () => ({
  ping: vi.fn().mockResolvedValue(true),
}));

const app = buildApp();

describe('Health routes', () => {
  describe('GET /healthz/live', () => {
    it('returns 200 with status live', async () => {
      const res = await request(app).get('/healthz/live');
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ status: 'live' });
    });
  });

  describe('GET /healthz/ready', () => {
    it('returns 200 when mongo is reachable', async () => {
      const { ping } = await import('../src/db.js');
      vi.mocked(ping).mockResolvedValue(true);

      const res = await request(app).get('/healthz/ready');
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ status: 'ready', mongo: 'ok' });
    });

    it('returns 503 when mongo is unreachable', async () => {
      const { ping } = await import('../src/db.js');
      vi.mocked(ping).mockResolvedValue(false);

      const res = await request(app).get('/healthz/ready');
      expect(res.status).toBe(503);
      expect(res.body).toEqual({ status: 'unavailable' });
    });
  });
});
