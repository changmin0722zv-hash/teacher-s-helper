import { neon } from "@neondatabase/serverless";
import { ensureDb, dbConfigured } from "../lib/cloud-db";

// Production builds validate the connected DB without importing or modifying
// teacher records. Import uses the teacher's authenticated GitHub session.
async function main() {
  if (process.env.VERCEL_ENV !== "production" || !dbConfigured()) return;
  await ensureDb();
  const sql = neon((process.env.DATABASE_URL || process.env.POSTGRES_URL)!);
  await sql`SELECT 1 FROM teaching_state LIMIT 1`;
  const extensions =
    await sql`SELECT name FROM pg_available_extensions WHERE name='pg_trgm'`;
  if (extensions.length) {
    await sql`CREATE EXTENSION IF NOT EXISTS pg_trgm`;
    await sql`CREATE INDEX IF NOT EXISTS teaching_text_search ON teaching_records USING gin(search_text gin_trgm_ops)`;
    await sql`CREATE INDEX IF NOT EXISTS teaching_compact_search ON teaching_records USING gin(replace(search_text,' ','') gin_trgm_ops)`;
  }
  console.log(
    "CLOUD_DATABASE_CHECK_OK: schema and database connection verified.",
  );
}
main().catch(() => {
  console.error(
    "클라우드 DB 검증에 실패했습니다. DATABASE_URL 연결과 권한을 확인해 주세요.",
  );
  process.exitCode = 1;
});
