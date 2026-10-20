import { test, expect } from "@playwright/test";
import { koreaToday } from "../../lib/planner";

test("unit to lesson, class copy, calendar, board, durable save and conflict protection", async ({
  page,
  request,
}) => {
  const baseline = await (await request.get("/api/planner")).json();
  const prefix = `검증-${Date.now()}`;
  const unitTitle = `${prefix} 길 안내하기`;
  const lessonTitle = `${prefix} 길 묻기 역할극`;
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  try {
    await page.goto("/");
    await expect(page.getByText("로컬 데모 ·", { exact: false })).toBeVisible();
    await page
      .getByRole("button", { name: "수업·단원 계획", exact: true })
      .click();
    await page.getByRole("button", { name: "단원 추가", exact: true }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("단원명 *", { exact: true }).fill(unitTitle);
    await dialog
      .getByLabel("성취 수준", { exact: true })
      .fill("간단한 표현으로 길을 묻고 안내할 수 있다.");
    await dialog
      .getByLabel("1차시", { exact: true })
      .fill("지도와 방향 표현 알아보기");
    await dialog
      .getByRole("button", { name: "차시 추가", exact: true })
      .click();
    await expect(dialog.getByLabel("7차시", { exact: true })).toBeVisible();
    await expect(dialog.getByLabel("기본설계", { exact: true })).toHaveValue(
      "",
    );
    await dialog
      .getByRole("button", { name: "계획 저장", exact: true })
      .click();
    await expect(dialog).not.toBeVisible();
    await page
      .getByRole("button", {
        name: `${unitTitle} 1차시 수업 만들기`,
        exact: true,
      })
      .click();
    await expect(dialog.getByLabel("활동", { exact: true })).toHaveValue(
      "지도와 방향 표현 알아보기",
    );
    await dialog.getByLabel("수업제목 *", { exact: true }).fill(lessonTitle);
    await dialog.getByLabel("날짜 *", { exact: true }).fill(koreaToday());
    await dialog
      .getByLabel("학생피드백", { exact: true })
      .fill("지도 활동에 적극적으로 참여함");
    await dialog
      .getByLabel("준비상태", { exact: true })
      .selectOption("수업 완료");
    await dialog
      .getByRole("button", { name: "계획 저장", exact: true })
      .click();
    await expect(dialog).not.toBeVisible();
    await page.getByRole("button", { name: /^수업 계획 \d/ }).click();
    await page
      .getByRole("button", { name: `영어 ${lessonTitle}`, exact: true })
      .click();
    await dialog
      .getByRole("button", { name: "다른 학반에 복제", exact: true })
      .click();
    await expect(dialog.getByLabel("학생피드백", { exact: true })).toHaveValue(
      "",
    );
    await expect(dialog.getByLabel("준비상태", { exact: true })).toHaveValue(
      "계획 중",
    );
    await dialog.getByLabel("학반 *", { exact: true }).fill("2");
    await dialog
      .getByRole("button", { name: "계획 저장", exact: true })
      .click();
    await expect(dialog).not.toBeVisible();
    await page
      .getByRole("button", { name: "준비상태 보드", exact: true })
      .click();
    const planned = page
      .locator(".board-column")
      .filter({ has: page.getByRole("heading", { name: /^계획 중/ }) });
    await planned
      .getByRole("combobox", { name: `${lessonTitle} 준비상태`, exact: true })
      .selectOption("준비 완료");
    await expect(
      page
        .locator(".board-column.status-2")
        .getByText(lessonTitle, { exact: true }),
    ).toBeVisible();
    await page.reload();
    await page.getByRole("button", { name: "수업 달력", exact: true }).click();
    await expect(
      page.getByRole("button", { name: /영어 · 5-2/ }),
    ).toBeVisible();
    await page.getByRole("button", { name: "주간", exact: true }).click();
    await expect(page.locator(".day-cell")).toHaveCount(7);
    await page.getByRole("button", { name: "월간", exact: true }).click();
    await expect(page.locator(".day-cell")).toHaveCount(42);
    await page.screenshot({
      path: "test-results/calendar.png",
      fullPage: true,
    });
    const saved = await (await request.get("/api/planner")).json();
    expect(
      saved.data.lessons.find(
        (l: { title: string; classroom: string }) =>
          l.title === lessonTitle && l.classroom === "1",
      ).feedback,
    ).toBe("지도 활동에 적극적으로 참여함");
    expect(
      saved.data.lessons.find(
        (l: { title: string; classroom: string }) =>
          l.title === lessonTitle && l.classroom === "2",
      ).status,
    ).toBe("준비 완료");
    const noOrigin = await request.put("/api/planner", { data: saved });
    expect(noOrigin.status()).toBe(403);
    const invalid = await request.put("/api/planner", {
      headers: { Origin: "http://127.0.0.1:3000" },
      data: { ...saved, data: { ...saved.data, schemaVersion: 100 } },
    });
    expect(invalid.status()).toBe(400);
    // Another computer changes the file after this browser read it.
    const external = structuredClone(saved);
    external.data.units.find(
      (u: { title: string }) => u.title === unitTitle,
    ).notes = "다른 컴퓨터에서 작성한 비고";
    const changed = await request.put("/api/planner", {
      headers: { Origin: "http://127.0.0.1:3000" },
      data: external,
    });
    expect(changed.ok()).toBe(true);
    await page.getByRole("button", { name: /영어 · 5-2/ }).click();
    await dialog
      .getByLabel("참고사항", { exact: true })
      .fill("이 컴퓨터의 미저장 메모");
    await dialog
      .getByRole("button", { name: "계획 저장", exact: true })
      .click();
    await expect(dialog.getByRole("alert")).toContainText("다른 곳에서 변경");
    await expect(dialog.getByLabel("참고사항", { exact: true })).toHaveValue(
      "이 컴퓨터의 미저장 메모",
    );
    await expect(
      dialog.getByRole("button", { name: "계획 저장", exact: true }),
    ).toBeDisabled();
    const current = await (await request.get("/api/planner")).json();
    expect(
      current.data.units.find((u: { title: string }) => u.title === unitTitle)
        .notes,
    ).toBe("다른 컴퓨터에서 작성한 비고");
    expect(errors).toEqual([]);
  } finally {
    const latest = await (await request.get("/api/planner")).json();
    const response = await request.put("/api/planner", {
      headers: { Origin: "http://127.0.0.1:3000" },
      data: { sha: latest.sha, data: baseline.data },
    });
    expect(response.ok()).toBe(true);
  }
});
