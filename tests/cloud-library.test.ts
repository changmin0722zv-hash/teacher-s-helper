import test from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { DB_STATEMENTS, revision, type Query } from "../lib/cloud-db";
import {
  migrateCloud,
  readCloud,
  saveCloud,
  type ImportSource,
} from "../lib/cloud-storage";
import { newLesson, newUnit, plannerSchema } from "../lib/planner";
import {
  emptyClassification,
  emptyFilters,
  sourceReference,
} from "../lib/library-model";
import { resourceItem } from "../lib/library-items";
import { searchDatabase } from "../lib/library-store";

async function database() {
  const db = new PGlite();
  for (const statement of DB_STATEMENTS) await db.exec(statement);
  const query: Query = async (sql, values) =>
    (await db.query<Record<string, unknown>>(sql, values)).rows;
  return { db, query };
}
function source() {
  const unit = {
    ...newUnit(),
    title: "8단원 I'm happy.",
    grade: 3,
    notes:
      "수정 중 초안: 우리 반 마음 통역소\n재방문 검수 16분. 모둠 인원 미확정.",
  };
  const lesson = {
    ...newLesson("2026-11-04"),
    title: "감정 표현",
    grade: 3,
    unitId: unit.id,
    sessionId: unit.sessions[0].id,
    feedback: "지난 수업에서 그림 도움이 필요했음",
  };
  return {
    schemaVersion: 1 as const,
    lessons: [lesson],
    units: [unit],
    timetable: [],
  };
}
function github(data = source()) {
  let s: ImportSource = { data, sha: "a".repeat(40) };
  let freezes = 0;
  return {
    get current() {
      return s;
    },
    set current(value: ImportSource) {
      s = value;
    },
    get freezes() {
      return freezes;
    },
    read: async () => structuredClone(s),
    freeze: async (state: { data: typeof data; sha: string; id: string }) => {
      if (s.sha !== state.sha) throw new Error("conflict");
      freezes++;
      s = {
        data: state.data,
        sha: "b".repeat(40),
        marker: { id: state.id, sourceSha: state.sha },
      };
    },
  };
}
test("cloud import is resumable, preserves data, and supports atomic stale-write protection", async () => {
  const { db, query } = await database();
  try {
    const gh = github();
    await migrateCloud(query, gh);
    await migrateCloud(query, gh);
    assert.equal(gh.freezes, 1);
    const first = await readCloud(query);
    assert.deepEqual(first.data, plannerSchema.parse(gh.current.data));
    const changed = {
      ...first.data,
      lessons: first.data.lessons.map((l) => ({
        ...l,
        notes: "DB에만 추가한 내용",
      })),
    };
    const saved = await saveCloud(changed, first.sha, query);
    assert.notEqual(saved.sha, first.sha);
    assert.equal(
      (await readCloud(query)).data.lessons[0].notes,
      "DB에만 추가한 내용",
    );
    await assert.rejects(
      saveCloud(first.data, first.sha, query),
      /다른 곳에서 변경/,
    );
    assert.equal(gh.current.data.lessons[0].notes, "");
    const history = await query(
      "SELECT count(*)::int AS count FROM teaching_versions",
    );
    assert.equal(history[0].count, 3);
  } finally {
    await db.close();
  }
});
test("import re-reads changes racing the GitHub fence and resumes after a failed activation", async () => {
  const { db, query } = await database();
  try {
    const gh = github();
    let race = true;
    const wrapped = {
      read: gh.read,
      freeze: async (s: Parameters<typeof gh.freeze>[0]) => {
        if (race) {
          race = false;
          gh.current = {
            ...gh.current,
            sha: "c".repeat(40),
            data: {
              ...gh.current.data,
              lessons: gh.current.data.lessons.map((l) => ({
                ...l,
                notes: "다른 기기 최신 기록",
              })),
            },
          };
          throw new Error("conflict");
        }
        return gh.freeze(s);
      },
    };
    let fail = true;
    const failing: Query = async (sql, values) => {
      if (sql.includes("SELECT teaching_save_records") && fail) {
        fail = false;
        throw new Error("network");
      }
      return query(sql, values);
    };
    await assert.rejects(migrateCloud(failing, wrapped));
    assert.ok(gh.current.marker);
    await migrateCloud(query, wrapped);
    assert.equal(
      (await readCloud(query)).data.lessons[0].notes,
      "다른 기기 최신 기록",
    );
    assert.equal(gh.freezes, 1);
  } finally {
    await db.close();
  }
});
test("library searches unit notes in SQL, paginates, retains classification and immutable source versions", async () => {
  const { db, query } = await database();
  try {
    const gh = github();
    await migrateCloud(query, gh);
    let result = await searchDatabase(
      query,
      { ...emptyFilters(), q: "마음 통역소" },
      0,
    );
    assert.equal(result.total, 1);
    assert.equal(result.items[0].id, gh.current.data.units[0].id);
    const id = gh.current.data.units[0].id;
    const [old] = await query(
      "SELECT version,document FROM teaching_records WHERE id=$1",
      [id],
    );
    const meta = {
      ...emptyClassification(),
      topics: ["감정"],
      methods: ["카드 제작"],
      curriculum: "2022 개정",
      duration: 16,
      materialStatus: "수정 중 초안",
    };
    const next = revision();
    await query(
      "SELECT teaching_save_item($1,$2,$3,$4::jsonb,$5::jsonb,false)",
      [id, old.version, next, "{}", JSON.stringify({ classification: meta })],
    );
    result = await searchDatabase(
      query,
      {
        ...emptyFilters(),
        subject: "영어",
        grade: "3-4",
        tag: "감정",
        maxMinutes: "20",
      },
      0,
    );
    assert.equal(result.total, 1);
    const before = await readCloud(query);
    await saveCloud(
      {
        ...before.data,
        units: before.data.units.map((u) => ({
          ...u,
          notes: u.notes + "\n추가 변경",
        })),
      },
      before.sha,
      query,
    );
    const [after] = await query(
      "SELECT document FROM teaching_records WHERE id=$1",
      [id],
    );
    assert.deepEqual((after.document as any).classification, meta);
    const [version] = await query(
      "SELECT document FROM teaching_versions WHERE record_id=$1 AND version=$2",
      [id, old.version],
    );
    assert.equal(
      (version.document as any).content.includes("추가 변경"),
      false,
    );
    assert.equal(
      (await searchDatabase(query, { ...emptyFilters(), q: "%' OR 1=1 --" }, 0))
        .total,
      0,
    );
    const now = new Date().toISOString();
    for (let i = 0; i < 22; i++) {
      const resource = {
        id: crypto.randomUUID(),
        title: `날짜 없는 초안 ${i}`,
        type: "초안" as const,
        content: "검색페이지 검증",
        links: [],
        classification: emptyClassification(),
        references: [],
        createdAt: now,
        updatedAt: now,
      };
      const v = revision();
      await query(
        "SELECT teaching_save_item($1,$2,$3,$4::jsonb,$5::jsonb,true)",
        [
          resource.id,
          "",
          v,
          JSON.stringify(resource),
          JSON.stringify(resourceItem(resource, v)),
        ],
      );
    }
    const first = await searchDatabase(
        query,
        { ...emptyFilters(), q: "검색페이지" },
        0,
      ),
      second = await searchDatabase(
        query,
        { ...emptyFilters(), q: "검색페이지" },
        1,
      );
    assert.equal(first.total, 22);
    assert.equal(first.items.length, 20);
    assert.equal(second.items.length, 2);
    const ref = sourceReference(
      { ...(old.document as any), version: old.version as string },
      "상담소 운영 16분",
      "excerpt",
    );
    assert.equal(ref.sourceId, id);
    assert.equal(ref.version, old.version);
    assert.equal(ref.excerpt, "상담소 운영 16분");
  } finally {
    await db.close();
  }
});

test("undoing a lesson deletion restores classification without rolling back other records", async () => {
  const { db, query } = await database();
  try {
    await migrateCloud(query, github());
    const original = await readCloud(query),
      lesson = original.data.lessons[0];
    const [row] = await query(
      "SELECT version FROM teaching_records WHERE id=$1",
      [lesson.id],
    );
    const meta = {
      ...emptyClassification(),
      topics: ["되살릴 분류"],
      favorite: true,
    };
    await query(
      "SELECT teaching_save_item($1,$2,$3,$4::jsonb,$5::jsonb,false)",
      [
        lesson.id,
        row.version,
        revision(),
        "{}",
        JSON.stringify({ classification: meta }),
      ],
    );
    const deleted = await saveCloud(
      { ...original.data, lessons: [] },
      original.sha,
      query,
    );
    const unrelated = await saveCloud(
      {
        ...deleted.data,
        units: deleted.data.units.map((u) => ({
          ...u,
          notes: "삭제 후 별도로 수정",
        })),
      },
      deleted.sha,
      query,
    );
    await saveCloud(
      { ...unrelated.data, lessons: [lesson] },
      unrelated.sha,
      query,
    );
    const restored = await readCloud(query);
    assert.deepEqual(restored.data.lessons[0], lesson);
    assert.equal(restored.data.units[0].notes, "삭제 후 별도로 수정");
    const [item] = await query(
      "SELECT document FROM teaching_records WHERE id=$1",
      [lesson.id],
    );
    assert.deepEqual((item.document as any).classification, meta);
    assert.equal(
      (
        await searchDatabase(
          query,
          { ...emptyFilters(), tag: "되살릴 분류" },
          0,
        )
      ).total,
      1,
    );
  } finally {
    await db.close();
  }
});
