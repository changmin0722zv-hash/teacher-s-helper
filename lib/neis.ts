import { z } from "zod";
import {
  SCHOOL,
  schoolEventSchema,
  type SchoolSnapshot,
  type SchoolEvent,
} from "./school";

const rowSchema = z.object({
  ATPT_OFCDC_SC_CODE: z.literal(SCHOOL.officeCode),
  SD_SCHUL_CODE: z.literal(SCHOOL.schoolCode),
  AA_YMD: z.string().regex(/^\d{8}$/),
  EVENT_NM: z.string(),
  EVENT_CNTNT: z.string().nullish(),
  SBTR_DD_SC_NM: z.string().nullish(),
  ONE_GRADE_EVENT_YN: z.string().nullish(),
  TW_GRADE_EVENT_YN: z.string().nullish(),
  THREE_GRADE_EVENT_YN: z.string().nullish(),
  FR_GRADE_EVENT_YN: z.string().nullish(),
  FIV_GRADE_EVENT_YN: z.string().nullish(),
  SIX_GRADE_EVENT_YN: z.string().nullish(),
});
const envelopeSchema = z.object({
  RESULT: z.object({ CODE: z.string() }).optional(),
  SchoolSchedule: z
    .array(
      z.object({
        head: z
          .array(
            z.object({
              list_total_count: z.number().int().nonnegative().optional(),
              RESULT: z.object({ CODE: z.string() }).optional(),
            }),
          )
          .optional(),
        row: z.array(rowSchema).optional(),
      }),
    )
    .optional(),
});
export async function fetchSchoolYear(
  year: number,
  key: string,
  fetcher: typeof fetch = fetch,
): Promise<SchoolSnapshot> {
  if (!Number.isInteger(year) || year < 2000 || year > 2100)
    throw new Error("조회 연도를 확인해 주세요.");
  if (!key.trim())
    throw new Error("학교 일정 연결을 위한 인증키 설정이 필요합니다.");
  const events: SchoolEvent[] = [];
  let expected = 0,
    received = 0;
  for (let page = 1; page <= 3; page++) {
    const url = new URL("https://open.neis.go.kr/hub/SchoolSchedule");
    url.search = new URLSearchParams({
      KEY: key,
      Type: "json",
      pIndex: String(page),
      pSize: "1000",
      ATPT_OFCDC_SC_CODE: SCHOOL.officeCode,
      SD_SCHUL_CODE: SCHOOL.schoolCode,
      AA_FROM_YMD: `${year}0101`,
      AA_TO_YMD: `${year}1231`,
    }).toString();
    const response = await fetcher(url, {
      cache: "no-store",
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok)
      throw new Error(
        "나이스에 연결하지 못했습니다. 잠시 후 다시 확인해 주세요.",
      );
    const body = envelopeSchema.parse(await response.json());
    if (body.RESULT?.CODE === "INFO-200" && page === 1) break;
    const blocks = body.SchoolSchedule;
    const result = blocks?.flatMap((b) => b.head || []).find((h) => h.RESULT)
      ?.RESULT?.CODE;
    if (!blocks || result !== "INFO-000")
      throw new Error(
        "나이스 응답을 확인하지 못했습니다. 인증키와 이용 한도를 확인해 주세요.",
      );
    const total = blocks
      .flatMap((b) => b.head || [])
      .find((h) => h.list_total_count !== undefined)?.list_total_count;
    if (total === undefined || total > 3000 || (page > 1 && total !== expected))
      throw new Error("학교 일정 응답이 불완전합니다. 다시 확인해 주세요.");
    expected = total;
    const rows = blocks.flatMap((b) => b.row || []);
    if (!rows.length && received < expected)
      throw new Error("학교 일정 응답이 불완전합니다.");
    received += rows.length;
    for (const row of rows) {
      if (!row.AA_YMD.startsWith(String(year)))
        throw new Error("요청한 연도와 다른 일정이 포함되어 있습니다.");
      const date = `${row.AA_YMD.slice(0, 4)}-${row.AA_YMD.slice(4, 6)}-${row.AA_YMD.slice(6, 8)}`;
      const grades = [
        row.ONE_GRADE_EVENT_YN,
        row.TW_GRADE_EVENT_YN,
        row.THREE_GRADE_EVENT_YN,
        row.FR_GRADE_EVENT_YN,
        row.FIV_GRADE_EVENT_YN,
        row.SIX_GRADE_EVENT_YN,
      ].flatMap((flag, i) => (flag === "Y" ? [i + 1] : []));
      events.push(
        schoolEventSchema.parse({
          id: JSON.stringify([date, row.EVENT_NM, grades, row.EVENT_CNTNT]),
          date,
          title: row.EVENT_NM,
          description: row.EVENT_CNTNT || "",
          dayType: row.SBTR_DD_SC_NM || "",
          grades,
        }),
      );
    }
    if (received >= expected) break;
  }
  if (received !== expected)
    throw new Error("학교 일정 전체를 받지 못했습니다. 다시 확인해 주세요.");
  return {
    schoolCode: SCHOOL.schoolCode,
    year,
    checkedAt: new Date().toISOString(),
    events: [
      ...new Map(events.map((event) => [event.id, event])).values(),
    ].sort((a, b) => a.date.localeCompare(b.date)),
  };
}
