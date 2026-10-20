import { test, expect } from "@playwright/test";
import { koreaToday, newLesson, type Lesson } from "../../lib/planner";

test("today dashboard saves preparation and appended notes across views, preserving conflict drafts", async ({
  page,
  request,
}) => {
  const baseline = await (await request.get("/api/planner")).json();
  const today = koreaToday();
  const yesterday = new Date(Date.parse(today + "T00:00:00Z") - 86400000)
    .toISOString()
    .slice(0, 10);
  const tomorrow = new Date(Date.parse(today + "T00:00:00Z") + 86400000)
    .toISOString()
    .slice(0, 10);
  const lesson: Lesson = {
    ...newLesson(today),
    title: "오늘의 협력수업 검증",
    grade: 6,
    classroom: "1",
    feedback: "기존 피드백",
    materials: "활동지 · https://example.com/material",
    activities: "짝과 표현 연습하기",
  };
  const previous = {
    ...newLesson(yesterday),
    title: "직전 수업 검증",
    grade: 6,
    classroom: "1",
    feedback: "이전 학급 반응 검증",
    notes: "표현 복습하기",
  };
  const otherClass = {
    ...previous,
    id: crypto.randomUUID(),
    classroom: "2",
    title: "다른 반 검증",
    feedback: "표시되면 안 되는 다른 반 피드백",
  };
  const future = {
    ...newLesson(tomorrow),
    title: "내일 수업 검증",
    grade: 6,
    classroom: "1",
  };
  const headers = { Origin: "http://127.0.0.1:3000" };
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  try {
    expect(
      (
        await request.put("/api/planner", {
          headers,
          data: {
            sha: baseline.sha,
            data: {
              ...baseline.data,
              lessons: [previous, otherClass, lesson, future],
              units: [],
            },
          },
        })
      ).ok(),
    ).toBe(true);
    await page.goto("/");
    await expect(
      page.getByRole("heading", { name: "오늘의 수업.", exact: true }),
    ).toBeVisible();
    const card = page.getByRole("article", { name: lesson.title, exact: true });
    await expect(card).toBeVisible();
    await expect(card.locator(".today-previous-body")).toContainText(
      previous.feedback,
    );
    await expect(
      page.getByText(otherClass.feedback, { exact: true }),
    ).toHaveCount(0);
    await expect(page.getByRole("article")).toHaveCount(1);
    await expect(card.getByRole("link", { name: /자료 1/ })).toHaveAttribute(
      "href",
      "https://example.com/material",
    );
    await card.getByLabel("준비할 일", { exact: true }).fill("활동지 인쇄");
    await card.getByRole("button", { name: "추가", exact: true }).click();
    const checkbox = card.getByRole("checkbox", {
      name: "활동지 인쇄",
      exact: true,
    });
    await expect(checkbox).toBeEnabled();
    await checkbox.check();
    await expect(checkbox).toBeChecked();
    await expect(checkbox).toBeEnabled();
    await card
      .getByRole("button", { name: "준비 완료로 표시", exact: true })
      .click();
    await expect(card.locator(".status-pill")).toHaveText("준비 완료");
    await page.reload();
    await expect(checkbox).toBeChecked();
    await card
      .getByLabel("수업 후 한 줄 기록", { exact: true })
      .fill("오늘의 새 피드백");
    await page.getByRole("button", { name: "수업 달력", exact: true }).click();
    await page
      .getByRole("button", { name: "오늘의 수업", exact: true })
      .click();
    await expect(
      card.getByLabel("수업 후 한 줄 기록", { exact: true }),
    ).toHaveValue("오늘의 새 피드백");
    // A concurrent writer must not lose their feedback, and the local draft must survive recovery.
    const concurrent = await (await request.get("/api/planner")).json();
    concurrent.data.lessons.find(
      (entry: Lesson) => entry.id === lesson.id,
    ).feedback = "기존 피드백\n다른 컴퓨터 기록";
    expect(
      (await request.put("/api/planner", { headers, data: concurrent })).ok(),
    ).toBe(true);
    await card
      .getByRole("button", { name: "기록 저장 · 수업 완료", exact: true })
      .click();
    await expect(page.getByRole("main").getByRole("alert")).toContainText(
      "다른 곳에서 변경",
    );
    await expect(
      card.getByLabel("수업 후 한 줄 기록", { exact: true }),
    ).toHaveValue("오늘의 새 피드백");
    await expect(
      card.getByRole("button", { name: "기록 저장 · 수업 완료", exact: true }),
    ).toBeDisabled();
    await page
      .getByRole("alert")
      .getByRole("button", { name: "최신 내용 불러오기", exact: true })
      .click();
    await expect(
      card.getByLabel("수업 후 한 줄 기록", { exact: true }),
    ).toHaveValue("오늘의 새 피드백");
    await card
      .getByRole("button", { name: "기록 저장 · 수업 완료", exact: true })
      .click();
    await expect(card.locator(".status-pill")).toHaveText("수업 완료");
    await expect(
      card.getByLabel("수업 후 한 줄 기록", { exact: true }),
    ).toHaveValue("");
    const saved = await (await request.get("/api/planner")).json();
    const updated = saved.data.lessons.find(
      (entry: Lesson) => entry.id === lesson.id,
    );
    expect(updated.feedback).toBe(
      "기존 피드백\n다른 컴퓨터 기록\n\n오늘의 새 피드백",
    );
    expect(updated.preparation[0]).toMatchObject({
      text: "활동지 인쇄",
      done: true,
    });
    expect(updated.createdAt).toBe(lesson.createdAt);
    expect(
      saved.data.lessons.filter((entry: Lesson) => entry.id !== lesson.id),
    ).toEqual([previous, otherClass, future]);
    await page
      .getByRole("button", { name: "준비상태 보드", exact: true })
      .click();
    await expect(
      page
        .locator(".board-column.status-3")
        .getByText(lesson.title, { exact: true }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "오늘의 수업", exact: true })
      .click();
    await card.getByRole("button", { name: "상세 편집", exact: true }).click();
    const dialog = page.getByRole("dialog");
    await expect(
      dialog.getByLabel("준비 항목 1 완료", { exact: true }),
    ).toBeChecked();
    await expect(dialog.getByLabel("학생피드백", { exact: true })).toHaveValue(
      updated.feedback,
    );
    await page.keyboard.press("Escape");
    await page.screenshot({
      path: "test-results/today-desktop.png",
      fullPage: true,
    });
    for (const width of [390, 768]) {
      await page.setViewportSize({ width, height: 900 });
      await expect(card).toBeVisible();
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      expect(
        await page
          .locator("main")
          .evaluate((main) =>
            [...main.querySelectorAll("*")]
              .filter(
                (element) =>
                  element.getClientRects().length &&
                  element.textContent?.trim(),
              )
              .every(
                (element) =>
                  parseFloat(getComputedStyle(element).fontSize) >= 15,
              ),
          ),
      ).toBe(true);
      await page.screenshot({
        path: `test-results/today-${width}.png`,
        fullPage: true,
      });
    }
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
