import test from "node:test";
import assert from "node:assert/strict";
import { fetchSchoolYear } from "../lib/neis";
import { SCHOOL } from "../lib/school";
const row = {
  ATPT_OFCDC_SC_CODE: SCHOOL.officeCode,
  SD_SCHUL_CODE: SCHOOL.schoolCode,
  AA_YMD: "20261103",
  EVENT_NM: "체험학습",
  EVENT_CNTNT: "6학년 행사",
  SIX_GRADE_EVENT_YN: "Y",
  SBTR_DD_SC_NM: "해당없음",
};
const response = (rows: unknown[], total = rows.length) =>
  Response.json({
    SchoolSchedule: [
      { head: [{ list_total_count: total }, { RESULT: { CODE: "INFO-000" } }] },
      { row: rows },
    ],
  });
test("NEIS requests verified school and full year, parses grade-specific events and pagination", async () => {
  let calls = 0;
  const fake: typeof fetch = async (input) => {
    const url = new URL(String(input));
    calls++;
    assert.equal(url.hostname, "open.neis.go.kr");
    assert.equal(url.searchParams.get("SD_SCHUL_CODE"), "7201223");
    assert.equal(url.searchParams.get("ATPT_OFCDC_SC_CODE"), "C10");
    assert.equal(url.searchParams.get("AA_FROM_YMD"), "20260101");
    assert.equal(url.searchParams.get("AA_TO_YMD"), "20261231");
    assert.equal(url.searchParams.get("pIndex"), String(calls));
    return response(
      [{ ...row, AA_YMD: calls === 1 ? "20261103" : "20261104" }],
      2,
    );
  };
  const data = await fetchSchoolYear(2026, "test-key", fake);
  assert.equal(calls, 2);
  assert.deepEqual(
    data.events.map((e) => e.date),
    ["2026-11-03", "2026-11-04"],
  );
  assert.deepEqual(data.events[0].grades, [6]);
});
test("NEIS no-data is distinct from failure; invalid schools, dates, counts and credentials cannot masquerade as empty schedules", async () => {
  const none = await fetchSchoolYear(2026, "test-key", async () =>
    Response.json({ RESULT: { CODE: "INFO-200" } }),
  );
  assert.deepEqual(none.events, []);
  await assert.rejects(
    fetchSchoolYear(2026, "test-key", async () =>
      Response.json({ RESULT: { CODE: "ERROR-290" } }),
    ),
  );
  await assert.rejects(
    fetchSchoolYear(2026, "test-key", async () =>
      response([{ ...row, SD_SCHUL_CODE: "wrong" }]),
    ),
  );
  await assert.rejects(
    fetchSchoolYear(2026, "test-key", async () =>
      response([{ ...row, AA_YMD: "20260230" }]),
    ),
  );
  await assert.rejects(
    fetchSchoolYear(2026, "test-key", async () =>
      response([{ ...row, AA_YMD: "20271103" }]),
    ),
  );
  await assert.rejects(
    fetchSchoolYear(2026, "test-key", async () => response([], 5)),
  );
  await assert.rejects(
    fetchSchoolYear(2026, "", async () => {
      throw new Error("must not fetch");
    }),
  );
});
