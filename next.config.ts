import type { NextConfig } from "next";

const isDevelopment = process.env.NODE_ENV !== "production";
const scriptSources = isDevelopment ? "'self' 'unsafe-inline' 'unsafe-eval' https://www.google.com/recaptcha/ https://www.gstatic.com/recaptcha/" : "'self' 'unsafe-inline' https://www.google.com/recaptcha/ https://www.gstatic.com/recaptcha/";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  async headers() {
    return [{
      source: "/(.*)",
      headers: [
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        { key: "X-Frame-Options", value: "DENY" },
        { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        { key: "Content-Security-Policy", value: `default-src 'self'; object-src 'none'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; script-src ${scriptSources}; connect-src 'self' https:; frame-src https://www.google.com/recaptcha/; font-src 'self' data:; frame-ancestors 'none'; base-uri 'self'; form-action 'self'` },
      ],
    }];
  },
};

export default nextConfig;
