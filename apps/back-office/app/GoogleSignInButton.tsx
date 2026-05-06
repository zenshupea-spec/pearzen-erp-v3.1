"use client";

import { useMemo, useState } from "react";

import { createSupabaseBrowserClient } from "../../../packages/supabase/client";

export default function GoogleSignInButton() {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);

  const [loading, setLoading] = useState(false);

  async function handleGoogleSignIn() {
    setLoading(true);
    try {
      const redirectTo = `${window.location.origin}/auth/callback?next=/`;

      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo
        }
      });

      if (error) {
        // Keep it simple for Phase 1.
        alert(error.message);
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      type="button"
      onClick={handleGoogleSignIn}
      disabled={loading}
      className="w-full rounded-xl glass-input px-4 py-3 text-sm font-medium text-white/90 shadow-sm transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {loading ? "Redirecting..." : "Sign In with Google"}
    </button>
  );
}

