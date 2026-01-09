"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { createBrowserClient } from "@/lib/supabase/client";

export default function AuthCallbackPage() {
  const router = useRouter();

  useEffect(() => {
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
        .then(({ error }) => {
          if (!error) {
            router.replace("/dashboard");
          } else {
            router.replace("/login?error=auth_error");
          }
        });
    } else {
      router.replace("/login?error=auth_error");
    }
  }, [router]);

  return (
    <div className="min-h-screen flex items-center justify-center">
      <span className="text-lg">Signing you in...</span>
    </div>
  );
}
