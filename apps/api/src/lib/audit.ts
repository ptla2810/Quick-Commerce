import type { Request } from 'express';
import { prisma, type Tx, Prisma } from './prisma';

export async function audit(
  req: Request | null,
  action: string,
  entityType: string,
  entityId: string | null,
  metadata?: Record<string, unknown>,
  tx: Tx = prisma,
) {
  await tx.auditLog.create({
    data: {
      actorUserId: req?.auth?.user.id ?? null,
      action,
      entityType,
      entityId,
      metadata: (metadata ?? undefined) as Prisma.InputJsonValue | undefined,
      ip: req?.ip ?? null,
    },
  });
}
