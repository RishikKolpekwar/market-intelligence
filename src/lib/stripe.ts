/**
 * Stripe Server-Side Utilities
 * 
 * This file provides server-side Stripe client initialization and helper functions.
 * It uses your Stripe secret key from environment variables.
 * 
 * IMPORTANT: Never expose your secret key to the client-side!
 */

import Stripe from 'stripe';

// Initialize Stripe client with your secret key
// This will use test mode keys (starting with sk_test_) automatically
export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2025-12-15.clover' as any,
  typescript: true,
});

/**
 * Get the Stripe price ID from environment variables
 * This is the price ID you created in your Stripe Dashboard
 */
export function getStripePriceId(): string {
  const priceId = process.env.STRIPE_PRICE_ID;
  if (!priceId) {
    throw new Error('STRIPE_PRICE_ID environment variable is not set');
  }
  return priceId;
}

/**
 * Check if we're in test mode (sandbox)
 * Stripe test keys start with sk_test_ and pk_test_
 */
export function isTestMode(): boolean {
  const secretKey = process.env.STRIPE_SECRET_KEY || '';
  return secretKey.startsWith('sk_test_');
}
