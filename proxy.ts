import NextAuth from "next-auth";
import { authConfig } from "@/auth.config";

// Gates every matched path through NextAuth's `authorized` callback.
export default NextAuth(authConfig).auth;

export const config = {
  matcher: ["/dashboard/:path*", "/admin/:path*", "/welcome", "/account"],
};
