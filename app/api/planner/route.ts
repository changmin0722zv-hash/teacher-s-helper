import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { appUrl, getSession } from "@/lib/auth";
import { plannerSchema } from "@/lib/planner";
import { sameOrigin } from "@/lib/security";
import { isDemo } from "@/lib/auth";
import { dbConfigured } from "@/lib/cloud-db";
import { changesSchema, applyChanges } from "@/lib/planner-sync";
import { storageFailure } from "@/lib/storage-error";
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
  if (dbConfigured() && !isDemo()) {
    const e = storageFailure(error);
    return reply({ error: e.message }, e.status);
  }
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
export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session) return reply({ error: "로그인이 필요합니다." }, 401);
  try {
    const snapshot = await readPlanner(session.token);
    if (
      !isDemo() &&
      dbConfigured() &&
      request.nextUrl.searchParams.has("page")
    ) {
      const page = Number(request.nextUrl.searchParams.get("page"));
      if (!Number.isSafeInteger(page) || page < 0)
        return reply({ error: "잘못된 페이지입니다." }, 400);
      const expected = request.nextUrl.searchParams.get("revision");
      if (expected && expected !== snapshot.sha)
        return reply(
          { error: "불러오는 동안 기록이 변경되었습니다. 다시 불러와 주세요." },
          409,
        );
      const rows = [
        ...snapshot.data.lessons.map((x) => ({ kind: "lessons", value: x })),
        ...snapshot.data.units.map((x) => ({ kind: "units", value: x })),
        ...(snapshot.data.timetable || []).map((x) => ({
          kind: "timetable",
          value: x,
        })),
      ];
      const data: {
        schemaVersion: 1;
        lessons: unknown[];
        units: unknown[];
        timetable: unknown[];
      } = { schemaVersion: 1, lessons: [], units: [], timetable: [] };
      let index = page,
        bytes = 0;
      for (; index < rows.length; index++) {
        const r = rows[index],
          size = Buffer.byteLength(JSON.stringify(r));
        if (index > page && bytes + size > 2500000) break;
        if (index - page >= 100) break;
        data[r.kind as "lessons" | "units" | "timetable"].push(r.value);
        bytes += size;
      }
      return reply({
        data,
        sha: snapshot.sha,
        backend: "database",
        nextPage: index < rows.length ? index : null,
      });
    }
    return reply(snapshot);
  } catch (error) {
    return failure(error);
  }
}
export async function PUT(request: NextRequest) {
  const session = await getSession();
  if (!session) return reply({ error: "로그인이 필요합니다." }, 401);
  if (!sameOrigin(request.headers.get("origin"), appUrl()))
    return reply({ error: "허용되지 않은 요청입니다." }, 403);
  if (!isDemo() && dbConfigured())
    return reply(
      {
        error:
          "클라우드 저장 방식이 변경되었습니다. 페이지를 새로고침해 주세요.",
      },
      409,
    );
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
export async function PATCH(request: NextRequest) {
  const session = await getSession();
  if (!session) return reply({ error: "로그인이 필요합니다." }, 401);
  if (!sameOrigin(request.headers.get("origin"), appUrl()))
    return reply({ error: "허용되지 않은 요청입니다." }, 403);
  const raw = await request.text();
  if (Buffer.byteLength(raw) > 3000000)
    return reply(
      { error: "한 번에 변경할 내용이 너무 큽니다. 나누어 저장해 주세요." },
      413,
    );
  try {
    const parsed = z
      .object({
        sha: z.string().regex(/^[a-f0-9]{40,64}$/),
        changes: changesSchema,
      })
      .strict()
      .safeParse(JSON.parse(raw));
    if (!parsed.success)
      return reply(
        {
          error:
            parsed.error.issues[0]?.message || "입력 내용을 확인해 주세요.",
        },
        400,
      );
    const current = await readPlanner(session.token);
    if (current.sha !== parsed.data.sha)
      return reply(
        {
          error:
            "다른 곳에서 변경된 내용이 있습니다. 최신 내용을 불러온 뒤 다시 저장해 주세요.",
        },
        409,
      );
    const checked = plannerSchema.safeParse(
      applyChanges(current.data, parsed.data.changes),
    );
    if (!checked.success)
      return reply({ error: checked.error.issues[0]?.message }, 400);
    const result = await savePlanner(session.token, checked.data, current.sha);
    return reply({ sha: result.sha, backend: result.backend });
  } catch (error) {
    if (error instanceof SyntaxError)
      return reply({ error: "올바른 JSON 형식이 아닙니다." }, 400);
    return failure(error);
  }
}
