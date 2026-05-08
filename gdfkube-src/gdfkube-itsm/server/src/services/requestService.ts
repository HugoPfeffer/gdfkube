import { ulid } from 'ulid';
import { RequestModel } from '../models/Request.js';
import { FormDefModel } from '../models/FormDef.js';
import { validateAgainstFormDef } from './formValidator.js';
import type { DemoUser } from '../data/demoUsers.js';
import type { AppError } from '../middleware/error.js';

const VALID_ENVS = new Set(['production', 'staging', 'development']);

interface SubmitInput {
  demoUser: DemoUser;
  body: Record<string, unknown>;
}

export async function submit({ demoUser, body }: SubmitInput) {
  const { formId, env, justification, ...fieldValues } = body as Record<
    string,
    unknown
  >;

  if (!formId || typeof formId !== 'string') {
    const e: AppError = new Error('formId is required');
    e.statusCode = 400;
    throw e;
  }

  if (!env || !VALID_ENVS.has(env as string)) {
    const e: AppError = new Error('env must be production, staging, or development');
    e.statusCode = 400;
    throw e;
  }

  const form = await FormDefModel.findById(formId);
  if (!form) {
    const e: AppError = new Error(`Form not found: ${formId}`);
    e.statusCode = 404;
    throw e;
  }

  const validation = validateAgainstFormDef(
    { fields: form.fields as any },
    fieldValues,
  );
  if (!validation.ok) {
    const e: AppError = new Error('Validation failed');
    e.statusCode = 400;
    e.details = validation.errors;
    throw e;
  }

  const id = ulid();

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
