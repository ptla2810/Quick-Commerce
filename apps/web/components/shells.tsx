'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useId, useState, type ReactNode } from 'react';
import { Bell, Building2, ChevronDown, Home, LayoutGrid, LifeBuoy, LogOut, MapPin, Package, Search, ShoppingCart, Store, Truck, User, ShieldCheck, Pill } from 'lucide-react';
import { BRAND } from '@/lib/brand';
import { api, useApi } from '@/lib/api';
import { useAuth } from './providers/auth';
import { useLocation } from './providers/location';
import { useCart } from './providers/cart';
import { cx, Spinner, LinkButton, EmptyState } from './ui';
import { money } from './commerce';

function Logo({ dark }: { dark?: boolean }) {
  return (
    <Link href="/" className="flex items-center gap-2" aria-label={`${BRAND.name} home`}>
      <svg viewBox="0 0 64 64" className="h-8 w-8" aria-hidden>
        <rect width="64" height="64" rx="16" fill={dark ? '#ffffff' : '#0F2747'} />
        <path d="M18 30 32 18l14 12v16a2 2 0 0 1-2 2H20a2 2 0 0 1-2-2z" fill="#1E9E5A" />
        <circle cx="32" cy="36" r="5" fill="#F29A4A" />
      </svg>
      <span className={cx('text-lg font-extrabold tracking-tight', dark ? 'text-white' : 'text-navy-800')}>{BRAND.name}</span>
    </Link>
  );
}

export function DemoBanner() {
  const { data } = useApi<{ demoMode: boolean; providers: { paymentSimulated: boolean } }>('/dev/status');
  if (!data?.demoMode && !data?.providers.paymentSimulated) return null;
  return (
    <div className="no-print bg-accent-100 px-4 py-1.5 text-center text-xs font-medium text-accent-700">
      Demo environment · fictional stores and products · payments, prescriptions review and delivery tracking are simulated
    </div>
  );
}

function AccountMenu() {
  const { user, logout, hasRole } = useAuth();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  useEffect(() => setOpen(false), [pathname]);
  if (!user)
    return (
      <Link href="/login" className="flex h-10 items-center gap-1.5 rounded-xl px-3 text-sm font-semibold text-navy-800 hover:bg-navy-50">
        <User className="h-5 w-5" aria-hidden /> Sign in
      </Link>
    );
  const links = [
    { href: '/account', label: 'Profile & addresses', show: true },
    { href: '/orders', label: 'My orders', show: true },
    { href: '/chemist/prescriptions', label: 'My prescriptions', show: true },
    { href: '/notifications', label: 'Notifications', show: true },
    { href: '/business', label: 'Business (HoReCa)', show: true },
    { href: '/seller', label: 'Seller dashboard', show: hasRole('SELLER') },
    { href: '/delivery', label: 'Delivery partner', show: hasRole('DELIVERY_PARTNER') },
    { href: '/admin', label: 'Admin console', show: hasRole('ADMIN', 'SUPER_ADMIN') },
  ];
  return (
    <div className="relative">
      <button onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-haspopup="menu" className="flex h-10 items-center gap-1 rounded-xl px-3 text-sm font-semibold text-navy-800 hover:bg-navy-50">
        <User className="h-5 w-5" aria-hidden />
        <span className="hidden max-w-28 truncate sm:inline">{user.name.split(' ')[0]}</span>
        <ChevronDown className="h-4 w-4" aria-hidden />
      </button>
      {open && (
        <div role="menu" className="absolute right-0 z-40 mt-2 w-60 rounded-2xl bg-white p-2 shadow-xl ring-1 ring-navy-100">
          {links
            .filter((l) => l.show)
            .map((l) => (
              <Link key={l.href} role="menuitem" href={l.href} className="block rounded-lg px-3 py-2.5 text-sm text-navy-800 hover:bg-navy-50">
                {l.label}
              </Link>
            ))}
          <button
            role="menuitem"
            onClick={async () => {
              await logout();
              router.push('/');
            }}
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-sm text-red-700 hover:bg-red-50"
          >
            <LogOut className="h-4 w-4" aria-hidden /> Sign out
          </button>
        </div>
      )}
    </div>
  );
}

function SearchBox({ className }: { className?: string }) {
  const router = useRouter();
  const [q, setQ] = useState('');
  const id = useId();
  return (
    <form
      role="search"
      className={cx('relative', className)}
      onSubmit={(e) => {
        e.preventDefault();
        if (q.trim()) router.push(`/search?q=${encodeURIComponent(q.trim())}`);
      }}
    >
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-navy-700/60" aria-hidden />
      <label htmlFor={id} className="sr-only">
        Search products
      </label>
      <input
        id={id}
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder='Search "atta", "dal", "paneer", "ORS"…'
        className="h-11 w-full rounded-xl border-0 bg-navy-50 pl-9 pr-3 text-base text-navy-900 ring-1 ring-inset ring-navy-100 placeholder:text-navy-700/50 focus:bg-white focus:ring-2 focus:ring-brand-500 sm:text-sm"
      />
    </form>
  );
}

function LocationPill() {
  const { location, ready } = useLocation();
  return (
    <Link href="/location" className="flex min-w-0 items-center gap-1.5 rounded-xl px-2 py-1 text-left hover:bg-navy-50" aria-label="Change delivery location">
      <MapPin className="h-5 w-5 shrink-0 text-brand-600" aria-hidden />
      <span className="min-w-0">
        <span className="block text-[11px] font-semibold uppercase tracking-wide text-navy-700/70">Deliver to</span>
        <span className="block truncate text-sm font-semibold text-navy-900">{!ready ? '…' : location ? `${location.addressLabel ? `${location.addressLabel} · ` : ''}${location.localityName}, ${location.cityName}` : 'Select location'}</span>
      </span>
      <ChevronDown className="h-4 w-4 shrink-0" aria-hidden />
    </Link>
  );
}

function CartButton() {
  const { cart } = useCart();
  return (
    <Link href="/cart" className="relative flex h-10 items-center gap-2 rounded-xl bg-brand-600 px-3 text-sm font-semibold text-white hover:bg-brand-700" aria-label={`Cart, ${cart?.itemCount ?? 0} items`}>
      <ShoppingCart className="h-5 w-5" aria-hidden />
      {cart ? <span>{money(cart.estimatedSubtotal)}</span> : <span>Cart</span>}
      {!!cart?.itemCount && <span className="absolute -right-1.5 -top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-accent-500 px-1 text-[11px] font-bold text-navy-900">{cart.itemCount}</span>}
    </Link>
  );
}

const BOTTOM_NAV = [
  { href: '/', label: 'Home', icon: Home },
  { href: '/categories', label: 'Categories', icon: LayoutGrid },
  { href: '/cart', label: 'Cart', icon: ShoppingCart },
  { href: '/orders', label: 'Orders', icon: Package },
  { href: '/account', label: 'Account', icon: User },
];

export function AppShell({ children, hideSearch }: { children: ReactNode; hideSearch?: boolean }) {
  const pathname = usePathname();
  const { cart } = useCart();
  return (
    <div className="min-h-dvh pb-20 md:pb-0">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded focus:bg-white focus:px-3 focus:py-2">
        Skip to content
      </a>
      <DemoBanner />
      <header className="no-print sticky top-0 z-30 border-b border-navy-100 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-2">
          <Logo />
          <div className="min-w-0 flex-1 md:flex-none md:w-72">
            <LocationPill />
          </div>
          {!hideSearch && <SearchBox className="hidden flex-1 md:block" />}
          <nav className="ml-auto flex items-center gap-1" aria-label="Account">
            <Link href="/support" className="hidden h-10 items-center gap-1.5 rounded-xl px-3 text-sm font-semibold text-navy-800 hover:bg-navy-50 lg:flex">
              <LifeBuoy className="h-5 w-5" aria-hidden /> Help
            </Link>
            <Link href="/notifications" className="hidden h-10 w-10 items-center justify-center rounded-xl hover:bg-navy-50 sm:flex" aria-label="Notifications">
              <Bell className="h-5 w-5 text-navy-800" aria-hidden />
            </Link>
            <AccountMenu />
            <div className="hidden md:block">
              <CartButton />
            </div>
          </nav>
        </div>
        {!hideSearch && (
          <div className="px-4 pb-2 md:hidden">
            <SearchBox />
          </div>
        )}
      </header>
      <main id="main" className="mx-auto max-w-7xl px-4 py-5">
        {children}
      </main>
      <footer className="no-print mx-auto mt-8 hidden max-w-7xl border-t border-navy-100 px-4 py-6 text-sm text-navy-700/70 md:block">
        <div className="flex flex-wrap gap-x-6 gap-y-2">
          <span>© {new Date().getFullYear()} {BRAND.name} (demo)</span>
          <Link href="/support">Help & FAQs</Link>
          <Link href="/offers">Offers</Link>
          <Link href="/business">For hotels & restaurants</Link>
          <Link href="/seller/onboarding">Sell on {BRAND.name}</Link>
          <Link href="/delivery/register">Deliver with us</Link>
        </div>
      </footer>
      {cart && cart.itemCount > 0 && pathname !== '/cart' && pathname !== '/checkout' && (
        <Link href="/cart" className="no-print fixed inset-x-3 bottom-[4.5rem] z-30 flex items-center justify-between rounded-2xl bg-brand-600 px-4 py-3 text-white shadow-lg md:hidden">
          <span className="text-sm font-semibold">
            {cart.itemCount} item{cart.itemCount > 1 ? 's' : ''} · {money(cart.estimatedSubtotal)}
          </span>
          <span className="text-sm font-bold">View cart →</span>
        </Link>
      )}
      <nav className="no-print fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-navy-100 bg-white md:hidden" aria-label="Main">
        {BOTTOM_NAV.map(({ href, label, icon: Icon }) => {
          const active = href === '/' ? pathname === '/' : pathname.startsWith(href);
          return (
            <Link key={href} href={href} aria-current={active ? 'page' : undefined} className={cx('flex h-16 flex-col items-center justify-center gap-0.5 text-[11px] font-semibold', active ? 'text-brand-700' : 'text-navy-700/70')}>
              <Icon className="h-5 w-5" aria-hidden />
              {label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}

/** Requires a signed-in user; shows a sign-in prompt otherwise. */
export function RequireAuth({ children, roles, message }: { children: ReactNode; roles?: string[]; message?: string }) {
  const { user, loading, hasRole } = useAuth();
  const pathname = usePathname();
  if (loading) return <Spinner />;
  if (!user)
    return (
      <EmptyState icon="🔐" title="Please sign in" body={message ?? 'Sign in to continue.'} action={<LinkButton href={`/login?next=${encodeURIComponent(pathname)}`}>Sign in</LinkButton>} />
    );
  if (roles && !hasRole(...roles)) return <EmptyState icon="🚫" title="No access" body="Your account does not have permission to view this page." action={<LinkButton href="/" variant="secondary">Go home</LinkButton>} />;
  return <>{children}</>;
}

export interface PortalNavItem {
  href: string;
  label: string;
  icon?: ReactNode;
  badge?: number;
}

const PORTAL_ICONS = { seller: Store, admin: ShieldCheck, delivery: Truck, business: Building2, chemist: Pill };

export function PortalShell({ portal, title, nav, children, roles }: { portal: keyof typeof PORTAL_ICONS; title: string; nav: PortalNavItem[]; children: ReactNode; roles?: string[] }) {
  const pathname = usePathname();
  const Icon = PORTAL_ICONS[portal];
  return (
    <div className="min-h-dvh">
      <DemoBanner />
      <header className="no-print sticky top-0 z-30 bg-navy-800 text-white">
        <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-2.5">
          <Logo dark />
          <span className="flex items-center gap-1.5 rounded-lg bg-white/10 px-2 py-1 text-sm font-semibold">
            <Icon className="h-4 w-4" aria-hidden /> {title}
          </span>
          <div className="ml-auto flex items-center gap-1">
            <Link href="/" className="rounded-lg px-3 py-2 text-sm font-medium hover:bg-white/10">
              Shop
            </Link>
            <PortalSwitcher />
          </div>
        </div>
        <nav className="no-scrollbar mx-auto flex max-w-7xl gap-1 overflow-x-auto px-4 pb-2" aria-label={`${title} sections`}>
          {nav.map((n) => {
            const active = n.href === pathname || (n.href !== nav[0].href && pathname.startsWith(n.href));
            return (
              <Link key={n.href} href={n.href} aria-current={active ? 'page' : undefined} className={cx('flex h-9 shrink-0 items-center gap-1.5 rounded-lg px-3 text-sm font-semibold', active ? 'bg-white text-navy-900' : 'text-white/85 hover:bg-white/10')}>
                {n.label}
                {!!n.badge && <span className="rounded-full bg-accent-500 px-1.5 text-[11px] font-bold text-navy-900">{n.badge}</span>}
              </Link>
            );
          })}
        </nav>
      </header>
      <main id="main" className="mx-auto max-w-7xl px-4 py-6">
        <RequireAuth roles={roles}>{children}</RequireAuth>
      </main>
    </div>
  );
}

function PortalSwitcher() {
  const { user, logout } = useAuth();
  const router = useRouter();
  if (!user) return null;
  return (
    <button
      onClick={async () => {
        await logout();
        router.push('/login');
      }}
      className="flex items-center gap-1 rounded-lg px-3 py-2 text-sm font-medium hover:bg-white/10"
    >
      <LogOut className="h-4 w-4" aria-hidden /> <span className="hidden sm:inline">Sign out</span>
    </button>
  );
}

export { api };
