import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { appUrl, cookieOptions, missingConfig, STATE_COOKIE } from "@/lib/auth";

export async function GET() {
  if (missingConfig().length)
    return NextResponse.json(
      { error: "로그인 환경 설정이 필요합니다." },
      { status: 503 },
    );
  const state = randomBytes(32).toString("hex");
  (await cookies()).set(STATE_COOKIE, state, cookieOptions(600));
  const url = new URL("https://github.com/login/oauth/authorize");
  url.searchParams.set("client_id", process.env.GITHUB_CLIENT_ID!);
  url.searchParams.set("redirect_uri", appUrl() + "/api/auth/callback");
  url.searchParams.set("scope", "repo");
  url.searchParams.set("state", state);
  return NextResponse.redirect(url);
}
