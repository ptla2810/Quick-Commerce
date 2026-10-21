import request from 'supertest';
import { PrismaClient } from '@prisma/client';
import { createApp } from '../src/app';

export const app = createApp();
export const prisma = new PrismaClient();

export type Agent = ReturnType<typeof request.agent>;

/** A cookie-carrying client signed in as a seeded demo user (looked up by phone). */
export async function as(phone: string): Promise<Agent> {
  const user = await prisma.user.findUniqueOrThrow({ where: { phone } });
  const agent = request.agent(app);
  const res = await agent.post('/api/dev/demo-login').send({ userId: user.id });
  if (res.status !== 200) throw new Error(`demo login failed: ${res.status} ${JSON.stringify(res.body)}`);
  return agent;
}

export const anon = () => request(app);

export const PHONES = {
  aarti: '9000000001',
  rohit: '9000000002',
  vikram: '9000000003',
  ramesh: '9000000011',
  neha: '9000000012',
  imran: '9000000013',
  sunil: '9000000014',
  pooja: '9000000015',
  sonu: '9000000021',
  opsAdmin: '9000000031',
  superAdmin: '9000000032',
};

export async function locality(name: string) {
  return prisma.locality.findFirstOrThrow({ where: { name } });
}
export async function store(slug: string) {
  return prisma.store.findUniqueOrThrow({ where: { slug } });
}
export async function variant(sku: string) {
  return prisma.productVariant.findUniqueOrThrow({ where: { sku } });
}
export async function stockOf(storeSlug: string, sku: string) {
  const s = await store(storeSlug);
  const v = await variant(sku);
  return (await prisma.storeInventory.findUniqueOrThrow({ where: { storeId_variantId: { storeId: s.id, variantId: v.id } } })).stockQty;
}

export async function addAddress(agent: Agent, localityName: string, label = 'Home') {
  const loc = await locality(localityName);
  const res = await agent.post('/api/me/addresses').send({
    label,
    contactName: 'Test Person',
    contactPhone: '9876543210',
    line1: '1 Test Street',
    localityId: loc.id,
    postalCode: loc.postalCode,
    lat: loc.lat,
    lng: loc.lng,
  });
  if (res.status !== 201) throw new Error(JSON.stringify(res.body));
  return res.body.address as { id: string };
}

export const key = () => `test-${Math.random().toString(36).slice(2)}-${Date.now()}`;
