import { createClient } from '@supabase/supabase-js';

import { isSupabaseConfigured, publicConfig } from './config';

const fallbackUrl = 'https://placeholder.supabase.co';
const fallbackKey = 'sb_publishable_placeholder_for_unconfigured_build';

export const supabase = createClient(
  isSupabaseConfigured ? publicConfig.supabaseUrl : fallbackUrl,
  isSupabaseConfigured ? publicConfig.supabasePublishableKey : fallbackKey,
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  },
);
