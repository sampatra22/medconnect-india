import type { NextConfig } from "next";

// Security headers applied to every response.
const securityHeaders = [
  // Never let browsers guess content types (blocks MIME-sniffing attacks).
  { key: "X-Content-Type-Options", value: "nosniff" },
  // Disallow embedding the app in iframes (clickjacking protection).
  { key: "X-Frame-Options", value: "DENY" },
  // Send only the origin as referrer to other sites.
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // We don't use camera/mic/geolocation from the browser (yet — maps come later).
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  // Opt out of Chrome's ad-tracking cohorts.
  { key: "X-DNS-Prefetch-Control", value: "on" },
];

const nextConfig: NextConfig = {
  poweredByHeader: false, // don't advertise the framework/version
  async headers() {
    return [{ source: "/(.*)", headers: securityHeaders }];
  },
};

export default nextConfig;
