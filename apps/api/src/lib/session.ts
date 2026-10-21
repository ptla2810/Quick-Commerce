import type { Request, Response } from 'express';
import { permissionsFor, type Role } from '@padosi/shared';
import { prisma } from './prisma';
import { newToken, sha256 } from './crypto';
import { env } from '../config/env';
import { SESSION_COOKIE, sessionCookieOptions } from '../middleware/auth';

/** Creates a server-side session. Web clients get an httpOnly cookie; mobile clients get a bearer token. */
export async function startSession(req: Request, res: Response, userId: string, client: 'web' | 'mobile') {
  const token = newToken();
  const ttlMs = env.SESSION_TTL_DAYS * 24 * 60 * 60 * 1000;
  await prisma.session.create({
    data: {
      userId,
      tokenHash: sha256(token),
      userAgent: req.headers['user-agent']?.slice(0, 200) ?? null,
      ip: req.ip ?? null,
      expiresAt: new Date(Date.now() + ttlMs),
    },
  });
  if (client === 'web') res.cookie(SESSION_COOKIE, token, sessionCookieOptions(ttlMs));
  return client === 'mobile' ? token : undefined;
}

export async function sessionPayload(userId: string) {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    include: {
      roles: true,
      customerProfile: true,
      businessProfile: { select: { id: true, businessName: true, verificationStatus: true, creditApproved: true } },
      deliveryPartner: { select: { id: true, verificationStatus: true, isOnline: true } },
      sellerMemberships: {
        include: { sellerOrg: { select: { id: true, name: true, verificationStatus: true, sellerType: true, stores: { select: { id: true, name: true, slug: true, verticals: true } } } } },
      },
    },
  });
  const roles = user.roles.map((r) => r.role as Role);
  return {
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      phoneVerified: !!user.phoneVerifiedAt,
      isDemo: user.isDemo,
      roles,
      permissions: permissionsFor(roles),
      preferredLanguage: user.customerProfile?.preferredLanguage ?? 'en',
      marketingConsent: user.customerProfile?.marketingConsent ?? false,
      businessProfile: user.businessProfile,
      deliveryPartner: user.deliveryPartner,
      sellerMemberships: user.sellerMemberships.map((m) => ({ role: m.role, org: m.sellerOrg })),
    },
  };
}
