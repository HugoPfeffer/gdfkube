// Pipeline visualization — renders the seven-stage CDC pipeline for a single
// request. The `state` per stage is derived from `request.status` and
// `request.stage`:
//
//   - status === "ready"        → every stage "done"
//   - status === "approval"     → every stage "pending"
//   - status === "provisioning" → idx < stage "done", idx === stage "active",
//                                  idx > stage "pending"
//   - status === "failed"       → idx < stage "done", idx === stage "failed",
//                                  idx > stage "pending"
//
// The active stage receives an inline `--anim-duration` CSS variable computed
// from `pipelineSpeed` (4 / pipelineSpeed seconds, baseline 4s at speed 1) so
// the pulse animation visibly accelerates when the tweak is increased.

import type { CSSProperties } from 'react';
import { PIPELINE_STAGES } from '../data/seeds';
import { Icons } from '../icons/Icons';
import type { Request } from '../types';

interface PipelineProps {
  request: Request;
  pipelineSpeed: number;
}

type StageState = 'done' | 'active' | 'pending' | 'failed';

function stageState(
  index: number,
  status: Request['status'],
  stage: number,
): StageState {
  if (status === 'ready') return 'done';
  if (status === 'approval') return 'pending';
  if (index < stage) return 'done';
  if (index === stage) return status === 'failed' ? 'failed' : 'active';
  return 'pending';
}

// Type-safe access to the icon map without `any`.
type IconMap = typeof Icons;
function iconFor(name: string | undefined) {
  if (!name) return Icons.form;
  if (name in Icons) return Icons[name as keyof IconMap];
  return Icons.form;
}

export function Pipeline({ request, pipelineSpeed }: PipelineProps) {
  // Avoid divide-by-zero or negative durations from a stale persisted tweak.
  const safeSpeed = pipelineSpeed > 0 ? pipelineSpeed : 1;
  const duration = `${4 / safeSpeed}s`;

  return (
    <div className="card pipeline" data-testid="pipeline">
      <div className="pipe-head">
        <h3>Provisioning Pipeline</h3>
      </div>
      <div className="pipe-stages stages">
        {PIPELINE_STAGES.map((stage, index) => {
          const state = stageState(index, request.status, request.stage);
          const Icon = iconFor(stage.icon);
          const className = `stage stage-${state} pipe-stage ${state}`;
          const style: CSSProperties | undefined =
            state === 'active'
              ? ({ ['--anim-duration' as 'animationDuration']: duration } as CSSProperties)
              : undefined;
          return (
            <div key={stage.id} className={className} style={style}>
              <span className="node">
                <Icon size={14} />
              </span>
              <span className="label">{stage.label}</span>
              {stage.sub && <span className="sublabel">{stage.sub}</span>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default Pipeline;
