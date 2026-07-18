const url = import.meta.env.VITE_SUPABASE_URL?.trim() ?? '';
const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim() ?? '';

export const publicConfig = {
  supabaseUrl: url,
  supabasePublishableKey: publishableKey,
  basePath: import.meta.env.VITE_BASE_PATH?.trim() || '/',
  demoMode: import.meta.env.VITE_DEMO_MODE === 'true',
};

export const isSupabaseConfigured =
  (/^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(url) ||
    /^http:\/\/(?:127\.0\.0\.1|localhost):\d+$/i.test(url)) &&
  publishableKey.length > 20 &&
  !publishableKey.includes('replace_me');

export const configHealth = {
  supabaseUrl: isSupabaseConfigured ? 'configured' : 'missing',
  publishableKey: isSupabaseConfigured ? 'configured' : 'missing',
  basePath: publicConfig.basePath,
  demoMode: publicConfig.demoMode,
} as const;
