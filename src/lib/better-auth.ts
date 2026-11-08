import { createHash } from "node:crypto";
import { betterAuth } from "better-auth";
import { after } from "next/server";
import { captcha, twoFactor } from "better-auth/plugins";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { prisma } from "@/lib/prisma";
import { passwordResetEmailHtml, sendEmail, verificationEmailHtml } from "@/lib/email";

const secret = process.env.AUTH_SECRET;
if (!secret || secret.length < 32) {
  throw new Error("AUTH_SECRET must be at least 32 characters");
}

const captchaSecret = process.env.RECAPTCHA_SECRET_KEY;
const emailVerificationEnabled = process.env.MERIT_EMAIL_VERIFICATION_ENABLED === "true";
if (!captchaSecret) {
  throw new Error("RECAPTCHA_SECRET_KEY must be configured");
}

export const auth = betterAuth({
  secret,
  appName: "MERIT",
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
    requireEmailVerification: emailVerificationEnabled,
    minPasswordLength: 12,
    maxPasswordLength: 128,
    resetPasswordTokenExpiresIn: 60 * 60,
    revokeSessionsOnPasswordReset: true,
    sendResetPassword: async ({ user, url, token }) => {
      after(async () => {
        await sendEmail({
          to: user.email,
          subject: "Reset your MERIT password",
          html: passwordResetEmailHtml(url),
          idempotencyKey: "merit-password-reset-" + createHash("sha256").update(token).digest("hex").slice(0, 24),
        });
      });
    },
  },
  emailVerification: {
    sendVerificationEmail: async ({ user, url, token }) => {
      after(async () => {
        await sendEmail({
          to: user.email,
          subject: "Verify your MERIT email address",
          html: verificationEmailHtml(url),
          idempotencyKey: "merit-email-verification-" + createHash("sha256").update(token).digest("hex").slice(0, 24),
        });
      });
    },
    // Enable only after the Resend sender is verified and the full delivery
    // and callback journey has passed in staging. Keep false by default.
    sendOnSignUp: emailVerificationEnabled,
    sendOnSignIn: false,
    autoSignInAfterVerification: true,
  },
  // The CI integration suite exercises real Better Auth sign-up/session
  // issuance without making external reCAPTCHA network calls. This explicit
  // test-only switch is set only on that CI step and must never be configured
  // in a deployed environment.
  plugins: [
    ...(process.env.MERIT_CI_AUTH_TESTS === "true" ? [] : [
      captcha({
        provider: "google-recaptcha",
        secretKey: captchaSecret,
        minScore: 0.5,
      }),
    ]),
    twoFactor({
      issuer: "MERIT",
      backupCodeOptions: { storeBackupCodes: "encrypted" },
    }),
  ],
  session: {
    expiresIn: 60 * 60 * 24 * 30,
    updateAge: 60 * 60 * 24,
  },
});
