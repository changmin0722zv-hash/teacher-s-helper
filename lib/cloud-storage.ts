import { randomUUID } from "node:crypto";
import { dbQuery, revision, type Query } from "./cloud-db";
import { plannerSchema, type Planner, type Snapshot } from "./planner";
import { lessonItem, unitItem } from "./library-items";
import { StorageError } from "./storage-error";

export const cloudSource = () =>
  `${process.env.GITHUB_OWNER || "changmin0722zv-hash"}/${process.env.GITHUB_REPO || "teacher-s-helper"}@${process.env.GITHUB_DATA_BRANCH || "main"}`;
export type ImportSource = {
  data: Planner;
  sha: string;
  marker?: { id: string; sourceSha: string };
};
export async function checkCloud(query: Query) {
  const [state] = await query(
    "SELECT source,active,revision FROM teaching_state WHERE id",
  );
  if (state?.source !== cloudSource() || !state.active)
    throw new StorageError(
      503,
      "클라우드 이전이 완료되지 않았거나 다른 작업실의 DB입니다. 화면을 새로고침해 주세요.",
    );
  return state;
}
export function plannerRows(data: Planner, version: string) {
  return [
    ...data.lessons.map((l) => ({
      id: l.id,
      kind: "lesson",
      payload: l,
      document: lessonItem(l, version),
    })),
    ...data.units.map((u) => ({
      id: u.id,
      kind: "unit",
      payload: u,
      document: unitItem(u, version),
    })),
    ...(data.timetable || []).map((s) => ({
      id: s.id,
      kind: "timetable",
      payload: s,
      document: {},
    })),
  ];
}
export async function migrateCloud(
  query: Query,
  github: {
    read(): Promise<ImportSource>;
    freeze(s: { data: Planner; sha: string; id: string }): Promise<void>;
  },
) {
  for (let attempt = 0; attempt < 3; attempt++) {
    let [state] = await query("SELECT * FROM teaching_state WHERE id");
    if (state && state.source !== cloudSource())
      throw new StorageError(503, "다른 작업실의 데이터베이스입니다.");
    if (state?.active) return;
    if (!state) {
      const source = await github.read();
      if (source.marker)
        throw new StorageError(
          503,
          "이미 이전된 원본입니다. 기존 DB 연결을 복구해 주세요.",
        );
      const data = plannerSchema.parse(source.data);
      await query(
        `INSERT INTO teaching_state(id,source,migration_id,source_sha,source_data,revision)
        VALUES(true,$1,$2,$3,$4::jsonb,$5) ON CONFLICT(id) DO NOTHING`,
        [
          cloudSource(),
          randomUUID(),
          source.sha,
          JSON.stringify(data),
          revision(),
        ],
      );
      [state] = await query("SELECT * FROM teaching_state WHERE id");
    }
    if (state.active) return;
    let source = await github.read();
    if (!source.marker && source.sha === state.source_sha) {
      try {
        await github.freeze({
          data: state.source_data as Planner,
          sha: state.source_sha as string,
          id: state.migration_id as string,
        });
      } catch {
        /* Re-read: a timed out CAS may have succeeded. */
      }
      source = await github.read();
    }
    if (
      source.marker &&
      source.marker.id === state.migration_id &&
      source.marker.sourceSha === state.source_sha
    ) {
      const next = revision();
      try {
        await query(
          "SELECT teaching_save_records($1,$2,$3::jsonb,'[]'::jsonb,true)",
          [
            state.revision,
            next,
            JSON.stringify(
              plannerRows(plannerSchema.parse(state.source_data), next),
            ),
          ],
        );
      } catch (error) {
        const [current] = await query(
          "SELECT active FROM teaching_state WHERE id",
        );
        if (!current?.active) throw error;
      }
      return;
    }
    if (source.marker)
      throw new StorageError(503, "이전 원본과 DB가 일치하지 않습니다.");
    if (source.sha !== state.source_sha) {
      await query(
        "DELETE FROM teaching_state WHERE id AND NOT active AND migration_id=$1",
        [state.migration_id],
      );
      continue;
    }
    throw new StorageError(
      503,
      "기존 기록을 보존했지만 저장 전환을 완료하지 못했습니다. 잠시 후 다시 불러와 주세요.",
    );
  }
  throw new StorageError(
    409,
    "다른 곳에서 변경된 내용이 있습니다. 다른 화면의 저장을 잠시 멈추고 다시 불러와 주세요.",
  );
}
export async function readCloud(query: Query = dbQuery()): Promise<Snapshot> {
  const [result] =
    await query(`SELECT (SELECT row_to_json(s) FROM (SELECT source,active,revision FROM teaching_state WHERE id) s) AS state,
    COALESCE(jsonb_agg(jsonb_build_object('kind',kind,'payload',payload) ORDER BY id) FILTER (WHERE kind<>'resource'),'[]'::jsonb) AS rows FROM teaching_records`);
  const state = result.state as {
    source: string;
    active: boolean;
    revision: string;
  } | null;
  if (!state?.active || state.source !== cloudSource())
    throw new StorageError(503, "클라우드 이전을 먼저 완료해 주세요.");
  const rows = result.rows as { kind: string; payload: unknown }[];
  return {
    data: plannerSchema.parse({
      schemaVersion: 1,
      lessons: rows.filter((r) => r.kind === "lesson").map((r) => r.payload),
      units: rows.filter((r) => r.kind === "unit").map((r) => r.payload),
      timetable: rows
        .filter((r) => r.kind === "timetable")
        .map((r) => r.payload),
    }),
    sha: state.revision,
    backend: "database",
  };
}
export async function saveCloud(
  data: Planner,
  sha: string,
  query: Query = dbQuery(),
) {
  const current = await readCloud(query);
  if (current.sha !== sha)
    throw new StorageError(
      409,
      "다른 곳에서 변경된 내용이 있습니다. 최신 내용을 불러온 뒤 다시 저장해 주세요.",
    );
  const checked = plannerSchema.parse(data),
    next = revision();
  const before = plannerRows(current.data, ""),
    after = plannerRows(checked, next);
  const old = new Map(before.map((r) => [r.id, JSON.stringify(r.payload)]));
  const ids = new Set(after.map((r) => r.id));
  const changed = after.filter(
    (r) => old.get(r.id) !== JSON.stringify(r.payload),
  );
  const removed = before.filter((r) => !ids.has(r.id)).map((r) => r.id);
  await query("SELECT teaching_save_records($1,$2,$3::jsonb,$4::jsonb)", [
    sha,
    next,
    JSON.stringify(changed),
    JSON.stringify(removed),
  ]);
  return { data: checked, sha: next, backend: "database" as const };
}
