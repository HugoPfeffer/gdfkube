// GenericRequest — schema-driven form runner.
//
// Reads `state.fields[formId]` from the data context and renders a form
// (left column) plus a live JSON payload preview (right column). Submit
// validates every field, dispatches ADD_REQUEST with status:"approval",
// triggers an info toast, and navigates to request-detail.

import { useMemo, useState, type ChangeEvent } from 'react';
import { itsmApi } from '../api/itsmApi';
import { Icons } from '../icons/Icons';
import type { Navigate } from '../router';
import type { Toast } from '../shell/ToastStack';
import { useGdfData, useGdfDispatch } from '../state/dataContext';
import type { Env, Field, Request, Role, User } from '../types';
import { interpolateTokens } from './interpolateTokens';
import { parseSelectOptions } from './parseSelectOptions';
import { PayloadPreview } from './PayloadPreview';
import { PrefixedInput } from './PrefixedInput';
import { RadioCards } from './RadioCards';
import { validateField } from './validate';

// "What happens next" narrative steps. Cluster requests cross MongoDB +
// Debezium so the sidebar lists 6 steps; other forms collapse those into
// a 5-step list to keep the footprint compact.
const CLUSTER_NEXT_STEPS = [
  'Form submitted',
  'MongoDB document created',
  'Debezium captured CDC event',
  'Kafka topic published',
  'Camel route reconciled',
  'ArgoCD synced cluster manifests',
] as const;

const GENERIC_NEXT_STEPS = [
  'Form submitted',
  'MongoDB document created',
  'Camel route reconciled',
  'Git PR opened',
  'ArgoCD synced manifests',
] as const;

function getNextSteps(formId: string): readonly string[] {
  return formId === 'cluster-request' ? CLUSTER_NEXT_STEPS : GENERIC_NEXT_STEPS;
}

interface GenericRequestProps {
  formId: string;
  navigate: Navigate;
  setToast: (t: Toast) => void;
  user: User;
  role: Role;
}

type FormValues = Record<string, unknown>;

function asStringMap(values: FormValues): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(values)) {
    if (v === undefined || v === null) continue;
    out[k] = String(v);
  }
  return out;
}

function partitionByBucket(fields: Field[], values: FormValues) {
  const meta: Record<string, unknown> = {};
  const vars: Record<string, unknown> = {};
  for (const f of fields) {
    const v = values[f.key];
    if (v === undefined) continue;
    if (f.bucket === 'meta') meta[f.key] = v;
    else vars[f.key] = v;
  }
  return { meta, vars };
}

// Seed initial form values from each field's schema so the live preview
// reflects the schema's intent at first paint:
//   select   -> first parsed option's `value` (or '' if none)
//   number   -> field.min if defined, else ''
//   checkbox -> false
//   else     -> ''
function seedDefaults(fields: Field[]): FormValues {
  const out: FormValues = {};
  for (const f of fields) {
    if (f.type === 'select') {
      const options = parseSelectOptions(f.options ?? '');
      out[f.key] = options[0]?.value ?? '';
    } else if (f.type === 'number') {
      out[f.key] = typeof f.min === 'number' ? f.min : '';
    } else if (f.type === 'checkbox') {
      out[f.key] = false;
    } else {
      out[f.key] = '';
    }
  }
  return out;
}

function genId(): string {
  // Deterministic-shaped synthetic id; collisions are not a concern for the demo.
  const n = Math.floor(Math.random() * 9_000_000 + 1_000_000);
  return `REQ${n}`;
}

function genCorrelationId(): string {
  return Math.random().toString(36).slice(2, 10);
}

export function GenericRequest({
  formId,
  navigate,
  setToast,
  user,
}: GenericRequestProps) {
  const { fields: allFields, forms } = useGdfData();
  const dispatch = useGdfDispatch();
  const fields = useMemo<Field[]>(
    () => allFields[formId] ?? [],
    [allFields, formId],
  );
  const formDef = forms.find((f) => f.id === formId);

  const [values, setValues] = useState<FormValues>(() => seedDefaults(fields));
  const [isSaving, setIsSaving] = useState(false);

  const stringValues = useMemo(() => asStringMap(values), [values]);
  const { meta, vars } = useMemo(
    () => partitionByBucket(fields, values),
    [fields, values],
  );

  const isValid = useMemo(() => {
    for (const f of fields) {
      if (validateField(f, values[f.key]) !== null) return false;
    }
    return true;
  }, [fields, values]);

  const setValue = (key: string, next: unknown) =>
    setValues((prev) => ({ ...prev, [key]: next }));

  const onSubmit = async () => {
    if (!isValid || isSaving) return;
    setIsSaving(true);
    const env: Env = (values.environment as Env) || 'development';
    const justification =
      typeof values.justification === 'string' && values.justification.length > 0
        ? values.justification
        : undefined;

    const thinBody: Record<string, unknown> = { formId, env, vars };
    if (justification) thinBody.justification = justification;
    const policyChecks = [{ id: 'baseline', label: 'Baseline policies', ok: true }];
    thinBody.policyChecks = policyChecks;

    try {
      const { id } = await itsmApi.requests.create(thinBody);
      const doc = await itsmApi.requests.get(id);

      const newRequest: Request = {
        id: doc.id as string,
        formId: (doc.formId as string) ?? formId,
        env: (doc.env as Env) ?? env,
        requester: (doc.requester as User) ?? user,
        requesterGroupName:
          (doc.requesterGroupName as string) ||
          (values.requesterGroupName as string) ||
          user.group ||
          '',
        status: (doc.status as Request['status']) ?? 'approval',
        stage: (doc.stage as number) ?? 0,
        submittedAt: (doc.submittedAt as string) ?? new Date().toISOString(),
        justification: doc.justification as string | undefined,
        vars: (doc.vars as Record<string, unknown>) ?? vars,
        meta: (doc.meta as Record<string, unknown>) ?? {},
        policyChecks: (doc.policyChecks as Request['policyChecks']) ?? policyChecks,
        approvalChain: (doc.approvalChain as Request['approvalChain']) ?? [],
      };

      dispatch({ type: 'ADD_REQUEST', request: newRequest });
      setToast({ kind: 'info', title: 'Request submitted for approval' });
      navigate('request-detail', { id, submitted: true });
    } catch (err) {
      setToast({ kind: 'warn', title: 'Submit failed', body: err instanceof Error ? err.message : String(err) });
    } finally {
      setIsSaving(false);
    }
  };

  const renderField = (field: Field) => {
    const inputId = `f-${formId}-${field.key}`;
    const helpId = field.help ? `${inputId}-help` : undefined;
    const raw = values[field.key];
    const stringValue = raw === undefined || raw === null ? '' : String(raw);
    const set = (next: unknown) => setValue(field.key, next);

    let control: React.ReactNode = null;
    if (field.type === 'text') {
      control = (
        <PrefixedInput
          field={field}
          value={stringValue}
          onChange={set}
          siblingValues={stringValues}
          inputId={inputId}
          describedBy={helpId}
        />
      );
    } else if (field.type === 'textarea') {
      control = (
        <textarea
          id={inputId}
          value={stringValue}
          placeholder={field.placeholder}
          onChange={(e: ChangeEvent<HTMLTextAreaElement>) => set(e.target.value)}
          aria-describedby={helpId}
        />
      );
    } else if (field.type === 'number') {
      control = (
        <input
          id={inputId}
          type="number"
          value={raw === undefined || raw === null ? '' : (raw as number | string)}
          min={field.min}
          max={field.max}
          onChange={(e: ChangeEvent<HTMLInputElement>) => {
            const v = e.target.value;
            set(v === '' ? undefined : Number(v));
          }}
          aria-describedby={helpId}
        />
      );
    } else if (field.type === 'checkbox') {
      control = (
        <input
          id={inputId}
          type="checkbox"
          checked={Boolean(raw)}
          onChange={(e: ChangeEvent<HTMLInputElement>) => set(e.target.checked)}
          aria-describedby={helpId}
        />
      );
    } else if (field.type === 'select' && field.displayAs === 'radio-cards') {
      control = <RadioCards field={field} value={stringValue} onChange={set} />;
    } else if (field.type === 'select') {
      const options = parseSelectOptions(field.options ?? '');
      control = (
        <select
          id={inputId}
          value={stringValue}
          onChange={(e: ChangeEvent<HTMLSelectElement>) => set(e.target.value)}
          aria-describedby={helpId}
        >
          <option value="">Select…</option>
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      );
    }

    const helpText = field.help
      ? interpolateTokens(field.help, stringValues)
      : null;

    const fieldError = validateField(field, raw);

    return (
      <div className="field" key={field.key}>
        <label htmlFor={inputId}>
          {field.label}
          {field.required && <span className="req">*</span>}
        </label>
        {control}
        {fieldError && <small className="field-error">{fieldError}</small>}
        {helpText && (
          <div className="help" id={helpId}>
            {helpText}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="page new-request-page">
      <div className="page-head">
        <h1 className="page-title">{formDef?.name ?? 'New Request'}</h1>
        {formDef?.description && (
          <p className="page-sub">{formDef.description}</p>
        )}
      </div>

      <div
        className="card"
        style={{
          display: 'grid',
          gridTemplateColumns: '1.4fr 1fr',
          gap: 24,
          padding: 18,
        }}
      >
        <div>
          <div className="form-grid full">{fields.map(renderField)}</div>
          <div
            style={{ display: 'flex', gap: 8, marginTop: 18, justifyContent: 'flex-end' }}
          >
            <button
              type="button"
              className="btn"
              onClick={() => navigate('catalog')}
            >
              Cancel
            </button>
            <button
              type="button"
              className="btn primary"
              disabled={!isValid || isSaving}
              onClick={onSubmit}
            >
              {isSaving ? 'Submitting…' : 'Submit'}
            </button>
          </div>
        </div>
        <aside>
          <h3
            style={{
              fontSize: 12,
              fontWeight: 600,
              color: 'var(--ink-500)',
              textTransform: 'uppercase',
              letterSpacing: 0.4,
              margin: '0 0 8px',
            }}
          >
            Live payload
          </h3>
          <PayloadPreview meta={meta} vars={vars} />

          <aside className="next-steps" style={{ marginTop: 18 }}>
            <h3
              style={{
                fontSize: 12,
                fontWeight: 600,
                color: 'var(--ink-500)',
                textTransform: 'uppercase',
                letterSpacing: 0.4,
                margin: '0 0 8px',
              }}
            >
              What happens next
            </h3>
            <ol>
              {getNextSteps(formId).map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ol>
            <div
              className="kafka-topic"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                marginTop: 12,
                fontSize: 12,
                color: 'var(--ink-500)',
              }}
            >
              <Icons.shield />
              <span>Routed via Kafka topic dbz.gdfkube.requests</span>
            </div>
          </aside>
        </aside>
      </div>
    </div>
  );
}

export default GenericRequest;
