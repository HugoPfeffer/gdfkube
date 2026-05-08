import mongoose from 'mongoose';

export async function connect(url: string): Promise<typeof mongoose> {
  return mongoose.connect(url, {
    serverSelectionTimeoutMS: 30_000,
    writeConcern: { w: 'majority' },
  });
}

export async function disconnect(): Promise<void> {
  await mongoose.disconnect();
}

export async function ping(): Promise<boolean> {
  try {
    const admin = mongoose.connection.db!.admin();
    const result = await admin.command({ ping: 1 });
    return result.ok === 1;
  } catch {
    return false;
  }
}
