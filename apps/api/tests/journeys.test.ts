import { afterAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { PHONES, addAddress, anon, app, as, key, locality, prisma, stockOf, store, variant } from './helpers';

afterAll(async () => {
  await prisma.$disconnect();
});

describe('1. registration and sign-in', () => {
  it('registers with a password, signs out and signs back in', async () => {
    const agent = request.agent(app);
    const reg = await agent.post('/api/auth/register').send({ name: 'New Customer', phone: '+91 98111 22334', password: 'secret123' });
    expect(reg.status).toBe(201);
    expect(reg.body.user.roles).toEqual(['CUSTOMER']);
    expect(reg.headers['set-cookie']?.[0]).toMatch(/HttpOnly/);
    expect((await agent.get('/api/auth/me')).status).toBe(200);
    await agent.post('/api/auth/logout').send({});
    expect((await agent.get('/api/auth/me')).status).toBe(401);
    const bad = await agent.post('/api/auth/login').send({ identifier: '9811122334', password: 'wrongpass1' });
    expect(bad.status).toBe(401);
    const ok = await agent.post('/api/auth/login').send({ identifier: '9811122334', password: 'secret123' });
    expect(ok.status).toBe(200);
  });

  it('rejects a duplicate phone and weak passwords', async () => {
    const dup = await anon().post('/api/auth/register').send({ name: 'X', phone: '9811122334', password: 'secret123' });
    expect(dup.status).toBe(409);
    const weak = await anon().post('/api/auth/register').send({ name: 'X', phone: '9811122335', password: 'short' });
    expect(weak.status).toBe(400);
    expect(weak.body.error.details.fields.password).toBeTruthy();
  });

  it('signs up with a mobile OTP and locks out wrong codes', async () => {
    const agent = request.agent(app);
    const sent = await agent.post('/api/auth/otp/request').send({ phone: '9822233445' });
    expect(sent.status).toBe(200);
    expect(sent.body.devCode).toMatch(/^\d{6}$/);
    const wrong = await agent.post('/api/auth/otp/verify').send({ phone: '9822233445', code: sent.body.devCode === '000000' ? '111111' : '000000', name: 'Otp User' });
    expect(wrong.body.error.code).toBe('OTP_INVALID');
    const ok = await agent.post('/api/auth/otp/verify').send({ phone: '9822233445', code: sent.body.devCode, name: 'Otp User' });
    expect(ok.status).toBe(200);
    expect(ok.body.user.phoneVerified).toBe(true);
    const reuse = await agent.post('/api/auth/otp/verify').send({ phone: '9822233445', code: sent.body.devCode });
    expect(reuse.status).toBe(400);
  });

  it('returns a bearer token only to mobile clients', async () => {
    const web = await anon().post('/api/auth/login').send({ identifier: '9811122334', password: 'secret123' });
    expect(web.body.token).toBeUndefined();
    const mobile = await anon().post('/api/auth/login').send({ identifier: '9811122334', password: 'secret123', client: 'mobile' });
    expect(mobile.body.token).toBeTruthy();
    const me = await anon().get('/api/auth/me').set('Authorization', `Bearer ${mobile.body.token}`);
    expect(me.status).toBe(200);
  });
});

describe('2–10. retail order from address to delivery', () => {
  it('runs the full journey with consistent stock, totals and records', async () => {
    const customer = request.agent(app);
    await customer.post('/api/auth/register').send({ name: 'Journey Buyer', email: 'journey@test.example', password: 'journey123' });

    // 2. serviceable address
    const address = await addAddress(customer, 'Prem Nagar');
    const prem = await locality('Prem Nagar');
    const svc = await anon().get(`/api/locations/serviceability?localityId=${prem.id}`);
    expect(svc.body.serviceable).toBe(true);

    // 3. nearby store and search by local term
    expect(svc.body.stores.map((s: { slug: string }) => s.slug)).toContain('sharma-kirana');
    const search = await anon().get(`/api/catalog/products?localityId=${prem.id}&q=atta&storeId=${(await store('sharma-kirana')).id}`);
    const atta = search.body.items.find((p: { slug: string }) => p.slug === 'atta');
    expect(atta).toBeTruthy();
    const attaVariant = atta.variants.find((v: { sku: string }) => v.sku === 'ATTA-5KG');
    const sharma = await store('sharma-kirana');

    // 4. add to cart, change quantity
    let cart = await customer.post('/api/cart/items').send({ storeId: sharma.id, variantId: attaVariant.id, quantity: 1 });
    expect(cart.status).toBe(200);
    cart = await customer.post('/api/cart/items').send({ storeId: sharma.id, variantId: attaVariant.id, quantity: 2 });
    expect(cart.body.cart.items[0].quantity).toBe(2);

    // Cart is single-store: a different store needs explicit replacement.
    const fresh = await store('bundelkhand-fresh-mart');
    const milk = await variant('MILK-1L');
    const conflict = await customer.post('/api/cart/items').send({ storeId: fresh.id, variantId: milk.id, quantity: 1 });
    expect(conflict.status).toBe(409);
    expect(conflict.body.error.code).toBe('CART_STORE_CONFLICT');

    // 5. stock validation and totals
    const stockBefore = await stockOf('sharma-kirana', 'ATTA-5KG');
    const tooMany = await customer.post('/api/cart/items').send({ storeId: sharma.id, variantId: attaVariant.id, quantity: stockBefore + 1 });
    expect(tooMany.body.error.code).toBe('INSUFFICIENT_STOCK');
    const quote = await customer.post('/api/checkout/quote').send({ addressId: address.id, paymentMethod: 'COD' });
    expect(quote.body.canPlaceOrder).toBe(true);
    const unit = attaVariant.bestOffer.price;
    expect(quote.body.totals.itemsSubtotal).toBe(unit * 2);
    const expectedFee = unit * 2 >= sharma.freeDeliveryAbove ? 0 : quote.body.totals.deliveryFee;
    expect(quote.body.totals.deliveryFee).toBe(expectedFee);
    expect(quote.body.totals.grandTotal).toBe(unit * 2 + quote.body.totals.deliveryFee);

    // 6. place order idempotently
    const idem = key();
    const placed = await customer.post('/api/orders').send({ addressId: address.id, paymentMethod: 'COD', idempotencyKey: idem });
    expect(placed.status).toBe(201);
    expect(placed.body.order.status).toBe('PLACED');
    expect(placed.body.order.paymentStatus).toBe('COD_PENDING');
    expect(placed.body.order.deliveryOtp).toMatch(/^\d{4}$/);
    const replay = await customer.post('/api/orders').send({ addressId: address.id, paymentMethod: 'COD', idempotencyKey: idem });
    expect(replay.status).toBe(200);
    expect(replay.body.replayed).toBe(true);
    expect(replay.body.order.id).toBe(placed.body.order.id);
    expect(await stockOf('sharma-kirana', 'ATTA-5KG')).toBe(stockBefore - 2);
    const orderId = placed.body.order.id;

    // Customers cannot drive fulfilment.
    expect((await customer.post(`/api/seller/orders/${orderId}/transition`).send({ to: 'ACCEPTED' })).status).toBe(403);

    // 7. seller accepts and prepares; seller view hides the customer's phone and delivery code
    const seller = await as(PHONES.ramesh);
    const sellerView = await seller.get(`/api/seller/orders/${orderId}`);
    expect(sellerView.body.order.deliveryOtp).toBeUndefined();
    expect(sellerView.body.order.deliveryAddress.contactPhone).toBeUndefined();
    const skip = await seller.post(`/api/seller/orders/${orderId}/transition`).send({ to: 'READY_FOR_PICKUP' });
    expect(skip.status).toBe(409);
    for (const to of ['ACCEPTED', 'PREPARING', 'READY_FOR_PICKUP']) {
      const r = await seller.post(`/api/seller/orders/${orderId}/transition`).send({ to });
      expect(r.status, JSON.stringify(r.body)).toBe(200);
    }

    // 8. delivery assignment and proof of delivery
    const sonu = await prisma.deliveryPartner.findFirstOrThrow({ where: { user: { phone: PHONES.sonu } } });
    const assign = await seller.post(`/api/seller/orders/${orderId}/assign`).send({ deliveryPartnerId: sonu.id });
    expect(assign.status).toBe(200);
    const rider = await as(PHONES.sonu);
    const list = await rider.get('/api/delivery/assignments');
    const job = list.body.assignments.find((a: { order: { id: string } }) => a.order.id === orderId);
    expect(job.customer.phone).toMatch(/•/); // masked before pickup
    expect(job.order.collectCash).toBe(placed.body.order.totals.grandTotal);
    expect((await rider.post(`/api/delivery/assignments/${job.id}/status`).send({ status: 'PICKED_UP' })).status).toBe(200);
    const carrying = (await rider.get('/api/delivery/assignments')).body.assignments.find((a: { id: string }) => a.id === job.id);
    expect(carrying.customer.phone).toBe('9876543210');
    const wrongOtp = placed.body.order.deliveryOtp === '0000' ? '1111' : '0000';
    expect((await rider.post(`/api/delivery/assignments/${job.id}/status`).send({ status: 'DELIVERED', otp: wrongOtp })).body.error.code).toBe('OTP_INVALID');
    const done = await rider.post(`/api/delivery/assignments/${job.id}/status`).send({ status: 'DELIVERED', otp: placed.body.order.deliveryOtp });
    expect(done.status).toBe(200);

    // 9. customer sees the result
    const track = await customer.get(`/api/orders/${orderId}`);
    expect(track.body.order.status).toBe('DELIVERED');
    expect(track.body.order.paymentStatus).toBe('COD_COLLECTED');
    expect(track.body.order.deliveryOtp).toBeUndefined();
    expect(track.body.order.events.map((e: { toStatus: string }) => e.toStatus)).toEqual(['PLACED', 'ACCEPTED', 'PREPARING', 'READY_FOR_PICKUP', 'OUT_FOR_DELIVERY', 'DELIVERED']);
    expect(track.body.order.actions.canReview).toBe(true);
    const invoice = await customer.get(`/api/orders/${orderId}/invoice`);
    expect(invoice.body.invoice.documentType).toBe('TAX_INVOICE');
    expect(invoice.body.invoice.totals.cgst + invoice.body.invoice.totals.sgst).toBe(track.body.order.totals.taxTotal);

    // 10. records stay consistent
    expect(await stockOf('sharma-kirana', 'ATTA-5KG')).toBe(stockBefore - 2);
    const commission = await prisma.commissionEntry.findUniqueOrThrow({ where: { orderId } });
    expect(commission.saleAmount).toBe(unit * 2);
    expect(commission.sellerEarning + commission.commissionAmount).toBe(commission.saleAmount);
    const audits = await prisma.inventoryAuditLog.findMany({ where: { orderId } });
    expect(audits).toHaveLength(1);
    expect(audits[0].delta).toBe(-2);
    const item = await prisma.orderItem.findFirstOrThrow({ where: { orderId } });
    expect(item.productName).toBe('Whole Wheat Atta');
    expect(item.sku).toBe('ATTA-5KG');

    // Rating updates the store aggregate.
    expect((await customer.post(`/api/orders/${orderId}/review`).send({ rating: 5, comment: 'Great' })).status).toBe(201);
  });

  it('never oversells the last unit under concurrent checkouts', async () => {
    const sharma = await store('sharma-kirana');
    const v = await variant('GARAM-100G');
    await prisma.storeInventory.update({ where: { storeId_variantId: { storeId: sharma.id, variantId: v.id } }, data: { stockQty: 1 } });
    const buyers = await Promise.all(
      [1, 2].map(async (i) => {
        const a = request.agent(app);
        await a.post('/api/auth/register').send({ name: `Racer ${i}`, email: `racer${i}@test.example`, password: 'racer1234' });
        const addr = await addAddress(a, 'Sipri Bazar');
        await a.post('/api/cart/items').send({ storeId: sharma.id, variantId: v.id, quantity: 1 });
        // Add enough value to clear the minimum order.
        await a.post('/api/cart/items').send({ storeId: sharma.id, variantId: (await variant('ATTA-5KG')).id, quantity: 1 });
        return { a, addr };
      }),
    );
    const results = await Promise.all(buyers.map(({ a, addr }) => a.post('/api/orders').send({ addressId: addr.id, paymentMethod: 'COD', idempotencyKey: key() })));
    const statuses = results.map((r) => r.status).sort();
    expect(statuses[0]).toBe(201);
    expect([409, 422]).toContain(statuses[1]);
    expect(await stockOf('sharma-kirana', 'GARAM-100G')).toBe(0);
  });
});

describe('11. HoReCa RFQ and quotation', () => {
  it('submits an RFQ, receives and accepts a quotation, then orders at the negotiated price', async () => {
    const buyer = await as(PHONES.vikram);
    const civil = await locality('Civil Lines');
    const salt = await variant('B-SALT-CASE25');
    const rfq = await buyer.post('/api/business/rfqs').send({
      title: 'Test RFQ – salt',
      deliveryLocalityId: civil.id,
      items: [{ variantId: salt.id, description: 'Salt case', quantity: 10, unit: 'CASE' }],
    });
    expect(rfq.status).toBe(201);
    expect(rfq.body.suppliersNotified).toBeGreaterThan(0);

    const wholesale = await store('jhansi-wholesale-traders');
    const supplier = await as(PHONES.imran);
    const open = await supplier.get(`/api/seller/stores/${wholesale.id}/rfqs`);
    const found = open.body.rfqs.find((r: { id: string }) => r.id === rfq.body.rfq.id);
    expect(found).toBeTruthy();
    const quoted = await supplier.post(`/api/seller/rfqs/${rfq.body.rfq.id}/quotations`).send({
      storeId: wholesale.id,
      validUntil: new Date(Date.now() + 2 * 86400_000).toISOString(),
      deliveryFee: 0,
      items: [{ rfqItemId: found.items[0].id, unitPrice: 41000, taxRateBps: 0, available: true }],
    });
    expect(quoted.status).toBe(201);
    expect(quoted.body.quotation.grandTotal).toBe(410000);

    // A grocery-only seller cannot quote.
    const retailer = await as(PHONES.ramesh);
    const sharma = await store('sharma-kirana');
    const denied = await retailer.post(`/api/seller/rfqs/${rfq.body.rfq.id}/quotations`).send({ storeId: sharma.id, validUntil: new Date(Date.now() + 86400_000).toISOString(), items: [{ rfqItemId: found.items[0].id, unitPrice: 1, taxRateBps: 0 }] });
    expect(denied.status).toBe(403);

    const detail = await buyer.get(`/api/business/rfqs/${rfq.body.rfq.id}`);
    expect(detail.body.rfq.quotations).toHaveLength(1);
    const accept = await buyer.post(`/api/business/quotations/${quoted.body.quotation.id}/accept`).send({});
    expect(accept.status).toBe(200);
    expect(accept.body.negotiatedItems).toBe(1);

    const cart = await buyer.post('/api/cart/bulk').send({ storeId: wholesale.id, mode: 'BUSINESS', replaceCart: true, items: [{ sku: 'B-SALT-CASE25', quantity: 4 }] });
    expect(cart.body.results[0].ok).toBe(true);
    expect(cart.body.cart.items[0].unitPrice).toBe(41000);
    const addr = await prisma.address.findFirstOrThrow({ where: { user: { phone: PHONES.vikram } } });
    const quote = await buyer.post('/api/checkout/quote').send({ mode: 'BUSINESS', addressId: addr.id, paymentMethod: 'BUSINESS_CREDIT' });
    expect(quote.body.vertical).toBe('HORECA');
    expect(quote.body.paymentMethods.find((p: { method: string }) => p.method === 'BUSINESS_CREDIT').available).toBe(true);
    const order = await buyer.post('/api/orders').send({ mode: 'BUSINESS', addressId: addr.id, paymentMethod: 'BUSINESS_CREDIT', idempotencyKey: key() });
    expect(order.status).toBe(201);
    expect(order.body.order.paymentStatus).toBe('CREDIT_DUE');
    expect(order.body.order.buyerGstin).toBe('09EEEEE0000E1Z5');
  });

  it('keeps wholesale prices and business ordering away from unverified buyers', async () => {
    const shopper = await as(PHONES.rohit);
    const wholesale = await store('jhansi-wholesale-traders');
    const r = await shopper.post('/api/cart/bulk').send({ storeId: wholesale.id, mode: 'BUSINESS', items: [{ sku: 'B-SALT-CASE25', quantity: 1 }] });
    expect(r.status).toBe(403);
    expect((await shopper.post('/api/business/rfqs').send({ title: 'x', deliveryLocalityId: 'x', items: [{ description: 'x', quantity: 1, unit: 'KG' }] })).status).toBe(404);
  });
});

describe('12. pharmacy prescription safeguards', () => {
  it('requires a prescription and a pharmacist review before the order can proceed', async () => {
    const customer = await as(PHONES.rohit);
    const pharmacy = await store('arogya-medicals-demo');
    const amox = await variant('AMOX-STRIP10');
    await customer.delete('/api/cart');
    await customer.post('/api/cart/items').send({ storeId: pharmacy.id, variantId: amox.id, quantity: 1, replaceCart: true });
    const addr = await addAddress(customer, 'Civil Lines', 'Rx');

    const noRx = await customer.post('/api/checkout/quote').send({ addressId: addr.id, paymentMethod: 'COD' });
    expect(noRx.body.issues.map((i: { code: string }) => i.code)).toContain('PRESCRIPTION_REQUIRED');
    const blocked = await customer.post('/api/orders').send({ addressId: addr.id, paymentMethod: 'COD', idempotencyKey: key() });
    expect(blocked.status).toBe(422);

    const fakeExe = await customer.post('/api/me/prescriptions').field('patientName', 'Rohit Yadav').attach('file', Buffer.from('MZ not a pdf'), 'rx.pdf');
    expect(fakeExe.body.error.code).toBe('UNSUPPORTED_FILE');
    const upload = await customer.post('/api/me/prescriptions').field('patientName', 'Rohit Yadav').attach('file', Buffer.from('%PDF-1.4\n% test prescription\n'), 'rx.pdf');
    expect(upload.status).toBe(201);
    const rxId = upload.body.prescription.id;

    const placed = await customer.post('/api/orders').send({ addressId: addr.id, paymentMethod: 'COD', prescriptionId: rxId, idempotencyKey: key() });
    expect(placed.status).toBe(201);
    expect(placed.body.order.status).toBe('AWAITING_RX_REVIEW');
    const orderId = placed.body.order.id;

    // Store owner is not a pharmacist: cannot accept or approve.
    const owner = await as(PHONES.sunil);
    expect((await owner.post(`/api/seller/orders/${orderId}/transition`).send({ to: 'ACCEPTED' })).status).toBe(409);
    const ownerReview = await owner.post(`/api/seller/orders/${orderId}/prescription-review`).send({ decision: 'APPROVED', notes: 'Looks fine', approvedProductIds: [amox.productId] });
    expect(ownerReview.status).toBe(403);
    // Prescription file is restricted.
    expect((await owner.get(`/api/me/files/${upload.body.prescription.fileId}`)).status).toBe(403);
    const otherCustomer = await as(PHONES.aarti);
    expect((await otherCustomer.get(`/api/me/files/${upload.body.prescription.fileId}`)).status).toBe(403);

    const pharmacist = await as(PHONES.pooja);
    expect((await pharmacist.get(`/api/me/files/${upload.body.prescription.fileId}`)).status).toBe(200);
    const incomplete = await pharmacist.post(`/api/seller/orders/${orderId}/prescription-review`).send({ decision: 'APPROVED', notes: 'Checked', approvedProductIds: [] });
    expect(incomplete.body.error.code).toBe('INCOMPLETE_APPROVAL');
    const approve = await pharmacist.post(`/api/seller/orders/${orderId}/prescription-review`).send({ decision: 'APPROVED', notes: 'Valid prescription, dosage checked', approvedProductIds: [amox.productId] });
    expect(approve.status).toBe(200);
    expect(approve.body.order.status).toBe('PLACED');
    const review = await prisma.prescriptionReview.findFirstOrThrow({ where: { prescriptionId: rxId } });
    expect(review.isSimulated).toBe(true);
    expect(await prisma.auditLog.count({ where: { action: 'PRESCRIPTION_APPROVED', entityId: rxId } })).toBe(1);
    expect(await prisma.auditLog.count({ where: { action: 'FILE_ACCESSED', entityId: upload.body.prescription.fileId } })).toBe(1);
  });

  it('rejects a prescription and releases the held stock', async () => {
    const customer = await as(PHONES.aarti);
    const pharmacy = await store('arogya-medicals-demo');
    const met = await variant('METFORMIN-STRIP15');
    const before = await stockOf('arogya-medicals-demo', 'METFORMIN-STRIP15');
    await customer.post('/api/cart/items').send({ storeId: pharmacy.id, variantId: met.id, quantity: 2, replaceCart: true });
    const rx = await customer.post('/api/me/prescriptions').field('patientName', 'Aarti').attach('file', Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0]), 'rx.png');
    const addr = await prisma.address.findFirstOrThrow({ where: { user: { phone: PHONES.aarti }, isDefault: true } });
    const placed = await customer.post('/api/orders').send({ addressId: addr.id, paymentMethod: 'UPI', prescriptionId: rx.body.prescription.id, idempotencyKey: key() });
    expect(placed.body.order.status).toBe('AWAITING_RX_REVIEW');
    // Cannot pay before review.
    expect((await customer.post(`/api/orders/${placed.body.order.id}/pay`).set('Idempotency-Key', key()).send({ method: 'UPI' })).status).toBe(409);
    expect(await stockOf('arogya-medicals-demo', 'METFORMIN-STRIP15')).toBe(before - 2);
    const pharmacist = await as(PHONES.pooja);
    const rej = await pharmacist.post(`/api/seller/orders/${placed.body.order.id}/prescription-review`).send({ decision: 'REJECTED', notes: 'Prescription is illegible' });
    expect(rej.body.order.status).toBe('REJECTED');
    expect(await stockOf('arogya-medicals-demo', 'METFORMIN-STRIP15')).toBe(before);
  });

  it('never sells restricted products', async () => {
    const pharmacy = await store('arogya-medicals-demo');
    const cat = await prisma.category.findFirstOrThrow({ where: { slug: 'chemist-c-rx' } });
    const p = await prisma.product.create({
      data: { name: 'Restricted Test Drug', slug: 'restricted-test', categoryId: cat.id, vertical: 'CHEMIST', isRestricted: true, schedule: 'SCHEDULE_X', variants: { create: { sku: 'RESTRICTED-1', name: '1 strip', unitType: 'STRIP', unitQuantity: 1, mrp: 1000 } } },
      include: { variants: true },
    });
    await prisma.storeInventory.create({ data: { storeId: pharmacy.id, variantId: p.variants[0].id, stockQty: 10 } });
    const list = await prisma.priceList.findFirstOrThrow({ where: { storeId: pharmacy.id, type: 'RETAIL' } });
    await prisma.priceListItem.create({ data: { priceListId: list.id, variantId: p.variants[0].id, unitPrice: 900 } });
    const customer = await as(PHONES.rohit);
    const r = await customer.post('/api/cart/items').send({ storeId: pharmacy.id, variantId: p.variants[0].id, quantity: 1, replaceCart: true });
    expect(r.body.error.code).toBe('RESTRICTED_PRODUCT');
    const civil = await locality('Civil Lines');
    const search = await anon().get(`/api/catalog/products?localityId=${civil.id}&q=restricted`);
    expect(search.body.total).toBe(0);
    // Sellers cannot list Schedule X products either.
    const pharmacist = await as(PHONES.pooja);
    const created = await pharmacist.post(`/api/seller/stores/${pharmacy.id}/products`).send({
      name: 'X drug', categoryId: cat.id, vertical: 'CHEMIST', taxRateBps: 1200,
      pharmacy: { schedule: 'SCHEDULE_X' },
      variant: { sku: 'XDRUG-1', name: '1 strip', unitType: 'STRIP', unitQuantity: 1, mrp: 1000 },
      inventory: { price: 900, stockQty: 1 },
    });
    expect(created.status).toBe(403);
  });
});

describe('13. access control', () => {
  it('blocks anonymous and unauthorised access to protected data', async () => {
    expect((await anon().get('/api/orders')).status).toBe(401);
    expect((await anon().get('/api/admin/metrics')).status).toBe(401);
    const customer = await as(PHONES.rohit);
    expect((await customer.get('/api/admin/metrics')).status).toBe(403);
    expect((await customer.get('/api/admin/sellers')).status).toBe(403);
    const sharma = await store('sharma-kirana');
    expect((await customer.get(`/api/seller/stores/${sharma.id}/orders`)).status).toBe(403);
    expect((await customer.get(`/api/seller/stores/${sharma.id}/inventory`)).status).toBe(403);
    // One seller cannot read another seller's store.
    const otherSeller = await as(PHONES.neha);
    expect((await otherSeller.get(`/api/seller/stores/${sharma.id}/orders`)).status).toBe(403);
    // Another customer's order is invisible.
    const aartiOrder = await prisma.order.findFirstOrThrow({ where: { user: { phone: PHONES.aarti } } });
    expect((await customer.get(`/api/orders/${aartiOrder.id}`)).status).toBe(404);
    // Customers cannot complete simulated payments for someone else.
    expect((await customer.post('/api/payments/nope/mock-complete').send({ outcome: 'success' })).status).toBe(404);
  });

  it('separates ops admin from super admin permissions', async () => {
    const ops = await as(PHONES.opsAdmin);
    expect((await ops.get('/api/admin/metrics')).status).toBe(200);
    expect((await ops.get('/api/admin/settings')).status).toBe(403);
    expect((await ops.get('/api/admin/audit-logs')).status).toBe(403);
    const sup = await as(PHONES.superAdmin);
    const s = await sup.put('/api/admin/settings').send({ codMaxOrderValue: 600000 });
    expect(s.status).toBe(200);
    expect(s.body.settings.codMaxOrderValue).toBe(600000);
    expect((await sup.get('/api/admin/audit-logs')).body.logs.some((l: { action: string }) => l.action === 'SETTINGS_UPDATED')).toBe(true);
  });

  it('reports GMV separately from platform revenue', async () => {
    const ops = await as(PHONES.opsAdmin);
    const m = await ops.get('/api/admin/metrics');
    expect(m.body.gmv).toBeGreaterThan(0);
    expect(m.body.revenue.platformRevenue).toBeLessThan(m.body.gmv);
    expect(m.body.revenue.netProfit).toBeNull();
    expect(m.body.byVertical.map((v: { vertical: string }) => v.vertical)).toEqual(['GROCERY', 'HORECA', 'CHEMIST']);
  });

  it('refuses demo sign-in for real (non-demo) accounts', async () => {
    const real = await prisma.user.findFirstOrThrow({ where: { isDemo: false } });
    expect((await anon().post('/api/dev/demo-login').send({ userId: real.id })).status).toBe(404);
  });
});

describe('14. unserviceable addresses', () => {
  it('cannot place an order to an area outside every service zone', async () => {
    const customer = await as(PHONES.rohit);
    const sharma = await store('sharma-kirana');
    await customer.post('/api/cart/items').send({ storeId: sharma.id, variantId: (await variant('ATTA-10KG')).id, quantity: 1, replaceCart: true });
    const babina = await addAddress(customer, 'Babina', 'Far');
    const svc = await anon().get(`/api/locations/serviceability?localityId=${(await locality('Babina')).id}`);
    expect(svc.body.serviceable).toBe(false);
    const quote = await customer.post('/api/checkout/quote').send({ addressId: babina.id, paymentMethod: 'COD' });
    expect(quote.body.issues.map((i: { code: string }) => i.code)).toContain('UNSERVICEABLE');
    const order = await customer.post('/api/orders').send({ addressId: babina.id, paymentMethod: 'COD', idempotencyKey: key() });
    expect(order.status).toBe(422);
    // Same store, address inside its zone but outside its own service list (Gwalior Road) is also refused.
    const gw = await addAddress(customer, 'Gwalior Road', 'North');
    const q2 = await customer.post('/api/checkout/quote').send({ addressId: gw.id, paymentMethod: 'COD' });
    expect(q2.body.issues.map((i: { code: string }) => i.code)).toContain('UNSERVICEABLE');
  });

  it('refuses orders when the store is closed', async () => {
    const customer = await as(PHONES.rohit);
    const sharma = await store('sharma-kirana');
    await prisma.store.update({ where: { id: sharma.id }, data: { isTemporarilyClosed: true } });
    try {
      await customer.post('/api/cart/items').send({ storeId: sharma.id, variantId: (await variant('ATTA-10KG')).id, quantity: 1, replaceCart: true });
      const addr = await addAddress(customer, 'Sipri Bazar', 'Closed test');
      const q = await customer.post('/api/checkout/quote').send({ addressId: addr.id, paymentMethod: 'COD' });
      expect(q.body.issues.map((i: { code: string }) => i.code)).toContain('STORE_CLOSED');
    } finally {
      await prisma.store.update({ where: { id: sharma.id }, data: { isTemporarilyClosed: false } });
    }
  });
});

describe('15. payment failure and cancellation', () => {
  it('handles failed then successful online payment', async () => {
    const customer = await as(PHONES.rohit);
    const sharma = await store('sharma-kirana');
    const v = await variant('TEA-250G');
    const before = await stockOf('sharma-kirana', 'TEA-250G');
    await customer.post('/api/cart/items').send({ storeId: sharma.id, variantId: v.id, quantity: 2, replaceCart: true });
    const addr = await addAddress(customer, 'Sipri Bazar', 'Pay');
    const placed = await customer.post('/api/orders').send({ addressId: addr.id, paymentMethod: 'UPI', idempotencyKey: key() });
    expect(placed.body.order.status).toBe('PENDING_PAYMENT');
    expect(await stockOf('sharma-kirana', 'TEA-250G')).toBe(before - 2);
    const id = placed.body.order.id;

    const pay1 = await customer.post(`/api/orders/${id}/pay`).set('Idempotency-Key', key()).send({ method: 'UPI' });
    expect(pay1.status).toBe(201);
    expect(pay1.body.simulated).toBe(true);
    const fail = await customer.post(`/api/payments/${pay1.body.paymentId}/mock-complete`).send({ outcome: 'failure' });
    expect(fail.body.paymentStatus).toBe('FAILED');
    expect(fail.body.orderStatus).toBe('PENDING_PAYMENT');
    // Replaying the result is a no-op.
    const again = await customer.post(`/api/payments/${pay1.body.paymentId}/mock-complete`).send({ outcome: 'success' });
    expect(again.body.paymentStatus).toBe('FAILED');

    const pay2 = await customer.post(`/api/orders/${id}/pay`).set('Idempotency-Key', key()).send({ method: 'CARD' });
    const ok = await customer.post(`/api/payments/${pay2.body.paymentId}/mock-complete`).send({ outcome: 'success' });
    expect(ok.body.orderStatus).toBe('PLACED');
    expect(ok.body.paymentStatus).toBe('PAID');

    // Cancelling a paid order refunds it and restores stock.
    const cancel = await customer.post(`/api/orders/${id}/cancel`).send({ reason: 'Changed my mind' });
    expect(cancel.status).toBe(200);
    expect(cancel.body.order.status).toBe('CANCELLED');
    expect(cancel.body.order.paymentStatus).toBe('REFUNDED');
    expect(cancel.body.order.refunds[0].status).toBe('PROCESSED');
    expect(await stockOf('sharma-kirana', 'TEA-250G')).toBe(before);
  });

  it('does not let customers cancel once the store has accepted', async () => {
    const customer = await as(PHONES.rohit);
    const sharma = await store('sharma-kirana');
    await customer.post('/api/cart/items').send({ storeId: sharma.id, variantId: (await variant('RICE-5KG')).id, quantity: 1, replaceCart: true });
    const addr = await addAddress(customer, 'Sipri Bazar', 'Cancel');
    const placed = await customer.post('/api/orders').send({ addressId: addr.id, paymentMethod: 'COD', idempotencyKey: key() });
    const seller = await as(PHONES.ramesh);
    await seller.post(`/api/seller/orders/${placed.body.order.id}/transition`).send({ to: 'ACCEPTED' });
    const r = await customer.post(`/api/orders/${placed.body.order.id}/cancel`).send({ reason: 'Too late' });
    expect(r.status).toBe(409);
    expect(r.body.error.code).toBe('NOT_CANCELLABLE');
    // Seller rejection requires a reason.
    const noReason = await seller.post(`/api/seller/orders/${placed.body.order.id}/transition`).send({ to: 'CANCELLED' });
    expect(noReason.status).toBe(400);
  });

  it('applies and validates coupons on the server', async () => {
    const customer = await as(PHONES.rohit);
    const sharma = await store('sharma-kirana');
    await customer.post('/api/cart/items').send({ storeId: sharma.id, variantId: (await variant('ATTA-10KG')).id, quantity: 1, replaceCart: true });
    const addr = await addAddress(customer, 'Sipri Bazar', 'Coupon');
    const first = await customer.post('/api/checkout/quote').send({ addressId: addr.id, paymentMethod: 'COD', couponCode: 'WELCOME50' });
    expect(first.body.issues[0].code).toBe('COUPON_INVALID'); // Rohit already has orders
    const fresh = await customer.post('/api/checkout/quote').send({ addressId: addr.id, paymentMethod: 'COD', couponCode: 'FRESH10' });
    expect(fresh.body.canPlaceOrder).toBe(true);
    expect(fresh.body.totals.discount).toBe(Math.min(Math.round(fresh.body.totals.itemsSubtotal * 0.1), 7500));
    expect(fresh.body.totals.grandTotal).toBe(fresh.body.totals.itemsSubtotal - fresh.body.totals.discount + fresh.body.totals.deliveryFee);
  });
});

describe('seller tools', () => {
  it('imports inventory by CSV and keeps an audit trail', async () => {
    const seller = await as(PHONES.ramesh);
    const sharma = await store('sharma-kirana');
    const csv = 'sku,price_rupees,stock_qty\nSALT-1KG,25,40\nNOPE-1,10,1\nSUGAR-1KG,999,5\n';
    const r = await seller.post(`/api/seller/stores/${sharma.id}/inventory/import`).send({ csv });
    expect(r.body.imported).toBe(1);
    expect(r.body.results[1].message).toMatch(/not found/);
    expect(r.body.results[2].message).toMatch(/exceeds MRP/);
    expect(await stockOf('sharma-kirana', 'SALT-1KG')).toBe(40);
    const analytics = await seller.get(`/api/seller/stores/${sharma.id}/analytics`);
    expect(analytics.body.totalOrders).toBeGreaterThan(0);
    expect(analytics.body.bestSellers.length).toBeGreaterThan(0);
  });

  it('runs seller onboarding through admin approval', async () => {
    const applicant = request.agent(app);
    await applicant.post('/api/auth/register').send({ name: 'New Seller', email: 'newseller@test.example', password: 'seller123' });
    const nandan = await locality('Nandanpura');
    const apply = await applicant.post('/api/seller/onboarding').send({
      orgName: 'Test Kirana', legalName: 'Test Kirana', sellerType: 'GROCERY_RETAILER', contactPhone: '9876500000', contactEmail: 'k@test.example',
      store: { name: 'Test Kirana', verticals: ['GROCERY'], addressLine: 'Main road', localityId: nandan.id, postalCode: nandan.postalCode, lat: nandan.lat, lng: nandan.lng, phone: '9876500000', openMinute: 0, closeMinute: 0, deliveryRadiusKm: 3, serviceLocalityIds: [nandan.id] },
    });
    expect(apply.status).toBe(201);
    // Pending stores are invisible to customers.
    let svc = await anon().get(`/api/locations/serviceability?localityId=${nandan.id}`);
    expect(svc.body.stores.some((s: { name: string }) => s.name === 'Test Kirana')).toBe(false);
    const ops = await as(PHONES.opsAdmin);
    expect((await ops.post(`/api/admin/sellers/${apply.body.sellerOrg.id}/verification`).send({ status: 'APPROVED', notes: 'ok' })).status).toBe(200);
    svc = await anon().get(`/api/locations/serviceability?localityId=${nandan.id}`);
    expect(svc.body.stores.some((s: { name: string }) => s.name === 'Test Kirana')).toBe(true);
    // A non-pharmacy cannot be set up to sell medicines.
    const bad = await applicant.post('/api/seller/onboarding').send({
      orgName: 'X', legalName: 'X', sellerType: 'GROCERY_RETAILER', contactPhone: '9876500000', contactEmail: 'k@test.example',
      store: { name: 'X', verticals: ['CHEMIST'], addressLine: 'x', localityId: nandan.id, postalCode: nandan.postalCode, lat: 0, lng: 0, phone: '9876500000', openMinute: 0, closeMinute: 0, deliveryRadiusKm: 3, serviceLocalityIds: [nandan.id] },
    });
    expect(bad.status).toBe(400);
  });
});
