/**
 * Subscribe Page
 * 
 * This page displays pricing information and allows users to start a subscription.
 * When they click "Subscribe", it calls the checkout session API and redirects to Stripe.
 * 
 * Based on: https://docs.stripe.com/billing/quickstart
 */

'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createBrowserClient } from '@/lib/supabase/client';

export default function SubscribePage() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);
  const [hasUsedTrial, setHasUsedTrial] = useState(false);
  const router = useRouter();

  useEffect(() => {
    // Check if user is authenticated and if they've used their trial
    const checkAuth = async () => {
      const supabase = createBrowserClient();
      const { data: { session } } = await supabase.auth.getSession();
      setIsAuthenticated(!!session);

      if (session?.user) {
        // Check if user has used their free trial
        const { data: userRecord } = await supabase
          .from('users')
          .select('has_used_trial')
          .eq('id', session.user.id)
          .single();

        if ((userRecord as any)?.has_used_trial) {
          setHasUsedTrial(true);
        }
      }

      setIsCheckingAuth(false);
    };

    checkAuth();
  }, [router]);

  const handleSubscribe = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const supabase = createBrowserClient();
      const { data: { session } } = await supabase.auth.getSession();

      if (!session) {
        // Redirect to login, and they'll come back here after login
        router.push('/login?redirect=/subscribe');
        setIsLoading(false);
        return;
      }

      // Call the checkout session API
      const response = await fetch('/api/billing/create-checkout-session', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to create checkout session');
      }

      // Redirect to Stripe Checkout
      if (data.url) {
        window.location.href = data.url;
      } else {
        throw new Error('No checkout URL returned');
      }
    } catch (err: any) {
      console.error('Error starting checkout:', err);
      setError(err.message || 'Something went wrong. Please try again.');
      setIsLoading(false);
    }
  };


  if (isCheckingAuth) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-lg">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto">
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold text-gray-900 mb-4">
            📈 Market Intelligence Premium
          </h1>
          <p className="text-xl text-gray-600">
            Get personalized daily market briefings and insights
          </p>
        </div>

        <div className="bg-white rounded-2xl shadow-xl p-8 mb-8">
          <div className="text-center">
            <div className="mb-6">
              <span className="text-5xl font-bold text-gray-900">$5</span>
              <span className="text-xl text-gray-600">/month</span>
            </div>
            {!hasUsedTrial && (
              <p className="text-gray-500 mb-8">Start with a 3-day free trial</p>
            )}
            {hasUsedTrial && (
              <p className="text-gray-500 mb-8">Activate your membership today</p>
            )}

            <ul className="text-left max-w-md mx-auto space-y-4 mb-8">
              <li className="flex items-start">
                <svg className="h-6 w-6 text-green-500 mr-3 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <span className="text-black">Daily personalized market briefings</span>
              </li>
              <li className="flex items-start">
                <svg className="h-6 w-6 text-green-500 mr-3 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <span className="text-black">Track unlimited assets and portfolios</span>
              </li>
              <li className="flex items-start">
                <svg className="h-6 w-6 text-green-500 mr-3 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <span className="text-black">Real-time news and market analysis</span>
              </li>
              <li className="flex items-start">
                <svg className="h-6 w-6 text-green-500 mr-3 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <span className="text-black">Email briefings delivered daily</span>
              </li>
            </ul>

            {error && (
              <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg">
                <p className="text-red-800 text-sm">{error}</p>
              </div>
            )}

            <button
              onClick={handleSubscribe}
              disabled={isLoading}
              className="w-full max-w-md mx-auto bg-blue-600 hover:bg-blue-700 text-white font-semibold py-4 px-8 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {isLoading ? (
                <>
                  <svg className="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Processing...
                </>
              ) : hasUsedTrial ? (
                'Activate Membership'
              ) : (
                'Start Free Trial'
              )}
            </button>

            <p className="mt-4 text-sm text-gray-500">
              {hasUsedTrial
                ? 'Cancel anytime.'
                : 'Cancel anytime during your trial. You won\'t be charged until the trial ends.'}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
