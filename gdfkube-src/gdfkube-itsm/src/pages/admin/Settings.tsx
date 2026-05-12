import { useEffect, useState } from 'react';
import { ApiError, itsmApi } from '../../api/itsmApi';
import type { Role } from '../../types';
import type { Toast } from '../../shell/ToastStack';

interface SettingsProps {
  role: Role;
  setToast: (toast: Toast | null) => void;
}

interface FormState {
  endpoint: string;
  owner: string;
  token: string;
}

interface Meta {
  updatedAt?: string;
  updatedBy?: string;
}

const ENDPOINT_RE = /^https?:\/\/.+$/;
const OWNER_RE = /^[a-zA-Z0-9_-]+$/;

function validateForm(form: FormState): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!form.endpoint) errors.endpoint = 'Required';
  else if (!ENDPOINT_RE.test(form.endpoint)) errors.endpoint = 'Invalid format';
  if (!form.owner) errors.owner = 'Required';
  else if (!OWNER_RE.test(form.owner)) errors.owner = 'Invalid format';
  if (!form.token) errors.token = 'Required';
  return errors;
}

export function Settings({ role, setToast }: SettingsProps) {
  const [form, setForm] = useState<FormState>({
    endpoint: '',
    owner: '',
    token: '',
  });
  const [meta, setMeta] = useState<Meta>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (role !== 'admin') return;
    const ctrl = new AbortController();
    itsmApi.settings
      .get(true, ctrl.signal)
      .then((data) => {
        setForm({
          endpoint: (data.endpoint as string) ?? '',
          owner: (data.owner as string) ?? '',
          token: (data.token as string) ?? '',
        });
        setMeta({
          updatedAt: data.updatedAt as string | undefined,
          updatedBy: data.updatedBy as string | undefined,
        });
      })
      .catch((err) => {
        if (err instanceof ApiError && err.status === 404) return;
        if (err.name === 'AbortError') return;
        setToast({
          kind: 'error',
          title: 'Failed to load settings',
          body: String(err.message ?? err),
        });
      })
      .finally(() => setLoading(false));
    return () => ctrl.abort();
  }, [role, setToast]);

  if (role !== 'admin') {
    return (
      <div className="page">
        <div className="page-head">
          <h1 className="page-title">Settings</h1>
          <p className="page-sub">
            Admin role required to view this page.
          </p>
        </div>
      </div>
    );
  }

  const handleChange = (field: keyof FormState, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    setErrors((prev) => {
      const next = { ...prev };
      delete next[field];
      return next;
    });
  };

  const handleSave = async () => {
    const errs = validateForm(form);
    if (Object.keys(errs).length > 0) {
      setErrors(errs);
      return;
    }
    setSaving(true);
    try {
      const data = await itsmApi.settings.update(form);
      setMeta({
        updatedAt: data.updatedAt as string | undefined,
        updatedBy: data.updatedBy as string | undefined,
      });
      setToast({ kind: 'success', title: 'Settings saved' });
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        const fields = (err.details as { fields?: string[] })?.fields;
        const body = fields ? `Invalid fields: ${fields.join(', ')}` : err.message;
        setToast({ kind: 'error', title: 'Save failed', body });
      } else {
        const msg = err instanceof Error ? err.message : String(err);
        setToast({ kind: 'error', title: 'Save failed', body: msg });
      }
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="page">
        <div className="page-head">
          <h1 className="page-title">Settings</h1>
          <p className="page-sub">Loading…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      <div className="page-head">
        <h1 className="page-title">Settings</h1>
        <p className="page-sub">Global Gitea configuration for repository provisioning.</p>
      </div>

      <div className="card" style={{ maxWidth: 600 }}>
        <div className="card-body">
          <label className="field-label">
            <span>Gitea Endpoint URL</span>
            <input
              type="text"
              className="input"
              placeholder="https://gitea.example.com"
              value={form.endpoint}
              onChange={(e) => handleChange('endpoint', e.target.value)}
            />
            {errors.endpoint && <span className="field-error">{errors.endpoint}</span>}
            <span className="field-help">Base URL of your Gitea instance (e.g., https://gitea.example.com)</span>
          </label>

          <label className="field-label">
            <span>Owner</span>
            <input
              type="text"
              className="input"
              placeholder="gdfkube"
              value={form.owner}
              onChange={(e) => handleChange('owner', e.target.value)}
            />
            {errors.owner && <span className="field-error">{errors.owner}</span>}
            <span className="field-help">User or organization under which forms will create repos</span>
          </label>

          <label className="field-label">
            <span>Personal Access Token</span>
            <input
              type="password"
              className="input"
              placeholder="PAT"
              value={form.token}
              onChange={(e) => handleChange('token', e.target.value)}
            />
            {errors.token && <span className="field-error">{errors.token}</span>}
            <span className="field-help">PAT with `write:repository` scope</span>
          </label>

          {(meta.updatedAt || meta.updatedBy) && (
            <div className="field-help" style={{ borderTop: '1px solid var(--border)', paddingTop: 12 }}>
              {meta.updatedBy && <span>Last updated by <strong>{meta.updatedBy}</strong></span>}
              {meta.updatedAt && meta.updatedBy && <span> · </span>}
              {meta.updatedAt && <span>{new Date(meta.updatedAt).toLocaleString()}</span>}
            </div>
          )}

          <div>
            <button
              type="button"
              className="btn primary"
              disabled={saving}
              onClick={handleSave}
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
