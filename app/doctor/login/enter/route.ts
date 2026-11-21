import { NextResponse } from "next/server";
import { signInOpen } from "@/lib/auth";

// Without REQUIRE_PASSWORD the login page lands here: the session is set and
// the visitor moves on. It must be a route, since only a route can set a cookie.
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const ok = await signInOpen("doctor");
  return NextResponse.redirect(new URL(ok ? "/doctor" : "/doctor/login?error=1", request.url));
}
