import { z } from 'zod';

const bool = z
  .enum(['true', 'false', '1', '0'])
  .optional()
  .transform((v) => v === 'true' || v === '1');

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().default(4000),
  DATABASE_URL: z.string().min(1),
  CORS_ORIGINS: z.string().default('http://localhost:3000'),
  SESSION_TTL_DAYS: z.coerce.number().int().min(1).max(365).default(30),
  COOKIE_SECURE: bool,
  ENABLE_DEMO_LOGIN: bool,
  DEMO_USER_PASSWORD: z.string().optional(),
  PAYMENT_PROVIDER: z.enum(['mock', 'razorpay']).default('mock'),
  SMS_PROVIDER: z.enum(['mock', 'msg91']).default('mock'),
  EMAIL_PROVIDER: z.enum(['mock']).default('mock'),
  PUSH_PROVIDER: z.enum(['mock']).default('mock'),
  MAPS_PROVIDER: z.enum(['local']).default('local'),
  STORAGE_PROVIDER: z.enum(['local']).default('local'),
  STORAGE_DIR: z.string().default('./storage'),
  RAZORPAY_KEY_ID: z.string().optional(),
  RAZORPAY_KEY_SECRET: z.string().optional(),
  RAZORPAY_WEBHOOK_SECRET: z.string().optional(),
  MSG91_AUTH_KEY: z.string().optional(),
  MSG91_TEMPLATE_ID: z.string().optional(),
  WEB_BASE_URL: z.string().default('http://localhost:3000'),
  LOG_LEVEL: z.string().default('info'),
});

export type Env = z.infer<typeof EnvSchema>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const env = EnvSchema.parse(source);
  if (env.NODE_ENV === 'production') {
    // Development conveniences must never reach production.
    const problems: string[] = [];
    if (env.ENABLE_DEMO_LOGIN) problems.push('ENABLE_DEMO_LOGIN must be false');
    if (env.PAYMENT_PROVIDER === 'mock') problems.push('PAYMENT_PROVIDER=mock is not allowed');
    if (env.SMS_PROVIDER === 'mock') problems.push('SMS_PROVIDER=mock is not allowed');
    if (!env.COOKIE_SECURE) problems.push('COOKIE_SECURE must be true');
    if (env.PAYMENT_PROVIDER === 'razorpay' && !(env.RAZORPAY_KEY_ID && env.RAZORPAY_KEY_SECRET && env.RAZORPAY_WEBHOOK_SECRET))
      problems.push('Razorpay keys and webhook secret are required');
    if (problems.length) throw new Error(`Unsafe production configuration:\n- ${problems.join('\n- ')}`);
  }
  if (env.PAYMENT_PROVIDER === 'razorpay' && !(env.RAZORPAY_KEY_ID && env.RAZORPAY_KEY_SECRET)) {
    throw new Error('PAYMENT_PROVIDER=razorpay requires RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET');
  }
  if (env.SMS_PROVIDER === 'msg91' && !(env.MSG91_AUTH_KEY && env.MSG91_TEMPLATE_ID)) {
    throw new Error('SMS_PROVIDER=msg91 requires MSG91_AUTH_KEY and MSG91_TEMPLATE_ID');
  }
  return env;
}

export const env = loadEnv();
export const demoMode = env.NODE_ENV !== 'production' && env.ENABLE_DEMO_LOGIN;
