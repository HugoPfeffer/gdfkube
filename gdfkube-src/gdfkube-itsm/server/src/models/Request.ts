import { Schema, model } from 'mongoose';

const PolicyCheckSchema = new Schema(
  {
    id: { type: String, required: true },
    label: { type: String, required: true },
    ok: { type: Boolean, required: true },
    detail: String,
  },
  { _id: false },
);

const ApprovalDecisionSchema = new Schema(
  {
    actor: { type: String, required: true },
    action: {
      type: String,
      required: true,
      enum: ['approved', 'rejected', 'requested_changes'],
    },
    comment: String,
    at: { type: String, required: true },
  },
  { _id: false },
);

const RequesterSchema = new Schema(
  {
    id: { type: String, required: true },
    name: { type: String, required: true },
    email: { type: String, required: true },
    role: {
      type: String,
      required: true,
      enum: ['operator', 'admin'],
    },
    fullName: String,
    group: String,
    status: String,
    username: String,
  },
  { _id: false },
);

const RequestSchema = new Schema(
  {
    _id: { type: String },
    formId: { type: String, required: true },
    env: {
      type: String,
      required: true,
      enum: ['production', 'staging', 'development'],
    },
    requester: { type: RequesterSchema, required: true },
    requesterGroupName: { type: String, required: true },
    status: {
      type: String,
      required: true,
      enum: ['approval', 'provisioning', 'ready', 'failed'],
      default: 'approval',
    },
    stage: { type: Number, required: true, min: 0, max: 6, default: 0 },
    submittedAt: { type: String, required: true },
    justification: String,
    vars: { type: Schema.Types.Mixed, default: {} },
    meta: { type: Schema.Types.Mixed, default: {} },
    policyChecks: { type: [PolicyCheckSchema], default: [] },
    approvalChain: { type: [ApprovalDecisionSchema], default: [] },
    reason: { type: String, default: null },
    formLabel: String,
    progress: Number,
    waiting: String,
    estCost: String,
    requestId: String,
  },
  {
    _id: false,
    versionKey: false,
    timestamps: false,
  },
);

export const RequestModel = model('Request', RequestSchema);
