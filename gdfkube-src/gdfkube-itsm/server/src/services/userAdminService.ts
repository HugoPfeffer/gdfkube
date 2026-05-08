import { UserModel } from '../models/User.js';
import type { AppError } from '../middleware/error.js';

const VALID_ROLES = new Set(['operator', 'admin', 'approver', 'service']);

const PATCH_WHITELIST = new Set([
  'name',
  'fullName',
  'email',
  'role',
  'group',
  'status',
  'mfa',
  'last',
]);

export async function create(body: Record<string, unknown>) {
  if (body.role && !VALID_ROLES.has(body.role as string)) {
    const e: AppError = new Error(`Invalid role: ${body.role}`);
    e.statusCode = 400;
    throw e;
  }

  try {
    return await UserModel.create({ _id: body.id, ...body });
  } catch (err: any) {
    if (err.code === 11000) {
      const e: AppError = new Error('User already exists');
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

  if (updates.role && !VALID_ROLES.has(updates.role as string)) {
    const e: AppError = new Error(`Invalid role: ${updates.role}`);
    e.statusCode = 400;
    throw e;
  }

  const doc = await UserModel.findByIdAndUpdate(
    id,
    { $set: updates },
    { new: true, runValidators: true },
  );

  if (!doc) {
    const e: AppError = new Error('User not found');
    e.statusCode = 404;
    throw e;
  }
  return doc;
}
