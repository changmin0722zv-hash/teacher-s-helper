import test from "node:test";
import assert from "node:assert/strict";
import {
  copyLesson,
  EMPTY_PLANNER,
  newLesson,
  plannerSchema,
  timetableSchema,
  type TimetableSlot,
} from "../lib/planner";
import { lessonsFromWeek, mondayOf, weekCandidates } from "../lib/timetable";
import type { SchoolEvent } from "../lib/school";
const slot = (patch: Partial<TimetableSlot> = {}): TimetableSlot => ({
  id: crypto.randomUUID(),
  weekday: 1,
  period: 2,
  grade: 6,
  classroom: "1",
  subject: "영어",
  title: "",
  startDate: "2026-10-21",
  endDate: null,
  ...patch,
});
test("week generation honors Monday boundaries and slot effective dates", () => {
  assert.equal(mondayOf("2026-11-08"), "2026-11-02");
  assert.equal(mondayOf("2027-01-01"), "2026-12-28");
  const slots = [
    slot(),
    slot({ weekday: 2, period: 3, startDate: "2026-11-04" }),
    slot({ weekday: 3, endDate: "2026-11-03" }),
  ];
  const candidates = weekCandidates(slots, "2026-11-06", []);
  assert.equal(candidates.length, 1);
  assert.equal(candidates[0].date, "2026-11-02");
  const [lesson] = lessonsFromWeek(candidates, [candidates[0].key]);
  assert.equal(lesson.title, "영어 수업");
  assert.equal(lesson.status, "계획 중");
  assert.equal(lesson.feedback, "");
  assert.equal(lesson.period, 2);
});
test("repeat import recognizes moved lessons and independent copies clear origin", () => {
  const slots = [slot()];
  const candidates = weekCandidates(slots, "2026-11-02", []);
  const [lesson] = lessonsFromWeek(candidates, [candidates[0].key]);
  const moved = { ...lesson, date: "2026-11-05", period: 4 };
  const repeated = weekCandidates(slots, "2026-11-02", [moved]);
  assert.match(repeated[0].blocked, /이미 등록/);
  assert.equal(lessonsFromWeek(repeated, [repeated[0].key]).length, 0);
  assert.equal(copyLesson(moved).timetableOrigin, undefined);
  assert.equal(
    plannerSchema.safeParse({
      ...EMPTY_PLANNER,
      lessons: [lesson, { ...moved, id: crypto.randomUUID() }],
    }).success,
    false,
  );
});
test("same-period conflicts block and undetermined periods and grade-specific events warn", () => {
  const s = slot();
  const lesson = {
    ...newLesson("2026-11-02"),
    title: "기존 수업",
    grade: 6,
    classroom: "1",
  };
  assert.match(
    weekCandidates([s], lesson.date, [{ ...lesson, period: 2 }])[0].blocked,
    /교시/,
  );
  const event: SchoolEvent = {
    id: "e",
    date: lesson.date,
    title: "체험학습",
    description: "",
    grades: [6],
    dayType: "",
  };
  const c = weekCandidates([s], lesson.date, [lesson], [event])[0];
  assert.equal(c.blocked, "");
  assert.equal(c.warnings.length, 2);
  assert.equal(
    weekCandidates([s], lesson.date, [], [{ ...event, grades: [3] }])[0]
      .warnings.length,
    0,
  );
  assert.equal(
    weekCandidates(
      [s, { ...s, id: crypto.randomUUID(), period: 3 }],
      lesson.date,
      [],
    ).length,
    2,
  );
});
test("overlapping base slots reject but future replacements and legacy records remain valid", () => {
  const a = slot({ endDate: "2026-11-01" }),
    b = slot({ startDate: "2026-11-02" });
  assert.equal(timetableSchema.safeParse([a, b]).success, true);
  assert.equal(
    timetableSchema.safeParse([a, { ...b, startDate: "2026-11-01" }]).success,
    false,
  );
  assert.equal(
    timetableSchema.safeParse([a, { ...a, id: a.id, weekday: 2 }]).success,
    false,
  );
  assert.deepEqual(plannerSchema.parse(EMPTY_PLANNER), EMPTY_PLANNER);
  const candidates = weekCandidates([b], "2026-11-02", []);
  const [created] = lessonsFromWeek(candidates, [candidates[0].key]);
  const data = {
    ...EMPTY_PLANNER,
    timetable: [{ ...b, title: "새로운 수업제목" }],
    lessons: [created],
  };
  assert.equal(plannerSchema.parse(data).lessons[0].title, "영어 수업");
});
