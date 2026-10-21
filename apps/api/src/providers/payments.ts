import { env } from '../config/env';
import { hmacSha256Hex, safeEqualHex } from '../lib/crypto';

export interface CreatePaymentResult {
  providerRef: string;
  /** What the client needs to open the provider checkout. */
  clientPayload: Record<string, unknown>;
}

export interface PaymentProvider {
  readonly name: 'mock' | 'razorpay';
  readonly simulated: boolean;
  createPayment(input: { paymentId: string; amount: number; orderNumber: string }): Promise<CreatePaymentResult>;
  verifyWebhook(rawBody: Buffer, signature: string | undefined): boolean;
  refund(input: { providerRef: string; amount: number }): Promise<{ providerTxnId: string }>;
}

/** Simulated gateway for development. Payments are completed from the web "simulated checkout" page. */
class MockPaymentProvider implements PaymentProvider {
  readonly name = 'mock' as const;
  readonly simulated = true;
  async createPayment(input: { paymentId: string }) {
    return { providerRef: `mock_${input.paymentId}`, clientPayload: { checkoutPath: `/pay/${input.paymentId}` } };
  }
  verifyWebhook() {
    return false;
  }
  async refund(input: { providerRef: string }) {
    return { providerTxnId: `mock_refund_${input.providerRef}_${Date.now()}` };
  }
}

/**
 * Razorpay Orders API + webhook signature verification.
 * Implemented from Razorpay's documented contract but NOT tested against a live merchant account here.
 */
class RazorpayProvider implements PaymentProvider {
  readonly name = 'razorpay' as const;
  readonly simulated = false;
  private auth() {
    return 'Basic ' + Buffer.from(`${env.RAZORPAY_KEY_ID}:${env.RAZORPAY_KEY_SECRET}`).toString('base64');
  }
  async createPayment(input: { paymentId: string; amount: number; orderNumber: string }) {
    const res = await fetch('https://api.razorpay.com/v1/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: this.auth() },
      body: JSON.stringify({ amount: input.amount, currency: 'INR', receipt: input.paymentId, notes: { orderNumber: input.orderNumber } }),
    });
    if (!res.ok) throw new Error(`Razorpay order creation failed (${res.status})`);
    const body = (await res.json()) as { id: string };
    return { providerRef: body.id, clientPayload: { keyId: env.RAZORPAY_KEY_ID, razorpayOrderId: body.id, amount: input.amount, currency: 'INR' } };
  }
  verifyWebhook(rawBody: Buffer, signature: string | undefined) {
    if (!signature || !env.RAZORPAY_WEBHOOK_SECRET) return false;
    return safeEqualHex(hmacSha256Hex(env.RAZORPAY_WEBHOOK_SECRET, rawBody), signature);
  }
  async refund(input: { providerRef: string; amount: number }) {
    const res = await fetch(`https://api.razorpay.com/v1/payments/${input.providerRef}/refund`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: this.auth() },
      body: JSON.stringify({ amount: input.amount }),
    });
    if (!res.ok) throw new Error(`Razorpay refund failed (${res.status})`);
    const body = (await res.json()) as { id: string };
    return { providerTxnId: body.id };
  }
}

export const payments: PaymentProvider = env.PAYMENT_PROVIDER === 'razorpay' ? new RazorpayProvider() : new MockPaymentProvider();
