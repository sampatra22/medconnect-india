"use client"

import { useState } from "react"
import { ShieldCheck, ShieldAlert } from "lucide-react"

import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"

const ROLE_LABEL: Record<string, string> = {
  medical_representative: "Medical Representative",
  mr: "Medical Representative",
  doctor: "Doctor",
  clinic_staff: "Clinic Staff",
  admin: "Admin",
}

function initials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("")
}

type VerifiedProfile = {
  verified: true
  user: { id: string | number; name: string; email: string; role: string }
}
type UnverifiedProfile = { verified: false; error?: string }
type ProfileResult = VerifiedProfile | UnverifiedProfile

/**
 * Clicking a name in an audit/edit-history entry opens this card.
 * It re-fetches the account fresh from the user directory by ID rather than
 * trusting the name/email text stored on the history entry — so the badge
 * reflects a real, currently-registered account, not just whatever text was
 * submitted at edit time.
 */
export function EditorProfile({
  userId,
  name,
  role,
}: {
  userId: string | number
  name: string
  role: string
}) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<ProfileResult | null>(null)

  async function handleOpenChange(next: boolean) {
    setOpen(next)
    if (next && !result) {
      setLoading(true)
      try {
        const res = await fetch(`/api/users/${userId}`)
        const data = await res.json()
        setResult(res.ok ? data : { verified: false, error: data.error });
      } catch {
        setResult({ verified: false, error: "Could not reach the account directory." })
      } finally {
        setLoading(false)
      }
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger
        render={
          <button
            type="button"
            className="font-semibold text-gray-700 hover:text-blue-700 hover:underline decoration-dotted underline-offset-2"
          >
            {name}
          </button>
        }
      />
      <DialogContent className="max-w-sm">
        <DialogHeader className="items-center sm:items-center">
          <DialogTitle>Editor profile</DialogTitle>
          <DialogDescription>
            Verified against MedConnect India&apos;s account directory
          </DialogDescription>
        </DialogHeader>

        {loading && (
          <div className="flex flex-col items-center gap-3 py-4 animate-pulse">
            <div className="h-14 w-14 rounded-full bg-muted" />
            <div className="h-3 w-32 rounded bg-muted" />
            <div className="h-3 w-40 rounded bg-muted" />
          </div>
        )}

        {!loading && result?.verified && (
          <div className="flex flex-col items-center gap-2 py-2 text-center">
            <Avatar size="lg" className="size-14">
              <AvatarFallback className="text-base font-semibold text-blue-700 bg-blue-100">
                {initials(result.user.name)}
              </AvatarFallback>
            </Avatar>
            <p className="text-base font-bold text-slate-900">{result.user.name}</p>
            <p className="text-sm text-slate-500">{result.user.email}</p>
            <Badge className="bg-blue-100 text-blue-700">
              {ROLE_LABEL[result.user.role] ?? result.user.role}
            </Badge>
            <div className="mt-2 flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700">
              <ShieldCheck className="h-3.5 w-3.5" />
              Verified MedConnect India account
            </div>
            <p className="text-xs text-slate-400 mt-1">Account ID: {result.user.id}</p>
          </div>
        )}

        {!loading && result && !result.verified && (
          <div className="flex flex-col items-center gap-2 py-4 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-red-100">
              <ShieldAlert className="h-7 w-7 text-red-600" />
            </div>
            <p className="text-sm font-semibold text-red-700">
              Could not verify &quot;{name}&quot;
            </p>
            <p className="text-xs text-slate-500 max-w-[240px]">
              {result.error ??
                "This edit is not linked to any account currently in the directory. Treat this update with caution."}
            </p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
