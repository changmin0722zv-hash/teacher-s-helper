import { neon } from "@neondatabase/serverless";
import { randomBytes } from "node:crypto";
import { StorageError } from "./storage-error";

export type Query = (
  sql: string,
  values?: unknown[],
) => Promise<Record<string, unknown>[]>;
export const revision = () => randomBytes(20).toString("hex");
export const dbConfigured = () =>
  Boolean(process.env.DATABASE_URL || process.env.POSTGRES_URL);
export function dbQuery(): Query {
  if (process.env.VERCEL_ENV && process.env.VERCEL_ENV !== "production")
    throw new StorageError(
      503,
      "운영 기록은 운영 사이트에서만 사용할 수 있습니다.",
    );
  const sql = neon((process.env.DATABASE_URL || process.env.POSTGRES_URL)!);
  return (text, values = []) => sql.query(text, values);
}
export const DB_STATEMENTS = [
  `CREATE OR REPLACE FUNCTION teaching_normalize(t text) RETURNS text LANGUAGE sql IMMUTABLE AS $$ SELECT regexp_replace(translate(lower(normalize(t,NFKC)), '‘’', chr(39)||chr(39)), '\\s+', ' ', 'g') $$`,
  `CREATE TABLE IF NOT EXISTS teaching_state (
 id boolean PRIMARY KEY DEFAULT true CHECK(id), source text NOT NULL,
 migration_id text NOT NULL, source_sha text NOT NULL, source_data jsonb NOT NULL,
 active boolean NOT NULL DEFAULT false, revision text NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS teaching_records (
 id uuid PRIMARY KEY, kind text NOT NULL, payload jsonb NOT NULL,
 document jsonb NOT NULL, version text NOT NULL,
 search_text text NOT NULL, updated_at timestamptz NOT NULL DEFAULT now())`,
  `CREATE INDEX IF NOT EXISTS teaching_kind ON teaching_records(kind,id)`,
  `CREATE INDEX IF NOT EXISTS teaching_subject ON teaching_records((document->>'subject'))`,
  `CREATE INDEX IF NOT EXISTS teaching_date ON teaching_records((document->>'date'))`,
  `CREATE TABLE IF NOT EXISTS teaching_versions (
 record_id uuid NOT NULL, version text NOT NULL, document jsonb NOT NULL,
 payload jsonb, created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(record_id,version))`,
  `ALTER TABLE teaching_versions ADD COLUMN IF NOT EXISTS payload jsonb`,
  `CREATE TABLE IF NOT EXISTS teaching_searches (id uuid PRIMARY KEY, payload jsonb NOT NULL)`,
  `CREATE OR REPLACE FUNCTION teaching_save_records(p_expected text,p_next text,p_rows jsonb,p_remove jsonb,p_activate boolean DEFAULT false)
 RETURNS text LANGUAGE plpgsql AS $fn$
 DECLARE state teaching_state%ROWTYPE; r jsonb; old teaching_records%ROWTYPE; doc jsonb; previous jsonb;
 BEGIN
  SELECT * INTO state FROM teaching_state WHERE id FOR UPDATE;
  IF state.revision IS DISTINCT FROM p_expected THEN RAISE EXCEPTION 'TEACHING_CONFLICT'; END IF;
  IF NOT state.active AND NOT p_activate THEN RAISE EXCEPTION 'TEACHING_NOT_READY'; END IF;
  DELETE FROM teaching_records WHERE kind<>'resource' AND id::text IN (SELECT jsonb_array_elements_text(p_remove));
  FOR r IN SELECT jsonb_array_elements(p_rows) LOOP
   SELECT * INTO old FROM teaching_records WHERE id=(r->>'id')::uuid FOR UPDATE;
   IF old.id IS NOT NULL AND old.kind<>r->>'kind' THEN RAISE EXCEPTION 'TEACHING_CONFLICT'; END IF;
   doc := r->'document';
   IF old.id IS NOT NULL AND old.document ? 'classification' THEN doc := jsonb_set(doc,'{classification}',old.document->'classification'); END IF;
   IF old.id IS NULL AND r->>'kind' IN ('lesson','unit') THEN
    SELECT document INTO previous FROM teaching_versions WHERE record_id=(r->>'id')::uuid
     ORDER BY created_at DESC,version DESC LIMIT 1;
    IF previous ? 'classification' AND previous->>'kind'=r->>'kind' THEN
     doc := jsonb_set(doc,'{classification}',previous->'classification');
    END IF;
   END IF;
   INSERT INTO teaching_records(id,kind,payload,document,version,search_text)
   VALUES ((r->>'id')::uuid,r->>'kind',r->'payload',doc,p_next,teaching_normalize(doc::text))
   ON CONFLICT(id) DO UPDATE SET payload=EXCLUDED.payload,document=EXCLUDED.document,version=p_next,search_text=EXCLUDED.search_text,updated_at=now();
   INSERT INTO teaching_versions(record_id,version,document,payload) VALUES ((r->>'id')::uuid,p_next,doc,r->'payload') ON CONFLICT DO NOTHING;
  END LOOP;
  IF p_activate THEN
    IF EXISTS (SELECT 1 FROM jsonb_array_elements(p_rows) expected
      LEFT JOIN teaching_records actual ON actual.id::text=expected->>'id'
      WHERE actual.payload IS DISTINCT FROM expected->'payload')
      OR (SELECT count(*) FROM teaching_records WHERE kind<>'resource')<>jsonb_array_length(p_rows)
    THEN RAISE EXCEPTION 'TEACHING_IMPORT_MISMATCH'; END IF;
  END IF;
  UPDATE teaching_state SET revision=p_next, active=true WHERE id;
  RETURN p_next;
 END; $fn$`,
  `CREATE OR REPLACE FUNCTION teaching_save_item(p_id uuid,p_expected text,p_next text,p_payload jsonb,p_doc jsonb,p_resource boolean)
 RETURNS text LANGUAGE plpgsql AS $fn$
 DECLARE old teaching_records%ROWTYPE; doc jsonb;
 BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(p_id::text,0));
  SELECT * INTO old FROM teaching_records WHERE id=p_id FOR UPDATE;
  IF (old.id IS NULL AND p_expected<>'') OR (old.id IS NOT NULL AND old.version<>p_expected)
   THEN RAISE EXCEPTION 'TEACHING_CONFLICT'; END IF;
  IF old.id IS NULL AND NOT p_resource THEN RAISE EXCEPTION 'TEACHING_CONFLICT'; END IF;
  IF old.id IS NOT NULL AND (old.kind='resource')<>p_resource THEN RAISE EXCEPTION 'TEACHING_CONFLICT'; END IF;
  doc := CASE WHEN p_resource THEN p_doc ELSE jsonb_set(old.document,'{classification}',p_doc->'classification') END;
  INSERT INTO teaching_records(id,kind,payload,document,version,search_text)
   VALUES(p_id,'resource',p_payload,doc,p_next,teaching_normalize(doc::text))
   ON CONFLICT(id) DO UPDATE SET payload=CASE WHEN p_resource THEN p_payload ELSE teaching_records.payload END,
    document=doc,version=p_next,search_text=teaching_normalize(doc::text),updated_at=now();
  INSERT INTO teaching_versions(record_id,version,document,payload) VALUES(p_id,p_next,doc,CASE WHEN p_resource THEN p_payload ELSE old.payload END);
  RETURN p_next;
 END; $fn$`,
];
let ready: Promise<void> | undefined;
export async function ensureDb() {
  if (!ready)
    ready = (async () => {
      const sql = neon((process.env.DATABASE_URL || process.env.POSTGRES_URL)!);
      await sql.transaction([
        sql`SELECT pg_advisory_xact_lock(728102304)`,
        ...DB_STATEMENTS.map((s) => sql.query(s)),
      ]);
    })().catch((error) => {
      ready = undefined;
      throw error;
    });
  return ready;
}
