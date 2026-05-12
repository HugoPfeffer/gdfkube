import { useEffect, useState } from 'react';
import type { Navigate } from '../../router';
import type { Role } from '../../types';
import type { Toast } from '../../shell/ToastStack';

interface SettingsProps {
  role: Role;
  navigate: Navigate;
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
    fetch('/api/itsm/settings?reveal=1', {
      headers: { 'X-Demo-User': 'maria.costa' },
      signal: ctrl.signal,
    })
      .then((res) => {
        if (res.status === 404) return null;
        if (!res.ok) throw new Error(res.statusText);
        return res.json();
      })
      .then((data) => {
        if (data) {
          setForm({
            endpoint: data.endpoint ?? '',
            owner: data.owner ?? '',
            token: data.token ?? '',
          });
          setMeta({
            updatedAt: data.updatedAt,
            updatedBy: data.updatedBy,
          });
        }
      })
      .catch((err) => {
        if (err.name !== 'AbortError') {
          setToast({
            kind: 'error',
            title: 'Failed to load settings',
            body: String(err.message ?? err),
          });
        }
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
      const res = await fetch('/api/itsm/settings', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'X-Demo-User': 'maria.costa',
        },
        body: JSON.stringify(form),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error ?? res.statusText);
      }
      const data = await res.json();
      setMeta({ updatedAt: data.updatedAt, updatedBy: data.updatedBy });
      setToast({ kind: 'success', title: 'Settings saved' });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setToast({ kind: 'error', title: 'Save failed', body: msg });
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
        <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 16, padding: 20 }}>
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
            <div style={{ fontSize: 12, color: 'var(--ink-500)', borderTop: '1px solid var(--border)', paddingTop: 12 }}>
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

export default Settings;
