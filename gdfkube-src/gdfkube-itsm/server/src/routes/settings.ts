import { Router } from 'express';
import { GiteaSettings } from '../models/GiteaSettings.js';
import { demoUser } from '../middleware/demoUser.js';
import { requireAdmin } from '../middleware/requireAdmin.js';

const router = Router();

router.get('/', demoUser, requireAdmin, async (req, res, next) => {
  try {
    const doc = await GiteaSettings.findById('gitea').lean();
    if (!doc) {
      res.status(404).json({ error: 'settings not found' });
      return;
    }
    const reveal = req.query.reveal === '1';
    if (reveal) {
      res.set('Cache-Control', 'no-store');
    }
    res.json({ ...doc, token: reveal ? doc.token : '***' });
  } catch (err) {
    next(err);
  }
});

router.patch('/', demoUser, requireAdmin, async (req, res, next) => {
  try {
    if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) {
      res.status(400).json({ error: 'invalid body' });
      return;
    }
    const { endpoint, owner, token } = req.body;
    const errors: string[] = [];
    if (!endpoint || !/^https?:\/\/.+$/.test(endpoint)) errors.push('endpoint');
    if (!owner || !/^[a-zA-Z0-9_-]+$/.test(owner)) errors.push('owner');
    if (!token) errors.push('token');
    if (errors.length) {
      res.status(400).json({ error: 'validation failed', fields: errors });
      return;
    }

    const doc = await GiteaSettings.findOneAndUpdate(
      { _id: 'gitea' },
      {
        $set: {
          endpoint,
          owner,
          token,
          updatedAt: new Date(),
          updatedBy: req.demoUser!.id,
        },
      },
      { upsert: true, new: true, lean: true },
    );
    res.json({ ...doc, token: '***' });
  } catch (err) {
    next(err);
  }
});

export default router;
