import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';
import { buildApp } from '../src/app.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const specPath = resolve(__dirname, '..', 'src', 'openapi.yaml');

function extractExpressRoutes(app: ReturnType<typeof buildApp>) {
  const routes: { method: string; path: string }[] = [];

  function walk(stack: any[], prefix = '') {
    for (const layer of stack) {
      if (layer.route) {
        const fullPath = prefix + layer.route.path;
        for (const method of Object.keys(layer.route.methods)) {
          routes.push({ method, path: fullPath });
        }
      } else if (layer.name === 'router' && layer.handle?.stack) {
        const match = layer.regexp?.source;
        let routerPrefix = prefix;
        if (layer.keys?.length === 0 && match) {
          const clean = match
            .replace(/^\^\\\//, '/')
            .replace(/\\\/\?\(\?=\\\/\|\$\)$/, '')
            .replace(/\(\?:\(\[\^\\\/\]\+\?\)\)/, ':param')
            .replace(/\\\//g, '/');
          if (clean !== '/' && clean !== '/?(?=/|$)') {
            routerPrefix = prefix + clean;
          }
        }
        walk(layer.handle.stack, routerPrefix);
      }
    }
  }

  walk(app._router.stack);
  return routes;
}

function normalizeExpressPath(p: string): string {
  return p.replace(/:(\w+)/g, '{$1}').replace(/\/$/, '') || '/';
}

describe('OpenAPI spec', () => {
  it('is valid YAML and has openapi 3.1 version', () => {
    const raw = readFileSync(specPath, 'utf-8');
    const spec = yaml.load(raw) as any;
    expect(spec.openapi).toMatch(/^3\.1/);
  });

  it('covers all registered Express routes', () => {
    const raw = readFileSync(specPath, 'utf-8');
    const spec = yaml.load(raw) as any;
    const specPaths = spec.paths ?? {};

    const app = buildApp();
    const routes = extractExpressRoutes(app);

    const missing: string[] = [];
    for (const { method, path } of routes) {
      const normalized = normalizeExpressPath(path);
      if (!specPaths[normalized]?.[method]) {
        missing.push(`${method.toUpperCase()} ${normalized}`);
      }
    }

    expect(missing).toEqual([]);
  });

  it('includes X-Demo-User security scheme', () => {
    const raw = readFileSync(specPath, 'utf-8');
    const spec = yaml.load(raw) as any;
    expect(spec.components?.securitySchemes?.DemoUser).toBeDefined();
    expect(spec.components.securitySchemes.DemoUser.type).toBe('apiKey');
    expect(spec.components.securitySchemes.DemoUser.name).toBe('X-Demo-User');
  });
});
