import { test, expect } from "@playwright/test";
import { readFile, writeFile, rm } from "node:fs/promises";
import { newLesson, newUnit, koreaToday } from "../../lib/planner";

test("library finds unit notes, saves cloud metadata and undated drafts, and reuses excerpts without overwriting records", async ({
  page,
  request,
}) => {
  const baseline = await (await request.get("/api/planner")).json();
  let libraryBefore: string | undefined;
  try {
    libraryBefore = await readFile(".local/library.json", "utf8");
  } catch {}
  const prefix = `자료실-${Date.now()}`;
  const unit = {
    ...newUnit(),
    title: prefix + " 단원",
    grade: 3,
    notes: "우리 반 마음 통역소\n재방문 검수 16분\n모둠 배치는 미확정",
  };
  const lesson = {
    ...newLesson(koreaToday()),
    title: prefix + " 대상 수업",
    grade: 3,
    activities: "기존 활동 보존",
    feedback: "기존 반응 보존",
  };
  try {
    const seed = await request.put("/api/planner", {
      headers: { Origin: "http://127.0.0.1:3000" },
      data: {
        sha: baseline.sha,
        data: {
          ...baseline.data,
          units: [...baseline.data.units, unit],
          lessons: [...baseline.data.lessons, lesson],
        },
      },
    });
    expect(seed.ok()).toBe(true);
    await page.goto("/");
    await page
      .getByRole("button", { name: "수업 자료실", exact: true })
      .click();
    const search = page.getByRole("textbox", { name: "자료실 전체 본문 검색" });
    await search.fill("재방문 검수");
    await page
      .locator(".library-card")
      .filter({ hasText: prefix + " 단원" })
      .click();
    const detail = page.getByRole("article", { name: "선택한 자료" });
    await expect(detail.locator(".library-content").first()).toContainText(
      "모둠 배치는 미확정",
    );
    await detail.getByRole("button", { name: "분류·자료 편집" }).click();
    await detail.getByLabel("주제·개념 (쉼표로 구분)").fill("감정");
    await detail
      .getByLabel("자료 상태", { exact: true })
      .selectOption("수정 중 초안");
    await detail
      .getByRole("button", { name: "자료 저장", exact: true })
      .click();
    await expect(page.getByText("자료와 분류를 저장했습니다.")).toBeVisible();
    await detail.getByText("이 자료 활용하기", { exact: true }).click();
    await detail
      .getByLabel("가져올 부분", { exact: true })
      .fill("재방문 검수 16분\n모둠 배치는 미확정");
    await detail
      .getByLabel("추가할 수업", { exact: true })
      .selectOption(lesson.id);
    await detail
      .getByRole("button", { name: "선택한 부분 추가", exact: true })
      .click();
    await expect(
      page.getByText("선택한 수업에 출처와 함께 추가했습니다."),
    ).toBeVisible();
    const saved = await (await request.get("/api/planner")).json();
    const target = saved.data.lessons.find(
      (x: { id: string }) => x.id === lesson.id,
    );
    expect(target.activities).toContain("기존 활동 보존");
    expect(target.activities).toContain("미확정");
    expect(target.feedback).toBe("기존 반응 보존");
    expect(target.references[0].sourceId).toBe(unit.id);
    const old = await request.get(
      `/api/library?id=${unit.id}&version=${target.references[0].version}`,
    );
    expect(old.ok()).toBe(true);
    await detail
      .getByRole("button", { name: "선택한 부분 추가", exact: true })
      .click();
    await expect(
      page.locator(".teaching-library").getByRole("alert"),
    ).toContainText("이미 연결");
    await page.getByRole("button", { name: "날짜 없는 자료 추가" }).click();
    await detail
      .getByLabel("자료 제목", { exact: true })
      .fill(prefix + " 날짜 미정 초안");
    await detail
      .getByLabel("자료 본문", { exact: true })
      .fill("그림을 보며 학생끼리 의미를 확인한다.");
    await detail
      .getByRole("group", { name: "주교과·연계교과", exact: true })
      .getByRole("checkbox", { name: "국어", exact: true })
      .check();
    await detail
      .getByRole("group", { name: "활용 가능 학년", exact: true })
      .getByRole("checkbox", { name: "3학년", exact: true })
      .check();
    await detail.getByLabel("활동 방식 (쉼표로 구분)").fill("카드 제작");
    await detail
      .getByRole("button", { name: "자료 저장", exact: true })
      .click();
    await expect(page.getByText("자료와 분류를 저장했습니다.")).toBeVisible();
    await search.fill(prefix + " 날짜 미정");
    await expect(page.locator(".library-card")).toHaveCount(1);
    page.once("dialog", (d) => d.accept(prefix + " 책장"));
    await page.getByRole("button", { name: "검색 조건 저장" }).click();
    await expect(
      page.getByRole("button", { name: prefix + " 책장", exact: true }),
    ).toBeVisible();
    await page.reload();
    await page
      .getByRole("button", { name: "수업 자료실", exact: true })
      .click();
    await page
      .getByRole("button", { name: prefix + " 책장", exact: true })
      .click();
    await expect(page.locator(".library-card")).toHaveCount(1);
    await page
      .locator(".library-card")
      .filter({ hasText: prefix + " 날짜 미정 초안" })
      .click();
    await expect(detail).toContainText("실시일 미정");
    await expect(detail).toContainText("그림을 보며");
    const after = await (await request.get("/api/planner")).json();
    expect(after.data.lessons.length).toBe(baseline.data.lessons.length + 1);
    await page.screenshot({
      path: "test-results/library-desktop.png",
      fullPage: true,
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({
      path: "test-results/library-mobile.png",
      fullPage: true,
    });
    await expect
      .poll(() =>
        page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
      )
      .toBe(true);
    await page.screenshot({
      path: "test-results/library-mobile.png",
      fullPage: true,
    });
    const noOrigin = await request.put("/api/library", { data: {} });
    expect(noOrigin.status()).toBe(403);
  } finally {
    const latest = await (await request.get("/api/planner")).json();
    await request.put("/api/planner", {
      headers: { Origin: "http://127.0.0.1:3000" },
      data: { sha: latest.sha, data: baseline.data },
    });
    if (libraryBefore === undefined)
      await rm(".local/library.json", { force: true });
    else await writeFile(".local/library.json", libraryBefore);
  }
});
