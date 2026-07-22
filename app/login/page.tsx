"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { signIn, useSession } from "next-auth/react";
import { homeFor } from "@/lib/roles";

export default function LoginPage() {
  const router = useRouter();
  const { data: session, status } = useSession();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // Already signed in? Asking someone to log in again is a dead end — send
  // them where they were going.
  useEffect(() => {
    if (status === "authenticated") {
      const role = String((session?.user as { role?: string } | undefined)?.role || "");
      router.replace(homeFor(role));
    }
  }, [status, session, router]);

  async function handleLogin(e?: React.FormEvent) {
    e?.preventDefault();
    setError("");
    setLoading(true);

    const res = await signIn("credentials", { email, password, redirect: false });

    if (!res || res.error) {
      setLoading(false);
      setError("Invalid email or password");
      return;
    }

    // The sign-in response has just set the session cookie, but the client
    // SessionProvider that every dashboard's useSession() reads has NOT yet
    // refetched it. A client-side router.push would land on a dashboard that
    // still sees "unauthenticated" and bounces straight back here — which is
    // exactly the "have to click twice" bug.
    //
    // Read the fresh session server-side (the cookie is present now), then do
    // a FULL navigation: the destination loads with a fresh provider that
    // sees the cookie from the first byte. One click, every role.
    const session = await fetch("/api/auth/session", { cache: "no-store" })
      .then((r) => r.json())
      .catch(() => null);
    const role = String(session?.user?.role || "").toLowerCase();
    // Landing pages come from the central role config (one source of truth).
    window.location.assign(homeFor(role));
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-blue-50">
      <form
        onSubmit={handleLogin}
        className="bg-white rounded-2xl shadow-lg p-8 w-full max-w-md"
      >
        <h1 className="text-2xl font-bold text-blue-700 mb-2">MedConnect India</h1>
        <p className="text-gray-500 mb-6 text-sm">Sign in to your account</p>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-600 rounded-lg px-4 py-3 mb-4 text-sm">
            {error}
          </div>
        )}

        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@medconnect.com"
            required
            className="w-full border border-gray-300 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            required
            className="w-full border border-gray-300 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 rounded-lg transition disabled:opacity-50"
        >
          {loading ? "Signing in…" : "Sign In"}
        </button>

        <p className="text-sm text-gray-500 text-center mt-4">
          New MR?{" "}
          <a href="/signup" className="text-blue-600 hover:underline">
            Create an account
          </a>
        </p>
      </form>
    </div>
  );
}
