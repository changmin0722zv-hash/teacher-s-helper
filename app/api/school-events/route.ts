import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { fetchSchoolYear } from "@/lib/neis";
export const dynamic = "force-dynamic";
const reply = (body: unknown, status = 200) =>
  NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
export async function GET(request: NextRequest) {
  if (!(await getSession()))
    return reply({ error: "로그인이 필요합니다." }, 401);
  const value = request.nextUrl.searchParams.get("year") || "";
  if (!/^20\d{2}$/.test(value))
    return reply({ error: "조회 연도를 확인해 주세요." }, 400);
  const key = process.env.NEIS_API_KEY;
  if (!key)
    return reply(
      {
        code: "NEIS_KEY_MISSING",
        error: "학교 일정 연결 대기 · 나이스 인증키 설정이 필요합니다.",
      },
      503,
    );
  try {
    return reply(await fetchSchoolYear(Number(value), key));
  } catch {
    // Never expose upstream URLs, credentials, or raw API errors.
    return reply(
      {
        error:
          "학교 일정을 갱신하지 못했습니다. 나이스 연결·인증키·이용 한도를 확인해 주세요. 마지막으로 받은 일정은 유지됩니다.",
      },
      502,
    );
  }
}
