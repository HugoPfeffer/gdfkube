import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { buildApp } from '../src/app.js';
import { FormDefModel } from '../src/models/FormDef.js';

const app = buildApp();
const ADMIN = 'maria.costa';
const OPERATOR = 'joao.silva';

const SEED_FORM = {
  _id: 'cluster-request',
  name: 'OpenShift Cluster Request',
  topic: 'dbz.gdfkube.requests',
  status: 'active',
  fields: [
    { key: 'clusterName', label: 'Cluster', type: 'text', bucket: 'vars', required: true },
  ],
};

describe('Forms endpoints', () => {
  beforeEach(async () => {
    await FormDefModel.create(SEED_FORM);
    await FormDefModel.create({
      _id: 'disabled-form',
      name: 'Disabled',
      topic: 'test',
      status: 'disabled',
    });
  });

  describe('GET /api/itsm/forms', () => {
    it('returns active forms only by default', async () => {
      const res = await request(app)
        .get('/api/itsm/forms')
        .set('X-Demo-User', OPERATOR);
      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);
      expect(res.body[0].id).toBe('cluster-request');
    });

    it('includes disabled forms for admin with ?include=disabled', async () => {
      const res = await request(app)
        .get('/api/itsm/forms?include=disabled')
        .set('X-Demo-User', ADMIN);
      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(2);
    });

    it('returns 403 for operator with ?include=disabled', async () => {
      const res = await request(app)
        .get('/api/itsm/forms?include=disabled')
        .set('X-Demo-User', OPERATOR);
      expect(res.status).toBe(403);
    });
  });

  describe('GET /api/itsm/forms/:id', () => {
    it('returns form by id', async () => {
      const res = await request(app)
        .get('/api/itsm/forms/cluster-request')
        .set('X-Demo-User', OPERATOR);
      expect(res.status).toBe(200);
      expect(res.body.name).toBe('OpenShift Cluster Request');
    });

    it('returns 404 for unknown form', async () => {
      const res = await request(app)
        .get('/api/itsm/forms/nope')
        .set('X-Demo-User', OPERATOR);
      expect(res.status).toBe(404);
    });
  });

  describe('POST /api/itsm/forms', () => {
    it('creates form as admin', async () => {
      const res = await request(app)
        .post('/api/itsm/forms')
        .set('X-Demo-User', ADMIN)
        .send({ id: 'new-form', name: 'New', topic: 'test', status: 'active' });
      expect(res.status).toBe(201);
      expect(res.body.id).toBe('new-form');
    });

    it('returns 409 on duplicate', async () => {
      const res = await request(app)
        .post('/api/itsm/forms')
        .set('X-Demo-User', ADMIN)
        .send({ id: 'cluster-request', name: 'Dup', topic: 'test', status: 'active' });
      expect(res.status).toBe(409);
    });

    it('does NOT alias body._id when id is absent', async () => {
      const res = await request(app)
        .post('/api/itsm/forms')
        .set('X-Demo-User', ADMIN)
        .send({ _id: 'should.not.persist', name: 'X', topic: 'test', status: 'active' });
      expect(res.status).toBe(201);
      expect(res.body._id).not.toBe('should.not.persist');
    });

    it('returns 403 for operator', async () => {
      const res = await request(app)
        .post('/api/itsm/forms')
        .set('X-Demo-User', OPERATOR)
        .send({ id: 'op-form', name: 'x', topic: 'x', status: 'active' });
      expect(res.status).toBe(403);
    });
  });

  describe('PATCH /api/itsm/forms/:id', () => {
    it('updates whitelisted fields', async () => {
      const res = await request(app)
        .patch('/api/itsm/forms/cluster-request')
        .set('X-Demo-User', ADMIN)
        .send({ name: 'Renamed' });
      expect(res.status).toBe(200);
      expect(res.body.name).toBe('Renamed');
    });

    it('rejects non-whitelisted keys', async () => {
      const res = await request(app)
        .patch('/api/itsm/forms/cluster-request')
        .set('X-Demo-User', ADMIN)
        .send({ _id: 'hack' });
      expect(res.status).toBe(400);
    });

    it('returns 404 for unknown form', async () => {
      const res = await request(app)
        .patch('/api/itsm/forms/nope')
        .set('X-Demo-User', ADMIN)
        .send({ name: 'x' });
      expect(res.status).toBe(404);
    });

    it('returns 403 for operator', async () => {
      const res = await request(app)
        .patch('/api/itsm/forms/cluster-request')
        .set('X-Demo-User', OPERATOR)
        .send({ name: 'x' });
      expect(res.status).toBe(403);
    });
  });
});
