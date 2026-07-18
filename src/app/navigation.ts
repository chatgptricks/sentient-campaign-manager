import {
  Bell,
  BriefcaseBusiness,
  Building2,
  LayoutDashboard,
  Megaphone,
  Settings2,
  type LucideIcon,
} from 'lucide-react';

import type { RoleCode } from '../domain/permissions';

export interface NavigationItem {
  label: string;
  to: string;
  icon: LucideIcon;
  roles?: RoleCode[];
}

export const navigationItems: NavigationItem[] = [
  { label: 'Dashboard', to: '/dashboard', icon: LayoutDashboard },
  { label: 'Promotions', to: '/promotions', icon: Megaphone },
  { label: 'Clients', to: '/clients', icon: Building2 },
  { label: 'My Work', to: '/my-work', icon: BriefcaseBusiness },
  { label: 'Notifications', to: '/notifications', icon: Bell },
  { label: 'Administration', to: '/administration', icon: Settings2, roles: ['ADMINISTRATOR'] },
];
