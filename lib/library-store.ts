import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile, rename } from "node:fs/promises";
import { isDemo } from "./auth";
import { readPlanner } from "./storage";
import { dbConfigured, dbQuery, revision, type Query } from "./cloud-db";
import { checkCloud } from "./cloud-storage";
import { lessonItem, unitItem, resourceItem } from "./library-items";
import {
  classificationSchema,
  resourceSchema,
  matchesLibrary,
  normalizeSearch,
  type Classification,
  type LibraryResource,
  type LibraryFilters,
  type LibraryItem,
  type SavedSearch,
} from "./library-model";
import { StorageError } from "./storage-error";

type DemoStore = {
  resources: LibraryResource[];
  metadata: Record<string, Classification>;
  versions: Record<string, LibraryItem>;
  searches: SavedSearch[];
};
const demoPath = ".local/library.json";
const hash = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");
async function readDemo(): Promise<DemoStore> {
  try {
    return JSON.parse(await readFile(demoPath, "utf8"));
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
    return { resources: [], metadata: {}, versions: {}, searches: [] };
  }
}
async function writeDemo(data: DemoStore) {
  await mkdir(".local", { recursive: true });
  await writeFile(demoPath + ".tmp", JSON.stringify(data));
  await rename(demoPath + ".tmp", demoPath);
}
let demoQueue: Promise<unknown> = Promise.resolve();
async function demoWrite<T>(fn: () => Promise<T>): Promise<T> {
  const task = demoQueue.then(fn);
  demoQueue = task.catch(() => {});
  return task;
}
async function demoItems(token: string, store: DemoStore) {
  const p = await readPlanner(token);
  return [
    ...p.data.lessons.map((l) => lessonItem(l, "")),
    ...p.data.units.map((u) => unitItem(u, "")),
    ...store.resources.map((r) => resourceItem(r, "")),
  ].map((item) => {
    item.classification = store.metadata[item.id] || item.classification;
    item.version = hash(item);
    return item;
  });
}
export async function libraryQuery() {
  if (!dbConfigured())
    throw new StorageError(
      503,
      "자료실 저장을 위해 Vercel에 DATABASE_URL을 연결해 주세요.",
    );
  const query = dbQuery();
  await checkCloud(query);
  return query;
}
export function searchWhere(f: LibraryFilters) {
  const values: unknown[] = [],
    clauses = ["kind IN ('lesson','unit','resource')"];
  const bind = (v: unknown) => {
    values.push(v);
    return `$${values.length}`;
  };
  if (f.subject) {
    const p = bind(f.subject);
    clauses.push(
      `(document->>'subject'=${p} OR document#>'{classification,subjects}' @> jsonb_build_array(${p}::text))`,
    );
  }
  if (f.grade) {
    const p = bind(f.grade.split("-").map(Number));
    clauses.push(
      `EXISTS (SELECT 1 FROM unnest(${p}::int[]) g WHERE document->>'grade'=g::text OR document#>'{classification,grades}' @> jsonb_build_array(g))`,
    );
  }
  if (f.kind) clauses.push(`kind=${bind(f.kind)}`);
  if (f.status)
    clauses.push(
      `document#>>'{classification,materialStatus}'=${bind(f.status)}`,
    );
  if (f.curriculum)
    clauses.push(
      `document#>>'{classification,curriculum}'=${bind(f.curriculum)}`,
    );
  if (f.favorite) clauses.push(`document#>>'{classification,favorite}'='true'`);
  if (f.maxMinutes)
    clauses.push(
      `(document#>>'{classification,duration}')::int<=${bind(Number(f.maxMinutes))}`,
    );
  if (f.year)
    clauses.push(
      f.year === "undated"
        ? `document->>'date' IS NULL`
        : `left(document->>'date',4)=${bind(f.year)}`,
    );
  if (f.tag) {
    const p = bind(normalizeSearch(f.tag));
    clauses.push(
      `EXISTS(SELECT 1 FROM jsonb_array_elements_text((document#>'{classification,topics}')||(document#>'{classification,actions}')||(document#>'{classification,methods}')||(document#>'{classification,supports}')||(document#>'{classification,contexts}')) t WHERE strpos(teaching_normalize(t),${p})>0)`,
    );
  }
  if (f.standard) {
    const p = bind(normalizeSearch(f.standard));
    clauses.push(
      `EXISTS(SELECT 1 FROM jsonb_array_elements(document#>'{classification,standards}') s WHERE s->>'alignment'='교사 연결' AND strpos(teaching_normalize(s->>'code'),${p})>0)`,
    );
  }
  for (const word of normalizeSearch(f.q)
    .split(" ")
    .filter(Boolean)
    .slice(0, 12)) {
    const pattern = "%" + word.replace(/[\\%_]/g, "\\$&") + "%";
    const p = bind(pattern);
    clauses.push(
      `(search_text LIKE ${p} OR replace(search_text,' ','') LIKE replace(${p},' ',''))`,
    );
  }
  return { where: clauses.join(" AND "), values };
}
export async function searchDatabase(
  query: Query,
  f: LibraryFilters,
  page: number,
) {
  const { where, values } = searchWhere(f);
  const q = values.length + 1;
  const rows = await query(
    `SELECT id,kind,version,document-'resource'-'content'-'references' AS summary,
    substring(document->>'content' FROM greatest(1,strpos(teaching_normalize(document->>'content'),split_part(teaching_normalize($${q}),' ',1))-100) FOR 600) AS excerpt, count(*) OVER()::int AS total
    FROM teaching_records WHERE ${where} ORDER BY CASE WHEN teaching_normalize(document->>'title')=teaching_normalize($${q}) THEN 0 ELSE 1 END,updated_at DESC,id LIMIT 20 OFFSET $${q + 1}`,
    [...values, f.q, page * 20],
  );
  return {
    items: rows.map((r) => ({
      ...(r.summary as LibraryItem),
      version: r.version as string,
      content: r.excerpt as string,
    })),
    total: Number(rows[0]?.total || 0),
    page,
    backend: "database",
  };
}
export async function searchLibrary(
  token: string,
  f: LibraryFilters,
  page: number,
) {
  if (!isDemo()) return searchDatabase(await libraryQuery(), f, page);
  const store = await readDemo(),
    items = (await demoItems(token, store)).filter((i) => matchesLibrary(i, f));
  return {
    items: items.slice(page * 20, page * 20 + 20).map(({ resource, ...i }) => ({
      ...i,
      content: i.content.slice(0, 600),
    })),
    total: items.length,
    page,
    backend: "demo",
  };
}
export async function getLibraryItem(
  token: string,
  id: string,
  version?: string,
): Promise<LibraryItem> {
  if (isDemo()) {
    const store = await readDemo();
    const item = version
      ? store.versions[id + ":" + version]
      : (await demoItems(token, store)).find((i) => i.id === id);
    if (!item) throw new StorageError(404, "자료를 찾을 수 없습니다.");
    return item;
  }
  const query = await libraryQuery();
  const [row] = version
    ? await query(
        "SELECT document,version FROM teaching_versions WHERE record_id=$1::uuid AND version=$2",
        [id, version],
      )
    : await query(
        "SELECT document,version FROM teaching_records WHERE id=$1::uuid AND kind<>'timetable'",
        [id],
      );
  if (!row) throw new StorageError(404, "자료를 찾을 수 없습니다.");
  return { ...(row.document as LibraryItem), version: row.version as string };
}
export async function saveLibraryItem(
  token: string,
  id: string,
  expected: string,
  classification: Classification,
  resource?: LibraryResource,
): Promise<LibraryItem> {
  const meta = classificationSchema.parse(classification);
  const r = resource
    ? resourceSchema.parse({ ...resource, classification: meta })
    : undefined;
  if (r && r.id !== id)
    throw new StorageError(400, "자료 ID가 일치하지 않습니다.");
  if (isDemo())
    return demoWrite(async () => {
      const store = await readDemo();
      const existing = (await demoItems(token, store)).find((i) => i.id === id);
      if ((existing?.version || "") !== expected || (!existing && !r))
        throw new StorageError(
          409,
          "다른 곳에서 변경된 내용이 있습니다. 다시 불러와 주세요.",
        );
      if (existing) store.versions[id + ":" + existing.version] = existing;
      if (r) {
        const index = store.resources.findIndex((x) => x.id === id);
        if (index < 0) store.resources.push(r);
        else store.resources[index] = r;
      }
      store.metadata[id] = meta;
      await writeDemo(store);
      const saved = (await demoItems(token, store)).find((i) => i.id === id)!;
      store.versions[id + ":" + saved.version] = saved;
      await writeDemo(store);
      return saved;
    });
  const query = await libraryQuery(),
    next = revision();
  const document = r
    ? resourceItem({ ...r, classification: meta }, next)
    : { classification: meta };
  await query(
    "SELECT teaching_save_item($1::uuid,$2,$3,$4::jsonb,$5::jsonb,$6)",
    [
      id,
      expected,
      next,
      JSON.stringify(r || {}),
      JSON.stringify(document),
      Boolean(r),
    ],
  );
  return getLibraryItem(token, id);
}
export async function savedSearches(
  action: "list" | "save" | "delete",
  search?: SavedSearch,
  id?: string,
) {
  if (isDemo())
    return demoWrite(async () => {
      const store = await readDemo();
      if (action === "save")
        store.searches = [
          ...store.searches.filter((x) => x.id !== search!.id),
          search!,
        ];
      if (action === "delete")
        store.searches = store.searches.filter((x) => x.id !== id);
      if (action !== "list") await writeDemo(store);
      return store.searches;
    });
  const query = await libraryQuery();
  if (action === "save")
    await query(
      "INSERT INTO teaching_searches(id,payload) VALUES($1::uuid,$2::jsonb) ON CONFLICT(id) DO UPDATE SET payload=EXCLUDED.payload",
      [search!.id, JSON.stringify(search)],
    );
  if (action === "delete")
    await query("DELETE FROM teaching_searches WHERE id=$1::uuid", [id]);
  return (await query("SELECT payload FROM teaching_searches ORDER BY id")).map(
    (r) => r.payload,
  );
}
