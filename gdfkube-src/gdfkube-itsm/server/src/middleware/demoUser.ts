import type { Request, Response, NextFunction } from 'express';
import { DEMO_USERS, type DemoUser } from '../data/demoUsers.js';

declare global {
  namespace Express {
    interface Request {
      demoUser?: DemoUser;
    }
  }
}

export function demoUser(req: Request, res: Response, next: NextFunction): void {
  const username = req.headers['x-demo-user'] as string | undefined;
  if (!username) {
    res.status(401).json({ error: 'X-Demo-User required' });
    return;
  }
  const user = DEMO_USERS[username];
  if (!user) {
    res.status(401).json({ error: 'unknown demo user' });
    return;
  }
  req.demoUser = user;
  next();
}
