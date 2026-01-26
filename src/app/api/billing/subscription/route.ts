/**
 * Get Subscription Status API Route
 * 
 * This endpoint returns the current user's subscription status.
 * Used by the frontend to check if a user has an active subscription.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const authHeader = request.headers.get('authorization');
    
    if (!authHeader) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Get user from Supabase
    const { data: { user }, error: authError } = await supabase.auth.getUser(
      authHeader.replace('Bearer ', '')
    );

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Get user's subscription
    const { data: subscription, error: subError } = await (supabase
      .from('subscriptions') as any)
      .select('*')
      .eq('user_id', user.id)
      .in('status', ['active', 'trialing'])
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    // Check is_free_account from users table
    const { data: userRecord } = await (supabase
      .from('users') as any)
      .select('is_free_account')
      .eq('id', user.id)
      .single();

    if (subError && subError.code !== 'PGRST116') { // PGRST116 = not found
      console.error('Error fetching subscription:', subError);
      return NextResponse.json(
        { error: 'Failed to fetch subscription' },
        { status: 500 }
      );
    }

    const hasActiveSubscription = subscription && 
      (subscription.status === 'active' || subscription.status === 'trialing');
    const isFreeAccount = userRecord?.is_free_account === true;

    // User has access if they have an active subscription OR is_free_account = true
    const hasAccess = hasActiveSubscription || isFreeAccount;

    return NextResponse.json({
      hasActiveSubscription: hasAccess,
      subscription: subscription || null,
    });
  } catch (error: any) {
    console.error('Error checking subscription:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to check subscription' },
      { status: 500 }
    );
  }
}
