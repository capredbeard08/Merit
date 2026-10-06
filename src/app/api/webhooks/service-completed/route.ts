import { NextResponse } from "next/server";
import { serviceCompletedEventSchema } from "@/lib/security";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = serviceCompletedEventSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid event payload" }, { status: 400 });
  }

  if (!parsed.data.consent.feedbackContact) {
    return NextResponse.json({ accepted: false, reason: "feedback_contact_not_consented" }, { status: 202 });
  }

  return NextResponse.json({ accepted: true, eventId: parsed.data.eventId }, { status: 202 });
}
