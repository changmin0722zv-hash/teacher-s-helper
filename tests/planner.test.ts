import test from "node:test";
import assert from "node:assert/strict";
import {
  copyLesson,
  dateSchema,
  daysUntil,
  EMPTY_PLANNER,
  koreaToday,
  newLesson,
  newUnit,
  plannerSchema,
  unlinkUnit,
} from "../lib/planner";

test("Korean calendar day changes at 15:00 UTC and countdown does not depend on host timezone", () => {
  assert.equal(koreaToday(new Date("2026-10-15T14:59:59Z")), "2026-10-15");
  assert.equal(koreaToday(new Date("2026-10-15T15:00:00Z")), "2026-10-16");
  assert.equal(daysUntil("2026-11-01", "2026-10-31"), 1);
  assert.equal(daysUntil("2026-10-15", "2026-10-16"), -1);
  assert.equal(daysUntil("2026-10-16", "2026-10-16"), 0);
});
test("date validation rejects impossible dates but accepts leap day", () => {
  assert.equal(dateSchema.safeParse("2026-02-29").success, false);
  assert.equal(dateSchema.safeParse("2028-02-29").success, true);
  assert.equal(dateSchema.safeParse("2026-13-01").success, false);
});
test("copy creates an independent lesson and resets feedback and preparation", () => {
  const original = {
    ...newLesson(),
    title: "길 묻기",
    feedback: "짝 활동에 관심을 보임",
    status: "수업 완료" as const,
    activities: "길 안내 역할극",
  };
  const copy = copyLesson(original);
  assert.notEqual(copy.id, original.id);
  assert.equal(copy.activities, original.activities);
  assert.equal(copy.feedback, "");
  assert.equal(copy.status, "계획 중");
  copy.activities = "지도 읽기";
  assert.equal(original.activities, "길 안내 역할극");
});
test("unit relationships reject dangling sessions, mismatched grade and duplicate IDs", () => {
  const unit = { ...newUnit(), title: "길 안내하기" };
  const lesson = {
    ...newLesson(),
    title: "길 묻기",
    unitId: unit.id,
    sessionId: unit.sessions[0].id,
  };
  const data = { ...EMPTY_PLANNER, units: [unit], lessons: [lesson] };
  assert.equal(plannerSchema.safeParse(data).success, true);
  assert.equal(
    plannerSchema.safeParse({
      ...data,
      lessons: [{ ...lesson, sessionId: crypto.randomUUID() }],
    }).success,
    false,
  );
  assert.equal(
    plannerSchema.safeParse({ ...data, lessons: [{ ...lesson, grade: 4 }] })
      .success,
    false,
  );
  assert.equal(
    plannerSchema.safeParse({ ...data, lessons: [lesson, lesson] }).success,
    false,
  );
  assert.equal(plannerSchema.safeParse({ ...data, units: [] }).success, false);
});
test("unit deletion preserves lessons, feedback and creation dates while clearing links", () => {
  const unit = { ...newUnit(), title: "길 안내하기" };
  const lesson = {
    ...newLesson(),
    title: "길 묻기",
    unitId: unit.id,
    sessionId: unit.sessions[0].id,
    feedback: "지도가 도움이 됨",
  };
  const result = unlinkUnit(
    { ...EMPTY_PLANNER, units: [unit], lessons: [lesson] },
    unit.id,
  );
  assert.equal(result.units.length, 0);
  assert.equal(result.lessons.length, 1);
  assert.equal(result.lessons[0].feedback, lesson.feedback);
  assert.equal(result.lessons[0].createdAt, lesson.createdAt);
  assert.equal(result.lessons[0].unitId, null);
  assert.equal(result.lessons[0].sessionId, null);
  assert.equal(plannerSchema.safeParse(result).success, true);
});
