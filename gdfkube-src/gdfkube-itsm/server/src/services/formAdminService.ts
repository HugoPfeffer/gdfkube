import { FormDefModel } from '../models/FormDef.js';
import type { AppError } from '../middleware/error.js';

const PATCH_WHITELIST = new Set([
  'name',
  'topic',
  'status',
  'fields',
  'templates',
]);

export async function create(body: Record<string, unknown>) {
  try {
    return await FormDefModel.create({ _id: body.id, ...body });
  } catch (err: any) {
    if (err.code === 11000) {
      const e: AppError = new Error('Form already exists');
      e.statusCode = 409;
      throw e;
    }
    throw err;
  }
}

export async function patch(id: string, body: Record<string, unknown>) {
  const updates: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(body)) {
    if (!PATCH_WHITELIST.has(key)) {
      const e: AppError = new Error(`Invalid field: ${key}`);
      e.statusCode = 400;
      throw e;
    }
    updates[key] = value;
  }

  const doc = await FormDefModel.findByIdAndUpdate(
    id,
    { $set: updates },
    { new: true, runValidators: true },
  );

  if (!doc) {
    const e: AppError = new Error('Form not found');
    e.statusCode = 404;
    throw e;
  }
  return doc;
}
