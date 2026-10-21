import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { pinoHttp } from 'pino-http';
import { env } from './config/env';
import { logger } from './lib/logger';
import { AppError, errorHandler } from './lib/errors';
import { loadSession } from './middleware/auth';
import { authRouter } from './routes/auth';
import { devRouter } from './routes/dev';
import { locationsRouter } from './routes/locations';
import { catalogRouter, storesRouter } from './routes/catalog';
import { cartRouter, checkoutRouter } from './routes/cart';
import { ordersRouter, paymentsRouter, razorpayWebhook } from './routes/orders';
import { accountRouter, publicRouter } from './routes/account';
import { sellerRouter } from './routes/seller';
import { businessRouter } from './routes/business';
import { deliveryRouter } from './routes/delivery';
import { adminRouter } from './routes/admin';
import { prisma } from './lib/prisma';

export function createApp() {
  const app = express();
  app.set('trust proxy', 1);
  app.disable('x-powered-by');
  app.use(helmet());
  const origins = env.CORS_ORIGINS.split(',').map((o) => o.trim()).filter(Boolean);
  app.use(cors({ origin: origins, credentials: true }));
  if (env.NODE_ENV !== 'test') app.use(pinoHttp({ logger, autoLogging: { ignore: (req) => req.url === '/api/health' } }));

  // Webhooks need the raw body for signature verification, so they are mounted before the JSON parser.
  app.post('/api/payments/webhooks/razorpay', express.raw({ type: 'application/json', limit: '1mb' }), razorpayWebhook);

  app.use(express.json({ limit: '1mb' }));
  app.use(cookieParser());
  app.use(loadSession);

  // CSRF defence for cookie-authenticated writes: browsers cannot send JSON cross-site without a
  // CORS preflight, so require JSON or multipart on unsafe methods (SameSite=Lax covers the rest).
  app.use((req, _res, next) => {
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method) && req.headers['content-length'] !== '0' && req.headers['content-type']) {
      const type = req.headers['content-type'];
      if (!type.startsWith('application/json') && !type.startsWith('multipart/form-data')) {
        return next(new AppError(415, 'UNSUPPORTED_MEDIA_TYPE', 'Send JSON or multipart form data'));
      }
    }
    next();
  });

  app.get('/api/health', async (_req, res) => {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ ok: true, time: new Date().toISOString() });
  });

  app.use('/api/auth', authRouter);
  app.use('/api/dev', devRouter);
  app.use('/api/locations', locationsRouter);
  app.use('/api/catalog', catalogRouter);
  app.use('/api/stores', storesRouter);
  app.use('/api/cart', cartRouter);
  app.use('/api/checkout', checkoutRouter);
  app.use('/api/orders', ordersRouter);
  app.use('/api/payments', paymentsRouter);
  app.use('/api/public', publicRouter);
  app.use('/api/me', accountRouter);
  app.use('/api/seller', sellerRouter);
  app.use('/api/business', businessRouter);
  app.use('/api/delivery', deliveryRouter);
  app.use('/api/admin', adminRouter);

  app.use('/api', (_req, _res, next) => next(new AppError(404, 'NOT_FOUND', 'Endpoint not found')));
  app.use(errorHandler);
  return app;
}
