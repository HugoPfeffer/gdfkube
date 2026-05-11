import { Router } from 'express';
import { ping } from '../db.js';

const router = Router();

router.get('/healthz/live', (_req, res) => {
  res.status(200).json({ status: 'live' });
});

router.get('/healthz/ready', async (_req, res) => {
  const ok = await ping();
  if (ok) {
    res.status(200).json({ status: 'ready', mongo: 'ok' });
  } else {
    res.status(503).json({ status: 'unavailable' });
  }
});

export default router;
