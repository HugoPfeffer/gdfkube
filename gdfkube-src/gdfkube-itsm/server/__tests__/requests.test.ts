import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { buildApp } from '../src/app.js';
import { RequestModel } from '../src/models/Request.js';
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
    {
      key: 'clusterName',
      label: 'Cluster',
      type: 'text',
      bucket: 'vars',
      required: true,
      validation: '^[a-z][a-z0-9-]*$',
    },
    {
      key: 'environment',
      label: 'Env',
      type: 'select',
      bucket: 'vars',
      required: true,
      options: 'development|Dev; staging|Staging; production|Prod',
    },
    {
      key: 'nodeCount',
      label: 'Nodes',
      type: 'number',
      bucket: 'vars',
      required: true,
      min: 1,
      max: 10,
    },
  ],
};

const SEED_REQUEST = {
  _id: 'REQ001',
  formId: 'cluster-request',
  env: 'production',
  requester: { id: 'joao.silva', name: 'João Silva', email: 'j@s.gov', role: 'operator' },
  requesterGroupName: 'saude',
  status: 'approval',
  stage: 0,
  submittedAt: '2026-05-01T10:00:00Z',
  vars: { clusterName: 'vacinacao' },
  meta: { correlationId: 'REQ001' },
};

describe('Requests endpoints', () => {
  beforeEach(async () => {
    await FormDefModel.create(SEED_FORM);
    await RequestModel.create(SEED_REQUEST);
    await RequestModel.create({
      ...SEED_REQUEST,
      _id: 'REQ002',
      status: 'ready',
      submittedAt: '2026-05-02T10:00:00Z',
      requesterGroupName: 'educacao',
      formId: 'cluster-request',
    });
  });

  describe('GET /api/itsm/requests', () => {
    it('returns requests sorted desc by submittedAt', async () => {
      const res = await request(app)
        .get('/api/itsm/requests')
        .set('X-Demo-User', OPERATOR);
      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(2);
      expect(res.body[0].id).toBe('REQ002');
      expect(res.body[1].id).toBe('REQ001');
    });

    it('filters by status', async () => {
      const res = await request(app)
        .get('/api/itsm/requests?status=approval')
        .set('X-Demo-User', OPERATOR);
      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);
      expect(res.body[0].id).toBe('REQ001');
    });

    it('filters by formId', async () => {
      const res = await request(app)
        .get('/api/itsm/requests?formId=cluster-request')
        .set('X-Demo-User', OPERATOR);
      expect(res.body).toHaveLength(2);
    });

    it('filters by requesterGroup', async () => {
      const res = await request(app)
        .get('/api/itsm/requests?requesterGroup=educacao')
        .set('X-Demo-User', OPERATOR);
      expect(res.body).toHaveLength(1);
      expect(res.body[0].id).toBe('REQ002');
    });
  });

  describe('GET /api/itsm/requests/:id', () => {
    it('returns request by id', async () => {
      const res = await request(app)
        .get('/api/itsm/requests/REQ001')
        .set('X-Demo-User', OPERATOR);
      expect(res.status).toBe(200);
      expect(res.body.id).toBe('REQ001');
      expect(res.body.formId).toBe('cluster-request');
    });

    it('returns 404 for unknown id', async () => {
      const res = await request(app)
        .get('/api/itsm/requests/NOPE')
        .set('X-Demo-User', OPERATOR);
      expect(res.status).toBe(404);
    });
  });

  describe('POST /api/itsm/requests', () => {
    it('creates request with {id} response and Location header', async () => {
      const res = await request(app)
        .post('/api/itsm/requests')
        .set('X-Demo-User', OPERATOR)
        .send({
          formId: 'cluster-request',
          env: 'production',
          clusterName: 'test-cluster',
          environment: 'production',
          nodeCount: 3,
        });
      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty('id');
      expect(Object.keys(res.body)).toEqual(['id']);
      expect(res.headers.location).toContain('/api/itsm/requests/');
    });

    it('assigns a REQ-pattern id with form-type letter suffix', async () => {
      const res = await request(app)
        .post('/api/itsm/requests')
        .set('X-Demo-User', OPERATOR)
        .send({
          formId: 'cluster-request',
          env: 'staging',
          clusterName: 'ulid-test',
          environment: 'staging',
          nodeCount: 1,
        });
      expect(res.body.id).toMatch(/^REQ\d{7}[CNSX]$/);
    });

    it('assigns sequential REQ ids to concurrent submissions', async () => {
      const payload = {
        formId: 'cluster-request',
        env: 'production',
        clusterName: 'concurrent-test',
        environment: 'production',
        nodeCount: 2,
      };

      const [resA, resB] = await Promise.all([
        request(app)
          .post('/api/itsm/requests')
          .set('X-Demo-User', OPERATOR)
          .send({ ...payload, clusterName: 'concurrent-a' }),
        request(app)
          .post('/api/itsm/requests')
          .set('X-Demo-User', OPERATOR)
          .send({ ...payload, clusterName: 'concurrent-b' }),
      ]);

      expect(resA.status).toBe(201);
      expect(resB.status).toBe(201);
      expect(resA.body.id).toMatch(/^REQ\d{7}[CNSX]$/);
      expect(resB.body.id).toMatch(/^REQ\d{7}[CNSX]$/);
      expect(resA.body.id).not.toBe(resB.body.id);

      const numA = parseInt(resA.body.id.slice(3, 10), 10);
      const numB = parseInt(resB.body.id.slice(3, 10), 10);
      expect(Math.abs(numA - numB)).toBe(1);
    });

    it('injects meta.requesterGroupName from demoUser.group', async () => {
      const createRes = await request(app)
        .post('/api/itsm/requests')
        .set('X-Demo-User', OPERATOR)
        .send({
          formId: 'cluster-request',
          env: 'development',
          clusterName: 'meta-group-test',
          environment: 'development',
          nodeCount: 2,
        });
      expect(createRes.status).toBe(201);

      const getRes = await request(app)
        .get(`/api/itsm/requests/${createRes.body.id}`)
        .set('X-Demo-User', OPERATOR);
      expect(getRes.body.requesterGroupName).toBe('saude');
      expect(getRes.body.meta.requesterGroupName).toBe('saude');
      expect(getRes.body.meta.correlationId).toBe(createRes.body.id);
    });

    it('sets meta.correlationId to _id', async () => {
      const createRes = await request(app)
        .post('/api/itsm/requests')
        .set('X-Demo-User', OPERATOR)
        .send({
          formId: 'cluster-request',
          env: 'development',
          clusterName: 'corr-test',
          environment: 'development',
          nodeCount: 2,
        });

      const getRes = await request(app)
        .get(`/api/itsm/requests/${createRes.body.id}`)
        .set('X-Demo-User', OPERATOR);
      expect(getRes.body.meta.correlationId).toBe(createRes.body.id);
    });

    it('returns 400 for validation errors', async () => {
      const res = await request(app)
        .post('/api/itsm/requests')
        .set('X-Demo-User', OPERATOR)
        .send({ formId: 'cluster-request', env: 'production' });
      expect(res.status).toBe(400);
      expect(res.body.details).toBeDefined();
      expect(res.body.details.length).toBeGreaterThan(0);
    });

    it('rejects invalid env', async () => {
      const res = await request(app)
        .post('/api/itsm/requests')
        .set('X-Demo-User', OPERATOR)
        .send({
          formId: 'cluster-request',
          env: 'invalid-env',
          clusterName: 'x',
          environment: 'production',
          nodeCount: 1,
        });
      expect(res.status).toBe(400);
    });
  });

  describe('POST /api/itsm/requests/:id/approvals', () => {
    it('approved transitions to provisioning/stage 1', async () => {
      const res = await request(app)
        .post('/api/itsm/requests/REQ001/approvals')
        .set('X-Demo-User', ADMIN)
        .send({ action: 'approved', comment: 'LGTM' });
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('provisioning');
      expect(res.body.stage).toBe(1);
      expect(res.body.approvalChain).toHaveLength(1);
      expect(res.body.approvalChain[0].actor).toBe('maria.costa');
    });

    it('rejected transitions to failed with reason', async () => {
      const res = await request(app)
        .post('/api/itsm/requests/REQ001/approvals')
        .set('X-Demo-User', ADMIN)
        .send({ action: 'rejected', comment: 'Not needed' });
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('failed');
      expect(res.body.reason).toBe('Not needed');
    });

    it('requested_changes only appends to chain', async () => {
      const res = await request(app)
        .post('/api/itsm/requests/REQ001/approvals')
        .set('X-Demo-User', ADMIN)
        .send({ action: 'requested_changes', comment: 'Fix name' });
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('approval');
      expect(res.body.approvalChain).toHaveLength(1);
    });

    it('duplicate POST adds 2 entries (no dedupe)', async () => {
      await request(app)
        .post('/api/itsm/requests/REQ001/approvals')
        .set('X-Demo-User', ADMIN)
        .send({ action: 'requested_changes', comment: 'First' });
      const res = await request(app)
        .post('/api/itsm/requests/REQ001/approvals')
        .set('X-Demo-User', ADMIN)
        .send({ action: 'requested_changes', comment: 'Second' });
      expect(res.body.approvalChain).toHaveLength(2);
    });

    it('returns 403 for operator', async () => {
      const res = await request(app)
        .post('/api/itsm/requests/REQ001/approvals')
        .set('X-Demo-User', OPERATOR)
        .send({ action: 'approved' });
      expect(res.status).toBe(403);
    });

    it('returns 404 for unknown id', async () => {
      const res = await request(app)
        .post('/api/itsm/requests/NOPE/approvals')
        .set('X-Demo-User', ADMIN)
        .send({ action: 'approved' });
      expect(res.status).toBe(404);
    });

    it('returns 400 for bad action', async () => {
      const res = await request(app)
        .post('/api/itsm/requests/REQ001/approvals')
        .set('X-Demo-User', ADMIN)
        .send({ action: 'invalid' });
      expect(res.status).toBe(400);
    });
  });
});
