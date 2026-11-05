import { test, expect } from "@playwright/test";
import { koreaToday, newLesson, shiftDate } from "../../lib/planner";

test("calendar quick actions copy independently, paste into a date, confirm deletion, undo and reject stale saves", async ({
  page,
  request,
}) => {
  const baseline = await (await request.get("/api/planner")).json();
  const today = koreaToday(),
    destination = shiftDate(today, 1);
  const source = {
    ...newLesson(today),
    title: `빠른메뉴-${Date.now()}`,
    grade: 3,
    classroom: "1",
    period: 2,
    activities: "의미 확인 활동",
    feedback: "원본 학급 반응",
    status: "수업 완료",
    preparation: [{ id: crypto.randomUUID(), text: "카드 준비", done: true }],
  };
  const origin = { Origin: "http://127.0.0.1:3000" };
  const read = async () => (await request.get("/api/planner")).json();
  try {
    expect(
      (
        await request.put("/api/planner", {
          headers: origin,
          data: {
            sha: baseline.sha,
            data: {
              ...baseline.data,
              lessons: [...baseline.data.lessons, source],
            },
          },
        })
      ).ok(),
    ).toBe(true);
    await page.goto("/");
    await page.getByRole("button", { name: "수업 달력", exact: true }).click();
    const sourceCard = page
      .locator(".calendar-event")
      .filter({ hasText: source.title });
    const targetDay = page.locator(`[data-date="${destination}"]`);
    const menu = page.getByRole("menu", { name: "달력 빠른 메뉴" });
    const dialog = page.getByRole("dialog");
    await targetDay
      .getByRole("button", { name: `${destination} 날짜 메뉴` })
      .click();
    await expect(
      menu.getByRole("menuitem", { name: "붙여넣기", exact: true }),
    ).toBeDisabled();
    await page.keyboard.press("Escape");
    await sourceCard.click({ button: "right" });
    await expect(dialog).not.toBeVisible();
    await expect(menu).toBeVisible();
    await menu.getByRole("menuitem", { name: "수정", exact: true }).click();
    await expect(dialog.getByLabel("수업제목 *", { exact: true })).toHaveValue(
      source.title,
    );
    await page.keyboard.press("Escape");
    await sourceCard.focus();
    await page.keyboard.press("Shift+F10");
    await page.keyboard.press("ArrowDown");
    await expect(
      menu.getByRole("menuitem", { name: "복사", exact: true }),
    ).toBeFocused();
    await page.keyboard.press("Enter");
    expect((await read()).data.lessons.length).toBe(
      baseline.data.lessons.length + 1,
    );
    await targetDay.locator(".date-number").click({ button: "right" });
    await menu.getByRole("menuitem", { name: "붙여넣기", exact: true }).click();
    await expect(dialog.getByLabel("날짜 *", { exact: true })).toHaveValue(
      destination,
    );
    await expect(dialog.getByLabel("준비상태", { exact: true })).toHaveValue(
      "계획 중",
    );
    await expect(dialog.getByLabel("학생피드백", { exact: true })).toHaveValue(
      "",
    );
    await dialog.getByLabel("학반 *", { exact: true }).fill("2");
    await dialog
      .getByRole("button", { name: "계획 저장", exact: true })
      .click();
    await expect(dialog).not.toBeVisible();
    const afterPaste = await read();
    const pasted = afterPaste.data.lessons.find(
      (l: any) => l.title === source.title && l.classroom === "2",
    );
    expect(pasted.id).not.toBe(source.id);
    expect(pasted.preparation[0].done).toBe(false);
    expect(pasted.preparation[0].id).not.toBe(source.preparation[0].id);
    expect(pasted.activities).toBe(source.activities);
    expect(
      afterPaste.data.lessons.find((l: any) => l.id === source.id),
    ).toEqual(source);
    const pastedMore = targetDay.getByRole("button", {
      name: `${source.title} 3-2 수업 메뉴`,
      exact: true,
    });
    await pastedMore.click();
    page.once("dialog", (d) => d.dismiss());
    await menu.getByRole("menuitem", { name: "삭제", exact: true }).click();
    expect(
      (await read()).data.lessons.some((l: any) => l.id === pasted.id),
    ).toBe(true);
    await pastedMore.click();
    page.once("dialog", async (d) => {
      expect(d.message()).toContain(destination);
      expect(d.message()).toContain("3학년 2반");
      await d.accept();
    });
    await menu.getByRole("menuitem", { name: "삭제", exact: true }).click();
    await expect(pastedMore).toHaveCount(0);
    await page
      .getByRole("button", { name: "삭제 실행 취소", exact: true })
      .click();
    await expect(pastedMore).toBeVisible();
    expect(
      (await read()).data.lessons.find((l: any) => l.id === pasted.id),
    ).toEqual(pasted);
    await pastedMore.click();
    await page
      .getByRole("heading", { name: "수업 달력", exact: false })
      .click();
    await expect(menu).not.toBeVisible();
    await page.setViewportSize({ width: 390, height: 844 });
    await pastedMore.click();
    await expect(menu).toBeVisible();
    const bounds = await menu.boundingBox();
    expect(bounds!.x).toBeGreaterThanOrEqual(0);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(390);
    await page.screenshot({
      path: "test-results/calendar-menu-mobile.png",
      fullPage: false,
    });
    await page.keyboard.press("Escape");
    await page.setViewportSize({ width: 1440, height: 1050 });
    await pastedMore.click();
    await page.screenshot({
      path: "test-results/calendar-menu-desktop.png",
      fullPage: true,
    });
    await page.keyboard.press("Escape");
    const external = await read();
    external.data.lessons.find((l: any) => l.id === pasted.id).notes =
      "다른 기기 최신 기록";
    expect(
      (
        await request.put("/api/planner", { headers: origin, data: external })
      ).ok(),
    ).toBe(true);
    await pastedMore.click();
    page.once("dialog", (d) => d.accept());
    await menu.getByRole("menuitem", { name: "삭제", exact: true }).click();
    await expect(page.locator(".error[role=alert]")).toContainText(
      "다른 곳에서 변경",
    );
    expect(
      (await read()).data.lessons.find((l: any) => l.id === pasted.id).notes,
    ).toBe("다른 기기 최신 기록");
    await expect(
      page.getByRole("button", { name: "삭제 실행 취소", exact: true }),
    ).toHaveCount(0);
  } finally {
    const latest = await read();
    expect(
      (
        await request.put("/api/planner", {
          headers: origin,
          data: { sha: latest.sha, data: baseline.data },
        })
      ).ok(),
    ).toBe(true);
  }
});
