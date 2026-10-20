import test from "node:test";
import assert from "node:assert/strict";
import { copyLesson, lessonSchema, newLesson } from "../lib/planner";
import { appendFeedback, previousLesson, resourceLinks } from "../lib/today";

test("previous lesson matches the class and subject across the full history", () => {
  const current = { ...newLesson("2026-10-20"), title: "오늘 수업" };
  const previous = { ...current, id: crypto.randomUUID(), date: "2026-10-19" };
  const older = { ...previous, id: crypto.randomUUID(), date: "2026-10-16" };
  const lessons = [
    current,
    { ...previous, id: crypto.randomUUID(), classroom: "2" },
    { ...previous, id: crypto.randomUUID(), grade: 3 },
    { ...previous, id: crypto.randomUUID(), subject: "수학" },
    { ...previous, id: crypto.randomUUID(), date: "2026-10-21" },
    { ...previous, id: crypto.randomUUID(), date: current.date },
    older,
    previous,
  ];
  assert.equal(previousLesson(current, lessons)?.id, previous.id);
  assert.equal(previousLesson(current, [current, lessons[1]]), undefined);
});

test("resource links retain balanced paths, omit credentials and deduplicate", () => {
  assert.deepEqual(
    resourceLinks(
      "[자료](https://www.example.com/lesson_(1)) https://www.example.com/lesson_(1)\nhttps://example.org/video.\njavascript:alert(1) https://user:secret@example.com/private",
    ),
    [
      { href: "https://www.example.com/lesson_(1)", label: "example.com" },
      { href: "https://example.org/video", label: "example.org" },
    ],
  );
  assert.deepEqual(resourceLinks("활동지와 교과서"), []);
});

test("quick records append without modifying existing feedback", () => {
  assert.equal(
    appendFeedback("기존 기록\n ", " 새 기록 "),
    "기존 기록\n \n\n새 기록",
  );
  assert.equal(appendFeedback("기존 기록", "  "), "기존 기록");
  assert.equal(appendFeedback("", " 새 기록 "), "새 기록");
});

test("optional preparation remains backward compatible and copies reset independently", () => {
  const legacy = { ...newLesson(), title: "준비 체크 검증" };
  assert.deepEqual(lessonSchema.parse(legacy), legacy);
  const item = { id: crypto.randomUUID(), text: "활동지 인쇄", done: true };
  const original = { ...legacy, preparation: [item] };
  assert.deepEqual(lessonSchema.parse(original).preparation, [item]);
  assert.equal(
    lessonSchema.safeParse({ ...original, preparation: [item, item] }).success,
    false,
  );
  assert.equal(
    lessonSchema.safeParse({
      ...original,
      preparation: [{ ...item, text: " " }],
    }).success,
    false,
  );
  const copy = copyLesson(original);
  assert.equal(copy.preparation?.[0].text, item.text);
  assert.equal(copy.preparation?.[0].done, false);
  assert.notEqual(copy.preparation?.[0].id, item.id);
  assert.equal(original.preparation[0].done, true);
});
