import { useEffect, useRef, useState, type ReactNode } from 'react';
import { itsmApi } from '../api/itsmApi';
import { GdfDataProvider, type DataState } from '../state/dataContext';
import type { Field, FormDef, Group, TemplateFile, User } from '../types';

interface BootstrapProps {
  children: ReactNode;
}

type Phase = 'loading' | 'ready' | 'error';

function extractForms(rawForms: Record<string, unknown>[]): {
  forms: FormDef[];
  fields: Record<string, Field[]>;
  templates: Record<string, TemplateFile[]>;
} {
  const forms: FormDef[] = [];
  const fields: Record<string, Field[]> = {};
  const templates: Record<string, TemplateFile[]> = {};

  for (const raw of rawForms) {
    const id = raw.id as string;
    forms.push({
      id,
      name: raw.name as string,
      topic: raw.topic as string,
      description: raw.description as string | undefined,
      status: raw.status as 'active' | 'disabled',
      lastEdited: raw.lastEdited as string | undefined,
      submissions: raw.submissions as number | undefined,
      fieldCount: raw.fieldCount as number | undefined,
      updated: raw.updated as string | undefined,
    });
    fields[id] = (raw.fields as Field[] | undefined) ?? [];
    templates[id] = (raw.templates as TemplateFile[] | undefined) ?? [];
  }

  return { forms, fields, templates };
}

export function Bootstrap({ children }: BootstrapProps) {
  const [phase, setPhase] = useState<Phase>('loading');
  const [data, setData] = useState<DataState | null>(null);
  const [error, setError] = useState<string>('');
  const abortRef = useRef<AbortController | null>(null);

  const load = () => {
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    setPhase('loading');
    setError('');

    const fetchData = async () => {
      const [rawForms, rawRequests] = await Promise.all([
        itsmApi.forms.list({ include: 'disabled' }, ac.signal),
        itsmApi.requests.list(ac.signal),
      ]);

      const [rawUsers, rawGroups] = await Promise.all([
        itsmApi.users.list(ac.signal),
        itsmApi.groups.list(ac.signal),
      ]);

      const { forms, fields, templates } = extractForms(rawForms);

      const state: DataState = {
        requests: rawRequests as unknown as DataState['requests'],
        forms,
        fields,
        users: rawUsers as unknown as User[],
        groups: rawGroups as unknown as Group[],
        templates,
      };

      setData(state);
      setPhase('ready');
    };

    fetchData().catch((err) => {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      if (err && typeof err === 'object' && 'name' in err && err.name === 'AbortError') return;
      setError(err instanceof Error ? err.message : String(err));
      setPhase('error');
    });
  };

  useEffect(() => {
    load();
    return () => {
      abortRef.current?.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (phase === 'loading') {
    return (
      <div className="bootstrap-loader" data-testid="bootstrap-loader" style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        height: '100vh', fontSize: 14, color: 'var(--ink-500, #64748b)',
      }}>
        Loading…
      </div>
    );
  }

  if (phase === 'error') {
    return (
      <div className="bootstrap-error" data-testid="bootstrap-error" style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        justifyContent: 'center', height: '100vh', gap: 12,
      }}>
        <p style={{ color: 'var(--red-700, #b91c1c)', margin: 0 }}>
          Failed to load: {error}
        </p>
        <button type="button" className="btn primary" onClick={load}>
          Retry
        </button>
      </div>
    );
  }

  return <GdfDataProvider initial={data!}>{children}</GdfDataProvider>;
}

export default Bootstrap;
