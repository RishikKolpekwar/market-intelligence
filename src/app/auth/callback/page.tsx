"use client";
import { useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createBrowserClient } from "@/lib/supabase/client";

function AuthCallbackContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    // Get redirect parameter if present
    const redirectTo = searchParams.get("redirect");
    
    // Parse tokens from URL hash
    const hash = window.location.hash.substring(1);
    const params = new URLSearchParams(hash);
    const access_token = params.get("access_token");
    const refresh_token = params.get("refresh_token");
    const expires_in = params.get("expires_in");

    if (access_token && refresh_token && expires_in) {
      const supabase = createBrowserClient();
      supabase.auth
        .setSession({
          access_token,
          refresh_token,
        })
        .then(async ({ error }) => {
          if (!error) {
            // If there's a redirect parameter, use it
            if (redirectTo) {
              router.replace(redirectTo);
              return;
            }

            // Otherwise, check subscription status
            try {
              const response = await fetch("/api/billing/subscription", {
                headers: {
                  Authorization: `Bearer ${access_token}`,
                },
              });

              if (response.ok) {
                const data = await response.json();
                if (data.hasActiveSubscription) {
                  router.replace("/dashboard");
                } else {
                  router.replace("/subscribe");
                }
              } else {
                // If check fails, redirect to subscribe page to be safe
                router.replace("/subscribe");
              }
            } catch (err) {
              console.error("Error checking subscription:", err);
              router.replace("/subscribe");
            }
          } else {
            router.replace("/login?error=auth_error");
          }
        });
    } else {
      router.replace("/login?error=auth_error");
    }
  }, [router, searchParams]);

  return (
    <div className="min-h-screen flex items-center justify-center">
      <span className="text-lg">Signing you in...</span>
    </div>
  );
}

export default function AuthCallbackPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center">
        <span className="text-lg">Loading...</span>
      </div>
    }>
      <AuthCallbackContent />
    </Suspense>
  );
}
