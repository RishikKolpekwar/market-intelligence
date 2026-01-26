/**
 * Cancel Subscription API Route
 *
 * This endpoint cancels a user's subscription at the end of the current billing period.
 * Users can only cancel through this endpoint (not via Stripe Customer Portal).
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
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get user from Supabase
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser(authHeader.replace('Bearer ', ''));

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // 2. Get user's active subscription
    const { data: subscriptionData, error: subError } = await supabase
      .from('subscriptions')
      .select('stripe_subscription_id, status')
      .eq('user_id', user.id)
      .in('status', ['active', 'trialing'])
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (subError || !subscriptionData) {
      return NextResponse.json({ error: 'No active subscription found' }, { status: 404 });
    }

    const subscription = subscriptionData as {
      stripe_subscription_id: string;
      status: string;
    };

    // 3. Cancel the subscription
    const isTrial = subscription.status === 'trialing';

    let stripeSubscription: any;

    if (isTrial) {
      // Immediately cancel trial
      stripeSubscription = await stripe.subscriptions.cancel(subscription.stripe_subscription_id);

      // Update database to canceled
      await (supabase
        .from('subscriptions') as any)
        .update({
          status: 'canceled',
          cancel_at_period_end: false,
          updated_at: new Date().toISOString(),
        })
        .eq('stripe_subscription_id', subscription.stripe_subscription_id);
    } else {
      // Cancel at period end for paid subscriptions
      stripeSubscription = await stripe.subscriptions.update(subscription.stripe_subscription_id, {
        cancel_at_period_end: true,
      });

      // Update database
      await (supabase
        .from('subscriptions') as any)
        .update({
          cancel_at_period_end: true,
          updated_at: new Date().toISOString(),
        })
        .eq('stripe_subscription_id', subscription.stripe_subscription_id);
    }

    return NextResponse.json({
      success: true,
      message: isTrial
        ? 'Your free trial has been canceled.'
        : 'Subscription will be canceled at the end of the current billing period',
      cancel_at: isTrial
        ? new Date().toISOString()
        : stripeSubscription?.current_period_end
          ? new Date(stripeSubscription.current_period_end * 1000).toISOString()
          : null,
      immediate: isTrial,
    });
  } catch (error: any) {
    console.error('Error canceling subscription:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to cancel subscription' },
      { status: 500 }
    );
  }
}
