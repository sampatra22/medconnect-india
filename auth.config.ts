import type { NextAuthConfig } from "next-auth";

// Edge-safe config (no Prisma import) shared by proxy.ts and auth.ts
export const authConfig = {
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
      const role = (auth.user as { role?: string }).role;
      if (pathname.startsWith("/admin") && role !== "admin") {
        return Response.redirect(new URL("/dashboard", request.nextUrl));
      }
      return true;
    },
  },
} satisfies NextAuthConfig;
