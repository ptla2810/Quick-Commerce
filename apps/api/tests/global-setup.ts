import { PrismaClient } from '@prisma/client';
import { seed } from '../prisma/seed';

/** Seeds the freshly migrated test database once, and opens every demo store 24 hours so tests do not depend on the clock. */
export default async function setup() {
  const prisma = new PrismaClient();
  await seed(prisma, { log: () => {} });
  await prisma.store.updateMany({ data: { openMinute: 0, closeMinute: 0 } });
  await prisma.$disconnect();
}
