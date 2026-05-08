import { Router } from 'express';
import { FormDefModel } from '../models/FormDef.js';
import * as formAdmin from '../services/formAdminService.js';
import { demoUser } from '../middleware/demoUser.js';
import { requireAdmin } from '../middleware/requireAdmin.js';

const router = Router();

function toJson(doc: any) {
  const obj = doc.toObject();
  obj.id = obj._id;
  delete obj._id;
  return obj;
}

router.get('/', demoUser, async (req, res, next) => {
  try {
    const include = req.query.include as string | undefined;
    if (include === 'disabled' && req.demoUser?.role !== 'admin') {
      res.status(403).json({ error: 'Admin role required to list disabled forms' });
      return;
    }
    const filter =
      include === 'disabled' ? {} : { status: 'active' };
    const docs = await FormDefModel.find(filter);
    res.json(docs.map(toJson));
  } catch (err) {
    next(err);
  }
});

router.get('/:id', demoUser, async (req, res, next) => {
  try {
    const doc = await FormDefModel.findById(req.params.id);
    if (!doc) {
      res.status(404).json({ error: 'Form not found' });
      return;
    }
    res.json(toJson(doc));
  } catch (err) {
    next(err);
  }
});

router.post('/', demoUser, requireAdmin, async (req, res, next) => {
  try {
    const doc = await formAdmin.create(req.body);
    res.status(201).json(toJson(doc));
  } catch (err) {
    next(err);
  }
});

router.patch('/:id', demoUser, requireAdmin, async (req, res, next) => {
  try {
    const doc = await formAdmin.patch(req.params.id, req.body);
    res.json(toJson(doc));
  } catch (err) {
    next(err);
  }
});

export default router;
