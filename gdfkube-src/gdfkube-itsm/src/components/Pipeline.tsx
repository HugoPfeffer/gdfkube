import type { CSSProperties } from 'react';
import { PIPELINE_STAGES } from '../data/seeds';
import { Icons } from '../icons/Icons';
import type { Request } from '../types';

const TOTAL_STAGES = PIPELINE_STAGES.length;

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

type IconMap = typeof Icons;
function iconFor(name: string | undefined) {
  if (!name) return Icons.form;
  if (name in Icons) return Icons[name as keyof IconMap];
  return Icons.form;
}

export function Pipeline({ request, pipelineSpeed }: PipelineProps) {
  const safeSpeed = pipelineSpeed > 0 ? pipelineSpeed : 1;
  const duration = `${4 / safeSpeed}s`;

  const isProvisioning = request.status === 'provisioning';
  const isFailed = request.status === 'failed';
  const isReady = request.status === 'ready';
  const progress = request.progress ?? (isReady ? 100 : 0);
  const failedStage = isFailed ? PIPELINE_STAGES[request.stage] : undefined;

  return (
    <div className="card pipeline" data-testid="pipeline" style={{ marginBottom: 18 }}>
      <div className="pipe-head">
        <div className="row" style={{ gap: 14 }}>
          <h3>Provisioning Pipeline</h3>
          {isProvisioning && (
            <span className="pill blue"><span className="dot" />Live · stage {Math.min(request.stage + 1, TOTAL_STAGES)} of {TOTAL_STAGES}</span>
          )}
          {isReady && (
            <span className="pill green"><Icons.check size={11} /> Completed</span>
          )}
          {isFailed && (
            <span className="pill red"><Icons.alert size={11} /> Failed at {failedStage?.label}</span>
          )}
        </div>
        <div className="row">
          <span style={{ fontSize: 12, color: 'var(--ink-500)' }}>Overall</span>
          <div className="progress" style={{ width: 180 }}><div style={{ width: `${progress}%` }} /></div>
          <span className="mono" style={{ fontSize: 12, color: 'var(--ink-700)' }}>{progress}%</span>
        </div>
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
