import type { NextAuthConfig } from "next-auth";
import { homeFor, rolesWith } from "@/lib/roles";

// Edge-safe config (no Prisma import) shared by proxy.ts and auth.ts
export const authConfig = {
  // Self-hosted / localhost production runs (next start) need this; Vercel
  // sets the host itself. Dev mode always trusts localhost.
  trustHost: true,
  pages: { signIn: "/login" },
  session: { strategy: "jwt" },
  providers: [],
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        token.id = (user as { id?: string }).id;
        token.role = (user as { role?: string }).role;
      }
      return token;
    },
    session({ session, token }) {
      if (session.user) {
        (session.user as { id?: string }).id = token.id as string;
        (session.user as { role?: string }).role = token.role as string;
      }
      return session;
    },
    authorized({ auth, request }) {
      const { pathname } = request.nextUrl;
      if (!auth?.user) return false; // not signed in -> redirected to /login
      const role = (auth.user as { role?: string }).role ?? "";
      if (pathname.startsWith("/admin") && role !== "admin") {
        return Response.redirect(new URL("/dashboard", request.nextUrl));
      }
      // Role-gated dashboards: a pasted/bookmarked URL for another role's
      // dashboard silently lands you on YOUR home instead of an error page.
      if (pathname.startsWith("/dashboard/mr") && !rolesWith("plan_visits").includes(role)) {
        return Response.redirect(new URL(homeFor(role), request.nextUrl));
      }
      if (pathname.startsWith("/dashboard/doctor") && !rolesWith("share_day_plan").includes(role)) {
        return Response.redirect(new URL(homeFor(role), request.nextUrl));
      }
      return true;
    },
  },
} satisfies NextAuthConfig;
