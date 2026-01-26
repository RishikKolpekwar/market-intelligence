/**
 * Stripe Webhook Handler
 * 
 * This endpoint receives webhook events from Stripe and updates the database accordingly.
 * It handles:
 * - customer.subscription.created
 * - customer.subscription.updated
 * - customer.subscription.deleted
 * - checkout.session.completed
 * 
 * IMPORTANT: This endpoint must be publicly accessible (no auth required)
 * but it verifies the webhook signature from Stripe for security.
 * 
 * Based on: https://docs.stripe.com/billing/quickstart
 */

import { NextRequest, NextResponse } from 'next/server';
import { stripe } from '@/lib/stripe';
import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Create Supabase client with service role key for webhook operations
// This bypasses RLS policies since webhooks need to update any user's subscription
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY! // Service role key has admin access
);

/**
 * Handle subscription events from Stripe
 */
async function handleSubscriptionChange(
  subscription: Stripe.Subscription,
  eventType: string
) {
  const customerId = subscription.customer as string;
  const subscriptionId = subscription.id;
  const status = subscription.status;
  const priceId = subscription.items.data[0]?.price.id;

  // Cast to any to access period dates (available in API but types vary by version)
  const sub = subscription as any;
  const currentPeriodStart = sub.current_period_start
    ? new Date(sub.current_period_start * 1000).toISOString()
    : null;
  const currentPeriodEnd = sub.current_period_end
    ? new Date(sub.current_period_end * 1000).toISOString()
    : null;
  const cancelAtPeriodEnd = subscription.cancel_at_period_end;

  // Get user ID from Stripe customer metadata or lookup
  let userId: string | null = null;

  // Try to get from customer metadata
  const customer = await stripe.customers.retrieve(customerId);
  if (!customer.deleted && 'metadata' in customer) {
    userId = customer.metadata.supabase_user_id || null;
  }

  // If not in metadata, try to find by stripe_customer_id
  if (!userId) {
    const { data: userRecord } = await supabase
      .from('users')
      .select('id')
      .eq('stripe_customer_id', customerId)
      .single();

    if (userRecord) {
      userId = userRecord.id;
    }
  }

  if (!userId) {
    console.error('Could not find user for customer:', customerId);
    return;
  }

  // Update or create subscription record
  const subscriptionData = {
    user_id: userId,
    stripe_subscription_id: subscriptionId,
    stripe_customer_id: customerId,
    stripe_price_id: priceId,
    status: status,
    current_period_start: currentPeriodStart,
    current_period_end: currentPeriodEnd,
    cancel_at_period_end: cancelAtPeriodEnd,
  };

  const { error } = await supabase
    .from('subscriptions')
    .upsert(subscriptionData, {
      onConflict: 'user_id',
    });

  if (error) {
    console.error('Error upserting subscription:', error);
    throw error;
  }

  // If this is a trial subscription, mark the user as having used their trial
  if (status === 'trialing') {
    const { error: userUpdateError } = await supabase
      .from('users')
      .update({ has_used_trial: true })
      .eq('id', userId);

    if (userUpdateError) {
      console.error('Error updating has_used_trial:', userUpdateError);
    }
  }

  console.log(`✅ Subscription ${eventType}:`, {
    userId,
    subscriptionId,
    status,
  });
}

export async function POST(request: NextRequest) {
  const body = await request.text();
  const signature = request.headers.get('stripe-signature');

  if (!signature) {
    return NextResponse.json(
      { error: 'No signature' },
      { status: 400 }
    );
  }

  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!webhookSecret) {
    console.error('STRIPE_WEBHOOK_SECRET is not set');
    return NextResponse.json(
      { error: 'Webhook secret not configured' },
      { status: 500 }
    );
  }

  let event: Stripe.Event;

  try {
    // Verify webhook signature
    event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
  } catch (err: any) {
    console.error('Webhook signature verification failed:', err.message);
    return NextResponse.json(
      { error: `Webhook Error: ${err.message}` },
      { status: 400 }
    );
  }

  // Handle the event
  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        
        // If it's a subscription checkout, retrieve the subscription
        if (session.mode === 'subscription' && session.subscription) {
          const subscription = await stripe.subscriptions.retrieve(
            session.subscription as string
          );
          await handleSubscriptionChange(subscription, 'created');
        }
        break;
      }

      case 'customer.subscription.created':
      case 'customer.subscription.updated': {
        const subscription = event.data.object as Stripe.Subscription;
        await handleSubscriptionChange(subscription, event.type);
        break;
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription;
        
        // Mark subscription as canceled in database
        const { error } = await supabase
          .from('subscriptions')
          .update({ status: 'canceled' })
          .eq('stripe_subscription_id', subscription.id);

        if (error) {
          console.error('Error updating canceled subscription:', error);
        } else {
          console.log('✅ Subscription canceled:', subscription.id);
        }
        break;
      }

      case 'invoice.paid':
      case 'invoice.payment_succeeded': {
        // Payment successful - subscription continues
        console.log('✅ Invoice paid:', (event.data.object as any).id);
        break;
      }

      case 'invoice.payment_failed': {
        // Payment failed - log it (Stripe will retry automatically)
        const invoice = event.data.object as any;
        console.log('⚠️ Invoice payment failed:', invoice.id);
        break;
      }

      default:
        console.log(`Unhandled event type: ${event.type}`);
    }

    return NextResponse.json({ received: true });
  } catch (error: any) {
    console.error('Error handling webhook:', error);
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }
}
