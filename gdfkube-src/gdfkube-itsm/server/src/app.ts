import express from 'express';
import { httpLogger } from './middleware/logging.js';
import { errorMiddleware } from './middleware/error.js';
import healthRouter from './routes/health.js';
import metricsRouter from './routes/metrics.js';
import openapiRouter from './routes/openapi.js';
import formsRouter from './routes/forms.js';
import requestsRouter from './routes/requests.js';
import usersRouter from './routes/users.js';
import groupsRouter from './routes/groups.js';
import { httpRequestDuration } from './routes/metrics.js';

export function buildApp(): express.Express {
  const app = express();

  app.use(httpLogger);
  app.use(express.json());

  app.use((req, res, next) => {
    const start = process.hrtime.bigint();
    res.on('finish', () => {
      const durationMs =
        Number(process.hrtime.bigint() - start) / 1_000_000_000;
      httpRequestDuration.observe(
        {
          method: req.method,
          route: req.route?.path ?? req.path,
          status_code: res.statusCode,
        },
        durationMs,
      );
    });
    next();
  });

  app.use(healthRouter);
  app.use(metricsRouter);
  app.use(openapiRouter);

  app.use('/api/itsm/forms', formsRouter);
  app.use('/api/itsm/requests', requestsRouter);
  app.use('/api/itsm/users', usersRouter);
  app.use('/api/itsm/groups', groupsRouter);

  app.use(errorMiddleware);

  return app;
}
