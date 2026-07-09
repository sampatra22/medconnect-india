"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Mail, Lock, Stethoscope } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"

const roleRedirect: Record<string, string> = {
  admin: "/dashboard",
  mr: "/dashboard",
  doctor: "/dashboard",
  chemist: "/dashboard",
  recruiter: "/dashboard",
}

export function LoginModal() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)

  function resetForm() {
    setEmail("")
    setPassword("")
    setError("")
    setLoading(false)
  }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setError("")
    setLoading(true)

    try {
      const res = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.error || "Login failed")
        setLoading(false)
        return
      }

      localStorage.setItem("medconnect_user", JSON.stringify(data.user))
      setOpen(false)
      resetForm()
      router.push(roleRedirect[data.user.role] ?? "/dashboard")
    } catch {
      setError("Something went wrong. Please try again.")
      setLoading(false)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (!next) resetForm()
      }}
    >
      <DialogTrigger render={<Button variant="ghost">Log In</Button>} />
      <DialogContent>
        <DialogHeader className="items-center sm:items-center">
          <div className="mb-2 flex items-center gap-2">
            <Stethoscope className="h-6 w-6 text-blue-600" />
            <span className="text-lg font-bold text-slate-900 dark:text-white">
              MedConnect <span className="text-emerald-600">India</span>
            </span>
          </div>
          <DialogTitle>Welcome back</DialogTitle>
          <DialogDescription>Log in to your MedConnect India account</DialogDescription>
        </DialogHeader>

        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-600 dark:border-red-900 dark:bg-red-950 dark:text-red-400">
            {error}
          </div>
        )}

        <form className="space-y-4" onSubmit={handleLogin}>
          <div>
            <label className="text-sm font-medium text-slate-700 dark:text-slate-200">
              Email
            </label>
            <div className="relative mt-1">
              <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@medconnect.com"
                className="pl-9"
                required
              />
            </div>
          </div>

          <div>
            <label className="text-sm font-medium text-slate-700 dark:text-slate-200">
              Password
            </label>
            <div className="relative mt-1">
              <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="pl-9"
                required
              />
            </div>
          </div>

          <Button type="submit" disabled={loading} className="w-full bg-blue-600 hover:bg-blue-700">
            {loading ? "Signing in…" : "Log In"}
          </Button>
        </form>

        <p className="text-center text-sm text-slate-500 dark:text-slate-400">
          Don&apos;t have an account?{" "}
          <a href="/signup" className="font-medium text-blue-600 hover:underline">
            Sign up
          </a>
        </p>
      </DialogContent>
    </Dialog>
  )
}
