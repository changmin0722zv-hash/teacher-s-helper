import { z } from "zod";
import school from "../data/school.json";
import { dateSchema } from "./planner";

export const SCHOOL = school;
export const schoolEventSchema = z.object({
  id: z.string(),
  date: dateSchema,
  title: z.string(),
  description: z.string(),
  grades: z.array(z.number().int().min(1).max(6)),
  dayType: z.string(),
});
export const schoolSnapshotSchema = z.object({
  schoolCode: z.literal(SCHOOL.schoolCode),
  year: z.number().int(),
  checkedAt: z.string().datetime(),
  events: z.array(schoolEventSchema).max(3000),
});
export type SchoolEvent = z.infer<typeof schoolEventSchema>;
export type SchoolSnapshot = z.infer<typeof schoolSnapshotSchema>;
export function eventsFor(events: SchoolEvent[], date: string, grade?: number) {
  return events.filter(
    (event) =>
      event.date === date &&
      (!grade || !event.grades.length || event.grades.includes(grade)),
  );
}
