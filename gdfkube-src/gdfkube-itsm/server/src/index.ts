import { connect } from './db.js';
import { buildApp } from './app.js';
import { logger } from './middleware/logging.js';

const MONGO_URL =
  process.env.MONGO_URL ?? 'mongodb://mongo1:27017/gdfkube?replicaSet=rs0';
const PORT = Number(process.env.PORT) || 3000;

async function main() {
  logger.info('connecting to MongoDB…');
  await connect(MONGO_URL);
  logger.info('MongoDB connected');

  const app = buildApp();
  app.listen(PORT, () => {
    logger.info({ port: PORT }, 'itsm-api listening');
  });
}

main().catch((err) => {
  logger.fatal({ err }, 'failed to start');
  process.exit(1);
});
