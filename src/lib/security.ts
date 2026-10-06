import { z } from "zod";

export const serviceCompletedEventSchema = z.object({
  eventId: z.string().min(8).max(128),
  workspaceId: z.string().min(1).max(128),
  branchId: z.string().min(1).max(128),
  occurredAt: z.string().datetime(),
  customer: z.object({
    externalId: z.string().min(1).max(256),
    email: z.string().email().max(320).optional(),
    phone: z.string().max(32).optional(),
    name: z.string().max(200).optional(),
  }),
  service: z.object({
    externalId: z.string().max(256).optional(),
    completedAt: z.string().datetime(),
    type: z.string().max(200).optional(),
  }),
  consent: z.object({
    feedbackContact: z.boolean(),
    recordedAt: z.string().datetime(),
  }),
});

export type ServiceCompletedEvent = z.infer<typeof serviceCompletedEventSchema>;

export function redactEmail(email?: string) {
  if (!email) return undefined;
  const parts = email.split("@");
  if (parts.length !== 2) return "[redacted]";
  return parts[0].slice(0, 1) + "***@" + parts[1];
}
