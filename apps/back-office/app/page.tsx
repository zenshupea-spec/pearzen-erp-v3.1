import type { Metadata } from "next";

import { createSupabaseServerClient } from "../../../packages/supabase/server";

import GoogleSignInButton from "./GoogleSignInButton";

export const metadata: Metadata = {
  title: "PEARZEN ERP - Back Office",
  description: "Head Office / OM / HR / FM / MD-OD"
};

export default async function Page(props: {
  searchParams?: { [key: string]: string | string[] | undefined };
}) {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getUser();
  const user = data.user;

  const error =
    typeof props.searchParams?.error === "string"
      ? props.searchParams?.error
      : undefined;

  return (
    <main className="min-h-screen flex items-center justify-center p-6">
      <div className="w-full max-w-md glass-panel rounded-2xl p-6">
        <div className="mb-6">
          <div className="text-lg font-semibold">PEARZEN ERP</div>
          <div className="text-sm text-zinc-300">Back Office</div>
        </div>

        {user ? (
          <div className="text-sm text-zinc-200">
            Signed in.
            <div className="mt-1 break-all text-xs text-zinc-400">
              {user.email ?? "OAuth user"}
            </div>
          </div>
        ) : (
          <>
            {error ? (
              <div className="mb-4 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-200">
                {error === "oauth_failed"
                  ? "Google login failed. Please try again."
                  : "Login error. Please try again."}
              </div>
            ) : null}

            <GoogleSignInButton />
          </>
        )}
      </div>
    </main>
  );
}

