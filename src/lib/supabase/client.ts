import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { Database } from '@/types/database';

export type TypedSupabaseClient = SupabaseClient<Database>;

// Client for browser-side operations (respects RLS)
export const createBrowserClient = (): TypedSupabaseClient => {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
};

// Server client - optionally accepts access token for authenticated requests
export const createServerClient = (options?: { accessToken?: string }) => {
  const { accessToken } = options || {};
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    accessToken
      ? {
          global: {
            headers: { Authorization: `Bearer ${accessToken}` },
          },
        }
      : undefined
  );
};

// Server client with explicit access token (for when you have the token)
export const createServerClientWithToken = (accessToken: string) => {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      global: {
        headers: { Authorization: `Bearer ${accessToken}` },
      },
    }
  );
};

// Admin client with service role key (bypasses RLS - use carefully)
export const createAdminClient = () => {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
};
