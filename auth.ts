import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { authConfig } from "@/auth.config";
import { ROLE_TO_UI } from "@/lib/roles";
import { rateLimit, rateLimitReset } from "@/lib/rate-limit";

// Brute-force guard: 5 failed attempts per email per 5 minutes.
const LOGIN_LIMIT = 5;
const LOGIN_WINDOW_MS = 5 * 60 * 1000;

export const { handlers, signIn, signOut, auth } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      credentials: { email: {}, password: {} },
      authorize: async (credentials) => {
        const email = String(credentials?.email ?? "").toLowerCase().trim().slice(0, 120);
        const password = String(credentials?.password ?? "");
        if (!email || !password) return null;

        // Too many recent attempts for this email → fail without touching the DB.
        // (Same generic "invalid credentials" shown to the user — no info leak.)
        if (!rateLimit(`login:${email}`, LOGIN_LIMIT, LOGIN_WINDOW_MS)) return null;

        const user = await prisma.user.findUnique({ where: { email } });
        if (!user) return null;

        const isValid = await bcrypt.compare(password, user.password);
        if (!isValid) return null;

        rateLimitReset(`login:${email}`); // successful login clears the counter

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          role: ROLE_TO_UI[user.role],
        };
      },
    }),
  ],
});
