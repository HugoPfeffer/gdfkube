import { RequestModel } from '../models/Request.js';
import { FormDefModel } from '../models/FormDef.js';
import { validateAgainstFormDef } from './formValidator.js';
import type { DemoUser } from '../data/demoUsers.js';
import type { AppError } from '../middleware/error.js';

const VALID_ENVS = new Set(['production', 'staging', 'development']);

const FORM_TYPE_CODE: Record<string, 'C' | 'N' | 'S'> = {
  'cluster-request': 'C',
  'namespace-request': 'N',
  'scale-request': 'S',
};

const REQ_ID_PATTERN = /^REQ\d{7}[CNSX]$/;
const REQ_ID_BASE_SEQ = 10251;
const REQ_RETRY_LIMIT = 5;

async function nextRequestNumber(formId: string): Promise<string> {
  const doc = await RequestModel.findOne({ _id: REQ_ID_PATTERN })
    .sort({ _id: -1 })
    .select('_id')
    .lean();

  let seq = REQ_ID_BASE_SEQ;
  if (doc && typeof doc._id === 'string') {
    const parsed = parseInt(doc._id.slice(3, 10), 10);
    if (Number.isFinite(parsed)) {
      seq = parsed + 1;
    }
  }

  const padded = String(seq).padStart(7, '0');
  const suffix = FORM_TYPE_CODE[formId];
  if (!suffix) {
    console.warn(
      `nextRequestNumber: unknown formId "${formId}", falling back to suffix "X"`,
    );
    return `REQ${padded}X`;
  }
  return `REQ${padded}${suffix}`;
}

interface SubmitInput {
  demoUser: DemoUser;
  body: Record<string, unknown>;
}

export async function submit({ demoUser, body }: SubmitInput) {
  const { formId, env, justification, ...fieldValues } = body as Record<
    string,
    unknown
  >;

  // #region agent log
  fetch('http://localhost:7430/ingest/60f88a58-2925-43f9-b28f-bcec8ca13914',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'df73a6'},body:JSON.stringify({sessionId:'df73a6',location:'requestService.ts:submit',message:'incoming body and destructured values',data:{rawBody:body,formId,env,justification,fieldValuesKeys:Object.keys(fieldValues),fieldValues},timestamp:Date.now(),hypothesisId:'H1,H2,H4'})}).catch(()=>{});
  // #endregion

  if (!formId || typeof formId !== 'string') {
    const e: AppError = new Error('formId required');
    e.statusCode = 400;
    throw e;
  }

  if (!env || !VALID_ENVS.has(env as string)) {
    const e: AppError = new Error('env must be production, staging, or development');
    e.statusCode = 400;
    throw e;
  }

  const form = await FormDefModel.findById(formId);
  if (!form || (form as any).status !== 'active') {
    const e: AppError = new Error('unknown formId');
    e.statusCode = 400;
    throw e;
  }

  // #region agent log
  fetch('http://localhost:7430/ingest/60f88a58-2925-43f9-b28f-bcec8ca13914',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'df73a6'},body:JSON.stringify({sessionId:'df73a6',location:'requestService.ts:pre-validation',message:'form fields vs fieldValues',data:{formFields:(form.fields as any).map((f:any)=>({key:f.key,bucket:f.bucket,required:f.required})),fieldValuesKeys:Object.keys(fieldValues)},timestamp:Date.now(),hypothesisId:'H1,H3'})}).catch(()=>{});
  // #endregion

  const validation = validateAgainstFormDef(
    { fields: form.fields as any },
    fieldValues,
  );
  if (!validation.ok) {
    // #region agent log
    fetch('http://localhost:7430/ingest/60f88a58-2925-43f9-b28f-bcec8ca13914',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'df73a6'},body:JSON.stringify({sessionId:'df73a6',location:'requestService.ts:validation-failed',message:'validation errors',data:{errors:validation.errors},timestamp:Date.now(),hypothesisId:'H1,H2,H3'})}).catch(()=>{});
    // #endregion
    const e: AppError = new Error('Validation failed');
    e.statusCode = 400;
    e.details = validation.errors;
    throw e;
  }

  let id = await nextRequestNumber(formId);
  let lastErr: unknown;
  for (let attempt = 0; attempt < REQ_RETRY_LIMIT; attempt++) {
    try {
      const doc = await RequestModel.create({
        _id: id,
        formId,
        env,
        requester: {
          id: demoUser.id,
          name: demoUser.name,
          fullName: demoUser.fullName,
          email: demoUser.email,
          role: demoUser.role,
          group: demoUser.group,
        },
        requesterGroupName: demoUser.group,
        status: 'approval',
        stage: 0,
        submittedAt: new Date().toISOString(),
        justification: justification as string | undefined,
        vars: validation.vars,
        meta: { ...validation.meta, correlationId: id },
        policyChecks: [],
        approvalChain: [],
      });
      return doc;
    } catch (err) {
      lastErr = err;
      const code = (err as { code?: number }).code;
      if (code !== 11000) {
        throw err;
      }
      id = await nextRequestNumber(formId);
    }
  }
  throw lastErr;
}

interface DecideInput {
  id: string;
  demoUser: DemoUser;
  body: { action: string; comment?: string };
}

const VALID_ACTIONS = new Set(['approved', 'rejected', 'requested_changes']);

export async function decide({ id, demoUser, body }: DecideInput) {
  if (!VALID_ACTIONS.has(body.action)) {
    const e: AppError = new Error(
      `Invalid action: ${body.action}. Must be approved, rejected, or requested_changes`,
    );
    e.statusCode = 400;
    throw e;
  }

  const entry = {
    actor: demoUser.id,
    action: body.action,
    comment: body.comment ?? undefined,
    at: new Date().toISOString(),
  };

  const update: Record<string, unknown> = {
    $push: { approvalChain: entry },
  };

  if (body.action === 'approved') {
    update.$set = { status: 'provisioning', stage: 1 };
  } else if (body.action === 'rejected') {
    update.$set = {
      status: 'failed',
      reason: body.comment ?? 'Rejected',
    };
  }

  const doc = await RequestModel.findByIdAndUpdate(id, update, {
    new: true,
    runValidators: true,
  });

  if (!doc) {
    const e: AppError = new Error('Request not found');
    e.statusCode = 404;
    throw e;
  }

  return doc;
}
