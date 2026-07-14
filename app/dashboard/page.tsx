"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSession, signOut } from "next-auth/react";
import Link from "next/link";

export default function Dashboard() {
  const router = useRouter();
  const { data: session, status } = useSession();
  const user = session?.user as
    | { name?: string | null; email?: string | null; role?: string }
    | undefined;

  useEffect(() => {
    if (status === "unauthenticated") router.push("/login");
    else if (user?.role === "mr") router.replace("/dashboard/mr");
    else if (user?.role === "doctor") router.replace("/dashboard/doctor");
  }, [status, user?.role, router]);

  if (status !== "authenticated" || !user || user.role === "mr" || user.role === "doctor")
    return null;

  return (
    <div className="min-h-screen bg-blue-50 flex items-center justify-center px-4 py-10">
      <div className="bg-white rounded-2xl shadow-lg p-8 w-full max-w-md text-center">
        <div className="text-4xl mb-4">✅</div>
        <h1 className="text-2xl font-bold text-blue-700 mb-2">Login Successful!</h1>
        <p className="text-gray-500 mb-4">Welcome back,</p>
        <p className="text-xl font-bold text-gray-800">{user.name}</p>
        <p className="text-sm text-gray-500 mt-1">{user.email}</p>
        <span className="inline-block mt-3 bg-blue-100 text-blue-700 font-semibold px-4 py-1 rounded-full text-sm uppercase">
          {user.role}
        </span>

        <div className="mt-6 border-t border-gray-100 pt-6 text-left">
          <p className="text-xs font-semibold text-gray-500 mb-3 uppercase tracking-wide">
            Quick actions
          </p>
          <Link
            href="/doctors"
            className="flex items-center justify-between bg-blue-50 hover:bg-blue-100 rounded-xl px-4 py-3 transition"
          >
            <span>
              <span className="block font-semibold text-blue-800">
                Check doctor availability
              </span>
              <span className="block text-xs text-gray-500">
                Live status, patient counts &amp; MR visiting times before you head out
              </span>
            </span>
            <span className="text-blue-600 text-lg">→</span>
          </Link>
        </div>

        <button
          onClick={() => signOut({ callbackUrl: "/login" })}
          className="mt-6 w-full bg-red-500 hover:bg-red-600 text-white font-semibold py-2 rounded-lg transition"
        >
          Log Out
        </button>
      </div>
    </div>
  );
}
