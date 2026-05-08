import { describe, it, expect } from 'vitest';
import { RequestModel } from '../src/models/Request.js';
import { FormDefModel } from '../src/models/FormDef.js';
import { UserModel } from '../src/models/User.js';
import { GroupModel } from '../src/models/Group.js';

describe('Request model', () => {
  it('creates a valid request', async () => {
    const doc = new RequestModel({
      _id: 'REQ001',
      formId: 'cluster-request',
      env: 'production',
      requester: {
        id: 'joao.silva',
        name: 'João Silva',
        email: 'joao@saude.gov',
        role: 'operator',
      },
      requesterGroupName: 'saude',
      status: 'approval',
      stage: 0,
      submittedAt: '2026-05-01T10:00:00Z',
      vars: { clusterName: 'test' },
      meta: { correlationId: 'REQ001' },
    });
    const err = doc.validateSync();
    expect(err).toBeUndefined();
  });

  it('rejects invalid status enum', async () => {
    const doc = new RequestModel({
      _id: 'REQ002',
      formId: 'x',
      env: 'production',
      requester: { id: 'a', name: 'a', email: 'a@b', role: 'operator' },
      requesterGroupName: 'x',
      status: 'bogus',
      stage: 0,
      submittedAt: 'now',
    });
    const err = doc.validateSync();
    expect(err).toBeDefined();
  });

  it('rejects invalid env enum', async () => {
    const doc = new RequestModel({
      _id: 'REQ003',
      formId: 'x',
      env: 'bogus' as any,
      requester: { id: 'a', name: 'a', email: 'a@b', role: 'operator' },
      requesterGroupName: 'x',
      status: 'approval',
      stage: 0,
      submittedAt: 'now',
    });
    const err = doc.validateSync();
    expect(err).toBeDefined();
  });

  it('defaults approvalChain to empty array and reason to null', () => {
    const doc = new RequestModel({
      _id: 'REQ004',
      formId: 'x',
      env: 'staging',
      requester: { id: 'a', name: 'a', email: 'a@b', role: 'operator' },
      requesterGroupName: 'x',
      stage: 0,
      submittedAt: 'now',
    });
    expect(doc.approvalChain).toEqual([]);
    expect(doc.reason).toBeNull();
  });

  it('rejects stage > 6', () => {
    const doc = new RequestModel({
      _id: 'REQ005',
      formId: 'x',
      env: 'staging',
      requester: { id: 'a', name: 'a', email: 'a@b', role: 'operator' },
      requesterGroupName: 'x',
      stage: 7,
      submittedAt: 'now',
    });
    const err = doc.validateSync();
    expect(err).toBeDefined();
  });

  it('does not add __v field', () => {
    const doc = new RequestModel({
      _id: 'REQ006',
      formId: 'x',
      env: 'development',
      requester: { id: 'a', name: 'a', email: 'a@b', role: 'operator' },
      requesterGroupName: 'x',
      stage: 0,
      submittedAt: 'now',
    });
    const obj = doc.toObject();
    expect(obj).not.toHaveProperty('__v');
  });
});

describe('FormDef model', () => {
  it('creates a valid form', () => {
    const doc = new FormDefModel({
      _id: 'cluster-request',
      name: 'OpenShift Cluster Request',
      topic: 'dbz.gdfkube.requests',
      status: 'active',
      fields: [
        { key: 'clusterName', label: 'Cluster', type: 'text', bucket: 'vars' },
      ],
    });
    const err = doc.validateSync();
    expect(err).toBeUndefined();
  });

  it('rejects invalid status', () => {
    const doc = new FormDefModel({
      _id: 'bad',
      name: 'x',
      topic: 'x',
      status: 'archived',
    });
    const err = doc.validateSync();
    expect(err).toBeDefined();
  });

  it('rejects invalid field type', () => {
    const doc = new FormDefModel({
      _id: 'bad2',
      name: 'x',
      topic: 'x',
      status: 'active',
      fields: [{ key: 'k', label: 'l', type: 'date', bucket: 'vars' }],
    });
    const err = doc.validateSync();
    expect(err).toBeDefined();
  });
});

describe('User model', () => {
  it('creates a valid user', () => {
    const doc = new UserModel({
      _id: 'joao.silva',
      name: 'João Silva',
      email: 'joao@saude.gov',
      role: 'operator',
    });
    const err = doc.validateSync();
    expect(err).toBeUndefined();
  });

  it('rejects invalid role', () => {
    const doc = new UserModel({
      _id: 'bad',
      name: 'x',
      email: 'x@y',
      role: 'superadmin',
    });
    const err = doc.validateSync();
    expect(err).toBeDefined();
  });

  it('requires name and email', () => {
    const doc = new UserModel({ _id: 'no-name', role: 'admin' });
    const err = doc.validateSync();
    expect(err).toBeDefined();
    expect(err!.errors).toHaveProperty('name');
    expect(err!.errors).toHaveProperty('email');
  });
});

describe('Group model', () => {
  it('creates a valid group', () => {
    const doc = new GroupModel({
      _id: 'saude',
      name: 'Saúde',
      fullName: 'Department of Health',
    });
    const err = doc.validateSync();
    expect(err).toBeUndefined();
  });

  it('defaults users and forms to empty arrays', () => {
    const doc = new GroupModel({ _id: 'test', name: 'Test' });
    expect(doc.users).toEqual([]);
    expect(doc.forms).toEqual([]);
  });

  it('requires name', () => {
    const doc = new GroupModel({ _id: 'no-name' });
    const err = doc.validateSync();
    expect(err).toBeDefined();
    expect(err!.errors).toHaveProperty('name');
  });
});
