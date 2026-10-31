import { createHash } from "node:crypto";
import { betterAuth } from "better-auth";
import { captcha } from "better-auth/plugins";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { prisma } from "@/lib/prisma";
import { sendEmail } from "@/lib/email";

const secret = process.env.AUTH_SECRET;
if (!secret || secret.length < 32) {
  throw new Error("AUTH_SECRET must be at least 32 characters");
}

const captchaSecret = process.env.RECAPTCHA_SECRET_KEY;
if (!captchaSecret) {
  throw new Error("RECAPTCHA_SECRET_KEY must be configured");
}

export const auth = betterAuth({
  secret,
  // Resolve each request against a strict MERIT-owned hostname allowlist.
  // Better Auth 1.7.x adds allowedHosts to trustedOrigins automatically.
  // Vercel rewrites the public host, so trustedProxyHeaders is not required.
  baseURL: {
    allowedHosts: [
      "merit-olive.vercel.app",
      "merit-capredbeard08.vercel.app",
      "merit-git-main-capredbeard08.vercel.app",
      "merit-*-capredbeard08.vercel.app",
      ...(process.env.NODE_ENV === "development" ? ["localhost:3000"] : []),
    ],
    protocol: process.env.NODE_ENV === "development" ? "http" : "https",
    fallback: "https://merit-olive.vercel.app",
  },
  database: prismaAdapter(prisma, {
    provider: "postgresql",
  }),
  emailAndPassword: {
    enabled: true,
    // Keep the pilot behavior explicit until the verified sender domain and
    // complete verification journey have been confirmed end to end.
    requireEmailVerification: false,
    minPasswordLength: 12,
    maxPasswordLength: 128,
  },
  emailVerification: {
    sendVerificationEmail: async ({ user, url, token }) => {
      const safeUrl = url.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
      await sendEmail({
        to: user.email,
        subject: "Verify your MERIT email address",
        html: `<div style="font-family:Arial,sans-serif;color:#173b2f;line-height:1.6"><h2>Verify your email</h2><p>Confirm your email address to finish setting up your MERIT account.</p><p><a href="${safeUrl}" style="display:inline-block;padding:12px 18px;background:#173b2f;color:#fff;text-decoration:none;border-radius:8px">Verify email address</a></p><p>If you did not create this account, you can ignore this message.</p></div>`,
        idempotencyKey: "merit-email-verification-" + createHash("sha256").update(token).digest("hex").slice(0, 24),
      });
    },
    // Deliberately dormant until EMAIL_FROM is a verified sender and delivery
    // plus callback behavior are tested. Do not claim email verification is enforced.
    sendOnSignUp: false,
    sendOnSignIn: false,
    autoSignInAfterVerification: true,
  },
  plugins: [
    captcha({
      provider: "google-recaptcha",
      secretKey: captchaSecret,
      minScore: 0.5,
    }),
  ],
  session: {
    expiresIn: 60 * 60 * 24 * 30,
    updateAge: 60 * 60 * 24,
  },
});
