import { test, expect, type Page, type TestInfo } from "@playwright/test";
import {
  buildSchedule,
  defaultAvailability,
  parseTaskInput,
  replanTasks,
  starterTasks,
  type PlanSnapshot,
} from "../src/shared/domain";

type BridgeCall = { method: string; input: Record<string, any> };
const emptyState: PlanSnapshot = {
  tasks: [],
  schedule: [],
  availability: defaultAvailability,
  version: 0,
  confirmed: false,
};

// Exercise the production renderer against the existing domain functions.
// Only the Electron IPC boundary is replaced, so real user data/API keys are never touched.
async function boot(
  page: Page,
  options: { state?: PlanSnapshot; failGenerate?: boolean; failLoad?: boolean; currentTime?: string } = {},
) {
  const calls: BridgeCall[] = [];
  let aiSettings = { enabled: false, baseUrl: "https://api.deepseek.com", model: "deepseek-v4-flash", hasApiKey: false };
  let snapshot = structuredClone(options.state ?? emptyState);
  await page.clock.setFixedTime(new Date(options.currentTime ?? "2026-09-05T08:00:00+08:00"));
  await page.route("**/__test__/*", async (route) => {
    const method = new URL(route.request().url()).pathname.split("/").pop()!;
    const input = route.request().postDataJSON() ?? {};
    calls.push({ method, input });
    if (
      (method === "generatePlan" && options.failGenerate) ||
      (method === "load" && options.failLoad)
    ) {
      await route.fulfill({ status: 503, json: { error: "Unavailable" } });
      return;
    }
    let result: unknown = {};
    switch (method) {
      case "getAiSettings": result = aiSettings; break;
      case "saveAiSettings":
        aiSettings = { enabled: input.enabled, baseUrl: input.baseUrl, model: input.model, hasApiKey: Boolean(input.apiKey || aiSettings.hasApiKey) };
        result = aiSettings;
        break;
      case "load":
        result = { ...snapshot, history: [] };
        break;
      case "generatePlan": {
        const tasks = parseTaskInput(input.rawText);
        result = { tasks, schedule: buildSchedule(tasks, input.availability, 480), source: "local" };
        break;
      }
      case "saveDraft":
        snapshot = {
          tasks: structuredClone(input.tasks),
          availability: structuredClone(input.availability),
          schedule: structuredClone(input.schedule),
          version: snapshot.version,
          confirmed: false,
        };
        result = snapshot;
        break;
      case "confirmPlan":
        snapshot = { ...input, version: snapshot.version + 1, confirmed: true } as PlanSnapshot;
        result = snapshot;
        break;
      case "suggestReplan": {
        const tasks = replanTasks(input.tasks, input.currentTaskId, input.reason);
        result = {
          tasks,
          schedule: buildSchedule(tasks, input.availability, 480),
          reason: input.reason,
        };
        break;
      }
      case "clearData":
        snapshot = structuredClone(emptyState);
        break;
    }
    await route.fulfill({ json: result });
  });
  await page.addInitScript(() => {
    const request = async (method: string, input = {}) => {
      const response = await fetch("/__test__/" + method, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      if (!response.ok) throw new Error("Test bridge unavailable");
      return response.json();
    };
    window.aiTodo = {
      getAiSettings: () => request("getAiSettings"),
      saveAiSettings: (input) => request("saveAiSettings", input),
      load: () => request("load"),
      generatePlan: (input) => request("generatePlan", input),
      saveDraft: (input) => request("saveDraft", input),
      confirmPlan: (input) => request("confirmPlan", input),
      suggestReplan: (input) => request("suggestReplan", input),
      recordProgress: (input) => request("recordProgress", input),
      snoozeReminder: (input) => request("snoozeReminder", input),
      clearData: () => request("clearData"),
      onReminder: (callback) => {
        const listener = (event: Event) => callback((event as CustomEvent).detail ?? {});
        window.addEventListener("test-reminder", listener);
        return () => window.removeEventListener("test-reminder", listener);
      },
    };
  });
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await expect.poll(() => calls.some((call) => call.method === "load")).toBe(true);
  return { calls, errors };
}

async function assertLayout(page: Page) {
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
  ).toBe(true);
  const clipped = await page
    .locator("main input, main select, main textarea, main button")
    .evaluateAll((elements) =>
      elements
        .filter((element) => {
          const box = element.getBoundingClientRect();
          if (!box.width || !box.height) return false;
          const centerX = box.left + box.width / 2;
          const centerY = box.top + box.height / 2;
          if (centerY < 0 || centerY >= window.innerHeight) return false;
          const topElement = document.elementFromPoint(centerX, centerY);
          return (
            box.left < -1 ||
            box.right > window.innerWidth + 1 ||
            !(topElement && element.contains(topElement))
          );
        })
        .map((element) => element.getAttribute("aria-label") ?? element.textContent),
    );
  expect(clipped).toEqual([]);
  for (const row of await page.locator(".task-row").all()) {
    const controls = await row.locator("input,select,button").evaluateAll((elements) =>
      elements.map((element) => {
        const box = element.getBoundingClientRect();
        return { left: box.left, right: box.right, top: box.top, bottom: box.bottom };
      }),
    );
    for (let i = 0; i < controls.length; i++) {
      for (let j = i + 1; j < controls.length; j++) {
        const a = controls[i],
          b = controls[j];
        expect(a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom).toBe(
          false,
        );
      }
    }
  }
}

async function capture(page: Page, info: TestInfo, name: string) {
  await page.locator(".app-shell img").evaluateAll(async (images) => {
    await Promise.all(images.map((image) => (image as HTMLImageElement).decode()));
  });
  await assertLayout(page);
  const path = info.outputPath(name + ".png");
  await page.screenshot({ path, fullPage: true });
  await info.attach(name, { path, contentType: "image/png" });
}

function confirmedState(): PlanSnapshot {
  return {
    tasks: structuredClone(starterTasks),
    schedule: buildSchedule(starterTasks, defaultAvailability, 480),
    availability: defaultAvailability,
    version: 2,
    confirmed: true,
  };
}

test("capture, edit, confirm, progress and completion keep the full workflow", async ({
  page,
}, info) => {
  const { calls, errors } = await boot(page);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("把今天，安排得刚刚好。");
  const companion = page.locator(".sidebar .cat-friend");
  await expect(companion).toHaveCount(1);
  await expect(page.locator("main .cat-friend")).toHaveCount(0);
  await expect(companion).toHaveAttribute("src", "./fluffy-cat.png");
  await expect.poll(() => companion.evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0)).toBe(true);
  if (info.project.name === "mobile") {
    await expect(companion).toBeHidden();
  } else {
    await expect(companion).toBeVisible();
    const catBounds = await companion.boundingBox();
    const editorBounds = await page.locator(".capture-grid > .surface").boundingBox();
    const navigationBounds = await page.locator(".step-nav").boundingBox();
    const noteBounds = await page.locator(".sidebar-note").boundingBox();
    expect(catBounds!.x + catBounds!.width).toBeLessThan(editorBounds!.x);
    expect(catBounds!.y).toBeGreaterThan(navigationBounds!.y + navigationBounds!.height);
    expect(catBounds!.y + catBounds!.height).toBeLessThan(noteBounds!.y);
  }
  await capture(page, info, "capture");
  await page.getByRole("button", { name: "添加时段" }).click();
  await expect(page.getByLabel("时段 3 开始时间")).toHaveValue("19:00");
  await page.getByLabel("时段 3 结束时间").fill("21:00");
  await page.getByRole("button", { name: "删除时段 3" }).click();
  await page.getByLabel("时段 1 开始时间").fill("08:30");
  await page.getByLabel("今天想完成什么？").fill("准备周会材料；回复客户邮件");
  await page.getByRole("button", { name: "生成参考计划" }).click();
  await expect(page.getByRole("heading", { name: "这份安排合适吗？" })).toBeVisible();
  expect(calls.find((call) => call.method === "generatePlan")?.input.availability[0].start).toBe(
    "08:30",
  );
  await page.getByLabel("准备周会材料 任务名称", { exact: true }).fill("准备周会演示");
  await page.getByLabel("准备周会演示 完成标准", { exact: true }).fill("完成 5 页可演示的材料");
  await page.getByLabel("准备周会演示 优先级").selectOption("高");
  await page.getByLabel("准备周会演示 预计耗时（分钟）").fill("60");
  await page.getByRole("button", { name: "添加计划", exact: true }).click();
  await expect(page.getByLabel("新计划 任务名称", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "删除新计划", exact: true }).click();
  await capture(page, info, "review");
  await expect(page.locator(".sidebar .cat-friend")).toHaveCount(1);
  await expect(page.locator("main .cat-friend")).toHaveCount(0);
  await page.getByRole("button", { name: "确认并开始" }).click();
  await expect(page.getByRole("heading", { name: "按现在的节奏继续" })).toBeVisible();
  const confirmed = calls.find((call) => call.method === "confirmPlan")!.input;
  expect(confirmed.tasks[0]).toMatchObject({
    title: "准备周会演示",
    duration: 60,
    priority: "高",
    doneDefinition: "完成 5 页可演示的材料",
  });
  expect(confirmed.tasks).toHaveLength(2);
  await page.clock.setFixedTime(new Date("2026-09-05T09:00:00+08:00"));
  await page.waitForTimeout(1100);
  await page.getByRole("button", { name: "完成 50%", exact: true }).click();
  await expect(page.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "50");
  await expect
    .poll(() =>
      calls.some(
        (call) => call.method === "recordProgress" && call.input.eventType === "progress_50",
      ),
    )
    .toBe(true);
  const countdown = page.getByRole("timer").locator("strong");
  await expect(countdown).toHaveText("00:30:00");
  await page.getByRole("button", { name: "继续任务", exact: true }).click();
  await expect(page.getByRole("button", { name: "暂停任务", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "暂停任务", exact: true }).click();
  await expect(page.getByRole("button", { name: "继续任务", exact: true })).toBeVisible();
  await page.clock.setFixedTime(new Date("2026-09-05T09:10:00+08:00"));
  await page.waitForTimeout(1100);
  await expect(countdown).toHaveText("00:30:00");
  await page.getByRole("button", { name: "继续任务", exact: true }).click();
  await expect(countdown).toHaveText("00:20:00");
  await capture(page, info, "execute");
  await expect(page.locator(".sidebar .cat-friend")).toHaveCount(1);
  await expect(page.locator("main .cat-friend")).toHaveCount(0);
  await page.getByRole("button", { name: "标记为已完成" }).click();
  await expect(page.locator(".focus-top h2")).toHaveText("准备周会演示");
  await expect(page.getByRole("button", { name: "开始下一任务", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "开始下一任务", exact: true }).click();
  await expect(page.locator(".focus-top h2")).toHaveText("回复客户邮件");
  await expect(page.locator(".time-chip")).toHaveText("09:10–09:40");
  await expect(page.getByRole("button", { name: "暂停任务", exact: true })).toBeVisible();
  await expect(page.locator(".timeline-item.done")).toContainText("准备周会演示");
  expect(errors).toEqual([]);
});

test("uses the current task end time for countdown after an earlier task has expired", async ({ page }) => {
  const tasks = starterTasks.slice(0, 2).map((task, index) => ({
    ...task,
    id: "clock-task-" + index,
    duration: 60,
  }));
  const schedule = buildSchedule(
    tasks,
    [{ id: "afternoon", start: "15:00", end: "18:00", kind: "available" }],
    15 * 60,
  );
  await boot(page, {
    currentTime: "2026-09-05T16:27:00+08:00",
    state: { tasks, schedule, availability: [{ id: "afternoon", start: "15:00", end: "18:00", kind: "available" }], version: 1, confirmed: true },
  });
  await expect(page.locator(".focus-top h2")).toHaveText(tasks[1].title);
  await expect(page.getByRole("timer").locator("strong")).toHaveText("00:33:00");
  await expect(page.locator(".timeline-item").nth(0)).toBeEnabled();
  await page.locator(".timeline-item").nth(0).click();
  await expect(page.locator(".focus-top h2")).toHaveText(tasks[0].title);
});

test("reflows following task times and warns when the new timeline exceeds availability", async ({ page }) => {
  const tasks = starterTasks.map((task, index) => ({
    ...task,
    id: "edit-task-" + index,
    duration: [60, 60, 30][index],
  }));
  const availability = [{ id: "morning", start: "09:00", end: "11:00", kind: "available" as const }];
  const schedule = buildSchedule(tasks, [{ id: "morning", start: "09:00", end: "18:00", kind: "available" }], 9 * 60);
  const { calls } = await boot(page, {
    state: { tasks, schedule, availability, version: 1, confirmed: false },
  });
  await page.getByLabel(tasks[1].title + " 结束时间", { exact: true }).fill("12:00");
  await expect(page.getByLabel(tasks[2].title + " 开始时间", { exact: true })).toHaveValue("12:00");
  await expect.poll(() => calls.filter((call) => call.method === "saveDraft").length).toBeGreaterThan(0);
  await page.getByLabel(tasks[1].title + " 结束时间", { exact: true }).fill("17:30");
  await expect(page.getByLabel(tasks[2].title + " 开始时间", { exact: true })).toHaveValue("17:30");
  await expect(page.getByRole("status")).toContainText("超出今日可用时段");
  await expect(page.getByText("2 项任务超出今日可用时段", { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { name: "这份安排合适吗？" })).toBeVisible();
  await expect(page.getByLabel(tasks[1].title + " 结束时间", { exact: true })).toHaveValue("17:30");
});

test("restores a confirmed plan, receives reminders and confirms replan only explicitly", async ({
  page,
}, info) => {
  const { calls, errors } = await boot(page, { state: confirmedState() });
  await expect(page.getByRole("status")).toContainText("已恢复本地计划 v2");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.evaluate(() => window.dispatchEvent(new Event("test-reminder")));
  await expect(page.getByRole("status")).toContainText("同步一下当前任务进度");
  await expect(page.getByRole("alertdialog")).toContainText("需要同步进度");
  await page.getByRole("button", { name: "关闭提醒" }).click();
  await page.evaluate(() =>
    window.dispatchEvent(new CustomEvent("test-reminder", { detail: { kind: "end" } })),
  );
  await expect(page.getByRole("alertdialog")).toContainText("任务结束提醒");
  await expect(page.getByRole("alertdialog")).toContainText("实际完成情况");
  await page.getByRole("button", { name: "关闭提醒" }).click();
  await page.getByRole("button", { name: "遇到阻碍", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await page.keyboard.press("Shift+Tab");
  expect(await dialog.evaluate((element) => element.contains(document.activeElement))).toBe(true);
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole("button", { name: "遇到阻碍", exact: true })).toBeFocused();
  await page.getByRole("button", { name: "遇到阻碍", exact: true }).click();
  await page.getByLabel("自定义阻碍原因").fill("   ");
  await expect(page.getByRole("button", { name: "使用此原因" })).toBeDisabled();
  await page.getByLabel("自定义阻碍原因").fill("  资料需要补充  ");
  await page.getByRole("button", { name: "使用此原因" }).click();
  await expect(page.getByRole("heading", { name: "这是建议的新安排" })).toBeVisible();
  expect(calls.find((call) => call.method === "suggestReplan")?.input.reason).toBe("资料需要补充");
  expect(calls.filter((call) => call.method === "confirmPlan")).toHaveLength(0);
  await page.screenshot({ path: info.outputPath("replan-dialog.png"), fullPage: true });
  await page.getByRole("button", { name: "生成重排草稿" }).click();
  await expect(page.getByRole("heading", { name: "这份安排合适吗？" })).toBeVisible();
  expect(calls.filter((call) => call.method === "confirmPlan")).toHaveLength(0);
  await expect(page.getByLabel("完成 MVP Demo 交互 预计耗时（分钟）")).toHaveValue("120");
  await page.getByRole("button", { name: "确认并开始" }).click();
  await expect(page.getByRole("status")).toContainText("计划 v3 已确认");
  await page.getByRole("button", { name: "遇到阻碍", exact: true }).click();
  await page.getByRole("button", { name: "临时事项打断", exact: true }).click();
  await expect(page.getByRole("heading", { name: "这是建议的新安排" })).toBeVisible();
  await page.getByRole("button", { name: "返回", exact: true }).click();
  await page.getByRole("button", { name: "暂时不调整", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(calls.filter((call) => call.method === "confirmPlan")).toHaveLength(1);
  expect(errors).toEqual([]);
});

test("segmented and unscheduled tasks remain editable without hidden time controls", async ({
  page,
}) => {
  const tasks = starterTasks.map((task, index) => ({ ...task, duration: [240, 180, 60][index] }));
  const schedule = buildSchedule(tasks, defaultAvailability, 480);
  await boot(page, {
    state: { tasks, schedule, availability: defaultAvailability, version: 1, confirmed: false },
  });
  await expect(page.getByText("跨可用时段", { exact: true })).toBeVisible();
  await expect(page.getByText("手动安排", { exact: true })).toBeVisible();
  await page.getByLabel("回复客户邮件 开始时间").fill("19:00");
  await expect(page.getByLabel("回复客户邮件 结束时间")).toHaveValue("20:00");
  await page.getByLabel("回复客户邮件 结束时间").fill("20:15");
  await expect(page.getByLabel("回复客户邮件 预计耗时（分钟）")).toHaveValue("75");
  await page.getByLabel("回复客户邮件 结束时间").fill("19:05");
  await expect(page.getByLabel("回复客户邮件 预计耗时（分钟）")).toHaveValue("5");
  await assertLayout(page);
  await page.getByLabel("回复客户邮件 结束时间").fill("18:00");
  await expect(page.getByRole("status")).toContainText("结束时间需要晚于开始时间");
  const shortDuration = page.getByLabel("完成 MVP Demo 交互 预计耗时（分钟）");
  await shortDuration.fill("5");
  await expect(shortDuration).toHaveValue("5");
});

test("empty states, deletion and the last availability safeguard stay usable", async ({ page }) => {
  const { calls, errors } = await boot(page);
  await page.getByRole("button", { name: "删除全部本地数据" }).click();
  await expect(page.getByRole("status")).toHaveText("本地数据已删除。");
  expect(calls.some((call) => call.method === "clearData")).toBe(true);
  await page.getByRole("button", { name: "删除时段 2" }).click();
  await expect(page.getByRole("button", { name: "删除时段 1" })).toBeDisabled();
  await page.getByRole("button", { name: /02.*确认计划/ }).click();
  await expect(page.getByRole("button", { name: "添加第一项计划" })).toBeVisible();
  await page.getByRole("button", { name: "添加第一项计划" }).click();
  await expect(page.getByLabel("新计划 任务名称", { exact: true })).toBeVisible();
  await assertLayout(page);
  expect(errors).toEqual([]);
});

test("failed generation retains input, re-enables retry and dismisses feedback", async ({
  page,
}) => {
  const { errors } = await boot(page, { failGenerate: true, failLoad: true });
  await expect(page.getByRole("status")).toContainText("暂时无法读取本地计划");
  const input = page.getByLabel("今天想完成什么？");
  await input.fill("明天开会的材料");
  await page.getByRole("button", { name: "生成参考计划" }).click();
  await expect(page.getByRole("status")).toContainText("生成计划失败");
  await expect(input).toHaveValue("明天开会的材料");
  await expect(page.getByRole("button", { name: "生成参考计划" })).toBeEnabled();
  await page.getByRole("button", { name: "关闭提示" }).click();
  await expect(page.getByRole("status")).toBeEmpty();
  await input.fill("  ");
  await expect(page.getByRole("button", { name: "生成参考计划" })).toBeDisabled();
  expect(errors).toEqual([]);
});

test("long titles and extra availability do not overflow the page", async ({ page }) => {
  const state = confirmedState();
  state.tasks[0].title = "这是一个很长的任务标题，用来检查窗口缩小时是否仍能完整查看任务并操作进度";
  state.schedule = buildSchedule(state.tasks, defaultAvailability, 480);
  await boot(page, { state });
  await expect(page.locator(".focus-top h2")).toHaveText(state.tasks[0].title);
  await assertLayout(page);
  await page.getByRole("button", { name: "设置可用时段" }).click();
  for (let index = 0; index < 4; index++)
    await page.getByRole("button", { name: "添加时段" }).click();
  await assertLayout(page);
});


test('defaults to local mode and saves optional AI settings without revealing keys', async ({ page }) => {
  const { calls, errors } = await boot(page);
  await expect(page.locator('.preview-items > div')).toHaveCount(0);
  await expect(page.getByRole('button', { name: '大模型设置', exact: true })).toHaveText('本地模式');
  await page.getByLabel('今天想完成什么？').fill('写报告；准备会议');
  await page.getByRole('button', { name: '生成参考计划' }).click();
  await expect(page.getByLabel('写报告 预计耗时（分钟）')).toHaveValue('30');
  await expect(page.getByLabel('准备会议 预计耗时（分钟）')).toHaveValue('30');
  await expect(page.getByRole('status')).toContainText('每项 30 分钟');
  await page.getByRole('button', { name: '大模型设置', exact: true }).click();
  await page.getByLabel('使用大模型估算耗时', { exact: true }).check();
  await page.getByRole('button', { name: '保存设置' }).click();
  expect(calls.filter(c => c.method === 'saveAiSettings')).toHaveLength(0);
  await page.getByLabel('API Key', { exact: true }).fill('test-only-key');
  await page.getByRole('button', { name: '保存设置' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('button', { name: '大模型设置', exact: true })).toHaveText('大模型估时');
  await page.reload();
  await page.getByRole('button', { name: '大模型设置', exact: true }).click();
  await expect(page.getByLabel('API Key', { exact: true })).toHaveValue('');
  await page.getByLabel('不使用大模型', { exact: true }).check();
  await expect(page.getByLabel('API Key', { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: '保存设置' }).click();
  await expect(page.getByRole('button', { name: '大模型设置', exact: true })).toHaveText('本地模式');
  await expect(page.getByLabel('写报告 预计耗时（分钟）')).toHaveValue('30');
  expect(errors).toEqual([]);
});
