import type { Lesson, Unit } from "./planner";
import {
  emptyClassification,
  type LibraryItem,
  type LibraryResource,
} from "./library-model";

export function lessonItem(l: Lesson, version: string): LibraryItem {
  return {
    id: l.id,
    kind: "lesson",
    title: l.title,
    subject: l.subject,
    grade: l.grade,
    date: l.date,
    type: "수업 기록",
    version,
    classification: emptyClassification(),
    references: l.references || [],
    content: [
      `학습목표\n${l.objective}`,
      `교재·준비물\n${l.materials}`,
      `준비 체크\n${(l.preparation || []).map((p) => p.text).join("\n")}`,
      `활동\n${l.activities}`,
      `학생피드백 (과거 적용 기록)\n${l.feedback}`,
      `참고사항\n${l.notes}`,
    ].join("\n\n"),
  };
}
export function unitItem(u: Unit, version: string): LibraryItem {
  return {
    id: u.id,
    kind: "unit",
    title: u.title,
    subject: u.subject,
    grade: u.grade,
    date: null,
    type: "단원 계획",
    version,
    classification: emptyClassification(),
    references: [],
    content: [
      `성취 수준\n${u.achievement}`,
      `기본설계\n${u.design}`,
      ...u.sessions.map((s, i) => `${i + 1}차시\n${s.activity}`),
      `비고\n${u.notes}`,
    ].join("\n\n"),
  };
}
export function resourceItem(r: LibraryResource, version: string): LibraryItem {
  return {
    id: r.id,
    kind: "resource",
    title: r.title,
    subject: r.classification.subjects[0] || "",
    grade: r.classification.grades[0] || null,
    date: null,
    type: r.type,
    version,
    classification: r.classification,
    references: r.references,
    content: r.content,
    resource: r,
  };
}
