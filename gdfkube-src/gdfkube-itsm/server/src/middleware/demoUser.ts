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
    res.status(401).json({ error: 'Missing X-Demo-User header' });
    return;
  }
  const user = DEMO_USERS[username];
  if (!user) {
    res.status(401).json({ error: `Unknown demo user: ${username}` });
    return;
  }
  req.demoUser = user;
  next();
}
