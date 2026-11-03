import { z } from "zod";
import {
  lessonSchema,
  unitSchema,
  timetableSlotSchema,
  type Planner,
} from "./planner";
const change = <T extends z.ZodType>(schema: T) =>
  z
    .object({
      upsert: z.array(schema).max(500),
      remove: z.array(z.string().uuid()).max(500),
    })
    .strict();
export const changesSchema = z
  .object({
    lessons: change(lessonSchema),
    units: change(unitSchema),
    timetable: change(timetableSlotSchema),
  })
  .strict();
export type Changes = z.infer<typeof changesSchema>;
export function plannerChanges(before: Planner, after: Planner): Changes {
  function diff<T extends { id: string }>(a: T[], b: T[]) {
    const old = new Map(a.map((x) => [x.id, JSON.stringify(x)]));
    const ids = new Set(b.map((x) => x.id));
    return {
      upsert: b.filter((x) => old.get(x.id) !== JSON.stringify(x)),
      remove: a.filter((x) => !ids.has(x.id)).map((x) => x.id),
    };
  }
  return {
    lessons: diff(before.lessons, after.lessons),
    units: diff(before.units, after.units),
    timetable: diff(before.timetable || [], after.timetable || []),
  };
}
export function applyChanges(data: Planner, changes: Changes): Planner {
  function apply<T extends { id: string }>(
    rows: T[],
    c: { upsert: T[]; remove: string[] },
  ) {
    const map = new Map(rows.map((x) => [x.id, x]));
    for (const id of c.remove) map.delete(id);
    for (const x of c.upsert) map.set(x.id, x);
    return [...map.values()];
  }
  return {
    schemaVersion: 1,
    lessons: apply(data.lessons, changes.lessons),
    units: apply(data.units, changes.units),
    timetable: apply(data.timetable || [], changes.timetable),
  };
}
