import { Router } from 'express';
import { z } from 'zod';
import { loginSchema, normalizePhone, otpRequestSchema, otpVerifySchema, registerSchema } from '@padosi/shared';
import { prisma } from '../lib/prisma';
import { AppError, conflict, parse } from '../lib/errors';
import { hashPassword, numericCode, sha256, verifyPassword } from '../lib/crypto';
import { authOf, requireAuth, SESSION_COOKIE } from '../middleware/auth';
import { authLimiter, otpLimiter } from '../middleware/rateLimit';
import { sessionPayload, startSession } from '../lib/session';
import { sms } from '../providers/sms';
import { demoMode } from '../config/env';

export const authRouter = Router();
const invalidCredentials = () => new AppError(401, 'INVALID_CREDENTIALS', 'Incorrect mobile number/email or password');

authRouter.post('/register', authLimiter, async (req, res) => {
  const input = parse(registerSchema, req.body);
  const client = req.body?.client === 'mobile' ? 'mobile' : 'web';
  if (input.phone && (await prisma.user.findUnique({ where: { phone: input.phone } }))) throw conflict('PHONE_TAKEN', 'An account with this mobile number already exists. Please sign in.');
  if (input.email && (await prisma.user.findUnique({ where: { email: input.email } }))) throw conflict('EMAIL_TAKEN', 'An account with this email already exists. Please sign in.');
  const user = await prisma.user.create({
    data: {
      name: input.name,
      phone: input.phone ?? null,
      email: input.email ?? null,
      passwordHash: await hashPassword(input.password),
      roles: { create: { role: 'CUSTOMER' } },
      customerProfile: { create: { marketingConsent: input.marketingConsent } },
    },
  });
  const token = await startSession(req, res, user.id, client);
  res.status(201).json({ ...(await sessionPayload(user.id)), token });
});

authRouter.post('/login', authLimiter, async (req, res) => {
  const input = parse(loginSchema, req.body);
  const id = input.identifier.includes('@') ? { email: input.identifier.toLowerCase() } : { phone: normalizePhone(input.identifier) };
  const user = await prisma.user.findUnique({ where: id });
  // Always run a hash comparison so response time does not reveal whether the account exists.
  const ok = await verifyPassword(input.password, user?.passwordHash ?? 'scrypt$16384$8$1$AAAAAAAAAAAAAAAAAAAAAA==$AAAA');
  if (!user || !ok) throw invalidCredentials();
  if (user.status !== 'ACTIVE') throw new AppError(403, 'ACCOUNT_SUSPENDED', 'This account is suspended. Contact support.');
  const token = await startSession(req, res, user.id, input.client);
  res.json({ ...(await sessionPayload(user.id)), token });
});

authRouter.post('/otp/request', otpLimiter, async (req, res) => {
  const { phone } = parse(otpRequestSchema, req.body);
  const code = numericCode(6);
  await prisma.otpChallenge.create({ data: { phone, codeHash: sha256(`${phone}:${code}`), expiresAt: new Date(Date.now() + 5 * 60_000) } });
  await sms.sendOtp(phone, code);
  // The code is only echoed back in development demo mode, never in production.
  res.json({ sent: true, expiresInSeconds: 300, provider: sms.name, ...(demoMode && sms.name === 'mock' ? { devCode: code } : {}) });
});

authRouter.post('/otp/verify', authLimiter, async (req, res) => {
  const input = parse(otpVerifySchema, req.body);
  const challenge = await prisma.otpChallenge.findFirst({
    where: { phone: input.phone, consumedAt: null, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: 'desc' },
  });
  if (!challenge || challenge.attempts >= 5) throw new AppError(400, 'OTP_EXPIRED', 'This code has expired. Request a new one.');
  if (challenge.codeHash !== sha256(`${input.phone}:${input.code}`)) {
    await prisma.otpChallenge.update({ where: { id: challenge.id }, data: { attempts: { increment: 1 } } });
    throw new AppError(400, 'OTP_INVALID', 'Incorrect code. Please check and try again.');
  }
  const consumed = await prisma.otpChallenge.updateMany({ where: { id: challenge.id, consumedAt: null }, data: { consumedAt: new Date() } });
  if (consumed.count !== 1) throw new AppError(400, 'OTP_EXPIRED', 'This code has already been used.');

  let user = await prisma.user.findUnique({ where: { phone: input.phone } });
  if (!user) {
    if (!input.name) throw new AppError(400, 'NAME_REQUIRED', 'Tell us your name to create your account', { fields: { name: 'Required' } });
    user = await prisma.user.create({
      data: {
        name: input.name,
        phone: input.phone,
        phoneVerifiedAt: new Date(),
        roles: { create: { role: 'CUSTOMER' } },
        customerProfile: { create: {} },
      },
    });
  } else {
    if (user.status !== 'ACTIVE') throw new AppError(403, 'ACCOUNT_SUSPENDED', 'This account is suspended. Contact support.');
    if (!user.phoneVerifiedAt) await prisma.user.update({ where: { id: user.id }, data: { phoneVerifiedAt: new Date() } });
  }
  const token = await startSession(req, res, user.id, input.client);
  res.json({ ...(await sessionPayload(user.id)), token });
});

authRouter.post('/logout', async (req, res) => {
  if (req.auth) await prisma.session.deleteMany({ where: { id: req.auth.sessionId } });
  res.clearCookie(SESSION_COOKIE, { path: '/' });
  res.json({ ok: true });
});

authRouter.get('/me', requireAuth, async (req, res) => {
  res.json(await sessionPayload(authOf(req).user.id));
});

const profileSchema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  email: z.string().trim().toLowerCase().email().optional().nullable(),
  marketingConsent: z.boolean().optional(),
  preferredLanguage: z.enum(['en', 'hi']).optional(),
});

authRouter.patch('/me', requireAuth, async (req, res) => {
  const input = parse(profileSchema, req.body);
  const userId = authOf(req).user.id;
  await prisma.user.update({ where: { id: userId }, data: { name: input.name, email: input.email === undefined ? undefined : input.email } });
  if (input.marketingConsent !== undefined || input.preferredLanguage) {
    await prisma.customerProfile.upsert({
      where: { userId },
      create: { userId, marketingConsent: input.marketingConsent ?? false, preferredLanguage: input.preferredLanguage ?? 'en' },
      update: {
        ...(input.marketingConsent !== undefined ? { marketingConsent: input.marketingConsent, consentUpdatedAt: new Date() } : {}),
        ...(input.preferredLanguage ? { preferredLanguage: input.preferredLanguage } : {}),
      },
    });
  }
  res.json(await sessionPayload(userId));
});
