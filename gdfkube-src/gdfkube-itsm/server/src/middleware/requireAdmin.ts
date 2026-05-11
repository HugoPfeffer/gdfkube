import type { Request, Response, NextFunction } from 'express';

export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  if (req.demoUser?.role !== 'admin') {
    res.status(403).json({ error: 'admin role required' });
    return;
  }
  next();
}
