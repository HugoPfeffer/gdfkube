import { Router } from 'express';
import type { Request, Response } from 'express';
import { register, unregister } from '../pipeline/subscriptions.js';
import { STAGE_NAMES } from '../pipeline/stageEvents.js';
import { RequestModel } from '../models/Request.js';

export const sseRouter = Router();

sseRouter.get('/requests/:id/events', async (req: Request, res: Response) => {
  const doc = await RequestModel.findById(req.params.id).lean();
  if (!doc) { res.status(404).json({ error: 'not_found' }); return; }

  res.set({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
  });
  res.flushHeaders();

  const stage = typeof doc.stage === 'number' ? doc.stage : 0;
  const synthetic = {
    requestId: (doc._id as string),
    stage,
    stageName: STAGE_NAMES[stage] ?? 'form',
    status: 'ok' as const,
    at: new Date().toISOString(),
  };
  res.write(`data: ${JSON.stringify(synthetic)}\n\n`);

  register(synthetic.requestId, res);
  const heartbeat = setInterval(() => res.write(':\n\n'), 15000);
  req.on('close', () => {
    clearInterval(heartbeat);
    unregister(synthetic.requestId, res);
  });
});
