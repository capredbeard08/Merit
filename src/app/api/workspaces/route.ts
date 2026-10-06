import { NextResponse } from "next/server";
import { normalizeEmail } from "@/lib/auth";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);

  if (!body || typeof body.name !== "string" || typeof body.email !== "string") {
    return NextResponse.json({ error: "Workspace name and email are required" }, { status: 400 });
  }

  const name = body.name.trim();
  const email = normalizeEmail(body.email);

  if (name.length < 2 || name.length > 120) {
    return NextResponse.json({ error: "Invalid workspace name" }, { status: 400 });
  }

  if (!email.includes("@") || email.length > 320) {
    return NextResponse.json({ error: "Invalid email" }, { status: 400 });
  }

  return NextResponse.json({
    accepted: true,
    next: "authentication_required",
    workspace: { name, ownerEmail: email },
  }, { status: 202 });
}
