import { Router } from 'express';
import { UserModel } from '../models/User.js';
import * as userAdmin from '../services/userAdminService.js';
import { demoUser } from '../middleware/demoUser.js';
import { requireAdmin } from '../middleware/requireAdmin.js';

const router = Router();

function toJson(doc: any) {
  const obj = doc.toObject();
  obj.id = obj._id;
  delete obj._id;
  return obj;
}

router.get('/', demoUser, requireAdmin, async (_req, res, next) => {
  try {
    const docs = await UserModel.find();
    res.json(docs.map(toJson));
  } catch (err) {
    next(err);
  }
});

router.get('/:id', demoUser, requireAdmin, async (req, res, next) => {
  try {
    const doc = await UserModel.findById(req.params.id);
    if (!doc) {
      res.status(404).json({ error: 'User not found' });
      return;
    }
    res.json(toJson(doc));
  } catch (err) {
    next(err);
  }
});

router.post('/', demoUser, requireAdmin, async (req, res, next) => {
  try {
    const doc = await userAdmin.create(req.body);
    res.status(201).json(toJson(doc));
  } catch (err) {
    next(err);
  }
});

router.patch('/:id', demoUser, requireAdmin, async (req, res, next) => {
  try {
    const doc = await userAdmin.patch(req.params.id, req.body);
    res.json(toJson(doc));
  } catch (err) {
    next(err);
  }
});

export default router;
