"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail]       = useState("");
  const [password, setPassword] = useState("");
  const [error, setError]       = useState("");
  const [loading, setLoading]   = useState(false);

  async function handleLogin() {
    setError("");
    setLoading(true);


    const res = await fetch("/api/login", {      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });

    const data = await res.json();
    setLoading(false);

    if (!res.ok) {
      setError(data.error || "Login failed");
      return;
    }

    // Save user to localStorage
    localStorage.setItem("medconnect_user", JSON.stringify(data.user));

    // Redirect based on role
    const roleRedirect: Record<string, string> = {
  admin:     "/dashboard",
  mr:        "/dashboard",
  doctor:    "/dashboard",
  chemist:   "/dashboard",
  recruiter: "/dashboard",
};

    router.push(roleRedirect[data.user.role] ?? "/dashboard");
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-blue-50">
      <div className="bg-white rounded-2xl shadow-lg p-8 w-full max-w-md">
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
            className="w-full border border-gray-300 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <button
          onClick={handleLogin}
          disabled={loading}
          className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 rounded-lg transition disabled:opacity-50"
        >
          {loading ? "Signing in…" : "Sign In"}
        </button>

        {/* Test credentials hint */}
        <div className="mt-6 bg-gray-50 rounded-lg p-4 text-xs text-gray-500">
          <p className="font-semibold mb-1 text-gray-600">Test credentials:</p>
          <p>sam@medconnect.com / sam123 (Admin)</p>
          <p>ravi@medconnect.com / ravi123 (MR)</p>
          <p>anjali@medconnect.com / anjali123 (Doctor)</p>
        </div>
      </div>
    </div>
  );
}