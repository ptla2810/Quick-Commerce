import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import { env } from '../config/env';

// In-memory limiter: correct for a single API instance. Use a Redis store when running several instances.
const skip = () => env.NODE_ENV === 'test';

export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skip,
  message: { error: { code: 'RATE_LIMITED', message: 'Too many attempts. Please wait a few minutes and try again.' } },
});

export const otpLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 5,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skip,
  keyGenerator: (req) => (req.body?.phone ? `phone:${String(req.body.phone)}` : ipKeyGenerator(req.ip ?? '')),
  message: { error: { code: 'RATE_LIMITED', message: 'Too many codes requested. Please wait 10 minutes.' } },
});

export const writeLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 120,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skip,
  message: { error: { code: 'RATE_LIMITED', message: 'Too many requests. Please slow down.' } },
});
