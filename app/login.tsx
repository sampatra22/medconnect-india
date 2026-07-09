import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Stethoscope,
  Briefcase,
  Building2,
  Pill,
  UserCog,
  Users,
  Mail,
  Lock,
} from "lucide-react";

const roles = [
  { label: "Medical Rep", icon: Briefcase },
  { label: "Doctor", icon: Stethoscope },
  { label: "Chemist", icon: Pill },
  { label: "Pharma Company", icon: Building2 },
  { label: "Recruiter", icon: Users },
  { label: "Admin", icon: UserCog },
];

export default function LoginPage() {
  return (
    <main className="min-h-screen flex items-center justify-center bg-gradient-to-b from-blue-50 to-white dark:from-slate-900 dark:to-slate-950 px-6 py-12">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="flex items-center justify-center gap-2 mb-8">
          <Stethoscope className="h-7 w-7 text-blue-600" />
          <span className="text-xl font-bold text-slate-900 dark:text-white">
            MedConnect <span className="text-emerald-600">India</span>
          </span>
        </div>

        <Card className="shadow-lg">
          <CardContent className="p-8">
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white text-center">
              Welcome back
            </h1>
            <p className="text-sm text-slate-500 dark:text-slate-400 text-center mt-1 mb-6">
              Log in to your MedConnect India account
            </p>

            {/* Role selector */}
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-2">
              I am logging in as
            </p>
            <div className="grid grid-cols-3 gap-2 mb-6">
              {roles.map((role, idx) => {
                const Icon = role.icon;
                return (
                  <button
                    key={role.label}
                    type="button"
                    className={`flex flex-col items-center justify-center gap-1 rounded-lg border p-3 text-xs font-medium transition-colors
                      ${
                        idx === 0
                          ? "border-blue-600 bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300"
                          : "border-slate-200 text-slate-600 hover:border-blue-300 dark:border-slate-700 dark:text-slate-300"
                      }`}
                  >
                    <Icon className="h-5 w-5" />
                    {role.label}
                  </button>
                );
              })}
            </div>

            {/* Form */}
            <form className="space-y-4">
              <div>
                <label className="text-sm font-medium text-slate-700 dark:text-slate-200">
                  Email
                </label>
                <div className="relative mt-1">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                  <Input
                    type="email"
                    placeholder="you@example.com"
                    className="pl-9"
                  />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium text-slate-700 dark:text-slate-200">
                    Password
                  </label>
                  <Link
                    href="/forgot-password"
                    className="text-xs text-blue-600 hover:underline"
                  >
                    Forgot password?
                  </Link>
                </div>
                <div className="relative mt-1">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                  <Input
                    type="password"
                    placeholder="••••••••"
                    className="pl-9"
                  />
                </div>
              </div>

              <Button
                type="submit"
                className="w-full bg-blue-600 hover:bg-blue-700"
              >
                Log In
              </Button>
            </form>

            <div className="relative my-6">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-slate-200 dark:border-slate-700" />
              </div>
              <div className="relative flex justify-center text-xs">
                <span className="bg-white dark:bg-slate-950 px-2 text-slate-400">
                  or continue with
                </span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Button variant="outline" className="w-full">
                Google
              </Button>
              <Button variant="outline" className="w-full">
                Phone OTP
              </Button>
            </div>

            <p className="text-center text-sm text-slate-500 dark:text-slate-400 mt-6">
              Don&apos;t have an account?{" "}
              <Link href="/signup" className="text-blue-600 font-medium hover:underline">
                Sign up
              </Link>
            </p>
          </CardContent>
        </Card>

        <p className="text-center text-xs text-slate-400 mt-6">
          By continuing, you agree to MedConnect India&apos;s{" "}
          <Link href="/terms" className="underline">Terms</Link> and{" "}
          <Link href="/privacy" className="underline">Privacy Policy</Link>.
        </p>
      </div>
    </main>
  );
}
