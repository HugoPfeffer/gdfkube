import { Router } from 'express';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const router = Router();

const __dirname = dirname(fileURLToPath(import.meta.url));
const specPath = resolve(__dirname, '..', 'openapi.yaml');

router.get('/api/itsm/openapi.yaml', (_req, res) => {
  try {
    const content = readFileSync(specPath, 'utf-8');
    res.type('text/yaml').send(content);
  } catch {
    res.status(404).json({ error: 'OpenAPI spec not found' });
  }
});

export default router;
