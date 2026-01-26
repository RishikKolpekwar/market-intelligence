# Stripe Subscription Integration Setup Guide

This guide explains the Stripe integration that has been implemented in your application.

## 📁 Files Created/Modified

### 1. **`src/lib/stripe.ts`** - Stripe Utility Library
   - **Purpose**: Initializes the Stripe client with your secret key
   - **What it does**:
     - Creates a server-side Stripe client (never exposed to browser)
     - Provides helper functions to get price ID and check test mode
   - **Key Functions**:
     - `stripe`: The Stripe client instance
     - `getStripePriceId()`: Returns your Stripe price ID from env vars
     - `isTestMode()`: Checks if you're using test keys

### 2. **`supabase/migrations/012_stripe_subscriptions.sql`** - Database Schema
   - **Purpose**: Creates the `subscriptions` table to store Stripe subscription data
   - **What it does**:
     - Creates `subscriptions` table with fields for subscription status, periods, etc.
     - Adds `stripe_customer_id` column to `users` table
     - Sets up Row Level Security (RLS) policies
     - Creates indexes for fast lookups
   - **⚠️ IMPORTANT**: Run this SQL in your Supabase SQL Editor before testing!

### 3. **`src/app/api/billing/create-checkout-session/route.ts`** - Checkout API
   - **Purpose**: Creates a Stripe Checkout session when user clicks "Subscribe"
   - **What it does**:
     1. Authenticates the user
     2. Creates or retrieves a Stripe customer
     3. Creates a checkout session with 3-day trial (auto-charges on day 4)
     4. Returns the checkout URL to redirect user
   - **Endpoint**: `POST /api/billing/create-checkout-session`
   - **Requires**: Authorization header with user's access token

### 4. **`src/app/subscribe/page.tsx`** - Pricing/Subscribe Page
   - **Purpose**: The page where users see pricing and start subscription
   - **What it does**:
     - Displays pricing information ($29/month with 3-day trial)
     - Checks if user is authenticated
     - Calls the checkout API when "Start Free Trial" is clicked
     - Redirects user to Stripe Checkout
   - **Route**: `/subscribe`

### 5. **`src/app/subscribe/success/page.tsx`** - Success Page
   - **Purpose**: Shown after user completes Stripe Checkout
   - **What it does**:
     - Confirms subscription was created
     - Redirects to dashboard after 3 seconds
   - **Route**: `/subscribe/success?session_id={CHECKOUT_SESSION_ID}`

### 6. **`src/app/api/billing/create-portal-session/route.ts`** - Customer Portal API
   - **Purpose**: Creates a Stripe Customer Portal session for managing subscriptions
   - **What it does**:
     - Authenticates the user
     - Creates a portal session for the user's Stripe customer
     - Returns the portal URL
   - **Endpoint**: `POST /api/billing/create-portal-session`
   - **Use case**: Allow users to cancel, update payment methods, view invoices

### 7. **`src/app/api/billing/subscription/route.ts`** - Subscription Status API
   - **Purpose**: Checks if a user has an active subscription
   - **What it does**:
     - Returns subscription status for the authenticated user
     - Used by frontend to check access
   - **Endpoint**: `GET /api/billing/subscription`
   - **Returns**: `{ hasActiveSubscription: boolean, subscription: {...} }`

### 8. **`src/app/api/webhooks/stripe/route.ts`** - Webhook Handler
   - **Purpose**: Receives events from Stripe and updates your database
   - **What it does**:
     - Verifies webhook signature for security
     - Handles subscription events:
       - `checkout.session.completed`: When checkout is finished
       - `customer.subscription.created`: When subscription is created
       - `customer.subscription.updated`: When subscription changes
       - `customer.subscription.deleted`: When subscription is canceled
     - Updates the `subscriptions` table in your database
   - **Endpoint**: `POST /api/webhooks/stripe`
   - **⚠️ IMPORTANT**: This must be publicly accessible (no auth) but uses signature verification

### 9. **`src/app/auth/callback/page.tsx`** - Updated Auth Callback
   - **Purpose**: Checks subscription status after login
   - **What it does**:
     - After successful authentication, checks if user has active subscription
     - Redirects to `/dashboard` if subscribed, `/subscribe` if not
   - **Modified**: Added subscription check logic

## 🔧 Environment Variables Required

Add these to your `.env.local` file:

```bash
# Stripe Keys (from Stripe Dashboard)
STRIPE_SECRET_KEY=sk_test_...  # Your Stripe secret key (test mode for sandbox)
STRIPE_PRICE_ID=price_...      # Your Stripe price ID (from Products & Prices)
STRIPE_WEBHOOK_SECRET=whsec_... # Webhook signing secret (from Stripe Dashboard)

# Supabase (you should already have these)
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...  # Required for webhook handler
```

## 📋 Setup Steps

### Step 1: Run Database Migration
1. Open your Supabase Dashboard
2. Go to SQL Editor
3. Run the contents of `supabase/migrations/012_stripe_subscriptions.sql`
4. This creates the `subscriptions` table and updates the `users` table

### Step 2: Configure Supabase OAuth Redirect URLs

**IMPORTANT for Local Testing:**
1. Go to your Supabase Dashboard
2. Navigate to Authentication → URL Configuration
3. Add these redirect URLs:
   - `http://localhost:3000/auth/callback` (for local development)
   - `https://your-production-domain.com/auth/callback` (for production)
4. Save the changes

This ensures OAuth redirects work correctly in both local and production environments.

### Step 3: Get Stripe Keys
1. Go to [Stripe Dashboard](https://dashboard.stripe.com)
2. Make sure you're in **Test Mode** (toggle in top right)
3. Get your **Secret Key**: Settings → API keys → Secret key (starts with `sk_test_`)
4. Create a **Product & Price**:
   - Products → Add Product
   - Name: "Market Intelligence Premium"
   - Pricing: $29/month (recurring)
   - Copy the **Price ID** (starts with `price_`)
5. Get your **Webhook Secret**:
   - Developers → Webhooks → Add endpoint
   - URL: `https://your-domain.com/api/webhooks/stripe` (or use Stripe CLI for local testing)
   - Select events: `checkout.session.completed`, `customer.subscription.*`
   - Copy the **Signing secret** (starts with `whsec_`)

### Step 4: Add Environment Variables
Add all three Stripe variables to your `.env.local` file.

### Step 5: Test Locally with Stripe CLI (Optional)
For local webhook testing:
```bash
# Install Stripe CLI
brew install stripe/stripe-cli/stripe

# Login
stripe login

# Forward webhooks to local server
stripe listen --forward-to localhost:3000/api/webhooks/stripe
```
This will give you a webhook secret starting with `whsec_` - use this in your `.env.local` for local testing.

### Step 6: Test the Flow
1. Start your dev server: `npm run dev`
2. Go to `/subscribe`
3. Click "Start Free Trial"
4. Complete checkout in Stripe (use test card: `4242 4242 4242 4242`)
5. You should be redirected to `/subscribe/success` then `/dashboard`

## 🔄 How It Works

1. **User clicks "Subscribe"** → Calls `/api/billing/create-checkout-session`
2. **Checkout Session Created** → User redirected to Stripe Checkout
3. **User Completes Payment** → Stripe redirects to `/subscribe/success`
4. **Webhook Fired** → Stripe sends event to `/api/webhooks/stripe`
5. **Database Updated** → Subscription saved in `subscriptions` table
6. **User Redirected** → To dashboard (if subscribed) or subscribe page (if not)

## 🛡️ Security Notes

- **Webhook Signature Verification**: The webhook handler verifies the signature from Stripe to ensure requests are legitimate
- **Service Role Key**: The webhook uses Supabase service role key to bypass RLS and update any user's subscription
- **Server-Side Only**: Stripe secret key is never exposed to the client
- **RLS Policies**: Users can only view their own subscriptions

## 🧪 Testing in Sandbox Mode

- Use test cards from [Stripe Testing](https://stripe.com/docs/testing)
- Common test card: `4242 4242 4242 4242` (any future expiry, any CVC)
- Test webhooks locally with Stripe CLI
- All transactions are fake - no real charges

## 🔄 Trial Period & Cancellation

- **Trial Period**: 3 days (auto-charges on day 4)
- **Cancellation**: Users can only cancel through your app (not via Stripe Customer Portal)
- **Cancel Endpoint**: `POST /api/billing/cancel-subscription`
  - Requires Authorization header with user's access token
  - Cancels subscription at the end of the current billing period
  - Returns: `{ success: true, cancel_at: "ISO date string" }`

To add a cancel button in user settings:
```typescript
const handleCancel = async () => {
  const response = await fetch('/api/billing/cancel-subscription', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
    },
  });
  const data = await response.json();
  // Show confirmation message
};
```

## 📚 Next Steps

- Add a "Cancel Subscription" button in user settings/dashboard
- Add subscription status display on dashboard
- Add middleware to protect routes (redirect to `/subscribe` if not subscribed)
- Customize pricing page design
- Add multiple pricing tiers if needed

## 🐛 Troubleshooting

- **"Webhook secret not configured"**: Make sure `STRIPE_WEBHOOK_SECRET` is set
- **"No subscription found"**: Check that webhook events are being received (check Stripe Dashboard → Webhooks → Events)
- **"Unauthorized" errors**: Make sure user is authenticated and access token is passed in Authorization header
- **Database errors**: Make sure you ran the migration SQL in Supabase
