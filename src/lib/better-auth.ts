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

const trustedOrigins = [
  process.env.BETTER_AUTH_URL,
  process.env.NEXT_PUBLIC_APP_URL,
  "https://merit-capredbeard08.vercel.app",
  "https://merit-git-main-capredbeard08.vercel.app",
  "https://merit-olive.vercel.app",
  "https://merit-git-security-remediation-phase-1-capredbeard08.vercel.app",
  "https://merit-qmi40m6le-capredbeard08.vercel.app",
  "https://merit-29vvlita4-capredbeard08.vercel.app",
  "https://merit-mh7b9v2rj-capredbeard08.vercel.app",
  "https://merit-8q9b8dryg-capredbeard08.vercel.app",
].filter((origin): origin is string => Boolean(origin));

const previewCaptchaDisabled = process.env.VERCEL_ENV === "preview";
const captchaSecret = process.env.RECAPTCHA_SECRET_KEY;
if (!previewCaptchaDisabled && !captchaSecret) {
  throw new Error("RECAPTCHA_SECRET_KEY must be configured");
}

export const auth = betterAuth({
  secret,
  database: prismaAdapter(prisma, {
    provider: "postgresql",
  }),
  emailAndPassword: {
    enabled: true,
    // Temporary pilot configuration: email verification is disabled until
    // a verified sending domain is configured. Restore this before broad launch.
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
    // Keep email delivery dormant until the sender domain is verified.
    sendOnSignUp: false,
    sendOnSignIn: false,
    autoSignInAfterVerification: true,
  },
  // CAPTCHA remains mandatory in production. Preview deployments bypass it so
  // reviewers can authenticate on ephemeral Vercel hostnames not allowlisted
  // by Google's reCAPTCHA domain configuration.
  plugins: previewCaptchaDisabled ? [] : [
    captcha({
      provider: "google-recaptcha",
      secretKey: captchaSecret!,
      minScore: 0.5,
    }),
  ],
  session: {
    expiresIn: 60 * 60 * 24 * 30,
    updateAge: 60 * 60 * 24,
  },
  trustedOrigins,
});
