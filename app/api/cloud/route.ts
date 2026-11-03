import { NextRequest, NextResponse } from "next/server";
import { getSession, isDemo, appUrl } from "@/lib/auth";
import { sameOrigin } from "@/lib/security";
import { dbConfigured, dbQuery, ensureDb } from "@/lib/cloud-db";
import { migrateCloud, checkCloud } from "@/lib/cloud-storage";
import { freezeGitHub, readGitHubSource } from "@/lib/storage";
import { storageFailure } from "@/lib/storage-error";

export const dynamic = "force-dynamic";
// Non-sensitive readiness only: no record contents, counts, IDs, or credentials.
export async function GET() {
  if (!dbConfigured())
    return NextResponse.json(
      { storage: "github", status: "legacy" },
      { headers: { "Cache-Control": "no-store" } },
    );
  try {
    const [row] = await dbQuery()("SELECT active FROM teaching_state WHERE id");
    return NextResponse.json(
      {
        storage: "database",
        status: row?.active ? "ready" : "awaiting-sign-in",
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return NextResponse.json(
      { storage: "database", status: "unavailable" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session)
    return NextResponse.json(
      { error: "로그인이 필요합니다." },
      { status: 401 },
    );
  if (!sameOrigin(request.headers.get("origin"), appUrl()))
    return NextResponse.json(
      { error: "허용되지 않은 요청입니다." },
      { status: 403 },
    );
  if (isDemo()) return NextResponse.json({ backend: "demo" });
  if (!dbConfigured()) return NextResponse.json({ backend: "github" });
  // Preview envs may share the production integration: never migrate or write there.
  if (process.env.VERCEL_ENV && process.env.VERCEL_ENV !== "production")
    return NextResponse.json(
      { error: "DB 이전과 운영 기록은 운영 사이트에서만 사용할 수 있습니다." },
      { status: 503 },
    );
  try {
    await ensureDb();
    await migrateCloud(dbQuery(), {
      read: () => readGitHubSource(session.token),
      freeze: (s) => freezeGitHub(session.token, s),
    });
    await checkCloud(dbQuery());
    return NextResponse.json(
      { backend: "database" },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    const e = storageFailure(error);
    return NextResponse.json({ error: e.message }, { status: e.status });
  }
}
