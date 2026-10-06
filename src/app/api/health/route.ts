import { NextResponse } from "next/server";

export function GET() {
  return NextResponse.json({ ok: true, service: "merit", timestamp: new Date().toISOString() });
}
