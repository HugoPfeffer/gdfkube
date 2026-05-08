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
  const status = err.statusCode ?? 500;
  if (status >= 500) {
    logger.error({ err }, 'unhandled error');
  }
  res.status(status).json({
    error: err.message || 'Internal Server Error',
    ...(err.code && { code: err.code }),
    ...(err.details && { details: err.details }),
  });
}
