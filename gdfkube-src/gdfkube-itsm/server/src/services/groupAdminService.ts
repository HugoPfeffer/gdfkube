import { GroupModel } from '../models/Group.js';
import type { AppError } from '../middleware/error.js';

const PATCH_WHITELIST = new Set([
  'name',
  'fullName',
  'users',
  'forms',
  'repo',
  'clusters',
]);

export async function create(body: Record<string, unknown>) {
  try {
    return await GroupModel.create({ _id: body.id, ...body });
  } catch (err: any) {
    if (err.code === 11000) {
      const e: AppError = new Error('Group already exists');
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

  const doc = await GroupModel.findByIdAndUpdate(
    id,
    { $set: updates },
    { new: true, runValidators: true },
  );

  if (!doc) {
    const e: AppError = new Error('Group not found');
    e.statusCode = 404;
    throw e;
  }
  return doc;
}
