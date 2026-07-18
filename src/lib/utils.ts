import { format, formatDistanceToNowStrict, parseISO } from 'date-fns';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(value: string | null, fallback = 'Not set') {
  if (!value) return fallback;
  return format(parseISO(value), 'MMM d, yyyy');
}

export function formatDateTime(value: string | null, fallback = 'Not available') {
  if (!value) return fallback;
  return format(parseISO(value), 'MMM d, yyyy · h:mm a');
}

export function formatRelativeTime(value: string) {
  return formatDistanceToNowStrict(parseISO(value), { addSuffix: true });
}

export function formatMoney(amount: number, currency: string) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    maximumFractionDigits: 2,
  }).format(amount);
}

export function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('');
}

export function sanitizeExternalUrl(value: string) {
  const url = new URL(value);
  if (url.protocol !== 'https:') throw new Error('Only HTTPS links are allowed.');
  return url.toString();
}
