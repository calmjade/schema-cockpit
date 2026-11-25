import cors from '@fastify/cors';
import Fastify from 'fastify';
import { initDatabase } from './db.js';
import { registerRoutes } from './routes.js';

const PORT = Number(process.env.PORT ?? 8092);
const HOST = process.env.HOST ?? '0.0.0.0';

async function bootstrap() {
  await initDatabase();

  const app = Fastify({
    logger: {
      level: 'info',
    },
  });

  await app.register(cors, {
    origin: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  });

  await registerRoutes(app);

  app.setErrorHandler((error, _request, reply) => {
    app.log.error(error);
    const errObj = error as { statusCode?: number; message?: string };
    const statusCode = errObj.statusCode ?? 500;
    reply.status(statusCode).send({
      error: errObj.message || '服务器内部错误',
    });
  });

  const shutdown = async () => {
    await app.close();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  await app.listen({ port: PORT, host: HOST });
  console.log(`[schema-cockpit] Backend listening at http://localhost:${PORT}`);
}

bootstrap().catch((err) => {
  console.error('Failed to start schema-cockpit backend:', err);
  process.exit(1);
});
