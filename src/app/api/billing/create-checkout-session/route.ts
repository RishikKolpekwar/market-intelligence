/**
 * Create Checkout Session API Route
 * 
 * This endpoint creates a Stripe Checkout session when a user wants to subscribe.
 * It:
 * 1. Authenticates the user
 * 2. Creates or retrieves a Stripe customer
 * 3. Creates a checkout session with the subscription
 * 4. Returns the session URL to redirect the user
 * 
 * Based on: https://docs.stripe.com/billing/quickstart
 */

import { NextRequest, NextResponse } from 'next/server';
import { stripe, getStripePriceId } from '@/lib/stripe';
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

    // 2. Get or create user record in public.users table
    const { data: userRecord, error: userError } = await (supabase
      .from('users') as any)
      .select('id, email, stripe_customer_id, has_used_trial')
      .eq('id', user.id)
      .single();

    if (userError && userError.code !== 'PGRST116') { // PGRST116 = not found
      console.error('Error fetching user:', userError);
      return NextResponse.json(
        { error: 'Failed to fetch user' },
        { status: 500 }
      );
    }

    // Create user record if it doesn't exist
    if (!userRecord) {
      const { error: insertError } = await (supabase
        .from('users') as any)
        .insert({
          id: user.id,
          email: user.email || '',
        });

      if (insertError) {
        console.error('Error creating user:', insertError);
        return NextResponse.json(
          { error: 'Failed to create user' },
          { status: 500 }
        );
      }
    }

    // 3. Get or create Stripe customer
    let customerId = userRecord?.stripe_customer_id;

    if (!customerId) {
      // Create a new Stripe customer
      const customer = await stripe.customers.create({
        email: user.email || undefined,
        metadata: {
          supabase_user_id: user.id,
        },
      });

      customerId = customer.id;

      // Save customer ID to database
      await (supabase
        .from('users') as any)
        .update({ stripe_customer_id: customerId })
        .eq('id', user.id);
    }

    // 4. Create Checkout Session
    const origin = request.headers.get('origin') || 'http://localhost:3000';
    const priceId = getStripePriceId();

    // Check if user has already used their free trial
    const hasUsedTrial = (userRecord as any)?.has_used_trial === true;

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: 'subscription',
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      success_url: `${origin}/subscribe/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/subscribe?canceled=true`,
      // Only include trial if user hasn't used it before
      subscription_data: {
        ...(hasUsedTrial ? {} : { trial_period_days: 3 }),
        metadata: {
          supabase_user_id: user.id,
        },
      },
    });

    // 5. Return the session URL
    return NextResponse.json({
      url: session.url,
    });
  } catch (error: any) {
    console.error('Error creating checkout session:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to create checkout session' },
      { status: 500 }
    );
  }
}
