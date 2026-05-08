import { Router } from 'express';
import { ping } from '../db.js';

const router = Router();

router.get('/healthz/live', (_req, res) => {
  res.status(200).json({ status: 'ok' });
});

router.get('/healthz/ready', async (_req, res) => {
  const ok = await ping();
  res.status(ok ? 200 : 503).json({ status: ok ? 'ok' : 'unavailable' });
});

export default router;
