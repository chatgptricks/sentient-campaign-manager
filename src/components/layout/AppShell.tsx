import { useState, type PropsWithChildren } from 'react';
import { NavLink } from 'react-router-dom';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { Bell, ChevronDown, LogOut, Menu, X } from 'lucide-react';

import { navigationItems } from '../../app/navigation';
import { useAuth } from '../../features/auth/AuthProvider';
import { publicConfig } from '../../lib/supabase/config';
import { cn, initials } from '../../lib/utils';
import { hasAnyRole, roleLabel } from '../../domain/permissions';
import { Button } from '../ui/Button';

function logoPath() {
  const base = publicConfig.basePath.endsWith('/')
    ? publicConfig.basePath
    : `${publicConfig.basePath}/`;
  return `${base}sentient-logo.svg`;
}

export function AppShell({ children }: PropsWithChildren) {
  const { profile, signOut } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);
  const roles = profile?.roles ?? [];
  const visibleNavigation = navigationItems.filter(
    (item) => !item.roles || hasAnyRole(roles, item.roles),
  );

  const navigation = (
    <nav className="grid gap-1" aria-label="Primary navigation">
      {visibleNavigation.map((item) => {
        const Icon = item.icon;
        return (
          <NavLink
            key={item.to}
            to={item.to}
            onClick={() => setMobileOpen(false)}
            className={({ isActive }) =>
              cn(
                'group flex min-h-11 items-center gap-3 rounded-md px-3 text-sm font-medium text-[var(--text-muted)] transition hover:bg-white/5 hover:text-[var(--text)] focus-visible:ring-2 focus-visible:ring-[var(--acid)] focus-visible:outline-none',
                isActive &&
                  'bg-[var(--acid)] text-black hover:bg-[var(--acid-soft)] hover:text-black',
              )
            }
          >
            <Icon className="size-4.5 shrink-0" strokeWidth={1.8} aria-hidden="true" />
            {item.label}
          </NavLink>
        );
      })}
    </nav>
  );

  return (
    <div className="min-h-screen bg-[var(--background)] text-[var(--text)]">
      <a
        className="sr-only z-[100] rounded-md bg-[var(--acid)] px-4 py-2 text-black focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
        href="#main-content"
      >
        Skip to content
      </a>
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 border-r border-[var(--border)] bg-[var(--sidebar)] lg:flex lg:flex-col">
        <div className="flex h-20 items-center border-b border-[var(--border)] px-6">
          <img className="h-7 w-auto brightness-0" src={logoPath()} alt="Sentient" />
        </div>
        <div className="flex-1 overflow-y-auto px-4 py-5">{navigation}</div>
        <div className="border-t border-[var(--border)] p-4">
          <p className="text-xs font-semibold text-[var(--text)]">Promotion Manager</p>
          <p className="mt-1 text-[11px] text-[var(--text-dim)]">Production workspace</p>
        </div>
      </aside>

      {mobileOpen ? (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-black/70"
            aria-label="Close navigation"
            onClick={() => setMobileOpen(false)}
          />
          <aside className="relative h-full w-[min(82vw,20rem)] border-r border-[var(--border)] bg-[var(--sidebar)] p-4 shadow-2xl">
            <div className="mb-7 flex items-center justify-between">
              <img className="h-7 w-auto brightness-0" src={logoPath()} alt="Sentient" />
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setMobileOpen(false)}
                aria-label="Close navigation"
              >
                <X className="size-5" />
              </Button>
            </div>
            {navigation}
          </aside>
        </div>
      ) : null}

      <div className="lg:pl-64">
        {publicConfig.demoMode ? (
          <div className="border-b border-[var(--acid)]/25 bg-[var(--acid)]/8 px-4 py-2 text-center text-xs font-semibold text-[var(--acid-ink)]">
            Interactive development preview · data resets when the server restarts
          </div>
        ) : null}
        <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b border-[var(--border)] bg-[var(--paper)] px-4 sm:px-6 lg:px-8">
          <Button
            className="lg:hidden"
            variant="ghost"
            size="icon"
            onClick={() => setMobileOpen(true)}
            aria-label="Open navigation"
          >
            <Menu className="size-5" />
          </Button>
          <div className="hidden items-center gap-2 text-xs text-[var(--text-dim)] lg:flex">
            <span className="size-1.5 rounded-full bg-[var(--acid)] shadow-[0_0_12px_var(--acid)]" />
            Secure operations workspace
          </div>
          <div className="ml-auto flex items-center gap-2">
            <Button asChild variant="ghost" size="icon">
              <NavLink to="/notifications" aria-label="Open notifications">
                <Bell className="size-4.5" />
              </NavLink>
            </Button>
            <DropdownMenu.Root>
              <DropdownMenu.Trigger asChild>
                <button className="flex min-h-10 items-center gap-2 rounded-md px-2 text-left transition hover:bg-white/5 focus-visible:ring-2 focus-visible:ring-[var(--acid)] focus-visible:outline-none">
                  <span className="grid size-8 place-items-center rounded-md bg-[var(--acid)] text-xs font-bold text-black">
                    {initials(profile?.displayName ?? 'User')}
                  </span>
                  <span className="hidden sm:block">
                    <span className="block text-xs font-semibold text-[var(--text)]">
                      {profile?.displayName}
                    </span>
                    <span className="block text-[10px] text-[var(--text-dim)]">
                      {profile?.roles[0] ? roleLabel[profile.roles[0]] : 'No role'}
                    </span>
                  </span>
                  <ChevronDown className="hidden size-3.5 text-[var(--text-dim)] sm:block" />
                </button>
              </DropdownMenu.Trigger>
              <DropdownMenu.Portal>
                <DropdownMenu.Content
                  align="end"
                  className="z-50 min-w-56 rounded-lg border border-[var(--border-strong)] bg-[var(--surface-raised)] p-1.5 shadow-2xl"
                  sideOffset={8}
                >
                  <div className="px-2 py-2">
                    <p className="text-xs font-semibold text-[var(--text)]">{profile?.email}</p>
                    <p className="mt-1 text-[10px] text-[var(--text-dim)]">
                      {profile?.roles.map((role) => roleLabel[role]).join(' · ')}
                    </p>
                  </div>
                  <DropdownMenu.Separator className="my-1 h-px bg-[var(--border)]" />
                  <DropdownMenu.Item
                    className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-2 text-sm text-[var(--text-muted)] outline-none hover:bg-white/6 hover:text-[var(--text)] focus:bg-white/6"
                    onSelect={() => void signOut()}
                  >
                    <LogOut className="size-4" />
                    Sign out
                  </DropdownMenu.Item>
                </DropdownMenu.Content>
              </DropdownMenu.Portal>
            </DropdownMenu.Root>
          </div>
        </header>
        <main
          id="main-content"
          className="mx-auto w-full max-w-[1600px] px-4 py-7 sm:px-6 lg:px-8 lg:py-9"
        >
          {children}
        </main>
      </div>
    </div>
  );
}
