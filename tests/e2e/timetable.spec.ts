import { test, expect } from "@playwright/test";
import { type Lesson } from "../../lib/planner";

test("school events and base timetable support selective weekly import, independent edits and duplicate prevention", async ({
  page,
  request,
}) => {
  const baseline = await (await request.get("/api/planner")).json();
  const headers = { Origin: "http://127.0.0.1:3000" };
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  let failSchool = false;
  await page.route("**/api/school-events?*", async (route) => {
    const year = Number(
      new URL(route.request().url()).searchParams.get("year"),
    );
    await route.fulfill({
      status: failSchool ? 502 : 200,
      json: failSchool
        ? { error: "학교 일정을 갱신하지 못했습니다." }
        : {
            schoolCode: "7201223",
            year,
            checkedAt: new Date().toISOString(),
            events:
              year === 2026
                ? [
                    {
                      id: "field-trip",
                      date: "2026-11-03",
                      title: "6학년 체험학습",
                      description: "테스트용 학교 일정",
                      grades: [6],
                      dayType: "해당없음",
                    },
                  ]
                : [],
          },
    });
  });
  try {
    expect(
      (
        await request.put("/api/planner", {
          headers,
          data: {
            sha: baseline.sha,
            data: { schemaVersion: 1, lessons: [], units: [] },
          },
        })
      ).ok(),
    ).toBe(true);
    const invalidYear = await request.get("/api/school-events?year=bad");
    expect(invalidYear.status()).toBe(400);
    await page.goto("/");
    const nav = page.getByRole("button", {
      name: "학교·기초시간표",
      exact: true,
    });
    await nav.click();
    await expect(
      page.getByRole("region", { name: "등록된 학교" }),
    ).toContainText("부산광역시북부교육지원청");
    await page.getByLabel("등록할 주", { exact: true }).fill("2026-11-02");
    for (const entry of [
      { day: "1", period: "1", classroom: "1" },
      { day: "2", period: "2", classroom: "2" },
    ]) {
      await page
        .getByRole("button", { name: "시간표 항목 추가", exact: true })
        .click();
      const form = page.getByRole("form", { name: "시간표 항목 편집" });
      await form
        .getByRole("combobox", { name: "요일", exact: true })
        .selectOption(entry.day);
      await form
        .getByRole("combobox", { name: "교시", exact: true })
        .selectOption(entry.period);
      await form.getByLabel("학반", { exact: true }).fill(entry.classroom);
      await form
        .getByLabel("기본 수업제목", { exact: true })
        .fill("영어 협력수업 검증");
      await form.getByLabel("적용 시작일", { exact: true }).fill("2026-10-21");
      await form
        .getByRole("button", { name: "시간표 저장", exact: true })
        .click();
      await expect(form).not.toBeVisible();
    }
    const preview = page.getByRole("region", { name: "주간 수업 일괄 등록" });
    const monday = preview.getByRole("checkbox", {
      name: "2026-11-02 1교시 6-1 등록",
      exact: true,
    });
    const tuesday = preview.getByRole("checkbox", {
      name: "2026-11-03 2교시 6-2 등록",
      exact: true,
    });
    await expect(monday).toBeChecked();
    await expect(tuesday).not.toBeChecked();
    await expect(preview).toContainText("학교 일정: 6학년 체험학습");
    await tuesday.check();
    let writes = 0;
    page.on("request", (r) => {
      if (r.method() === "PUT" && r.url().endsWith("/api/planner")) writes++;
    });
    await preview
      .getByRole("button", { name: "선택한 2개 수업 등록", exact: true })
      .click();
    await expect(
      preview.getByRole("button", {
        name: "선택한 0개 수업 등록",
        exact: true,
      }),
    ).toBeDisabled();
    expect(writes).toBe(1);
    const saved = await (await request.get("/api/planner")).json();
    expect(saved.data.timetable).toHaveLength(2);
    expect(saved.data.lessons).toHaveLength(2);
    expect(
      saved.data.lessons.every(
        (l: Lesson) => l.status === "계획 중" && l.feedback === "",
      ),
    ).toBe(true);
    await page
      .getByRole("button", { name: "선택한 주 달력 보기", exact: true })
      .click();
    await expect(
      page
        .locator(".school-event")
        .getByText("학교 · 6학년 체험학습", { exact: true }),
    ).toBeVisible();
    await page.getByRole("button", { name: /영어 · 6-1 · 1교시/ }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("날짜 *", { exact: true }).fill("2026-11-04");
    await dialog
      .getByLabel("학생피드백", { exact: true })
      .fill("개별 수업 기록 유지");
    await dialog
      .getByRole("button", { name: "계획 저장", exact: true })
      .click();
    await expect(dialog).not.toBeVisible();
    await nav.click();
    await expect(monday).toBeDisabled();
    await expect(preview).toContainText("이동한 수업 포함");
    await page
      .getByRole("button", { name: "월요일 1교시 6-1 영어 편집", exact: true })
      .click();
    const edit = page.getByRole("form", { name: "시간표 항목 편집" });
    await edit
      .getByLabel("기본 수업제목", { exact: true })
      .fill("다음 주부터 사용할 제목");
    await edit
      .getByRole("button", { name: "시간표 저장", exact: true })
      .click();
    await expect(edit).not.toBeVisible();
    await page.reload();
    await nav.click();
    await page.getByLabel("등록할 주", { exact: true }).fill("2026-11-02");
    await expect(monday).toBeDisabled();
    const current = await (await request.get("/api/planner")).json();
    expect(current.data.lessons).toHaveLength(2);
    const moved = current.data.lessons.find((l: Lesson) => l.classroom === "1");
    expect(moved.date).toBe("2026-11-04");
    expect(moved.feedback).toBe("개별 수업 기록 유지");
    expect(moved.title).toBe("영어 협력수업 검증");
    failSchool = true;
    await page
      .getByRole("button", { name: "학교 일정 새로고침", exact: true })
      .click();
    await expect(page.locator(".school-sync-bar")).toContainText(
      "학교 일정을 갱신하지 못했습니다.",
    );
    await expect(preview).toContainText("학교 일정: 6학년 체험학습");
    await page.screenshot({
      path: "test-results/timetable-desktop.png",
      fullPage: true,
    });
    await page.setViewportSize({ width: 390, height: 900 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: "test-results/timetable-mobile.png",
      fullPage: true,
    });
    expect(errors).toEqual([]);
  } finally {
    const latest = await (await request.get("/api/planner")).json();
    expect(
      (
        await request.put("/api/planner", {
          headers,
          data: { sha: latest.sha, data: baseline.data },
        })
      ).ok(),
    ).toBe(true);
  }
});
