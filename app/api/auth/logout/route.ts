import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import {
  appUrl,
  cookieOptions,
  missingConfig,
  isDemo,
  SESSION_COOKIE,
} from "@/lib/auth";
import { sameOrigin } from "@/lib/security";

export async function POST(request: NextRequest) {
  if (
    (!isDemo() && missingConfig().length) ||
    !sameOrigin(request.headers.get("origin"), appUrl())
  )
    return NextResponse.json(
      { error: "허용되지 않은 요청입니다." },
      { status: 403 },
    );
  (await cookies()).set(SESSION_COOKIE, "", cookieOptions(0));
  return NextResponse.redirect(new URL("/", appUrl()), 303);
}
