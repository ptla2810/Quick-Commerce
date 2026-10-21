// String unions mirrored by the Prisma enums in apps/api/prisma/schema.prisma.
// Keep both in sync when adding values.

export const VERTICALS = ['GROCERY', 'HORECA', 'CHEMIST'] as const;
export type Vertical = (typeof VERTICALS)[number];

export const ROLES = ['CUSTOMER', 'BUSINESS_BUYER', 'SELLER', 'DELIVERY_PARTNER', 'ADMIN', 'SUPER_ADMIN'] as const;
export type Role = (typeof ROLES)[number];

export const SELLER_MEMBER_ROLES = ['OWNER', 'MANAGER', 'PHARMACIST', 'STAFF'] as const;
export type SellerMemberRole = (typeof SELLER_MEMBER_ROLES)[number];

export const ORDER_STATUSES = [
  'AWAITING_RX_REVIEW',
  'PENDING_PAYMENT',
  'PLACED',
  'ACCEPTED',
  'PREPARING',
  'READY_FOR_PICKUP',
  'OUT_FOR_DELIVERY',
  'DELIVERY_FAILED',
  'DELIVERED',
  'CANCELLED',
  'REJECTED',
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const PAYMENT_STATUSES = [
  'PENDING',
  'PAID',
  'FAILED',
  'COD_PENDING',
  'COD_COLLECTED',
  'CREDIT_DUE',
  'REFUND_PENDING',
  'REFUNDED',
  'VOID',
] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export const PAYMENT_METHODS = ['COD', 'UPI', 'CARD', 'NETBANKING', 'BUSINESS_CREDIT'] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];
export const ONLINE_PAYMENT_METHODS: PaymentMethod[] = ['UPI', 'CARD', 'NETBANKING'];

export const FULFILMENT_TYPES = ['DELIVERY', 'PICKUP'] as const;
export type FulfilmentType = (typeof FULFILMENT_TYPES)[number];

export const ORDER_CHANNELS = ['RETAIL', 'BUSINESS'] as const;
export type OrderChannel = (typeof ORDER_CHANNELS)[number];

export const UNIT_TYPES = ['KG', 'G', 'L', 'ML', 'PIECE', 'PACK', 'DOZEN', 'CASE', 'CARTON', 'BOX', 'STRIP', 'BOTTLE', 'TUBE'] as const;
export type UnitType = (typeof UNIT_TYPES)[number];

export const VERIFICATION_STATUSES = ['PENDING', 'APPROVED', 'REJECTED', 'INFO_REQUIRED'] as const;
export type VerificationStatus = (typeof VERIFICATION_STATUSES)[number];

export const SELLER_TYPES = ['GROCERY_RETAILER', 'WHOLESALER', 'DISTRIBUTOR', 'HORECA_SUPPLIER', 'PHARMACY'] as const;
export type SellerType = (typeof SELLER_TYPES)[number];

export const DRUG_SCHEDULES = ['OTC', 'SCHEDULE_G', 'SCHEDULE_H', 'SCHEDULE_H1', 'SCHEDULE_X'] as const;
export type DrugSchedule = (typeof DRUG_SCHEDULES)[number];

export const SUBSTITUTION_PREFS = ['NO_SUBSTITUTE', 'SIMILAR_ITEM', 'CALL_ME'] as const;
export type SubstitutionPref = (typeof SUBSTITUTION_PREFS)[number];

export const DELIVERY_ASSIGNMENT_STATUSES = ['ASSIGNED', 'ACCEPTED', 'PICKED_UP', 'DELIVERED', 'FAILED', 'CANCELLED'] as const;
export type DeliveryAssignmentStatus = (typeof DELIVERY_ASSIGNMENT_STATUSES)[number];

export const RFQ_STATUSES = ['OPEN', 'QUOTED', 'ACCEPTED', 'CLOSED', 'CANCELLED'] as const;
export type RfqStatus = (typeof RFQ_STATUSES)[number];

export const QUOTATION_STATUSES = ['SUBMITTED', 'ACCEPTED', 'REJECTED', 'WITHDRAWN'] as const;
export type QuotationStatus = (typeof QUOTATION_STATUSES)[number];

export const PRESCRIPTION_STATUSES = ['PENDING_REVIEW', 'APPROVED', 'REJECTED', 'EXPIRED'] as const;
export type PrescriptionStatus = (typeof PRESCRIPTION_STATUSES)[number];

export const DISCOUNT_TYPES = ['PERCENT', 'FLAT', 'FREE_DELIVERY'] as const;
export type DiscountType = (typeof DISCOUNT_TYPES)[number];

export const BUSINESS_TYPES = ['HOTEL', 'RESTAURANT', 'CAFE', 'CATERER', 'CLOUD_KITCHEN', 'OTHER'] as const;
export type BusinessType = (typeof BUSINESS_TYPES)[number];

export const TICKET_CATEGORIES = ['ORDER_ISSUE', 'PAYMENT', 'DELIVERY', 'PRODUCT_QUALITY', 'ACCOUNT', 'PHARMACY', 'OTHER'] as const;
export type TicketCategory = (typeof TICKET_CATEGORIES)[number];

export const RETURN_STATUSES = ['REQUESTED', 'APPROVED', 'REJECTED', 'REFUNDED'] as const;
export type ReturnStatus = (typeof RETURN_STATUSES)[number];

export const DOCUMENT_TYPES = ['GST_CERTIFICATE', 'FSSAI_LICENCE', 'DRUG_LICENCE', 'PAN', 'SHOP_ESTABLISHMENT', 'DRIVING_LICENCE', 'ID_PROOF', 'VEHICLE_RC', 'OTHER'] as const;
export type DocumentType = (typeof DOCUMENT_TYPES)[number];
