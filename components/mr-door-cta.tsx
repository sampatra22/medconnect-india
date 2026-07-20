"use client";

import Link from "next/link";
import { useSession } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { homeFor } from "@/lib/roles";

// The homepage's "Medical Representative?" call to action. Same class of bug
// as the header: it invited an already-signed-in MR to log in again. Signed
// in, the useful offer is the way to their own dashboard.
export function MrDoorCta() {
  const { data: session, status } = useSession();
  const user = session?.user as { role?: string } | undefined;

  if (status === "loading") {
    return <div className="h-9 w-32 rounded-lg bg-slate-200 animate-pulse" aria-hidden />;
  }

  return (
    <Button
      className="bg-emerald-600 hover:bg-emerald-700 shrink-0"
      nativeButton={false}
      render={<Link href={user ? homeFor(user.role ?? "") : "/login"} />}
    >
      {user ? "Go to my dashboard →" : "MR Login →"}
    </Button>
  );
}
