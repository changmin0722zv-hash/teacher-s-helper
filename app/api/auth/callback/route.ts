import { timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import {
  appUrl,
  cookieOptions,
  missingConfig,
  setSession,
  STATE_COOKIE,
} from "@/lib/auth";
import { githubFetch } from "@/lib/storage";

export async function GET(request: NextRequest) {
  if (missingConfig().length)
    return NextResponse.json(
      { error: "로그인 환경 설정이 필요합니다." },
      { status: 503 },
    );
  const jar = await cookies();
  const stored = jar.get(STATE_COOKIE)?.value;
  jar.set(STATE_COOKIE, "", cookieOptions(0));
  const state = request.nextUrl.searchParams.get("state");
  const code = request.nextUrl.searchParams.get("code");
  const fail = () => NextResponse.redirect(new URL("/?auth_error=1", appUrl()));
  if (
    !stored ||
    !state ||
    !code ||
    !/^[a-f0-9]{64}$/.test(stored) ||
    !/^[a-f0-9]{64}$/.test(state) ||
    !timingSafeEqual(Buffer.from(stored), Buffer.from(state))
  )
    return fail();
  try {
    const response = await fetch(
      "https://github.com/login/oauth/access_token",
      {
        method: "POST",
        cache: "no-store",
        signal: AbortSignal.timeout(15000),
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          client_id: process.env.GITHUB_CLIENT_ID,
          client_secret: process.env.GITHUB_CLIENT_SECRET,
          code,
          redirect_uri: appUrl() + "/api/auth/callback",
        }),
      },
    );
    if (!response.ok) return fail();
    const token = await response.json();
    if (typeof token.access_token !== "string" || !token.access_token)
      return fail();
    const userResponse = await githubFetch(
      "https://api.github.com/user",
      token.access_token,
    );
    if (!userResponse.ok) return fail();
    const user = await userResponse.json();
    if (String(user.id) !== process.env.GITHUB_ALLOWED_USER_ID) return fail();
    await setSession({
      userId: String(user.id),
      login: user.login,
      token: token.access_token,
      expires: Date.now() + 8 * 3600000,
    });
    return NextResponse.redirect(new URL("/", appUrl()));
  } catch {
    return fail();
  }
}
