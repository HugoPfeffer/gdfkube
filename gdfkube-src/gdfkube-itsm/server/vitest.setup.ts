import mongoose from 'mongoose';
import { beforeAll, afterAll, beforeEach } from 'vitest';

const MONGO_URL =
  process.env.MONGO_URL ??
  'mongodb://mongo1:27017/gdfkube_test?replicaSet=rs0';

let connected = false;

beforeAll(async () => {
  try {
    await mongoose.connect(MONGO_URL);
    connected = true;
  } catch {
    // MongoDB unavailable — DB-dependent tests will be skipped via their own guards
  }
});

beforeEach(async () => {
  if (!connected) return;
  const collections = await mongoose.connection.db!.collections();
  for (const col of collections) {
    await col.deleteMany({});
  }
});

afterAll(async () => {
  if (connected) {
    await mongoose.disconnect();
  }
});
