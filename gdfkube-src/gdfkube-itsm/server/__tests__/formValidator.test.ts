import { describe, it, expect } from 'vitest';
import { validateAgainstFormDef } from '../src/services/formValidator.js';
import type { FormDefLike } from '../src/services/types.js';

const CLUSTER_FORM: FormDefLike = {
  fields: [
    {
      key: 'requesterGroupName',
      label: 'Department',
      type: 'select',
      bucket: 'meta',
      required: true,
      options:
        'saude|Saúde — Department of Health; educacao|Educação — Department of Education; transportes|Transportes',
    },
    {
      key: 'clusterName',
      label: 'Cluster name',
      type: 'text',
      bucket: 'vars',
      required: true,
      validation: '^[a-z][a-z0-9-]*$',
    },
    {
      key: 'environment',
      label: 'Environment',
      type: 'select',
      bucket: 'vars',
      required: true,
      options:
        'development|Development|Dev sandbox|#16a34a; staging|Staging|Pre-prod|#f59e0b; production|Production|Strict|#dc2626',
    },
    {
      key: 'nodeCount',
      label: 'Workers',
      type: 'number',
      bucket: 'vars',
      required: true,
      min: 1,
      max: 10,
    },
  ],
};

describe('formValidator', () => {
  it('happy path — partitions vars and meta', () => {
    const result = validateAgainstFormDef(CLUSTER_FORM, {
      requesterGroupName: 'saude',
      clusterName: 'vacinacao',
      environment: 'production',
      nodeCount: 3,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.vars).toEqual({
      clusterName: 'vacinacao',
      environment: 'production',
      nodeCount: 3,
    });
    expect(result.meta).toEqual({ requesterGroupName: 'saude' });
  });

  it('returns required error for missing fields', () => {
    const result = validateAgainstFormDef(CLUSTER_FORM, {});
    expect(result.ok).toBe(false);
    if (result.ok) return;
    const codes = result.errors.map((e) => e.code);
    expect(codes).toContain('required');
    expect(result.errors.length).toBe(4);
  });

  it('returns pattern error for invalid regex', () => {
    const result = validateAgainstFormDef(CLUSTER_FORM, {
      requesterGroupName: 'saude',
      clusterName: '123-INVALID',
      environment: 'production',
      nodeCount: 3,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors).toEqual([{ key: 'clusterName', code: 'pattern' }]);
  });

  it('returns range error for out-of-bounds number', () => {
    const result = validateAgainstFormDef(CLUSTER_FORM, {
      requesterGroupName: 'saude',
      clusterName: 'valid',
      environment: 'production',
      nodeCount: 99,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors).toEqual([{ key: 'nodeCount', code: 'range' }]);
  });

  it('returns enum error for invalid select value', () => {
    const result = validateAgainstFormDef(CLUSTER_FORM, {
      requesterGroupName: 'bogus-dept',
      clusterName: 'valid',
      environment: 'production',
      nodeCount: 3,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors).toEqual([
      { key: 'requesterGroupName', code: 'enum' },
    ]);
  });

  it('ignores unknown keys in body', () => {
    const result = validateAgainstFormDef(CLUSTER_FORM, {
      requesterGroupName: 'educacao',
      clusterName: 'test',
      environment: 'staging',
      nodeCount: 2,
      unknownField: 'should-be-ignored',
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.vars).not.toHaveProperty('unknownField');
    expect(result.meta).not.toHaveProperty('unknownField');
  });

  it('handles comma-delimited options', () => {
    const form: FormDefLike = {
      fields: [
        {
          key: 'dept',
          label: 'Dept',
          type: 'select',
          bucket: 'meta',
          required: true,
          options: 'saude, educacao, transportes',
        },
      ],
    };
    const ok = validateAgainstFormDef(form, { dept: 'educacao' });
    expect(ok.ok).toBe(true);

    const bad = validateAgainstFormDef(form, { dept: 'invalid' });
    expect(bad.ok).toBe(false);
  });
});
