import { auth } from "@/auth";
import { redirect } from "next/navigation";

export default async function WelcomePage() {
  const session = await auth();

  if (!session) {
    redirect("/login");
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-gradient-to-b from-blue-50 to-white px-6">
      <div className="text-center">
        <h1 className="text-3xl font-bold text-slate-900">
          Welcome, {session.user?.name} 👋
        </h1>
        <p className="text-slate-600 mt-2">
          You&apos;re logged in as a {(session.user as { role?: string })?.role}.
        </p>
      </div>
    </main>
  );
}