import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  AUTH_SECRET: z.string().min(32),
  BETTER_AUTH_URL: z.string().url(),
  NEXT_PUBLIC_APP_URL: z.string().url(),
  EMAIL_FROM: z.string().min(3),
  CRON_SECRET: z.string().min(32),
  AI_PROVIDER_API_KEY: z.string().optional(),
  EMAIL_PROVIDER_API_KEY: z.string().optional(),
});

export const env = envSchema.parse({
  DATABASE_URL: process.env.DATABASE_URL,
  AUTH_SECRET: process.env.AUTH_SECRET,
  BETTER_AUTH_URL: process.env.BETTER_AUTH_URL,
  NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
  EMAIL_FROM: process.env.EMAIL_FROM,
  CRON_SECRET: process.env.CRON_SECRET,
  AI_PROVIDER_API_KEY: process.env.AI_PROVIDER_API_KEY || undefined,
  EMAIL_PROVIDER_API_KEY: process.env.EMAIL_PROVIDER_API_KEY || undefined,
});

export const WEBHOOK_MAX_BODY_BYTES = 256 * 1024;
export const WEBHOOK_MAX_AGE_SECONDS = 24 * 60 * 60;
export const WEBHOOK_MAX_FUTURE_SECONDS = 5 * 60;
