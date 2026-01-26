/**
 * Create Customer Portal Session API Route
 * 
 * This endpoint creates a Stripe Customer Portal session that allows users to:
 * - Update payment methods
 * - View invoices
 * - Cancel subscriptions
 * - Update billing information
 * 
 * Based on: https://docs.stripe.com/billing/quickstart
 */

import { NextRequest, NextResponse } from 'next/server';
import { stripe } from '@/lib/stripe';
import { createServerSupabaseClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    // 1. Authenticate the user
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

    // 2. Get user's Stripe customer ID
    const { data: userRecord, error: userError } = await (supabase
      .from('users') as any)
      .select('stripe_customer_id')
      .eq('id', user.id)
      .single();

    if (userError || !userRecord?.stripe_customer_id) {
      return NextResponse.json(
        { error: 'No subscription found. Please subscribe first.' },
        { status: 404 }
      );
    }

    // 3. Create Customer Portal session
    const origin = request.headers.get('origin') || 'http://localhost:3000';

    const portalSession = await stripe.billingPortal.sessions.create({
      customer: userRecord.stripe_customer_id,
      return_url: `${origin}/dashboard`,
    });

    // 4. Return the portal URL
    return NextResponse.json({
      url: portalSession.url,
    });
  } catch (error: any) {
    console.error('Error creating portal session:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to create portal session' },
      { status: 500 }
    );
  }
}
