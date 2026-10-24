import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { prisma } from "@/lib/prisma";

const secret = process.env.AUTH_SECRET;
if (!secret || secret.length < 32) {
  throw new Error("AUTH_SECRET must be at least 32 characters");
}

export const auth = betterAuth({
  secret,
  // Resolve the auth base URL from the incoming host, but only for MERIT-owned
  // Vercel hostnames. This supports new preview deployment URLs without
  // manually updating the list for every deployment.
  baseURL: {
    allowedHosts: [
      "merit-olive.vercel.app",
      "merit-capredbeard08.vercel.app",
      "merit-git-main-capredbeard08.vercel.app",
      "merit-*-capredbeard08.vercel.app",
    ],
    protocol: "https",
    fallback: "https://merit-olive.vercel.app",
  },
  database: prismaAdapter(prisma, {
    provider: "postgresql",
  }),
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: false,
    minPasswordLength: 12,
    maxPasswordLength: 128,
  },
  session: {
    expiresIn: 60 * 60 * 24 * 30,
    updateAge: 60 * 60 * 24,
  },
});
