import pino from 'pino';
import pinoHttpModule from 'pino-http';

export const logger = pino({
  level: process.env.LOG_LEVEL ?? 'info',
});

const pinoHttp = (pinoHttpModule as any).default ?? pinoHttpModule;
export const httpLogger = pinoHttp({ logger });
