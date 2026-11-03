import { plannerSchema, type Planner, type Snapshot } from "./planner";
export async function loadPlanner(): Promise<Snapshot> {
  const init = await fetch("/api/cloud", { method: "POST" });
  const setup = await init.json();
  if (!init.ok) throw new Error(setup.error);
  if (setup.backend !== "database") {
    const r = await fetch("/api/planner", { cache: "no-store" });
    const b = await r.json();
    if (!r.ok) throw new Error(b.error);
    return {
      data: plannerSchema.parse(b.data),
      sha: b.sha,
      backend: setup.backend,
    };
  }
  const data: Planner = {
    schemaVersion: 1,
    lessons: [],
    units: [],
    timetable: [],
  };
  let page: number | null = 0,
    sha = "";
  while (page !== null) {
    const r: Response = await fetch(
      "/api/planner?" +
        new URLSearchParams({ page: String(page), revision: sha }),
      { cache: "no-store" },
    );
    const b: {
      data: Planner;
      sha: string;
      nextPage: number | null;
      error?: string;
    } = await r.json();
    if (!r.ok) throw new Error(b.error);
    sha = b.sha;
    data.lessons.push(...b.data.lessons);
    data.units.push(...b.data.units);
    data.timetable!.push(...(b.data.timetable || []));
    page = b.nextPage;
  }
  return { data: plannerSchema.parse(data), sha, backend: "database" };
}
