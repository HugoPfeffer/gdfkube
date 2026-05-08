import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { buildApp } from '../src/app.js';
import { GroupModel } from '../src/models/Group.js';

const app = buildApp();
const ADMIN = 'maria.costa';
const OPERATOR = 'joao.silva';

const SEED_GROUP = {
  _id: 'saude',
  name: 'Saúde',
  fullName: 'Department of Health',
  users: ['joao.silva'],
  forms: ['cluster-request'],
};

describe('Groups endpoints', () => {
  beforeEach(async () => {
    await GroupModel.create(SEED_GROUP);
  });

  describe('GET /api/itsm/groups', () => {
    it('lists groups for admin', async () => {
      const res = await request(app)
        .get('/api/itsm/groups')
        .set('X-Demo-User', ADMIN);
      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);
      expect(res.body[0].id).toBe('saude');
    });

    it('returns 403 for operator', async () => {
      const res = await request(app)
        .get('/api/itsm/groups')
        .set('X-Demo-User', OPERATOR);
      expect(res.status).toBe(403);
    });
  });

  describe('GET /api/itsm/groups/:id', () => {
    it('returns group by id', async () => {
      const res = await request(app)
        .get('/api/itsm/groups/saude')
        .set('X-Demo-User', ADMIN);
      expect(res.status).toBe(200);
      expect(res.body.name).toBe('Saúde');
      expect(res.body.users).toEqual(['joao.silva']);
    });

    it('returns 404 for unknown group', async () => {
      const res = await request(app)
        .get('/api/itsm/groups/nope')
        .set('X-Demo-User', ADMIN);
      expect(res.status).toBe(404);
    });
  });

  describe('POST /api/itsm/groups', () => {
    it('creates group as admin', async () => {
      const res = await request(app)
        .post('/api/itsm/groups')
        .set('X-Demo-User', ADMIN)
        .send({ id: 'new-group', name: 'New Group' });
      expect(res.status).toBe(201);
      expect(res.body.id).toBe('new-group');
      expect(res.body.users).toEqual([]);
      expect(res.body.forms).toEqual([]);
    });

    it('returns 409 on duplicate', async () => {
      const res = await request(app)
        .post('/api/itsm/groups')
        .set('X-Demo-User', ADMIN)
        .send({ id: 'saude', name: 'Dup' });
      expect(res.status).toBe(409);
    });

    it('returns 403 for operator', async () => {
      const res = await request(app)
        .post('/api/itsm/groups')
        .set('X-Demo-User', OPERATOR)
        .send({ id: 'x', name: 'x' });
      expect(res.status).toBe(403);
    });
  });

  describe('PATCH /api/itsm/groups/:id', () => {
    it('replaces users and forms wholesale', async () => {
      const res = await request(app)
        .patch('/api/itsm/groups/saude')
        .set('X-Demo-User', ADMIN)
        .send({
          users: ['joao.silva', 'maria.costa'],
          forms: ['cluster-request', 'namespace-request'],
        });
      expect(res.status).toBe(200);
      expect(res.body.users).toEqual(['joao.silva', 'maria.costa']);
      expect(res.body.forms).toEqual(['cluster-request', 'namespace-request']);
    });

    it('updates name and fullName', async () => {
      const res = await request(app)
        .patch('/api/itsm/groups/saude')
        .set('X-Demo-User', ADMIN)
        .send({ name: 'Updated', fullName: 'Updated Full' });
      expect(res.status).toBe(200);
      expect(res.body.name).toBe('Updated');
    });

    it('returns 404 for unknown group', async () => {
      const res = await request(app)
        .patch('/api/itsm/groups/nope')
        .set('X-Demo-User', ADMIN)
        .send({ name: 'x' });
      expect(res.status).toBe(404);
    });

    it('rejects non-whitelisted keys', async () => {
      const res = await request(app)
        .patch('/api/itsm/groups/saude')
        .set('X-Demo-User', ADMIN)
        .send({ _id: 'hack' });
      expect(res.status).toBe(400);
    });

    it('allows patching repo and clusters', async () => {
      const res = await request(app)
        .patch('/api/itsm/groups/saude')
        .set('X-Demo-User', ADMIN)
        .send({ repo: 'gdfkube-saude', clusters: 3 });
      expect(res.status).toBe(200);
      expect(res.body.repo).toBe('gdfkube-saude');
    });
  });
});
