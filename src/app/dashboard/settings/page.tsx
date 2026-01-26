"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createBrowserClient } from "@/lib/supabase/client";

interface Subscription {
  id: string;
  stripe_subscription_id: string;
  status: string;
  current_period_start: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  created_at: string;
}

export default function SettingsPage() {
  const [user, setUser] = useState<any>(null);
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isCanceling, setIsCanceling] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const accessTokenRef = useRef<string | null>(null);
  const router = useRouter();

  const supabaseRef = useRef<ReturnType<typeof createBrowserClient> | null>(null);
  if (!supabaseRef.current) {
    supabaseRef.current = createBrowserClient();
  }
  const supabase = supabaseRef.current;

  useEffect(() => {
    const loadData = async () => {
      const { data: { session } } = await supabase.auth.getSession();

      if (!session?.user) {
        router.replace("/login");
        return;
      }

      setUser(session.user);
      accessTokenRef.current = session.access_token;

      // Fetch subscription status
      try {
        const res = await fetch("/api/billing/subscription", {
          headers: {
            Authorization: `Bearer ${session.access_token}`,
          },
        });

        if (res.ok) {
          const data = await res.json();
          setSubscription(data.subscription);
        }
      } catch (err) {
        console.error("Error fetching subscription:", err);
      }

      setIsLoading(false);
    };

    loadData();
  }, [router, supabase]);

  const handleCancelSubscription = async () => {
    const confirmMessage = subscription?.status === "trialing"
      ? "Are you sure you want to cancel your free trial? You will lose access immediately."
      : "Are you sure you want to cancel your subscription? You will retain access until the end of your current billing period.";

    if (!confirm(confirmMessage)) return;

    setIsCanceling(true);
    setMessage(null);

    try {
      const res = await fetch("/api/billing/cancel-subscription", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessTokenRef.current}`,
        },
      });

      const data = await res.json();

      if (res.ok) {
        // If trial was canceled immediately, redirect to login
        if (data.immediate) {
          // Sign out and redirect
          await supabase.auth.signOut();
          router.replace("/login?message=subscription_canceled");
          return;
        }

        // Use cancel_at from response, or fall back to current_period_end from subscription
        const accessUntilDate = data.cancel_at || subscription?.current_period_end;
        setMessage({
          type: "success",
          text: `Your subscription has been canceled. You'll have access until ${formatDate(accessUntilDate)}.`,
        });
        // Refresh subscription data
        const subRes = await fetch("/api/billing/subscription", {
          headers: {
            Authorization: `Bearer ${accessTokenRef.current}`,
          },
        });
        if (subRes.ok) {
          const subData = await subRes.json();
          setSubscription(subData.subscription);
        }
      } else {
        setMessage({
          type: "error",
          text: data.error || "Failed to cancel subscription",
        });
      }
    } catch (err) {
      console.error("Error canceling subscription:", err);
      setMessage({
        type: "error",
        text: "Network error. Please try again.",
      });
    } finally {
      setIsCanceling(false);
    }
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return "N/A";
    return new Date(dateString).toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  };

  // Calculate trial end date (3 days from created_at)
  const getTrialEndDate = () => {
    if (subscription?.current_period_end) {
      return formatDate(subscription.current_period_end);
    }
    if (subscription?.created_at) {
      const trialEnd = new Date(subscription.created_at);
      trialEnd.setDate(trialEnd.getDate() + 3);
      return formatDate(trialEnd.toISOString());
    }
    return "N/A";
  };

  // Calculate next payment date (30 days from period start or created_at)
  const getNextPaymentDate = () => {
    if (subscription?.current_period_end) {
      return formatDate(subscription.current_period_end);
    }
    const startDate = subscription?.current_period_start || subscription?.created_at;
    if (startDate) {
      const nextPayment = new Date(startDate);
      nextPayment.setDate(nextPayment.getDate() + 30);
      return formatDate(nextPayment.toISOString());
    }
    return "N/A";
  };

  // Get period start display text
  const getPeriodStartDisplay = () => {
    if (subscription?.status === "trialing") {
      return "Trial";
    }
    if (subscription?.current_period_start) {
      return formatDate(subscription.current_period_start);
    }
    return formatDate(subscription?.created_at || null);
  };

  const getStatusBadge = (status: string, cancelAtPeriodEnd: boolean) => {
    if (cancelAtPeriodEnd) {
      return (
        <span className="px-3 py-1 text-sm font-medium rounded-full bg-yellow-100 text-yellow-800">
          Canceling
        </span>
      );
    }

    switch (status) {
      case "active":
        return (
          <span className="px-3 py-1 text-sm font-medium rounded-full bg-green-100 text-green-800">
            Active
          </span>
        );
      case "trialing":
        return (
          <span className="px-3 py-1 text-sm font-medium rounded-full bg-blue-100 text-blue-800">
            Free Trial
          </span>
        );
      case "past_due":
        return (
          <span className="px-3 py-1 text-sm font-medium rounded-full bg-red-100 text-red-800">
            Past Due
          </span>
        );
      case "canceled":
        return (
          <span className="px-3 py-1 text-sm font-medium rounded-full bg-gray-100 text-gray-800">
            Canceled
          </span>
        );
      default:
        return (
          <span className="px-3 py-1 text-sm font-medium rounded-full bg-gray-100 text-gray-800">
            {status}
          </span>
        );
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-lg">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-4">
              <Link
                href="/dashboard"
                className="text-gray-600 hover:text-gray-900 transition-colors"
              >
                &larr; Back to Dashboard
              </Link>
              <h1 className="text-xl font-bold text-gray-900">Settings</h1>
            </div>
            <span className="text-sm text-gray-600">{user?.email}</span>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Message */}
        {message && (
          <div
            className={`mb-6 p-4 rounded-lg ${
              message.type === "success"
                ? "bg-green-50 text-green-800 border border-green-200"
                : "bg-red-50 text-red-800 border border-red-200"
            }`}
          >
            {message.text}
          </div>
        )}

        {/* Subscription Section */}
        <div className="bg-white rounded-xl shadow-sm mb-6">
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="text-lg font-semibold text-gray-900">Subscription</h2>
          </div>

          <div className="px-6 py-6">
            {subscription ? (
              <div className="space-y-6">
                {/* Status */}
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm font-medium text-gray-500">Status</div>
                    <div className="mt-1 flex items-center gap-3">
                      {getStatusBadge(subscription.status, subscription.cancel_at_period_end)}
                      {subscription.cancel_at_period_end && (
                        <span className="text-sm text-gray-500">
                          Access until {subscription.status === "trialing" ? getTrialEndDate() : getNextPaymentDate()}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-2xl font-bold text-gray-900">$5</div>
                    <div className="text-sm text-gray-500">/month</div>
                  </div>
                </div>

                {/* Billing Period */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4 border-t border-gray-100">
                  <div>
                    <div className="text-sm font-medium text-gray-500">Current Period Started</div>
                    <div className="mt-1 text-gray-900">
                      {getPeriodStartDisplay()}
                    </div>
                  </div>
                  <div>
                    <div className="text-sm font-medium text-gray-500">
                      {subscription.status === "trialing" ? "Trial Ends" : "Next Payment"}
                    </div>
                    <div className="mt-1 text-gray-900">
                      {subscription.status === "trialing" ? getTrialEndDate() : getNextPaymentDate()}
                    </div>
                  </div>
                </div>

                {/* Member Since */}
                <div className="pt-4 border-t border-gray-100">
                  <div className="text-sm font-medium text-gray-500">Member Since</div>
                  <div className="mt-1 text-gray-900">
                    {formatDate(subscription.created_at)}
                  </div>
                </div>

                {/* Trial Info */}
                {subscription.status === "trialing" && !subscription.cancel_at_period_end && (
                  <div className="p-4 bg-blue-50 rounded-lg border border-blue-100">
                    <div className="flex items-start gap-3">
                      <span className="text-blue-500 text-xl">i</span>
                      <div>
                        <div className="font-medium text-blue-900">You&apos;re on a free trial</div>
                        <div className="text-sm text-blue-700 mt-1">
                          Your trial ends on {getTrialEndDate()}.
                          After that, you&apos;ll be charged $5/month. Cancel anytime before then to avoid being charged.
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Cancel Button */}
                {!subscription.cancel_at_period_end &&
                 (subscription.status === "active" || subscription.status === "trialing") && (
                  <div className="pt-4 border-t border-gray-100">
                    <button
                      onClick={handleCancelSubscription}
                      disabled={isCanceling}
                      className="px-4 py-2 text-sm font-medium text-red-600 hover:text-red-700 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50"
                    >
                      {isCanceling ? "Canceling..." : "Cancel Subscription"}
                    </button>
                    <p className="mt-2 text-sm text-gray-500">
                      {subscription.status === "trialing"
                        ? "Cancel your trial at any time. You won't be charged."
                        : "You'll retain access until the end of your current billing period."}
                    </p>
                  </div>
                )}

                {/* Already Canceled */}
                {subscription.cancel_at_period_end && (
                  <div className="p-4 bg-yellow-50 rounded-lg border border-yellow-100">
                    <div className="font-medium text-yellow-900">Subscription Canceled</div>
                    <div className="text-sm text-yellow-700 mt-1">
                      Your subscription has been canceled. You&apos;ll have access until{" "}
                      {subscription.status === "trialing" ? getTrialEndDate() : getNextPaymentDate()}.
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="text-center py-8">
                <p className="text-gray-500 mb-4">You don&apos;t have an active subscription.</p>
                <Link
                  href="/subscribe"
                  className="px-6 py-3 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition-colors"
                >
                  Subscribe Now
                </Link>
              </div>
            )}
          </div>
        </div>

        {/* Account Section */}
        <div className="bg-white rounded-xl shadow-sm">
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="text-lg font-semibold text-gray-900">Account</h2>
          </div>

          <div className="px-6 py-6">
            <div className="space-y-4">
              <div>
                <div className="text-sm font-medium text-gray-500">Email</div>
                <div className="mt-1 text-gray-900">{user?.email}</div>
              </div>
              <div>
                <div className="text-sm font-medium text-gray-500">User ID</div>
                <div className="mt-1 text-gray-500 text-sm font-mono">{user?.id}</div>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
