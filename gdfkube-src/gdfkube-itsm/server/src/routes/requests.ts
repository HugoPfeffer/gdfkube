import { Router } from 'express';
import { RequestModel } from '../models/Request.js';
import * as requestService from '../services/requestService.js';
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
    const filter: Record<string, unknown> = {};
    if (req.query.status) filter.status = req.query.status;
    if (req.query.formId) filter.formId = req.query.formId;
    if (req.query.requesterGroup)
      filter.requesterGroupName = req.query.requesterGroup;

    const docs = await RequestModel.find(filter).sort({ submittedAt: -1 });
    res.json(docs.map(toJson));
  } catch (err) {
    next(err);
  }
});

router.get('/:id', demoUser, async (req, res, next) => {
  try {
    const doc = await RequestModel.findById(req.params.id);
    if (!doc) {
      res.status(404).json({ error: 'Request not found' });
      return;
    }
    res.json(toJson(doc));
  } catch (err) {
    next(err);
  }
});

router.post('/', demoUser, async (req, res, next) => {
  try {
    const doc = await requestService.submit({
      demoUser: req.demoUser!,
      body: req.body,
    });
    res.status(201).location(`/api/itsm/requests/${doc._id}`).json({ id: doc._id });
  } catch (err) {
    next(err);
  }
});

router.post('/:id/approvals', demoUser, requireAdmin, async (req, res, next) => {
  try {
    const doc = await requestService.decide({
      id: req.params.id,
      demoUser: req.demoUser!,
      body: req.body,
    });
    res.json(toJson(doc));
  } catch (err) {
    next(err);
  }
});

export default router;
