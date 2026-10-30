import { createHash } from "node:crypto";
import { betterAuth } from "better-auth";
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
  "https://merit-qmi40m6le-capredbeard08.vercel.app",
  "https://merit-29vvlita4-capredbeard08.vercel.app",
  "https://merit-mh7b9v2rj-capredbeard08.vercel.app",
  "https://merit-8q9b8dryg-capredbeard08.vercel.app",
].filter((origin): origin is string => Boolean(origin));

export const auth = betterAuth({
  secret,
  database: prismaAdapter(prisma, {
    provider: "postgresql",
  }),
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: true,
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
    sendOnSignUp: true,
    sendOnSignIn: true,
    autoSignInAfterVerification: true,
  },
  session: {
    expiresIn: 60 * 60 * 24 * 30,
    updateAge: 60 * 60 * 24,
  },
  trustedOrigins,
});
