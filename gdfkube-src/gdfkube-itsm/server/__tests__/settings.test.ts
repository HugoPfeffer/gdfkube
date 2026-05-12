import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { buildApp } from '../src/app.js';
import { GiteaSettings } from '../src/models/GiteaSettings.js';

const app = buildApp();
const ADMIN = 'maria.costa';
const OPERATOR = 'joao.silva';
const SEED = {
  _id: 'gitea',
  endpoint: 'https://gitea.example.com',
  owner: 'myorg',
  token: 'real-token-value',
};

describe('Settings endpoints', () => {
  describe('GET /api/itsm/settings', () => {
    beforeEach(async () => {
      await GiteaSettings.create(SEED);
    });

    it('returns 200 with redacted token for admin', async () => {
      const res = await request(app)
        .get('/api/itsm/settings')
        .set('X-Demo-User', ADMIN);
      expect(res.status).toBe(200);
      expect(res.body.token).toBe('***');
      expect(res.body.endpoint).toBe(SEED.endpoint);
      expect(res.body.owner).toBe(SEED.owner);
    });

    it('returns 200 with cleartext token and Cache-Control: no-store when reveal=1', async () => {
      const res = await request(app)
        .get('/api/itsm/settings?reveal=1')
        .set('X-Demo-User', ADMIN);
      expect(res.status).toBe(200);
      expect(res.body.token).toBe('real-token-value');
      expect(res.headers['cache-control']).toBe('no-store');
    });

    it('returns 403 for non-admin', async () => {
      const res = await request(app)
        .get('/api/itsm/settings')
        .set('X-Demo-User', OPERATOR);
      expect(res.status).toBe(403);
    });
  });

  describe('GET /api/itsm/settings (no document)', () => {
    it('returns 404 when no settings exist', async () => {
      const res = await request(app)
        .get('/api/itsm/settings')
        .set('X-Demo-User', ADMIN);
      expect(res.status).toBe(404);
    });
  });

  describe('PATCH /api/itsm/settings', () => {
    beforeEach(async () => {
      await GiteaSettings.create(SEED);
    });

    it('updates settings for admin with valid body', async () => {
      const body = {
        endpoint: 'https://new.example.com',
        owner: 'neworg',
        token: 'new-pat',
      };
      const res = await request(app)
        .patch('/api/itsm/settings')
        .set('X-Demo-User', ADMIN)
        .send(body);
      expect(res.status).toBe(200);
      expect(res.body.token).toBe('***');

      const doc = await GiteaSettings.findById('gitea').lean();
      expect(doc!.endpoint).toBe('https://new.example.com');
      expect(doc!.owner).toBe('neworg');
      expect(doc!.token).toBe('new-pat');
      expect(doc!.updatedBy).toBe(ADMIN);
      const elapsed = Date.now() - new Date(doc!.updatedAt!).getTime();
      expect(elapsed).toBeLessThan(2000);
    });

    it('returns 400 for invalid endpoint', async () => {
      const res = await request(app)
        .patch('/api/itsm/settings')
        .set('X-Demo-User', ADMIN)
        .send({ endpoint: 'not-a-url', owner: 'ok', token: 'ok' });
      expect(res.status).toBe(400);

      const doc = await GiteaSettings.findById('gitea').lean();
      expect(doc!.endpoint).toBe(SEED.endpoint);
    });

    it('returns 400 for invalid owner', async () => {
      const res = await request(app)
        .patch('/api/itsm/settings')
        .set('X-Demo-User', ADMIN)
        .send({ endpoint: 'https://ok.com', owner: 'bad owner!!', token: 'ok' });
      expect(res.status).toBe(400);

      const doc = await GiteaSettings.findById('gitea').lean();
      expect(doc!.owner).toBe(SEED.owner);
    });

    it('returns 400 for empty token', async () => {
      const res = await request(app)
        .patch('/api/itsm/settings')
        .set('X-Demo-User', ADMIN)
        .send({ endpoint: 'https://ok.com', owner: 'ok', token: '' });
      expect(res.status).toBe(400);
    });

    it.each([null, [], 'a string'])(
      'returns 400 with "invalid body" for malformed body: %j',
      async (body) => {
        const res = await request(app)
          .patch('/api/itsm/settings')
          .set('X-Demo-User', ADMIN)
          .set('Content-Type', 'application/json')
          .send(JSON.stringify(body));
        expect(res.status).toBe(400);
        expect(res.body.error).toBe('invalid body');

        const doc = await GiteaSettings.findById('gitea').lean();
        expect(doc!.endpoint).toBe(SEED.endpoint);
      },
    );

    it('returns 403 for non-admin', async () => {
      const res = await request(app)
        .patch('/api/itsm/settings')
        .set('X-Demo-User', OPERATOR)
        .send({ endpoint: 'https://ok.com', owner: 'ok', token: 'ok' });
      expect(res.status).toBe(403);
    });
  });
});
