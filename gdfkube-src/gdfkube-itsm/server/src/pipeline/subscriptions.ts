import type { Response } from 'express';

const subs = new Map<string, Set<Response>>();

export function register(requestId: string, res: Response): void {
  if (!subs.has(requestId)) subs.set(requestId, new Set());
  subs.get(requestId)!.add(res);
}

export function unregister(requestId: string, res: Response): void {
  const set = subs.get(requestId);
  if (!set) return;
  set.delete(res);
  if (set.size === 0) subs.delete(requestId);
}

export function broadcast(requestId: string, payload: unknown): void {
  const set = subs.get(requestId);
  if (!set) return;
  const line = `data: ${JSON.stringify(payload)}\n\n`;
  for (const res of set) res.write(line);
}
