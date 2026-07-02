import { describe, expect, it, afterEach } from "vitest";

import {
  mergeSupabaseAuthCookieOptions,
  supabaseAuthCookieSecure,
  supabaseBrowserAuthCookieOptions,
  supabaseServerAuthCookieOptions,
} from "./cookie-options";

describe("supabase auth cookie options", () => {
  const originalNodeEnv = process.env.NODE_ENV;

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv;
  });

  it("uses lax sameSite and root path on server cookies", () => {
    expect(supabaseServerAuthCookieOptions()).toMatchObject({
      path: "/",
      sameSite: "lax",
      httpOnly: true,
    });
  });

  it("does not set httpOnly on browser cookie defaults", () => {
    expect(supabaseBrowserAuthCookieOptions().httpOnly).toBeUndefined();
  });

  it("sets Secure only in production", () => {
    process.env.NODE_ENV = "production";
    expect(supabaseAuthCookieSecure()).toBe(true);
    expect(supabaseServerAuthCookieOptions().secure).toBe(true);

    process.env.NODE_ENV = "development";
    expect(supabaseAuthCookieSecure()).toBe(false);
    expect(supabaseServerAuthCookieOptions().secure).toBe(false);
  });

  it("merges caller overrides without dropping secure defaults", () => {
    process.env.NODE_ENV = "production";
    const merged = mergeSupabaseAuthCookieOptions({ maxAge: 3600 });
    expect(merged).toMatchObject({
      path: "/",
      sameSite: "lax",
      secure: true,
      httpOnly: true,
      maxAge: 3600,
    });
  });
});
