import type { NextFunction, Request, Response } from 'express';
import type { Role, SellerMemberRole } from '@padosi/shared';
import { hasPermission, type Permission } from '@padosi/shared';
import { prisma } from '../lib/prisma';
import { sha256 } from '../lib/crypto';
import { forbidden, notFound, unauthorized } from '../lib/errors';
import { env } from '../config/env';

export const SESSION_COOKIE = 'padosi_session';

export interface AuthContext {
  sessionId: string;
  user: { id: string; name: string; email: string | null; phone: string | null; isDemo: boolean };
  roles: Role[];
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      auth?: AuthContext;
    }
  }
}

function extractToken(req: Request): string | null {
  const header = req.headers.authorization;
  if (header?.startsWith('Bearer ')) return header.slice(7).trim();
  return (req.cookies?.[SESSION_COOKIE] as string | undefined) ?? null;
}

/** Loads the session if one is present. Never rejects; use requireAuth for that. */
export async function loadSession(req: Request, _res: Response, next: NextFunction) {
  const token = extractToken(req);
  if (!token) return next();
  const session = await prisma.session.findUnique({
    where: { tokenHash: sha256(token) },
    include: { user: { include: { roles: true } } },
  });
  if (!session || session.expiresAt < new Date() || session.user.status !== 'ACTIVE') return next();
  req.auth = {
    sessionId: session.id,
    user: { id: session.user.id, name: session.user.name, email: session.user.email, phone: session.user.phone, isDemo: session.user.isDemo },
    roles: session.user.roles.map((r) => r.role as Role),
  };
  // Touch at most once a minute to avoid a write per request.
  if (Date.now() - session.lastUsedAt.getTime() > 60_000) {
    prisma.session.update({ where: { id: session.id }, data: { lastUsedAt: new Date() } }).catch(() => {});
  }
  next();
}

export function requireAuth(req: Request, _res: Response, next: NextFunction) {
  if (!req.auth) return next(unauthorized());
  next();
}

export function requireRole(...roles: Role[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.auth) return next(unauthorized());
    if (!req.auth.roles.some((r) => roles.includes(r))) return next(forbidden());
    next();
  };
}

export function requirePermission(perm: Permission) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.auth) return next(unauthorized());
    if (!hasPermission(req.auth.roles, perm)) return next(forbidden());
    next();
  };
}

export function authOf(req: Request): AuthContext {
  if (!req.auth) throw unauthorized();
  return req.auth;
}

export const isAdmin = (req: Request) => !!req.auth?.roles.some((r) => r === 'ADMIN' || r === 'SUPER_ADMIN');

/**
 * Resolves the caller's membership of the seller organisation that owns a store.
 * Admins are not seller members; admin routes have their own access paths.
 */
export async function requireStoreMember(req: Request, storeId: string, allowed?: SellerMemberRole[]) {
  const auth = authOf(req);
  const store = await prisma.store.findUnique({ where: { id: storeId }, include: { sellerOrg: true } });
  if (!store) throw notFound('Store');
  const member = await prisma.sellerMember.findUnique({
    where: { userId_sellerOrgId: { userId: auth.user.id, sellerOrgId: store.sellerOrgId } },
  });
  if (!member) throw forbidden('You are not a member of this store');
  if (allowed && !allowed.includes(member.role as SellerMemberRole)) throw forbidden(`This action requires one of: ${allowed.join(', ')}`);
  return { store, member };
}

export function sessionCookieOptions(maxAgeMs: number) {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: env.COOKIE_SECURE,
    path: '/',
    maxAge: maxAgeMs,
  };
}
