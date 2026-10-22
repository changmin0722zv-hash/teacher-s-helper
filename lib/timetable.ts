import {
  dateSchema,
  newLesson,
  shiftDate,
  type Lesson,
  type TimetableSlot,
} from "./planner";
import { eventsFor, type SchoolEvent } from "./school";

export const WEEKDAYS = ["월", "화", "수", "목", "금"];
export function mondayOf(date: string) {
  dateSchema.parse(date);
  return shiftDate(
    date,
    -((new Date(date + "T00:00:00Z").getUTCDay() + 6) % 7),
  );
}
export type WeekCandidate = {
  key: string;
  date: string;
  slot: TimetableSlot;
  blocked: string;
  warnings: string[];
};
export function weekCandidates(
  slots: TimetableSlot[],
  date: string,
  lessons: Lesson[],
  events: SchoolEvent[] = [],
): WeekCandidate[] {
  const monday = mondayOf(date);
  return slots
    .flatMap((slot) => {
      const day = shiftDate(monday, slot.weekday - 1);
      if (day < slot.startDate || (slot.endDate && day > slot.endDate))
        return [];
      const originExists = lessons.some(
        (l) =>
          l.timetableOrigin?.slotId === slot.id &&
          l.timetableOrigin.date === day,
      );
      const samePeriod = lessons.some(
        (l) => l.date === day && l.period === slot.period,
      );
      const undatedPeriod = lessons.some(
        (l) =>
          l.date === day &&
          l.period === undefined &&
          l.grade === slot.grade &&
          l.classroom === slot.classroom &&
          l.subject === slot.subject,
      );
      return [
        {
          key: `${slot.id}:${day}`,
          date: day,
          slot,
          blocked: originExists
            ? "이미 등록됨 · 이동한 수업 포함"
            : samePeriod
              ? "해당 교시에 등록한 수업이 있음"
              : "",
          warnings: [
            ...(undatedPeriod
              ? ["같은 학반·교과의 교시 미지정 수업이 있음"]
              : []),
            ...eventsFor(events, day, slot.grade).map(
              (e) => `학교 일정: ${e.title}`,
            ),
          ],
        },
      ];
    })
    .sort(
      (a, b) => a.date.localeCompare(b.date) || a.slot.period - b.slot.period,
    );
}
export function lessonsFromWeek(
  candidates: WeekCandidate[],
  selected: string[],
): Lesson[] {
  const keys = new Set(selected);
  return candidates
    .filter((c) => keys.has(c.key) && !c.blocked)
    .map(({ slot, date }) => ({
      ...newLesson(date),
      subject: slot.subject,
      title: slot.title || `${slot.subject} 수업`,
      grade: slot.grade,
      classroom: slot.classroom,
      period: slot.period,
      timetableOrigin: { slotId: slot.id, date },
    }));
}
