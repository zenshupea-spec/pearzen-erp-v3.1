"use client";

import { useState } from "react";

export default function EmpNumberLoginForm() {
  const [epfNo, setEpfNo] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleConnect() {
    setLoading(true);
    setError(null);
    try {
      const normalized = epfNo.trim();
      const res = await fetch("/api/auth/emp-login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ epfNo: normalized })
      });

      const data = await res.json().catch(() => null);

      if (!res.ok) {
        setError(
          typeof data?.error === "string" ? data.error : "Connection failed"
        );
        return;
      }

      // After session cookie is set by the API route, the server page will
      // re-render on refresh / navigation.
      window.location.reload();
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="glass-panel rounded-2xl p-6">
      <div className="mb-6">
        <div className="text-lg font-semibold text-field-fg">Guard Login</div>
        <div className="mt-1 text-xs text-field-fg/70">
          Phase 1 • Passwordless connection (EPF No)
        </div>
      </div>

      <label
        htmlFor="emp-number"
        className="block text-xs font-medium text-field-fg/80"
      >
        EPF No
      </label>
      <input
        id="epf-no"
        type="text"
        value={epfNo}
        onChange={(e) => setEpfNo(e.target.value)}
        inputMode="text"
        className="mt-2 w-full rounded-xl glass-input px-4 py-3 text-sm outline-none ring-0 placeholder:text-field-fg/50"
        placeholder="EPF membership number"
        autoComplete="off"
      />

      {error ? (
        <div className="mt-3 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-200">
          {error}
        </div>
      ) : null}

      <button
        type="button"
        onClick={handleConnect}
        disabled={loading || epfNo.trim().length === 0}
        className="mt-5 w-full rounded-xl bg-connection-ok px-4 py-3 text-sm font-semibold text-black shadow-connection-glow transition hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {loading ? "CONNECTING..." : "CONNECT"}
      </button>
    </div>
  );
}

