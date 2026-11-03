import { z } from "zod";
import { referenceSchema } from "./library-model";

export const SUBJECTS = [
  "국어",
  "수학",
  "사회",
  "과학",
  "영어",
  "도덕",
  "체육",
  "음악",
  "미술",
  "실과",
  "바른 생활",
  "슬기로운 생활",
  "즐거운 생활",
  "창의적 체험활동",
];
export const STATUSES = [
  "계획 중",
  "자료 준비 중",
  "준비 완료",
  "수업 완료",
] as const;
export const SUBJECT_COLORS: Record<string, string> = {
  영어: "#7ee2a8",
  국어: "#ffa8a2",
  수학: "#91bcff",
  사회: "#eac788",
  과학: "#80d8cf",
  체육: "#ffc078",
  음악: "#d5b0ff",
  미술: "#f4a8cb",
};
const note = z.string().max(20000);
const label = z.string().trim().min(1).max(160);
const id = z.string().uuid();
export const dateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const date = new Date(value + "T00:00:00Z");
    return (
      !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
    );
  }, "실제 달력에 있는 날짜를 입력해 주세요.");
const grade = z.number().int().min(1).max(6);
const timestamp = z.string().datetime();
export const timetableSlotSchema = z
  .object({
    id,
    weekday: z.number().int().min(1).max(5),
    period: z.number().int().min(1).max(12),
    grade,
    classroom: z.string().trim().min(1).max(40),
    subject: label,
    title: z.string().trim().max(160),
    startDate: dateSchema,
    endDate: dateSchema.nullable(),
  })
  .strict()
  .refine(
    (slot) => !slot.endDate || slot.endDate >= slot.startDate,
    "종료일은 시작일 이후여야 합니다.",
  );
export const timetableSchema = z
  .array(timetableSlotSchema)
  .max(300)
  .superRefine((slots, ctx) => {
    if (new Set(slots.map((s) => s.id)).size !== slots.length)
      ctx.addIssue({
        code: "custom",
        message: "시간표 항목 ID가 중복되었습니다.",
      });
    for (let i = 0; i < slots.length; i++)
      for (let j = i + 1; j < slots.length; j++) {
        const a = slots[i],
          b = slots[j];
        if (
          a.weekday === b.weekday &&
          a.period === b.period &&
          a.startDate <= (b.endDate || "9999-12-31") &&
          b.startDate <= (a.endDate || "9999-12-31")
        ) {
          ctx.addIssue({
            code: "custom",
            message: "같은 요일·교시에 적용 기간이 겹치는 수업이 있습니다.",
          });
          return;
        }
      }
  });
export type TimetableSlot = z.infer<typeof timetableSlotSchema>;
export const lessonSchema = z
  .object({
    id,
    subject: label,
    date: dateSchema,
    period: z.number().int().min(1).max(12).optional(),
    timetableOrigin: z
      .object({ slotId: id, date: dateSchema })
      .strict()
      .optional(),
    title: label,
    grade,
    classroom: z.string().trim().min(1).max(40),
    status: z.enum(STATUSES),
    objective: note,
    materials: note,
    preparation: z
      .array(
        z
          .object({
            id,
            text: z.string().trim().min(1).max(300),
            done: z.boolean(),
          })
          .strict(),
      )
      .max(100)
      .refine(
        (items) => new Set(items.map((item) => item.id)).size === items.length,
        "준비 항목 ID가 중복되었습니다.",
      )
      .optional(),
    activities: note,
    feedback: note,
    notes: note,
    references: z.array(referenceSchema).max(100).optional(),
    unitId: id.nullable(),
    sessionId: id.nullable(),
    createdAt: timestamp,
    updatedAt: timestamp,
  })
  .strict();
export const unitSchema = z
  .object({
    id,
    title: label,
    grade,
    subject: label,
    achievement: note,
    design: note,
    notes: note,
    sessions: z
      .array(z.object({ id, activity: note }).strict())
      .min(1)
      .max(100),
    createdAt: timestamp,
    updatedAt: timestamp,
  })
  .strict();
export const plannerSchema = z
  .object({
    schemaVersion: z.literal(1),
    lessons: z.array(lessonSchema),
    units: z.array(unitSchema),
    timetable: timetableSchema.optional(),
  })
  .strict()
  .superRefine((data, ctx) => {
    const origins = data.lessons.flatMap((l) =>
      l.timetableOrigin
        ? [`${l.timetableOrigin.slotId}:${l.timetableOrigin.date}`]
        : [],
    );
    if (new Set(origins).size !== origins.length)
      ctx.addIssue({
        code: "custom",
        message: "같은 시간표 수업이 중복 등록되었습니다.",
      });
    const ids = [
      ...data.lessons.map((x) => x.id),
      ...data.units.map((x) => x.id),
      ...data.units.flatMap((x) => x.sessions.map((s) => s.id)),
    ];
    if (new Set(ids).size !== ids.length)
      ctx.addIssue({ code: "custom", message: "중복된 ID가 있습니다." });
    for (const lesson of data.lessons) {
      const unit = data.units.find((u) => u.id === lesson.unitId);
      if (
        (lesson.unitId && !unit) ||
        (lesson.sessionId &&
          !unit?.sessions.some((s) => s.id === lesson.sessionId))
      )
        ctx.addIssue({
          code: "custom",
          message: "연결한 단원 또는 차시가 없습니다.",
        });
      if (
        unit &&
        (unit.grade !== lesson.grade || unit.subject !== lesson.subject)
      )
        ctx.addIssue({
          code: "custom",
          message: "연결한 단원과 수업의 학년·교과가 일치해야 합니다.",
        });
    }
  });
export type Lesson = z.infer<typeof lessonSchema>;
export type Unit = z.infer<typeof unitSchema>;
export type Planner = z.infer<typeof plannerSchema>;
export type Snapshot = {
  data: Planner;
  sha: string;
  backend?: "database" | "github" | "demo";
};
export const EMPTY_PLANNER: Planner = {
  schemaVersion: 1,
  lessons: [],
  units: [],
};

export function koreaToday(now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)!.value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}
export function daysUntil(date: string, today = koreaToday()) {
  return Math.round(
    (Date.parse(date + "T00:00:00Z") - Date.parse(today + "T00:00:00Z")) /
      86400000,
  );
}
export function dueLabel(date: string, today = koreaToday()) {
  const days = daysUntil(date, today);
  return days === 0 ? "오늘" : days > 0 ? `D−${days}` : `${-days}일 지남`;
}
export function shiftDate(date: string, days: number) {
  const d = new Date(date + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
export function newLesson(today = koreaToday()): Lesson {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    subject: "영어",
    date: today,
    title: "",
    grade: 5,
    classroom: "1",
    status: "계획 중",
    objective: "",
    materials: "",
    activities: "",
    feedback: "",
    notes: "",
    unitId: null,
    sessionId: null,
    createdAt: now,
    updatedAt: now,
  };
}
export function copyLesson(source: Lesson): Lesson {
  const now = new Date().toISOString();
  return {
    ...source,
    timetableOrigin: undefined,
    id: crypto.randomUUID(),
    status: "계획 중",
    feedback: "",
    ...(source.preparation
      ? {
          preparation: source.preparation.map((item) => ({
            ...item,
            id: crypto.randomUUID(),
            done: false,
          })),
        }
      : {}),
    createdAt: now,
    updatedAt: now,
  };
}
export function newUnit(): Unit {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    title: "",
    grade: 5,
    subject: "영어",
    achievement: "",
    design: "",
    notes: "",
    sessions: Array.from({ length: 6 }, () => ({
      id: crypto.randomUUID(),
      activity: "",
    })),
    createdAt: now,
    updatedAt: now,
  };
}
export function unlinkUnit(data: Planner, unitId: string): Planner {
  return {
    ...data,
    units: data.units.filter((u) => u.id !== unitId),
    lessons: data.lessons.map((l) =>
      l.unitId === unitId
        ? {
            ...l,
            unitId: null,
            sessionId: null,
            updatedAt: new Date().toISOString(),
          }
        : l,
    ),
  };
}
