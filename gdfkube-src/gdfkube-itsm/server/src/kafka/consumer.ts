import { Kafka, logLevel } from 'kafkajs';
import { broadcast } from '../pipeline/subscriptions.js';
import { validateStageEvent } from '../pipeline/stageEvents.js';
import { logger } from '../middleware/logging.js';

export async function startStageConsumer(): Promise<void> {
  const brokers = (process.env.KAFKA_BOOTSTRAP_SERVERS ?? 'kafka1:19092,kafka2:19092,kafka3:19092').split(',');
  const kafka = new Kafka({ clientId: 'itsm-sse', brokers, logLevel: logLevel.WARN });
  const groupId = `itsm-sse-${process.env.HOSTNAME ?? 'unknown'}`;
  const consumer = kafka.consumer({ groupId });
  await consumer.connect();
  await consumer.subscribe({ topic: 'gdfkube.pipeline.status', fromBeginning: false });
  await consumer.run({
    eachMessage: async ({ message }) => {
      const raw = message.value?.toString('utf8');
      if (!raw) return;
      let parsed: unknown;
      try { parsed = JSON.parse(raw); } catch { logger.error('stage event JSON parse failed'); return; }
      if (!validateStageEvent(parsed)) { logger.error({ parsed }, 'stage event schema invalid'); return; }
      broadcast(parsed.requestId, parsed);
    },
  });
  logger.info({ groupId }, 'stage event consumer started');
}
