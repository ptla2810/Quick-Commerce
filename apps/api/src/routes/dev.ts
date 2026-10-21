import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { forbidden, notFound, parse } from '../lib/errors';
import { demoMode, env } from '../config/env';
import { sessionPayload, startSession } from '../lib/session';
import { payments } from '../providers/payments';
import { sms } from '../providers/sms';

/**
 * Development-only helpers. Every route checks demoMode, which is forced off when NODE_ENV=production.
 * Demo login only works for users flagged isDemo by the seed script.
 */
export const devRouter = Router();

devRouter.get('/status', (_req, res) => {
  res.json({
    demoMode,
    environment: env.NODE_ENV,
    providers: { payment: payments.name, paymentSimulated: payments.simulated, sms: sms.name, maps: env.MAPS_PROVIDER, storage: env.STORAGE_PROVIDER },
  });
});

devRouter.get('/demo-accounts', async (_req, res) => {
  if (!demoMode) throw forbidden('Demo accounts are disabled');
  const users = await prisma.user.findMany({ where: { isDemo: true }, include: { roles: true }, orderBy: { createdAt: 'asc' } });
  res.json({ accounts: users.map((u) => ({ id: u.id, name: u.name, phone: u.phone, email: u.email, roles: u.roles.map((r) => r.role) })) });
});

devRouter.post('/demo-login', async (req, res) => {
  if (!demoMode) throw forbidden('Demo accounts are disabled');
  const { userId, client } = parse(z.object({ userId: z.string(), client: z.enum(['web', 'mobile']).default('web') }), req.body);
  const user = await prisma.user.findFirst({ where: { id: userId, isDemo: true } });
  if (!user) throw notFound('Demo account');
  const token = await startSession(req, res, user.id, client);
  res.json({ ...(await sessionPayload(user.id)), token });
});
