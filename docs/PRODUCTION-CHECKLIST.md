# Production readiness & compliance checklist

This MVP is technically functional. **A working system is not the same as a legally compliant business.** Treat every item below as something to confirm with qualified legal, tax and regulatory advisers before launch. This list is a starting point, not legal advice.

## 1. Pharmacy (Chemist vertical) — highest risk
- [ ] Get legal advice on the operating model for online medicine sales in India. Cover the Drugs and Cosmetics Act, 1940 and Rules, 1945, any notified e-pharmacy rules, and current court and regulatory positions. Check state-specific requirements for each launch city.
- [ ] Partner only with pharmacies holding valid retail drug licences (Forms 20/21 or as applicable). Verify the originals and track expiry dates. Re-verify periodically. Today, licence numbers are recorded and an admin approves them manually.
- [ ] Ensure every Rx order is reviewed and dispensed by a **registered pharmacist**. Verify their registration with the State Pharmacy Council. The `PHARMACIST` seller role and `pharmacistRegNumber` field exist, but registration is not verified automatically.
- [ ] Define prescription validity rules: how old a prescription can be, repeat-dispensing limits, quantity limits per prescription, and Schedule H1 register-keeping requirements. Implement them as configurable checks. Today the pharmacist judges validity manually.
- [ ] Keep Schedule X, narcotic and psychotropic (NDPS) products, and any banned FDCs blocked. The `isRestricted` flag and Schedule X refusal exist. Maintain the restricted list from official notifications.
- [ ] Add a qualified review of product content: no unsupported medical claims, correct composition and manufacturer details, and no self-medication prompts.
- [ ] Confirm the retention period for prescriptions and dispensing records. Add retention and deletion jobs.
- [ ] Define cold-chain and temperature-sensitive handling rules for delivery, or exclude those products.
- [ ] Turn off simulated pharmacist reviews (seed data only) and remove demo pharmacy records.

## 2. Data protection & privacy
- [ ] Map processing against the Digital Personal Data Protection Act, 2023 and its rules: notices, consent and its withdrawal, purpose limitation, data-principal rights (access, correction, erasure), grievance officer, breach notification.
- [ ] Health data (prescriptions): minimise collection, encrypt at rest (object storage with SSE/KMS), restrict access (already enforced and audited), define retention.
- [ ] Add account deletion and data export flows. Addresses are soft-deleted; a full erasure job is still needed.
- [ ] Publish a privacy policy and terms. The register page asks for acceptance, but no documents are linked yet.
- [ ] Follow CERT-In directions: incident reporting timelines and log retention. Ship structured logs (pino, already JSON in production) to a retained, access-controlled store.
- [ ] Store data in an Indian region where required or preferred.

## 3. Consumer protection & e-commerce
- [ ] Meet the Consumer Protection (E-Commerce) Rules, 2020: seller details on listings, grievance officer, return, refund, exchange and cancellation policies, no manipulative pricing or dark patterns, country of origin where applicable.
- [ ] Legal Metrology (Packaged Commodities): MRP, net quantity, manufacturer details and unit sale price must be displayed for packaged goods. MRP and pack size are shown; manufacturer and other declarations need catalogue fields.
- [ ] FSSAI: food sellers need FSSAI licences or registrations (captured for the demo; verify for real sellers). Assess whether the platform itself needs an FSSAI licence as an e-commerce food business operator.

## 4. Tax
- [ ] GST registration for the platform. TCS obligations of an e-commerce operator under Section 52 of the CGST Act (collection, GSTR-8 returns). Possible Section 9(5) liabilities.
- [ ] Invoice compliance: invoice numbering series per seller, e-invoicing thresholds, HSN codes (captured), place-of-supply rules (intra/inter-state handled by state code). Credit notes for returns.
- [ ] GST on delivery fees and platform/commission charges. Delivery fees are currently treated as platform revenue with no GST line.
- [ ] TDS/TCS under income-tax rules for e-commerce operators (e.g. Section 194-O) on seller payouts.

## 5. Payments
- [ ] Complete onboarding with an RBI-authorised payment aggregator (e.g. Razorpay). Enable `PAYMENT_PROVIDER=razorpay`, configure webhooks, and test end to end in test mode. The provider code exists but is untested.
- [ ] Never collect card data directly. Use the gateway's checkout or SDK (keeps PCI DSS scope minimal).
- [ ] Reconcile settlements and refunds; handle refund webhooks (currently a mock refund completes instantly; real refunds stay `PENDING` until confirmed).
- [ ] Define COD cash-handling, rider cash deposit and reconciliation processes.
- [ ] Business credit: credit agreements, collections and dunning, and any lending/NBFC regulatory implications if credit is extended by the platform.

## 6. Communications
- [ ] SMS: register entity, headers and templates on a DLT platform (TRAI). Configure MSG91 or another provider and test.
- [ ] Marketing consent is stored and respected for promotional notifications. Honour DND/NCPR preferences for SMS marketing.
- [ ] Push notifications: FCM/APNs credentials and Expo push setup.

## 7. Delivery partners
- [ ] Verify identity, driving licence and vehicle documents (upload flows exist for sellers and businesses; rider document upload is still to be built). Consider background checks.
- [ ] Engagement contracts. Check obligations under the Code on Social Security, 2020 for gig and platform workers, and any state platform-worker laws.
- [ ] Insurance for riders and goods in transit.

## 8. Engineering & operations
- [ ] Secrets in a secrets manager. Rotate `RAZORPAY_*`, `MSG91_*` and database credentials.
- [ ] HTTPS everywhere; `COOKIE_SECURE=true` (enforced at startup); HSTS at the edge.
- [ ] Managed PostgreSQL with automated backups and point-in-time recovery; test restores.
- [ ] Redis-backed rate limiting and job queue before running more than one API instance (the limiter and unpaid-order sweeper are in-process today).
- [ ] Object storage (S3/GCS) with encryption and private access for prescriptions and documents. Replace `LocalDiskStorage`.
- [ ] Monitoring and alerting: uptime, error tracking (e.g. Sentry), slow queries, order funnel.
- [ ] Load-test checkout and order placement. Revisit `listProducts` (in-memory filtering, capped at 500 products) as catalogues grow; move search to Postgres full-text or a search service.
- [ ] Upgrade Next.js 15 → 16 and Prisma 6 → 7 to clear the remaining dev-tooling advisories (`npm audit`).
- [ ] Add ESLint, CI (typecheck, tests, build) and a Playwright end-to-end suite.
- [ ] Remove demo data and demo accounts. Keep `ENABLE_DEMO_LOGIN=false` (enforced in production).
- [ ] Accessibility audit (WCAG 2.1 AA) with screen readers on Android and iOS. Add a Hindi and regional-language UI.
- [ ] Replace the placeholder brand name, logo, bundle identifiers (`com.example.padosi.*`) and support contacts.
