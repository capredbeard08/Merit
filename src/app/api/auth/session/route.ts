import { NextResponse } from "next/server";
import { COOKIE_NAME, verifySession } from "@/lib/session";

export async function GET(request: Request) {
  const token = request.headers.get("cookie")?.match(
    new RegExp(`(?:^|; )${COOKIE_NAME}=([^;]+)`)
  )?.[1];

  if (!token) {
    return NextResponse.json({ authenticated: false }, { status: 401 });
  }

  const session = verifySession(decodeURIComponent(token));
  if (!session) {
    return NextResponse.json({ authenticated: false }, { status: 401 });
  }

  return NextResponse.json({
    authenticated: true,
    user: {
      id: session.sub,
      workspaceId: session.workspaceId,
      email: session.email,
      role: session.role,
    },
  });
}
