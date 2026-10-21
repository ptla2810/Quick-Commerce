export const INDIAN_MOBILE = /^[6-9]\d{9}$/;
export const PINCODE = /^[1-9]\d{5}$/;
export const GSTIN = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

export function normalizePhone(input: string): string {
  const digits = input.replace(/\D/g, '');
  if (digits.length === 12 && digits.startsWith('91')) return digits.slice(2);
  if (digits.length === 11 && digits.startsWith('0')) return digits.slice(1);
  return digits;
}

/** Mask a phone number for display to people who do not need the full number. */
export function maskPhone(phone: string | null | undefined): string {
  if (!phone) return '';
  return phone.length >= 4 ? `${'•'.repeat(phone.length - 4)}${phone.slice(-4)}` : phone;
}
