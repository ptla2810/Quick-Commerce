import type { Role } from './enums';

export const PERMISSIONS = [
  'admin:dashboard',
  'admin:sellers',
  'admin:users',
  'admin:catalog',
  'admin:zones',
  'admin:orders',
  'admin:delivery',
  'admin:coupons',
  'admin:support',
  'admin:settlements',
  'admin:settings',
  'admin:audit',
] as const;
export type Permission = (typeof PERMISSIONS)[number];

/** Operations admins run the platform day to day; only super admins change settings or read the audit log. */
const ROLE_PERMISSIONS: Partial<Record<Role, Permission[]>> = {
  ADMIN: [
    'admin:dashboard',
    'admin:sellers',
    'admin:users',
    'admin:catalog',
    'admin:zones',
    'admin:orders',
    'admin:delivery',
    'admin:coupons',
    'admin:support',
    'admin:settlements',
  ],
  SUPER_ADMIN: [...PERMISSIONS],
};

export function permissionsFor(roles: Role[]): Permission[] {
  const set = new Set<Permission>();
  for (const r of roles) for (const p of ROLE_PERMISSIONS[r] ?? []) set.add(p);
  return [...set];
}

export function hasPermission(roles: Role[], perm: Permission): boolean {
  return permissionsFor(roles).includes(perm);
}
