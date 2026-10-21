# API reference

Base URL: `http://localhost:4000/api` (the web app proxies `/api/*` to it).

**Conventions**
- JSON in and out. Unsafe methods must send `Content-Type: application/json` or `multipart/form-data`.
- **Auth**: web uses the `padosi_session` httpOnly cookie. Mobile sends `Authorization: Bearer <token>`; the token is returned by the auth endpoints when the body has `"client": "mobile"`.
- **Money** is integer **paise** (₹1 = 100). GST rates are basis points (500 = 5%).
- **Errors** look like `{ "error": { "code": "OUT_OF_STOCK", "message": "…", "details": { … } } }`. Validation errors carry `details.fields` (field → message). Checkout errors carry `details.issues`.
- **Idempotency**: `POST /orders` needs `idempotencyKey` (body) or `Idempotency-Key` (header). `POST /orders/:id/pay` needs the `Idempotency-Key` header.
- Request schemas live in `packages/shared/src/schemas.ts` and are shared by client and server.

Legend: 🔓 public · 🔐 signed in · 🏪 seller member of the store · 🛵 delivery partner · 🛡 admin permission (in brackets)

## Auth `/auth`
| Method | Path | | Notes |
|---|---|---|---|
| POST | `/register` | 🔓 | name, phone and/or email, password, marketingConsent |
| POST | `/login` | 🔓 | identifier (phone or email), password |
| POST | `/otp/request` | 🔓 | phone; rate limited 5 per 10 min; `devCode` returned only in demo mode |
| POST | `/otp/verify` | 🔓 | phone, code, name (for new accounts); 5 attempts per code |
| POST | `/logout` | 🔐 | revokes the server session |
| GET/PATCH | `/me` | 🔐 | profile, roles, permissions, memberships; PATCH name/email/consent/language |

## Locations & catalogue
| Method | Path | | Notes |
|---|---|---|---|
| GET | `/locations/cities` | 🔓 | active cities |
| GET | `/locations/cities/:cityId/localities` | 🔓 | with `serviceable` flag |
| GET | `/locations/pincode/:pin` | 🔓 | |
| GET | `/locations/serviceability?localityId&lat&lng&vertical` | 🔓 | stores that deliver there, with distance, open status and ETA window |
| GET | `/catalog/categories?vertical` | 🔓 | |
| GET | `/catalog/brands` | 🔓 | |
| GET | `/catalog/products?localityId&lat&lng&q&category&brand&vertical&storeId&minPrice&maxPrice&inStock&regional&bulk&maxEta&sort&mode&page&pageSize` | 🔓 | only products stocked and priced by serviceable stores; `mode=BUSINESS` applies wholesale/negotiated prices for verified buyers |
| GET | `/catalog/products/:slug?localityId…` | 🔓 | detail + offers per nearby store |
| GET | `/catalog/recommendations?localityId…` | 🔓 | frequent / recent (signed in) / regional |
| GET | `/stores/nearby?localityId…` | 🔓 | |
| GET | `/stores/:slug?localityId…` | 🔓 | profile, licences, reviews, `deliversToSelectedLocation` |

## Cart, checkout, orders, payments (🔐)
| Method | Path | Notes |
|---|---|---|
| GET | `/cart?mode=RETAIL\|BUSINESS` | cart with live price and stock status |
| POST | `/cart/items` | storeId, variantId, quantity (0 removes), substitutionPref, replaceCart. `409 CART_STORE_CONFLICT` if another store |
| POST | `/cart/bulk` | business quick order by SKU or variantId; reports per-line results |
| DELETE | `/cart?mode` | clear |
| POST | `/checkout/quote` | server-side totals, issues, payment methods, ETA |
| POST | `/orders` | place order (idempotent). 201 new, 200 replayed, 422 `CHECKOUT_INVALID`, 409 `OUT_OF_STOCK` |
| GET | `/orders?scope=all\|active\|past&channel` | |
| GET | `/orders/:id` | detail incl. delivery code, timeline, refunds, allowed actions |
| POST | `/orders/:id/cancel` | reason; allowed only in configured statuses |
| POST | `/orders/:id/pay` | method; creates a payment attempt; returns `client.checkoutPath` (mock) or Razorpay order details |
| GET | `/orders/:id/invoice` | GST invoice (tax invoice once delivered) |
| POST | `/orders/:id/reorder` | refills the cart with items still available |
| POST | `/orders/:id/review` | rating 1–5 after delivery |
| POST | `/orders/:id/returns` | items + reason within the return window |
| GET | `/payments/:id` | |
| POST | `/payments/:id/mock-complete` | `{ outcome: success\|failure }` — mock provider + demo mode only |
| POST | `/payments/webhooks/razorpay` | raw body, `X-Razorpay-Signature` HMAC verified |

## Account `/me` (🔐)
Addresses `GET/POST /addresses`, `PATCH/DELETE /addresses/:id` · favourites `GET/POST /favourites` · notifications `GET /notifications`, `POST /notifications/read` · coupons `GET /coupons` · support `GET/POST /support/tickets`, `GET /support/tickets/:id`, `POST /support/tickets/:id/messages` · prescriptions `GET /prescriptions`, `POST /prescriptions` (multipart `file`, patientName, doctorName, issuedOn; JPG/PNG/WebP/PDF ≤ 5 MB, type checked by content) · private files `GET /files/:id` (owner, reviewing pharmacist, or admin as applicable; non-owner access is audited).
Public: `GET /public/support/info` (contact + FAQs).

## HoReCa `/business` (🔐)
`GET/POST/PATCH /profile`, `POST /profile/documents`, `GET /summary`, `GET /suppliers?localityId…`, `GET/POST /lists`, `POST /lists/from-order/:orderId`, `DELETE /lists/:id`, `GET/POST /rfqs` (verified businesses only), `GET /rfqs/:id` (with quotations), `POST /rfqs/:id/cancel`, `POST /quotations/:id/accept` (creates a negotiated price list valid until the quotation expires).

## Seller `/seller` (🏪 unless noted)
| Method | Path | Notes |
|---|---|---|
| POST | `/onboarding` | 🔐 creates org (PENDING), store, licences, OWNER membership |
| GET | `/me` | memberships, stores, licences, documents |
| POST | `/orgs/:orgId/documents` | OWNER/MANAGER, multipart |
| PATCH | `/stores/:storeId` | hours, closure, radius, fees, prep time, pickup |
| GET | `/stores/:storeId/orders?scope=new\|active\|completed\|all&status` | |
| GET | `/orders/:id` | seller view (no customer phone or delivery code) |
| POST | `/orders/:id/transition` | `{ to, reason }` — accept/prepare/ready/reject/cancel/collected |
| POST | `/orders/:id/prescription-review` | **PHARMACIST only**: decision, notes, approvedProductIds |
| GET | `/stores/:storeId/delivery-partners` | online verified partners in the city |
| POST | `/orders/:id/assign` | manual dispatch |
| GET | `/stores/:storeId/inventory?q&filter=all\|low\|out\|expiring` | |
| PATCH | `/stores/:storeId/inventory/:inventoryId` | stock (audited), prices, MOQ, batch, expiry, availability |
| GET | `/stores/:storeId/inventory/:inventoryId/history` | stock audit trail |
| GET | `/stores/:storeId/inventory.csv` | export |
| POST | `/stores/:storeId/inventory/import` | `{ csv }` bulk update by existing SKU |
| GET | `/categories` | |
| POST | `/stores/:storeId/products` | create product + variant + stock + prices (pharmacy rules enforced) |
| GET | `/stores/:storeId/analytics?days` | sales, AOV, acceptance/fulfilment, best sellers, stock alerts, earnings |
| GET | `/orgs/:orgId/settlements` | |
| GET | `/stores/:storeId/returns` | |
| GET | `/stores/:storeId/rfqs` | open RFQs in served localities (HoReCa stores) |
| POST | `/rfqs/:id/quotations` | submit or revise a quotation |

## Delivery `/delivery` (🛵)
`POST /register` (🔐), `GET /me`, `POST /availability` `{ isOnline, lat, lng }`, `GET /assignments?scope=active|history`, `POST /assignments/:id/status` `{ status: ACCEPTED|PICKED_UP|DELIVERED|FAILED, otp?, issueType?, note?, lat?, lng? }`, `GET /earnings`.

## Admin `/admin` (🛡)
`GET /metrics?days&cityId` [dashboard] · `GET /sellers?status`, `POST /sellers/:id/verification`, `POST /stores/:id/status` [sellers] · `GET /business-profiles`, `POST /business-profiles/:id/verification` (incl. credit terms), `GET /users`, `POST /users/:id/status` [users] · `GET /delivery-partners`, `POST /delivery-partners/:id/verification`, `POST /orders/:id/assign` [delivery] · `GET /orders`, `GET /orders/:id`, `POST /orders/:id/transition` (reason required, audited) [orders] · `GET /geo`, `POST /cities`, `PATCH /cities/:id`, `POST /zones`, `PATCH /zones/:id`, `POST /localities`, `PATCH /localities/:id` [zones] · `GET /catalog`, `POST /categories`, `PATCH /categories/:id`, `POST /brands`, `PATCH /products/:id` [catalog] · `GET/POST /coupons`, `PATCH /coupons/:id` [coupons] · `GET /tickets`, `POST /tickets/:id/status`, `GET /returns`, `POST /returns/:id/decision` [support] · `GET/POST /settlements`, `POST /settlements/:id/paid` [settlements] · `GET/PUT /settings` [settings — super admin] · `GET /audit-logs` [audit — super admin].

## Development only `/dev`
`GET /status` (always available: environment and provider names) · `GET /demo-accounts`, `POST /demo-login` (only when `ENABLE_DEMO_LOGIN=true` and not production; only `isDemo` users).
