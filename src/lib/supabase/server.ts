import { createClient } from '@supabase/supabase-js';
import { headers } from 'next/headers';
import { Database } from '@/types/database';

// Server client for API routes - reads auth from Authorization header
export const createServerSupabaseClient = async () => {
  const headersList = await headers();
  const authHeader = headersList.get('authorization');
  
  // Extract token from "Bearer <token>" format
  const accessToken = authHeader?.startsWith('Bearer ') 
    ? authHeader.slice(7) 
    : authHeader;

  const supabase = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    accessToken ? {
      global: {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      },
    } : undefined
  );

  return supabase;
};
