import { z } from "zod";

const label = z.string().trim().min(1).max(160);
export const referenceSchema = z
  .object({
    sourceId: z.string().uuid(),
    sourceKind: z.enum(["lesson", "unit", "resource"]),
    version: z.string().min(1).max(80),
    title: label,
    excerpt: z.string().max(20000),
    mode: z.enum(["reference", "excerpt", "adapt"]),
    addedAt: z.string().datetime(),
  })
  .strict();
export type SourceReference = z.infer<typeof referenceSchema>;
const tags = z.array(z.string().trim().min(1).max(60)).max(30);
export const classificationSchema = z
  .object({
    curriculum: z.string().max(100),
    edition: z.string().max(200),
    domain: z.string().max(160),
    subjects: tags,
    grades: z.array(z.number().int().min(1).max(6)).max(6),
    topics: tags,
    actions: tags,
    methods: tags,
    supports: tags,
    contexts: tags,
    duration: z.number().int().min(1).max(1000).nullable(),
    durationScope: z.enum(["전체 수업", "핵심 활동", "개별 활동"]),
    conditions: z.string().max(4000),
    output: z.string().max(2000),
    materialStatus: z.enum(["미분류", "수정 중 초안", "사용 가능", "보관"]),
    favorite: z.boolean(),
    standards: z
      .array(
        z
          .object({
            code: label,
            text: z.string().max(3000),
            edition: z.string().max(200),
            source: z.string().max(2000),
            verification: z.enum(["미확인", "원문 확인", "구판"]),
            alignment: z.enum(["추천", "교사 연결", "재검토"]),
          })
          .strict(),
      )
      .max(50),
  })
  .strict();
export type Classification = z.infer<typeof classificationSchema>;
export const emptyClassification = (): Classification => ({
  curriculum: "",
  edition: "",
  domain: "",
  subjects: [],
  grades: [],
  topics: [],
  actions: [],
  methods: [],
  supports: [],
  contexts: [],
  duration: null,
  durationScope: "핵심 활동",
  conditions: "",
  output: "",
  materialStatus: "미분류",
  favorite: false,
  standards: [],
});
export const resourceSchema = z
  .object({
    id: z.string().uuid(),
    title: label,
    type: z.enum(["초안", "활동", "평가 도구", "참고 자료"]),
    content: z.string().max(100000),
    links: z
      .array(
        z
          .string()
          .url()
          .refine(
            (v) => /^https?:\/\//.test(v),
            "HTTP(S) 링크를 입력해 주세요.",
          ),
      )
      .max(30),
    classification: classificationSchema,
    references: z.array(referenceSchema).max(100),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .strict();
export type LibraryResource = z.infer<typeof resourceSchema>;
export type LibraryItem = {
  id: string;
  kind: "lesson" | "unit" | "resource";
  title: string;
  subject: string;
  grade: number | null;
  date: string | null;
  type: string;
  version: string;
  content: string;
  classification: Classification;
  references: SourceReference[];
  resource?: LibraryResource;
};
export const filtersSchema = z.object({
  q: z.string().max(200).default(""),
  subject: z.string().max(100).default(""),
  grade: z
    .string()
    .regex(/^$|^[1-6]$|^(1-2|3-4|5-6)$/)
    .default(""),
  kind: z.enum(["", "lesson", "unit", "resource"]).default(""),
  tag: z.string().max(100).default(""),
  status: z.string().max(50).default(""),
  curriculum: z.string().max(100).default(""),
  standard: z.string().max(100).default(""),
  maxMinutes: z
    .string()
    .regex(/^$|^\d{1,4}$/)
    .default(""),
  favorite: z.enum(["", "true"]).default(""),
  year: z
    .string()
    .regex(/^$|^\d{4}$|^undated$/)
    .default(""),
});
export type LibraryFilters = z.infer<typeof filtersSchema>;
export const emptyFilters = (): LibraryFilters => filtersSchema.parse({});
export const savedSearchSchema = z
  .object({ id: z.string().uuid(), name: label, filters: filtersSchema })
  .strict();
export type SavedSearch = z.infer<typeof savedSearchSchema>;
export function normalizeSearch(text: string) {
  return text
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[‘’`]/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}
export function parseTags(text: string) {
  return [
    ...new Set(
      text
        .split(/[,，]/)
        .map((s) => s.trim().replace(/^짝활동$/, "짝 활동"))
        .filter(Boolean),
    ),
  ];
}
export function itemText(item: LibraryItem) {
  return normalizeSearch(
    [
      item.title,
      item.subject,
      item.content,
      JSON.stringify(item.classification),
    ].join(" "),
  );
}
export function matchesLibrary(item: LibraryItem, f: LibraryFilters) {
  const c = item.classification;
  return (
    (!f.subject ||
      item.subject === f.subject ||
      c.subjects.includes(f.subject)) &&
    (!f.grade ||
      f.grade
        .split("-")
        .map(Number)
        .some((g) => item.grade === g || c.grades.includes(g))) &&
    (!f.kind || item.kind === f.kind) &&
    (!f.status || c.materialStatus === f.status) &&
    (!f.curriculum || c.curriculum === f.curriculum) &&
    (!f.favorite || c.favorite) &&
    (!f.year ||
      (f.year === "undated" ? !item.date : item.date?.startsWith(f.year))) &&
    (!f.maxMinutes ||
      (c.duration !== null && c.duration <= Number(f.maxMinutes))) &&
    (!f.tag ||
      [
        ...c.topics,
        ...c.actions,
        ...c.methods,
        ...c.supports,
        ...c.contexts,
      ].some((t) => normalizeSearch(t).includes(normalizeSearch(f.tag)))) &&
    (!f.standard ||
      c.standards.some(
        (s) =>
          s.alignment === "교사 연결" &&
          normalizeSearch(s.code).includes(normalizeSearch(f.standard)),
      )) &&
    normalizeSearch(f.q)
      .split(" ")
      .filter(Boolean)
      .every((q) => itemText(item).includes(q))
  );
}
export function sourceReference(
  item: LibraryItem,
  excerpt: string,
  mode: SourceReference["mode"],
): SourceReference {
  return referenceSchema.parse({
    sourceId: item.id,
    sourceKind: item.kind,
    version: item.version,
    title: item.title,
    excerpt,
    mode,
    addedAt: new Date().toISOString(),
  });
}
