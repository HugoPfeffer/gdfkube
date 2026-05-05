// Service Catalog page — lists active request forms as clickable tiles.
//
// Reads `state.forms` from the data context and renders one tile per form
// whose `status === "active"`. The `cluster-request` tile is featured (extra
// modifier class). Tiles route to `new-request` with the form id as a param.
//
// Per spec the catalog has no filter chips and no Knowledge Base section.
// Each tile renders a `.meta` row with a clock icon plus a per-form duration
// string. When no forms are active an empty-state block is rendered instead
// of the tile grid.

import type { ComponentType } from 'react';
import { Icons } from '../icons/Icons';
import type { Navigate } from '../router';
import { useGdfData } from '../state/dataContext';
import type { FormDef } from '../types';

interface CatalogProps {
  navigate: Navigate;
}

type IconComponent = ComponentType<{ size?: number; className?: string }>;

type TileMeta = {
  icon: IconComponent;
  description: string;
};

const TILE_META: Record<string, TileMeta> = {
  'cluster-request': {
    icon: Icons.cluster,
    description:
      'Provision a HyperShift hosted control plane for your department.',
  },
  'namespace-request': {
    icon: Icons.ns,
    description:
      "Onboard a new namespace bound to your group's policies and quotas.",
  },
  'scale-request': {
    icon: Icons.scale,
    description: 'Adjust replica counts on an existing namespace or cluster.',
  },
};

const DURATION_FALLBACK = 'Self-service · varies';

const TILE_DURATION: Record<string, string> = {
  'cluster-request': '~3 min',
  'namespace-request': '~30 sec',
  'scale-request': '~1 min',
};

function metaFor(form: FormDef): TileMeta {
  return (
    TILE_META[form.id] ?? {
      icon: Icons.form,
      description: `Self-service request for ${form.name}.`,
    }
  );
}

function durationFor(form: FormDef): string {
  return TILE_DURATION[form.id] ?? DURATION_FALLBACK;
}

export function Catalog({ navigate }: CatalogProps) {
  const { forms } = useGdfData();
  const active = forms.filter((f) => f.status === 'active');

  if (active.length === 0) {
    return (
      <div className="page">
        <div className="page-head">
          <h1 className="page-title">Service Catalog</h1>
          <p className="page-sub">
            Self-service request forms backed by the platform's GitOps pipeline.
          </p>
        </div>

        <div className="catalog-empty">
          <Icons.form size={32} />
          <p>
            No active forms. Create a form in the admin portal to get started.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      <div className="page-head">
        <h1 className="page-title">Service Catalog</h1>
        <p className="page-sub">
          Self-service request forms backed by the platform's GitOps pipeline.
        </p>
      </div>

      <div className="catalog-grid">
        {active.map((form) => {
          const { icon: Icon, description } = metaFor(form);
          const duration = durationFor(form);
          const featured = form.id === 'cluster-request';
          const className = `cat-tile${featured ? ' featured' : ''}`;
          return (
            <div
              key={form.id}
              className={className}
              role="button"
              tabIndex={0}
              onClick={() => navigate('new-request', { formId: form.id })}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  if (e.key === ' ') e.preventDefault();
                  navigate('new-request', { formId: form.id });
                }
              }}
            >
              <div className="icn-box">
                <Icon size={20} />
              </div>
              <h3>{form.name}</h3>
              <p>{description}</p>
              <div className="meta">
                <Icons.clock />
                <span>{duration}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default Catalog;
