import {
  Bell,
  BriefcaseBusiness,
  Building2,
  CalendarRange,
  CircleDollarSign,
  LayoutDashboard,
  Megaphone,
  Network,
  UsersRound,
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
  { label: 'Overview', to: '/dashboard', icon: LayoutDashboard },
  { label: 'Calendar', to: '/calendar', icon: CalendarRange },
  { label: 'Campaigns', to: '/campaigns', icon: Megaphone },
  { label: 'Clients', to: '/clients', icon: Building2 },
  {
    label: 'Channels',
    to: '/channels',
    icon: Network,
    roles: ['SALES', 'CREATOR'],
  },
  { label: 'Sales', to: '/finance', icon: CircleDollarSign, roles: ['SALES', 'FINANCE'] },
  { label: 'My Work', to: '/my-work', icon: BriefcaseBusiness },
  { label: 'Notifications', to: '/notifications', icon: Bell },
  { label: 'Users & roles', to: '/administration', icon: UsersRound, roles: ['ADMINISTRATOR'] },
];
