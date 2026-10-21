export interface Offer {
  storeId: string;
  storeName: string;
  storeSlug: string;
  isDemoStore: boolean;
  price: number;
  taxInclusive: boolean;
  priceSource: string;
  minOrderQty: number;
  tiers: { minQty: number; unitPrice: number }[];
  inStock: boolean;
  lowStock: boolean;
  stockLeft: number | null;
  isOpen: boolean;
  distanceKm: number;
  etaMinMins: number;
  etaMaxMins: number;
  storeRating: number;
}

export interface VariantCard {
  id: string;
  sku: string;
  name: string;
  unitType: string;
  unitsPerCase: number | null;
  isBulk: boolean;
  mrp: number;
  bestOffer: Offer | null;
  offers: Offer[];
}

export interface ProductCard {
  id: string;
  slug: string;
  name: string;
  brand: { name: string; slug: string } | null;
  category: { id: string; name: string; slug: string; icon: string | null };
  vertical: 'GROCERY' | 'HORECA' | 'CHEMIST';
  description: string | null;
  imageUrl: string | null;
  isRegional: boolean;
  isDemo: boolean;
  taxRateBps: number;
  requiresPrescription: boolean;
  schedule: string | null;
  genericName: string | null;
  strength: string | null;
  dosageForm: string | null;
  manufacturer: string | null;
  variants: VariantCard[];
}

export interface StoreSummary {
  id: string;
  name: string;
  slug: string;
  verticals: string[];
  addressLine: string;
  phone: string;
  openMinute: number;
  closeMinute: number;
  isTemporarilyClosed: boolean;
  minOrderValue: number;
  baseDeliveryFee: number;
  freeDeliveryAbove: number;
  pickupEnabled: boolean;
  scheduledDeliveryEnabled: boolean;
  ratingAvg: number;
  ratingCount: number;
  isDemo: boolean;
  distanceKm: number | null;
  isOpen: boolean;
  etaMinMins: number | null;
  etaMaxMins: number | null;
}

export interface SessionUser {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  phoneVerified: boolean;
  isDemo: boolean;
  roles: string[];
  permissions: string[];
  preferredLanguage: string;
  marketingConsent: boolean;
  businessProfile: { id: string; businessName: string; verificationStatus: string; creditApproved: boolean } | null;
  deliveryPartner: { id: string; verificationStatus: string; isOnline: boolean } | null;
  sellerMemberships: { role: string; org: { id: string; name: string; verificationStatus: string; sellerType: string; stores: { id: string; name: string; slug: string; verticals: string[] }[] } }[];
}

export interface CartItem {
  id: string;
  variantId: string;
  quantity: number;
  substitutionPref: string;
  productName: string;
  productSlug: string;
  variantName: string;
  sku: string;
  vertical: string;
  requiresPrescription: boolean;
  mrp: number;
  unitPrice: number | null;
  taxInclusive: boolean;
  minOrderQty: number;
  tiers: { minQty: number; unitPrice: number }[];
  lineTotal: number | null;
  available: boolean;
  stockStatus: 'OK' | 'OUT_OF_STOCK' | 'INSUFFICIENT' | 'UNAVAILABLE';
  maxQuantity: number;
}

export interface Cart {
  id: string;
  mode: 'RETAIL' | 'BUSINESS';
  store: StoreSummary;
  items: CartItem[];
  itemCount: number;
  estimatedSubtotal: number;
  requiresPrescription: boolean;
}

export interface OrderDetail {
  id: string;
  orderNumber: string;
  status: string;
  paymentStatus: string;
  paymentMethod: string;
  fulfilmentType: string;
  channel: string;
  vertical: string;
  placedAt: string;
  deliveredAt: string | null;
  scheduledFor: string | null;
  etaMinMins: number | null;
  etaMaxMins: number | null;
  distanceKm: number | null;
  notes: string | null;
  cancelReason: string | null;
  rejectReason: string | null;
  couponCode: string | null;
  buyerGstin: string | null;
  buyerBusinessName: string | null;
  deliveryAddress: Record<string, string | number | null> | null;
  deliveryOtp?: string | null;
  totals: { itemsSubtotal: number; mrpTotal: number; discount: number; deliveryFee: number; taxableValue: number; taxTotal: number; grandTotal: number; commissionRateBps?: number; commissionAmount?: number; sellerEarning?: number };
  items: { id: string; variantId: string; productId: string; productName: string; variantName: string; sku: string; quantity: number; unitPrice: number; mrp: number | null; lineAmount: number; discount: number; netAmount: number; taxRateBps: number; taxAmount: number; requiresPrescription: boolean; substitutionPref: string; returnedQty: number }[];
  events: { toStatus: string; fromStatus: string | null; actorType: string; note: string | null; at: string }[];
  store: { id: string; name: string; slug: string; phone: string; addressLine: string; isDemo: boolean };
  delivery: { id: string; status: string; partnerName: string; vehicleType: string; assignedAt: string; pickedUpAt: string | null; events: { status: string; issueType: string | null; note: string | null; at: string }[] } | null;
  payments: { id: string; method: string; provider: string; status: string; amount: number; failureReason: string | null; createdAt: string }[];
  refunds: { id: string; amount: number; status: string; reason: string; processedAt: string | null }[];
  returns: { id: string; status: string; reason: string; amount: number; resolutionNote: string | null; createdAt: string }[];
  prescription: { id: string; status: string; patientName: string; createdAt: string } | null;
  review: { rating: number; comment: string | null } | null;
  actions: { canCancel: boolean; canPay: boolean; canReview: boolean; canReturn: boolean; nextStatuses: string[] };
}
