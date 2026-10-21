import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { logger } from '../lib/logger';

/**
 * Notifications are always stored in-app. Push and email are mock channels that only log
 * until FCM/APNs and an email service are configured.
 */
export async function notify(
  userIds: string | string[],
  n: { type: string; title: string; body: string; data?: Record<string, unknown>; marketing?: boolean },
) {
  const ids = [...new Set(Array.isArray(userIds) ? userIds : [userIds])];
  if (!ids.length) return;
  let recipients = ids;
  if (n.marketing) {
    // Promotional messages only go to users who opted in.
    const consenting = await prisma.customerProfile.findMany({ where: { userId: { in: ids }, marketingConsent: true }, select: { userId: true } });
    recipients = consenting.map((c) => c.userId);
  }
  if (!recipients.length) return;
  await prisma.notification.createMany({
    data: recipients.map((userId) => ({
      userId,
      type: n.type,
      title: n.title,
      body: n.body,
      data: (n.data ?? undefined) as Prisma.InputJsonValue | undefined,
    })),
  });
  logger.debug({ recipients: recipients.length, type: n.type }, '[mock push] notification queued');
}

export async function sellerUserIds(storeId: string): Promise<string[]> {
  const store = await prisma.store.findUnique({ where: { id: storeId }, select: { sellerOrg: { select: { members: { select: { userId: true } } } } } });
  return store?.sellerOrg.members.map((m) => m.userId) ?? [];
}
