import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSession, appUrl } from "@/lib/auth";
import { sameOrigin } from "@/lib/security";
import {
  filtersSchema,
  classificationSchema,
  resourceSchema,
  savedSearchSchema,
} from "@/lib/library-model";
import {
  getLibraryItem,
  searchLibrary,
  saveLibraryItem,
  savedSearches,
} from "@/lib/library-store";
import { storageFailure } from "@/lib/storage-error";
export const dynamic = "force-dynamic";
const reply = (value: unknown, status = 200) =>
  NextResponse.json(value, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return reply({ error: "로그인이 필요합니다." }, 401);
  try {
    const p = req.nextUrl.searchParams;
    if (p.get("searches") === "true")
      return reply({ searches: await savedSearches("list") });
    if (p.has("id")) {
      const id = z.string().uuid().parse(p.get("id"));
      const version = p.get("version") || undefined;
      if (version && !/^[a-f0-9]{40,64}$/.test(version))
        return reply({ error: "잘못된 버전입니다." }, 400);
      return reply(await getLibraryItem(session.token, id, version));
    }
    const page = z.coerce
      .number()
      .int()
      .min(0)
      .max(100000)
      .parse(p.get("page") || 0);
    const f = filtersSchema.parse(Object.fromEntries(p));
    return reply(await searchLibrary(session.token, f, page));
  } catch (error) {
    if (error instanceof z.ZodError)
      return reply({ error: "검색 조건을 확인해 주세요." }, 400);
    const e = storageFailure(error);
    return reply({ error: e.message }, e.status);
  }
}
export async function POST(req: NextRequest) {
  return write(req);
}
export async function PUT(req: NextRequest) {
  return write(req);
}
async function write(req: NextRequest) {
  const session = await getSession();
  if (!session) return reply({ error: "로그인이 필요합니다." }, 401);
  if (!sameOrigin(req.headers.get("origin"), appUrl()))
    return reply({ error: "허용되지 않은 요청입니다." }, 403);
  try {
    const raw = await req.text();
    if (Buffer.byteLength(raw) > 1000000)
      return reply({ error: "자료가 너무 큽니다." }, 413);
    const body = JSON.parse(raw);
    if (req.method === "POST") {
      const p = z
        .discriminatedUnion("action", [
          z
            .object({
              action: z.literal("save-search"),
              search: savedSearchSchema,
            })
            .strict(),
          z
            .object({
              action: z.literal("delete-search"),
              id: z.string().uuid(),
            })
            .strict(),
        ])
        .parse(body);
      return reply({
        searches:
          p.action === "save-search"
            ? await savedSearches("save", p.search)
            : await savedSearches("delete", undefined, p.id),
      });
    }
    const p = z
      .object({
        id: z.string().uuid(),
        version: z.string().regex(/^$|^[a-f0-9]{40,64}$/),
        classification: classificationSchema,
        resource: resourceSchema.optional(),
      })
      .strict()
      .parse(body);
    return reply(
      await saveLibraryItem(
        session.token,
        p.id,
        p.version,
        p.classification,
        p.resource,
      ),
    );
  } catch (error) {
    if (error instanceof z.ZodError)
      return reply({ error: error.issues[0]?.message }, 400);
    if (error instanceof SyntaxError)
      return reply({ error: "올바른 JSON 형식이 아닙니다." }, 400);
    const e = storageFailure(error);
    return reply({ error: e.message }, e.status);
  }
}
