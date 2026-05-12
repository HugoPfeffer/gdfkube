import type { Request, Response, NextFunction } from 'express';
import { logger } from './logging.js';

export interface AppError extends Error {
  statusCode?: number;
  code?: string;
  details?: unknown;
}

export function errorMiddleware(
  err: AppError,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  if ((err as { type?: string }).type === 'entity.parse.failed') {
    res.status(400).json({ error: 'invalid body' });
    return;
  }
  const status = err.statusCode ?? 500;
  if (status >= 500) {
    logger.error({ err }, 'unhandled error');
  }
  const body: Record<string, unknown> = {
    error: err.message || 'Internal Server Error',
  };
  if (err.code) body.code = err.code;
  if (err.details != null) body.details = err.details;
  res.status(status).json(body);
}
