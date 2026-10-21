import { env } from '../config/env';
import { logger } from '../lib/logger';

export interface SmsProvider {
  readonly name: string;
  sendOtp(phone: string, code: string): Promise<void>;
  send(phone: string, message: string): Promise<void>;
}

/** Development provider: writes messages to the API log instead of sending them. */
class MockSmsProvider implements SmsProvider {
  readonly name = 'mock';
  async sendOtp(phone: string, code: string) {
    logger.info(`[mock SMS] OTP for ${phone}: ${code}`);
  }
  async send(phone: string, message: string) {
    logger.info(`[mock SMS] to ${phone}: ${message}`);
  }
}

/**
 * MSG91 OTP API. Requires a DLT-registered sender and template (TRAI rules).
 * Not exercised against the live service in this repository; verify before enabling.
 */
class Msg91SmsProvider implements SmsProvider {
  readonly name = 'msg91';
  async sendOtp(phone: string, code: string) {
    const res = await fetch('https://control.msg91.com/api/v5/otp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', authkey: env.MSG91_AUTH_KEY! },
      body: JSON.stringify({ template_id: env.MSG91_TEMPLATE_ID, mobile: `91${phone}`, otp: code }),
    });
    if (!res.ok) throw new Error(`MSG91 OTP failed with status ${res.status}`);
  }
  async send() {
    throw new Error('Transactional SMS via MSG91 needs a DLT template; not configured');
  }
}

export const sms: SmsProvider = env.SMS_PROVIDER === 'msg91' ? new Msg91SmsProvider() : new MockSmsProvider();
