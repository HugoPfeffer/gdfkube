import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { buildApp } from '../src/app.js';
import { UserModel } from '../src/models/User.js';

const app = buildApp();
const ADMIN = 'maria.costa';
const OPERATOR = 'joao.silva';

const SEED_USER = {
  _id: 'test.user',
  name: 'Test User',
  email: 'test@gov.br',
  role: 'operator',
  group: 'saude',
};

describe('Users endpoints', () => {
  beforeEach(async () => {
    await UserModel.create(SEED_USER);
  });

  describe('GET /api/itsm/users', () => {
    it('lists users for admin', async () => {
      const res = await request(app)
        .get('/api/itsm/users')
        .set('X-Demo-User', ADMIN);
      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);
      expect(res.body[0].id).toBe('test.user');
    });

    it('returns 403 for operator', async () => {
      const res = await request(app)
        .get('/api/itsm/users')
        .set('X-Demo-User', OPERATOR);
      expect(res.status).toBe(403);
    });
  });

  describe('GET /api/itsm/users/:id', () => {
    it('returns user by id', async () => {
      const res = await request(app)
        .get('/api/itsm/users/test.user')
        .set('X-Demo-User', ADMIN);
      expect(res.status).toBe(200);
      expect(res.body.name).toBe('Test User');
    });

    it('returns 404 for unknown user', async () => {
      const res = await request(app)
        .get('/api/itsm/users/nope')
        .set('X-Demo-User', ADMIN);
      expect(res.status).toBe(404);
    });
  });

  describe('POST /api/itsm/users', () => {
    it('creates user as admin', async () => {
      const res = await request(app)
        .post('/api/itsm/users')
        .set('X-Demo-User', ADMIN)
        .send({ id: 'new.user', name: 'New', email: 'new@gov.br', role: 'admin' });
      expect(res.status).toBe(201);
      expect(res.body.id).toBe('new.user');
    });

    it('returns 409 on duplicate', async () => {
      const res = await request(app)
        .post('/api/itsm/users')
        .set('X-Demo-User', ADMIN)
        .send({ id: 'test.user', name: 'Dup', email: 'd@g', role: 'operator' });
      expect(res.status).toBe(409);
    });

    it('returns 403 for operator', async () => {
      const res = await request(app)
        .post('/api/itsm/users')
        .set('X-Demo-User', OPERATOR)
        .send({ id: 'x', name: 'x', email: 'x@y', role: 'operator' });
      expect(res.status).toBe(403);
    });

    it('returns 400 for bad role', async () => {
      const res = await request(app)
        .post('/api/itsm/users')
        .set('X-Demo-User', ADMIN)
        .send({ id: 'bad', name: 'Bad', email: 'b@g', role: 'superadmin' });
      expect(res.status).toBe(400);
    });
  });

  describe('PATCH /api/itsm/users/:id', () => {
    it('updates whitelisted fields', async () => {
      const res = await request(app)
        .patch('/api/itsm/users/test.user')
        .set('X-Demo-User', ADMIN)
        .send({ name: 'Updated', email: 'updated@gov.br' });
      expect(res.status).toBe(200);
      expect(res.body.name).toBe('Updated');
    });

    it('returns 404 for unknown user', async () => {
      const res = await request(app)
        .patch('/api/itsm/users/nope')
        .set('X-Demo-User', ADMIN)
        .send({ name: 'x' });
      expect(res.status).toBe(404);
    });

    it('rejects non-whitelisted keys', async () => {
      const res = await request(app)
        .patch('/api/itsm/users/test.user')
        .set('X-Demo-User', ADMIN)
        .send({ _id: 'hack' });
      expect(res.status).toBe(400);
    });

    it('allows patching role, group, status, mfa, last', async () => {
      const res = await request(app)
        .patch('/api/itsm/users/test.user')
        .set('X-Demo-User', ADMIN)
        .send({ role: 'admin', group: 'setic', status: 'active', mfa: 'totp', last: 'now' });
      expect(res.status).toBe(200);
      expect(res.body.role).toBe('admin');
    });
  });
});
