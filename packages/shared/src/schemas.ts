import { z } from 'zod';
import {
  BUSINESS_TYPES,
  DISCOUNT_TYPES,
  DOCUMENT_TYPES,
  DRUG_SCHEDULES,
  FULFILMENT_TYPES,
  ORDER_STATUSES,
  PAYMENT_METHODS,
  SELLER_TYPES,
  SUBSTITUTION_PREFS,
  TICKET_CATEGORIES,
  UNIT_TYPES,
  VERTICALS,
} from './enums';
import { GSTIN, INDIAN_MOBILE, PINCODE, normalizePhone } from './validation';

const phone = z
  .string()
  .transform(normalizePhone)
  .refine((v) => INDIAN_MOBILE.test(v), 'Enter a valid 10-digit Indian mobile number');
const email = z.string().trim().toLowerCase().email('Enter a valid email address');
const password = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(128)
  .regex(/[A-Za-z]/, 'Password must contain a letter')
  .regex(/\d/, 'Password must contain a number');
const gstin = z
  .string()
  .trim()
  .toUpperCase()
  .refine((v) => GSTIN.test(v), 'Enter a valid 15-character GSTIN');
const id = z.string().min(1).max(64);
const paise = z.number().int().min(0).max(1_000_000_000);
const shortText = (max = 120) => z.string().trim().min(1).max(max);

export const registerSchema = z
  .object({
    name: shortText(80),
    phone: phone.optional(),
    email: email.optional(),
    password,
    marketingConsent: z.boolean().default(false),
  })
  .refine((v) => v.phone || v.email, { message: 'Provide a mobile number or email', path: ['phone'] });

export const loginSchema = z.object({
  identifier: z.string().trim().min(3).max(120), // phone or email
  password: z.string().min(1).max(128),
  client: z.enum(['web', 'mobile']).default('web'),
});

export const otpRequestSchema = z.object({ phone });
export const otpVerifySchema = z.object({
  phone,
  code: z.string().regex(/^\d{6}$/, 'Enter the 6-digit code'),
  name: z.string().trim().max(80).optional(),
  client: z.enum(['web', 'mobile']).default('web'),
});

export const addressSchema = z.object({
  label: z.string().trim().max(30).default('Home'),
  contactName: shortText(80),
  contactPhone: phone,
  line1: shortText(160),
  line2: z.string().trim().max(160).optional().nullable(),
  landmark: z.string().trim().max(120).optional().nullable(),
  localityId: id,
  postalCode: z.string().refine((v) => PINCODE.test(v), 'Enter a valid 6-digit PIN code'),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  isDefault: z.boolean().default(false),
});

export const cartItemSchema = z.object({
  storeId: id,
  variantId: id,
  quantity: z.number().int().min(0).max(10000),
  mode: z.enum(['RETAIL', 'BUSINESS']).default('RETAIL'),
  substitutionPref: z.enum(SUBSTITUTION_PREFS).optional(),
  replaceCart: z.boolean().default(false),
});

export const checkoutSchema = z.object({
  mode: z.enum(['RETAIL', 'BUSINESS']).default('RETAIL'),
  addressId: id.optional(),
  fulfilmentType: z.enum(FULFILMENT_TYPES).default('DELIVERY'),
  paymentMethod: z.enum(PAYMENT_METHODS).default('COD'),
  couponCode: z.string().trim().toUpperCase().max(30).optional().nullable(),
  prescriptionId: id.optional().nullable(),
  scheduledFor: z.string().datetime().optional().nullable(),
  notes: z.string().trim().max(300).optional().nullable(),
});

export const placeOrderSchema = checkoutSchema.extend({
  idempotencyKey: z.string().min(8).max(80),
});

export const cancelOrderSchema = z.object({ reason: shortText(300) });

export const orderTransitionSchema = z.object({
  to: z.enum(ORDER_STATUSES),
  reason: z.string().trim().max(300).optional(),
});

export const mockPaymentResultSchema = z.object({ outcome: z.enum(['success', 'failure']) });

export const sellerOnboardingSchema = z.object({
  orgName: shortText(120),
  legalName: shortText(160),
  sellerType: z.enum(SELLER_TYPES),
  gstin: gstin.optional().nullable(),
  contactPhone: phone,
  contactEmail: email,
  store: z.object({
    name: shortText(120),
    verticals: z.array(z.enum(VERTICALS)).min(1),
    addressLine: shortText(200),
    localityId: id,
    postalCode: z.string().refine((v) => PINCODE.test(v), 'Enter a valid 6-digit PIN code'),
    lat: z.number(),
    lng: z.number(),
    phone,
    openMinute: z.number().int().min(0).max(1439),
    closeMinute: z.number().int().min(0).max(1439),
    deliveryRadiusKm: z.number().min(0.5).max(25),
    serviceLocalityIds: z.array(id).min(1),
  }),
  licences: z
    .array(
      z.object({
        type: z.enum(DOCUMENT_TYPES),
        number: shortText(60),
        validUntil: z.string().datetime().optional().nullable(),
      }),
    )
    .default([]),
});

export const storeSettingsSchema = z.object({
  openMinute: z.number().int().min(0).max(1439).optional(),
  closeMinute: z.number().int().min(0).max(1439).optional(),
  isTemporarilyClosed: z.boolean().optional(),
  deliveryRadiusKm: z.number().min(0.5).max(25).optional(),
  minOrderValue: paise.optional(),
  baseDeliveryFee: paise.optional(),
  freeDeliveryAbove: paise.optional(),
  prepTimeMins: z.number().int().min(5).max(240).optional(),
  pickupEnabled: z.boolean().optional(),
});

export const productCreateSchema = z.object({
  name: shortText(160),
  categoryId: id,
  brandName: z.string().trim().max(80).optional().nullable(),
  vertical: z.enum(VERTICALS),
  description: z.string().trim().max(2000).optional().nullable(),
  localNames: z.array(z.string().trim().min(1).max(60)).max(10).default([]),
  taxRateBps: z.number().int().min(0).max(2800),
  hsnCode: z.string().trim().max(10).optional().nullable(),
  isRegional: z.boolean().default(false),
  pharmacy: z
    .object({
      schedule: z.enum(DRUG_SCHEDULES),
      genericName: z.string().trim().max(160).optional().nullable(),
      strength: z.string().trim().max(60).optional().nullable(),
      dosageForm: z.string().trim().max(60).optional().nullable(),
      manufacturer: z.string().trim().max(120).optional().nullable(),
    })
    .optional()
    .nullable(),
  variant: z.object({
    sku: z.string().trim().min(2).max(60).regex(/^[A-Za-z0-9._-]+$/, 'SKU may contain letters, numbers, dot, dash and underscore'),
    name: shortText(60),
    unitType: z.enum(UNIT_TYPES),
    unitQuantity: z.number().positive().max(100000),
    mrp: paise,
    unitsPerCase: z.number().int().positive().optional().nullable(),
  }),
  inventory: z.object({
    price: paise,
    wholesalePrice: paise.optional().nullable(),
    stockQty: z.number().int().min(0).max(1_000_000),
    lowStockThreshold: z.number().int().min(0).max(100000).default(5),
    minOrderQty: z.number().int().min(1).max(10000).default(1),
  }),
});

export const inventoryUpdateSchema = z.object({
  stockQty: z.number().int().min(0).max(1_000_000).optional(),
  adjustBy: z.number().int().min(-1_000_000).max(1_000_000).optional(),
  price: paise.optional(),
  wholesalePrice: paise.optional().nullable(),
  lowStockThreshold: z.number().int().min(0).max(100000).optional(),
  isAvailable: z.boolean().optional(),
  minOrderQty: z.number().int().min(1).max(10000).optional(),
  batchNumber: z.string().trim().max(40).optional().nullable(),
  expiryDate: z.string().datetime().optional().nullable(),
  reason: z.string().trim().max(200).optional(),
});

export const rejectOrderSchema = z.object({ reason: shortText(300) });

export const businessProfileSchema = z.object({
  businessName: shortText(120),
  legalName: shortText(160),
  businessType: z.enum(BUSINESS_TYPES),
  gstin: gstin.optional().nullable(),
  fssaiNumber: z.string().trim().regex(/^\d{14}$/, 'FSSAI licence numbers are 14 digits').optional().nullable(),
  billingAddress: shortText(240),
  cityId: id,
  contactPhone: phone,
});

export const procurementListSchema = z.object({
  name: shortText(80),
  storeId: id,
  recurrence: z.enum(['NONE', 'DAILY', 'WEEKLY', 'MONTHLY']).default('NONE'),
  items: z.array(z.object({ variantId: id, quantity: z.number().int().min(1).max(10000) })).min(1).max(200),
});

export const rfqCreateSchema = z.object({
  title: shortText(120),
  notes: z.string().trim().max(1000).optional().nullable(),
  neededBy: z.string().datetime().optional().nullable(),
  deliveryLocalityId: id,
  items: z
    .array(
      z.object({
        variantId: id.optional().nullable(),
        description: shortText(160),
        quantity: z.number().positive().max(100000),
        unit: z.enum(UNIT_TYPES),
      }),
    )
    .min(1)
    .max(50),
});

export const quotationCreateSchema = z.object({
  storeId: id,
  validUntil: z.string().datetime(),
  deliveryFee: paise.default(0),
  notes: z.string().trim().max(1000).optional().nullable(),
  items: z
    .array(
      z.object({
        rfqItemId: id,
        variantId: id.optional().nullable(),
        unitPrice: paise,
        taxRateBps: z.number().int().min(0).max(2800),
        available: z.boolean().default(true),
      }),
    )
    .min(1),
});

export const prescriptionReviewSchema = z.object({
  decision: z.enum(['APPROVED', 'REJECTED']),
  notes: z.string().trim().min(3).max(1000),
  validUntil: z.string().datetime().optional().nullable(),
  approvedProductIds: z.array(id).default([]),
});

export const deliveryStatusSchema = z.object({
  status: z.enum(['ACCEPTED', 'PICKED_UP', 'DELIVERED', 'FAILED']),
  otp: z.string().regex(/^\d{4}$/).optional(),
  note: z.string().trim().max(300).optional(),
  issueType: z.enum(['CUSTOMER_UNAVAILABLE', 'WRONG_ADDRESS', 'CUSTOMER_REFUSED', 'VEHICLE_ISSUE', 'STORE_DELAY', 'OTHER']).optional(),
  lat: z.number().optional(),
  lng: z.number().optional(),
});

export const deliveryPartnerRegisterSchema = z.object({
  cityId: id,
  vehicleType: z.enum(['BICYCLE', 'SCOOTER', 'MOTORCYCLE', 'E_RICKSHAW']),
  vehicleNumber: z.string().trim().max(20).optional().nullable(),
  drivingLicenceNumber: z.string().trim().max(30).optional().nullable(),
});

export const assignDeliverySchema = z.object({ deliveryPartnerId: id });

export const couponSchema = z.object({
  code: z.string().trim().toUpperCase().regex(/^[A-Z0-9]{3,20}$/, 'Use 3-20 letters or numbers'),
  description: shortText(200),
  discountType: z.enum(DISCOUNT_TYPES),
  value: z.number().int().min(0),
  maxDiscount: paise.optional().nullable(),
  minOrderValue: paise.default(0),
  vertical: z.enum(VERTICALS).optional().nullable(),
  cityId: id.optional().nullable(),
  storeId: id.optional().nullable(),
  validFrom: z.string().datetime(),
  validTo: z.string().datetime(),
  usageLimit: z.number().int().positive().optional().nullable(),
  perUserLimit: z.number().int().positive().default(1),
  firstOrderOnly: z.boolean().default(false),
  isActive: z.boolean().default(true),
});

export const supportTicketSchema = z.object({
  category: z.enum(TICKET_CATEGORIES),
  subject: shortText(120),
  message: shortText(2000),
  orderId: id.optional().nullable(),
});

export const ticketMessageSchema = z.object({ body: shortText(2000) });

export const reviewSchema = z.object({
  orderId: id,
  rating: z.number().int().min(1).max(5),
  comment: z.string().trim().max(1000).optional().nullable(),
});

export const returnRequestSchema = z.object({
  reason: shortText(500),
  items: z.array(z.object({ orderItemId: id, quantity: z.number().int().min(1) })).min(1),
});

export const verificationDecisionSchema = z.object({
  status: z.enum(['APPROVED', 'REJECTED', 'INFO_REQUIRED']),
  notes: z.string().trim().max(1000).optional().nullable(),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type AddressInput = z.infer<typeof addressSchema>;
export type CheckoutInput = z.infer<typeof checkoutSchema>;
export type PlaceOrderInput = z.infer<typeof placeOrderSchema>;
export type ProductCreateInput = z.infer<typeof productCreateSchema>;
export type RfqCreateInput = z.infer<typeof rfqCreateSchema>;
export type QuotationCreateInput = z.infer<typeof quotationCreateSchema>;
