import { NextResponse } from "next/server";
import { auth } from "@/auth";

export type SessionUser = {
  id: string;
  name?: string | null;
  email?: string | null;
  role: string;
};

// Returns the signed-in user, or a ready-to-return 401/403 response.
export async function requireUser(allowedRoles?: string[]) {
  const session = await auth();
  const user = session?.user as SessionUser | undefined;

  if (!user?.id) {
    return {
      user: null,
      response: NextResponse.json({ error: "Please sign in first." }, { status: 401 }),
    };
  }
  if (allowedRoles && !allowedRoles.includes(user.role)) {
    return {
      user: null,
      response: NextResponse.json(
        { error: "You do not have permission to do this." },
        { status: 403 }
      ),
    };
  }
  return { user, response: null };
}
