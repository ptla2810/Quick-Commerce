import { createApp } from './app';
import { env, demoMode } from './config/env';
import { logger } from './lib/logger';
import { prisma } from './lib/prisma';
import { expireUnpaidOrders } from './services/orders';
import { payments } from './providers/payments';

const app = createApp();
const server = app.listen(env.PORT, () => {
  logger.info(`Padosi API listening on http://localhost:${env.PORT} (${env.NODE_ENV})`);
  if (demoMode) logger.warn('Demo mode is ON: demo sign-in and simulated payments are enabled. Never use this in production.');
  if (payments.simulated) logger.warn('Payments are SIMULATED (PAYMENT_PROVIDER=mock). No money moves.');
});

// Single-instance sweeper. With several API instances, move this to a scheduled job or queue (e.g. BullMQ on Redis).
const sweeper = setInterval(() => {
  expireUnpaidOrders()
    .then((n) => n && logger.info(`expired ${n} unpaid orders`))
    .catch((err) => logger.error({ err }, 'unpaid order sweep failed'));
}, 60_000);

async function shutdown(signal: string) {
  logger.info(`${signal} received, shutting down`);
  clearInterval(sweeper);
  server.close();
  await prisma.$disconnect();
  process.exit(0);
}
process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
