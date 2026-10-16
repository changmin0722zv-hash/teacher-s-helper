import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { appUrl, getSession } from "@/lib/auth";
import { plannerSchema } from "@/lib/planner";
import { sameOrigin } from "@/lib/security";
import {
  MAX_DATA_BYTES,
  readPlanner,
  savePlanner,
  StorageError,
} from "@/lib/storage";

export const dynamic = "force-dynamic";
const reply = (body: unknown, status = 200) =>
  NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
function failure(error: unknown) {
  return error instanceof StorageError
    ? reply({ error: error.message }, error.status)
    : reply(
        {
          error:
            "데이터를 처리하지 못했습니다. 연결과 저장소 파일 형식을 확인해 주세요.",
        },
        502,
      );
}
export async function GET() {
  const session = await getSession();
  if (!session) return reply({ error: "로그인이 필요합니다." }, 401);
  try {
    return reply(await readPlanner(session.token));
  } catch (error) {
    return failure(error);
  }
}
export async function PUT(request: NextRequest) {
  const session = await getSession();
  if (!session) return reply({ error: "로그인이 필요합니다." }, 401);
  if (!sameOrigin(request.headers.get("origin"), appUrl()))
    return reply({ error: "허용되지 않은 요청입니다." }, 403);
  const raw = await request.text();
  if (Buffer.byteLength(raw) > MAX_DATA_BYTES + 10000)
    return reply({ error: "데이터가 너무 큽니다." }, 413);
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return reply({ error: "올바른 JSON 형식이 아닙니다." }, 400);
  }
  const parsed = z
    .object({ data: plannerSchema, sha: z.string().regex(/^[a-f0-9]{40,64}$/) })
    .strict()
    .safeParse(body);
  if (!parsed.success)
    return reply(
      {
        error: parsed.error.issues[0]?.message || "입력 내용을 확인해 주세요.",
      },
      400,
    );
  try {
    return reply(
      await savePlanner(session.token, parsed.data.data, parsed.data.sha),
    );
  } catch (error) {
    return failure(error);
  }
}
