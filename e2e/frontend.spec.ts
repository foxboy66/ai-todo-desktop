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
  options: { view?: 'list' | 'capture' | 'review' | 'execute'; state?: PlanSnapshot; failSaveOnce?: boolean; failUpdateOnce?: boolean; failGenerate?: boolean; failLoad?: boolean; firstRun?: boolean; failSettingsSave?: boolean; currentTime?: string } = {},
) {
  const calls: BridgeCall[] = [];
  let failedSave = false, failedUpdate = false;
  let aiSettings = { enabled: false, baseUrl: "https://api.deepseek.com", model: "deepseek-v4-flash", hasApiKey: false, setupCompleted: !options.firstRun };
  let snapshot = structuredClone(options.state ?? emptyState);
  const states = new Map<string, PlanSnapshot>();
  states.set((options.currentTime ?? '2026-09-05').slice(0, 10), snapshot);
  await page.clock.setFixedTime(new Date(options.currentTime ?? "2026-09-05T08:00:00+08:00"));
  await page.route("**/__test__/*", async (route) => {
    const method = new URL(route.request().url()).pathname.split("/").pop()!;
    const input = route.request().postDataJSON() ?? {};
    calls.push({ method, input });
    if ((method === 'saveDraft' && options.failSaveOnce && !failedSave) || (method === 'updateTask' && options.failUpdateOnce && !failedUpdate)) {
      if (method === 'saveDraft') failedSave = true; else failedUpdate = true;
      await route.fulfill({ status: 503, json: { error: 'Disk unavailable' } }); return;
    }
    if (
      (method === "generatePlan" && options.failGenerate) ||
      (method === "load" && options.failLoad) ||
      (method === "saveAiSettings" && options.failSettingsSave)
    ) {
      await route.fulfill({ status: 503, json: { error: "Unavailable" } });
      return;
    }
    const day = input.day ?? (options.currentTime ?? '2026-09-05').slice(0, 10);
    snapshot = states.get(day) ?? structuredClone(emptyState);
    let result: unknown = {};
    switch (method) {
      case "getAiSettings": result = aiSettings; break;
      case "saveAiSettings":
        aiSettings = { enabled: input.enabled, baseUrl: input.baseUrl, model: input.model, hasApiKey: Boolean(input.apiKey || aiSettings.hasApiKey), setupCompleted: true };
        result = aiSettings;
        break;
      case "listDays": result = [...states].filter(([, state]) => state.tasks.length).map(([day, state]) => ({ day, total: state.tasks.length, completed: state.tasks.filter(task => task.status === '已完成').length, pending: state.tasks.filter(task => task.status !== '已完成').length })); break;
      case "updateTask": {
        const task = snapshot.tasks.find(task => task.id === input.taskId)!;
        if (input.targetDay && input.targetDay !== day) {
          const target = states.get(input.targetDay) ?? structuredClone(emptyState);
          target.tasks.push({ ...task, ...input.patch, status: '待安排' });
          target.schedule = buildSchedule(target.tasks, target.availability, 0); target.confirmed = false;
          states.set(input.targetDay, target);
          snapshot.tasks = snapshot.tasks.filter(task => task.id !== input.taskId);
          snapshot.schedule = snapshot.schedule.filter(task => task.id !== input.taskId);
        } else if (input.patch === null) {
          snapshot.tasks = snapshot.tasks.filter(task => task.id !== input.taskId);
          snapshot.schedule = snapshot.schedule.filter(task => task.id !== input.taskId);
        } else {
          const patch = { ...input.patch };
          if (patch.status === '已完成') { patch.progress = 100; patch.completedAt = new Date().toISOString(); }
          if (patch.status === '待安排') { patch.progress = 0; patch.completedAt = undefined; }
          snapshot.tasks = snapshot.tasks.map(task => task.id === input.taskId ? { ...task, ...patch } : task);
          snapshot.schedule = snapshot.schedule.map(task => task.id === input.taskId ? { ...task, ...patch } : task);
        }
        result = snapshot; break;
      }
      case "recordProgress":
        snapshot.tasks = snapshot.tasks.map(task => task.id === input.taskId ? { ...task, progress: input.payload.value, status: input.payload.value === 100 ? '已完成' : '部分完成' } : task);
        snapshot.schedule = snapshot.schedule.map(task => ({ ...task, ...snapshot.tasks.find(item => item.id === task.id) }));
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
    if (["saveDraft", "confirmPlan", "updateTask", "recordProgress"].includes(method)) states.set(day, structuredClone(snapshot));
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
      rendererReady: () => { void request("rendererReady"); },
      getAiSettings: () => request("getAiSettings"),
      saveAiSettings: (input) => request("saveAiSettings", input),
      load: (day) => request("load", { day }),
      listDays: () => request("listDays"),
      updateTask: (input) => request("updateTask", input),
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
  await page.locator('.startup-screen').waitFor({ state: 'detached' });
  // Existing workflow tests explicitly open their working page from the new home.
  const view = options.view ?? (options.firstRun ? 'list' : options.state?.tasks.length ? options.state.confirmed ? 'execute' : 'review' : 'capture');
  if (view !== 'list') await page.getByRole('button', { name: { capture: '批量添加', review: '任务清单', execute: '执行跟进' }[view], exact: view !== 'review' }).first().click();
  return { calls, errors };
}

async function reloadAndReturn(page: Page) {
  const current = await page.getByRole('heading', { level: 1 }).textContent();
  await page.reload();
  await page.locator('.startup-screen').waitFor({ state: 'detached' });
  if (await page.getByRole('dialog', { name: '欢迎使用 AI ToDo' }).count()) return;
  const label = current?.includes('批量添加') ? '批量添加' : current?.includes('执行跟进') ? '执行跟进' : '任务清单';
  await page.getByRole('button', { name: label, exact: label !== '任务清单' }).first().click();
}

async function assertLayout(page: Page) {
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
  ).toBe(true);
  const scope = await page.getByRole("dialog").count() ? page.getByRole("dialog") : page.locator("main");
  const clipped = await scope
    .locator("input, select, textarea, button")
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
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("批量添加");
  await expect(page.getByRole('navigation', { name: '主要导航' })).toBeVisible();
  await expect(page.locator('.cat-companion')).toHaveCount(0);
  await capture(page, info, "capture");
  await page.getByRole("button", { name: "添加时段" }).click();
  await expect(page.getByLabel("时段 3 开始时间")).toHaveValue("19:00");
  await page.getByLabel("时段 3 结束时间").fill("21:00");
  await page.getByRole("button", { name: "删除时段 3" }).click();
  await page.getByLabel("时段 1 开始时间").fill("08:30");
  await page.getByLabel("今天想完成什么？").fill("准备周会材料；回复客户邮件");
  await page.getByRole("button", { name: "生成参考计划" }).click();
  await expect(page.getByRole("heading", { name: "今天的任务" })).toBeVisible();
  expect(calls.find((call) => call.method === "generatePlan")?.input.availability[0].start).toBe(
    "08:30",
  );
  await page.getByLabel("准备周会材料 任务名称", { exact: true }).fill("准备周会演示");
  await page.getByLabel("准备周会演示 完成标准", { exact: true }).fill("完成 5 页可演示的材料");
  await page.getByLabel("准备周会演示 优先级").selectOption("高");
  await page.getByLabel("准备周会演示 预计耗时（分钟）").fill("60");
  await page.getByLabel("快速添加任务").fill("新计划");
  await page.getByRole("button", { name: "添加任务", exact: true }).click();
  await expect(page.getByLabel("新计划 任务名称", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "删除 新计划", exact: true }).click();
  await capture(page, info, "review");
  await page.getByRole("button", { name: "确认并开始" }).click();
  await expect(page.getByRole("heading", { name: "执行跟进" })).toBeVisible();
  await expect(page.getByRole('timer').locator('small')).toHaveText('任务倒计时');
  await expect(page.getByRole('button', { name: '暂停任务', exact: true })).toBeVisible();
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
  await expect(page.getByRole("button", { name: "暂停任务", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "暂停任务", exact: true }).click();
  await expect(page.getByRole("timer").locator("small")).toHaveText("倒计时已暂停");
  await expect(page.getByRole("button", { name: "继续任务", exact: true })).toBeVisible();
  await page.clock.setFixedTime(new Date("2026-09-05T09:10:00+08:00"));
  await page.waitForTimeout(1100);
  await expect(countdown).toHaveText("00:30:00");
  await page.getByRole("button", { name: "继续任务", exact: true }).click();
  await expect(countdown).toHaveText("00:20:00");
  await expect(page.getByRole("timer").locator("small")).toHaveText("任务倒计时");
  await capture(page, info, "execute");
  await page.getByRole("button", { name: "标记为已完成" }).click();
  await expect(page.locator(".focus-top h2")).toHaveText("回复客户邮件");
  await expect(page.locator(".time-chip")).toHaveText("09:10–09:40");
  await expect(page.getByRole("button", { name: "暂停任务", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "开始下一任务", exact: true })).toHaveCount(0);
  await expect(page.locator(".timeline-item.done")).toContainText("准备周会演示");
  expect(calls.filter((call) => call.method === "confirmPlan").at(-1)?.input.reason).toBe("完成后自动开始下一任务");
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
  await expect(page.getByRole("timer").locator("small")).toHaveText("任务倒计时");
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
  await reloadAndReturn(page);
  await expect(page.getByRole("heading", { name: "今天的任务" })).toBeVisible();
  await expect(page.getByLabel(tasks[1].title + " 结束时间", { exact: true })).toHaveValue("17:30");
});

test("restores a confirmed plan, receives reminders and confirms replan only explicitly", async ({
  page,
}, info) => {
  const { calls, errors } = await boot(page, { state: confirmedState() });
  await expect(page.locator(".workspace-context")).toContainText("计划已确认");
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
  await expect(page.getByRole("heading", { name: "今天的任务" })).toBeVisible();
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
  await page.getByRole("button", { name: "大模型设置", exact: true }).click();
  await page.getByText("本地数据管理", { exact: true }).click();
  await page.getByRole("button", { name: "删除全部本地数据", exact: true }).click();
  await page.getByRole("button", { name: "确认删除全部数据", exact: true }).click();
  await expect(page.getByRole("status")).toHaveText("本地数据已删除。");
  await page.getByRole("button", { name: "批量添加", exact: true }).click();
  expect(calls.some((call) => call.method === "clearData")).toBe(true);
  await page.getByRole("button", { name: "删除时段 2" }).click();
  await expect(page.getByRole("button", { name: "删除时段 1" })).toBeDisabled();
  await page.locator(".sidebar").getByRole("button", { name: '任务清单' }).click();
  await expect(page.getByText("当天没有任务。添加任务后，可在这里调整时间并开始执行。")).toBeVisible();
  await page.getByLabel("快速添加任务").fill("新计划");
  await page.getByRole("button", { name: "添加任务", exact: true }).click();
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
  await expect(page.locator(".notice")).toBeEmpty();
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
  await page.locator(".sidebar").getByRole("button", { name: "任务清单" }).click();
  await page.getByRole("button", { name: "可用时段", exact: true }).click();
  for (let index = 0; index < 4; index++)
    await page.getByRole("button", { name: "添加时段" }).click();
  await assertLayout(page);
});


test('defaults to local mode and saves optional AI settings without revealing keys', async ({ page }) => {
  const { calls, errors } = await boot(page);
  await expect(page.locator('.preview-items > div')).toHaveCount(0);
  await expect(page.locator('.top-actions .local-pill')).toHaveText('本地模式');
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
  await expect(page.locator('.top-actions .local-pill')).toHaveText('大模型估时');
  await reloadAndReturn(page);
  await page.getByRole('button', { name: '大模型设置', exact: true }).click();
  await expect(page.getByLabel('API Key', { exact: true })).toHaveValue('');
  await page.getByLabel('不使用大模型', { exact: true }).check();
  await expect(page.getByLabel('API Key', { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: '保存设置' }).click();
  await expect(page.locator('.top-actions .local-pill')).toHaveText('本地模式');
  await expect(page.getByLabel('写报告 预计耗时（分钟）')).toHaveValue('30');
  expect(errors).toEqual([]);
});


test('first launch asks for a mode and remembers the local choice', async ({ page }) => {
  const { calls, errors } = await boot(page, { firstRun: true });
  const welcome = page.getByRole('dialog', { name: '欢迎使用 AI ToDo' });
  await expect(welcome).toBeVisible();
  await expect(welcome.getByLabel('不使用大模型', { exact: true })).toBeChecked();
  await expect(welcome).toContainText('每项新任务默认 30 分钟');
  await expect(welcome.getByLabel('API Key', { exact: true })).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(welcome).toBeVisible();
  await page.getByRole('button', { name: '开始使用', exact: true }).click();
  await expect(welcome).toHaveCount(0);
  expect(calls.find(c => c.method === 'saveAiSettings')?.input.enabled).toBe(false);
  await reloadAndReturn(page);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('今天的任务');
  await page.getByRole('button', { name: '批量添加', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByLabel('今天想完成什么？').fill('准备会议');
  await page.getByRole('button', { name: '生成参考计划' }).click();
  await expect(page.getByLabel('准备会议 预计耗时（分钟）')).toHaveValue('30');
  expect(errors).toEqual([]);
});

test('first launch supports opting into AI and requires a key before continuing', async ({ page }) => {
  const { calls, errors } = await boot(page, { firstRun: true });
  await page.getByLabel('使用大模型估算耗时', { exact: true }).check();
  await page.getByRole('button', { name: '开始使用', exact: true }).click();
  expect(calls.filter(c => c.method === 'saveAiSettings')).toHaveLength(0);
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByLabel('API Key', { exact: true }).fill('first-run-test-key');
  await page.getByRole('button', { name: '开始使用', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.locator('.top-actions .local-pill')).toHaveText('大模型估时');
  await reloadAndReturn(page);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('failed first-run save stays open and does not silently complete setup', async ({ page }) => {
  await boot(page, { firstRun: true, failSettingsSave: true });
  await page.getByRole('button', { name: '开始使用', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('设置未保存');
  await expect(page.getByRole('dialog', { name: '欢迎使用 AI ToDo' })).toBeVisible();
  await reloadAndReturn(page);
  await expect(page.getByRole('dialog', { name: '欢迎使用 AI ToDo' })).toBeVisible();
});


test('explicit top-right AI settings button remains available while executing and preserves the task countdown', async ({ page }) => {
  const { calls, errors } = await boot(page, { state: confirmedState(), currentTime: '2026-09-05T09:00:00+08:00' });
  const button = page.locator('.top-actions').getByRole('button', { name: '大模型设置', exact: true });
  await expect(button).toHaveText('大模型设置');
  await expect(page.getByRole('timer').locator('small')).toHaveText('任务倒计时');
  const originalCountdown = await page.getByRole('timer').locator('strong').textContent();
  await button.click();
  await page.getByLabel('使用大模型估算耗时', { exact: true }).check();
  await page.getByLabel('API Key', { exact: true }).fill('execution-test-key');
  await page.getByRole('button', { name: '保存设置' }).click();
  await expect(page.locator('.top-actions .local-pill')).toHaveText('大模型估时');
  await expect(page.getByRole('timer').locator('strong')).toHaveText(originalCountdown!);
  await expect(page.getByRole('timer').locator('small')).toHaveText('任务倒计时');
  await button.click();
  await expect(page.getByLabel('API Key', { exact: true })).toHaveValue('');
  await page.getByLabel('不使用大模型', { exact: true }).check();
  await page.getByRole('button', { name: '保存设置' }).click();
  await expect(page.locator('.top-actions .local-pill')).toHaveText('本地模式');
  expect(calls.filter(c => c.method === 'saveAiSettings').map(c => c.input.enabled)).toEqual([true, false]);
  for (const step of ['任务清单', '执行跟进']) {
    await page.locator('.sidebar').getByRole('button', { name: step }).click();
    await expect(button).toBeVisible();
    await assertLayout(page);
  }
  expect(errors).toEqual([]);
});

test('theme switch uses the toggle origin and remembers the selected theme', async ({ page }, info) => {
  const { errors } = await boot(page, { view: 'list' });
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  const toggle = page.getByRole('button', { name: '切换到深色主题', exact: true });
  await toggle.click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect.poll(() => page.evaluate(() => window.localStorage.getItem('ai-todo-theme'))).toBe('dark');
  await expect.poll(() => page.locator('html').evaluate(element => getComputedStyle(element).getPropertyValue('--theme-radius'))).toMatch(/px/);
  await capture(page, info, 'dark-theme');
  await page.reload();
  await page.locator('.startup-screen').waitFor({ state: 'detached' });
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.getByRole('button', { name: '切换到浅色主题', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  expect(errors).toEqual([]);
});

test('daily list saves completion, supports undo and keeps yesterday separate after reload', async ({ page }, info) => {
  const { errors } = await boot(page);
  await page.locator('.sidebar').getByRole('button', { name: '任务清单' }).click();
  await page.getByLabel('快速添加任务').fill('整理书桌');
  await page.getByRole('button', { name: '添加任务', exact: true }).click();
  await expect(page.getByLabel('完成 整理书桌', { exact: true })).toBeVisible();
  await page.getByLabel('完成 整理书桌', { exact: true }).click();
  await expect(page.getByLabel('完成 整理书桌', { exact: true })).toHaveCount(0);
  await page.getByLabel('任务状态筛选').selectOption('done');
  await expect(page.getByLabel('完成 整理书桌', { exact: true })).toBeChecked();
  await reloadAndReturn(page);
  await page.locator('.sidebar').getByRole('button', { name: '任务清单' }).click();
  await page.getByLabel('任务状态筛选').selectOption('done');
  await expect(page.getByLabel('完成 整理书桌', { exact: true })).toBeChecked();
  await page.getByLabel('完成 整理书桌', { exact: true }).click();
  await page.getByLabel('任务状态筛选').selectOption('pending');
  await expect(page.getByLabel('完成 整理书桌', { exact: true })).not.toBeChecked();
  await page.getByRole('button', { name: '后一天', exact: true }).click();
  await expect(page.getByLabel('查看任务日期')).toHaveValue('2026-09-06');
  await expect(page.locator('.todo-item')).toHaveCount(0);
  await page.getByRole('button', { name: '前一天', exact: true }).click();
  await expect(page.getByLabel('完成 整理书桌', { exact: true })).toBeVisible();
  await capture(page, info, 'daily-list');
  expect(errors).toEqual([]);
});

test('history tasks move manually to today and keep their edited title, priority and duration', async ({ page }, info) => {
  await boot(page);
  await page.getByRole('button', { name: '前一天', exact: true }).click();
  await page.getByLabel('快速添加任务').fill('昨日未做完');
  await page.getByRole('button', { name: '添加任务', exact: true }).click();
  await page.getByRole('button', { name: '编辑 昨日未做完', exact: true }).click();
  const editor = page.getByRole('form', { name: '编辑任务' });
  await editor.getByLabel('编辑任务名称').fill('补完报告');
  await editor.getByLabel('耗时（分钟）').fill('45');
  await editor.getByLabel('优先级').selectOption('高');
  await capture(page, info, 'daily-edit');
  await editor.getByRole('button', { name: '保存修改' }).click();
  await page.getByRole('button', { name: '回到今天', exact: true }).click();
  await expect(page.locator('.todo-item')).toHaveCount(0);
  await page.getByLabel('按日期查看', { exact: true }).selectOption('2026-09-04');
  await page.getByRole('button', { name: '移到今天 补完报告' }).click();
  await expect(page.locator('.todo-item')).toHaveCount(0);
  await page.getByRole('button', { name: '回到今天', exact: true }).click();
  await expect(page.locator('.task-title-input').first()).toHaveValue('补完报告');
  await expect(page.getByLabel('补完报告 优先级', { exact: true })).toHaveValue('高');
  await expect(page.getByLabel('补完报告 预计耗时（分钟）')).toHaveValue('45');
  await page.getByLabel('搜索当天任务').fill('无匹配');
  await expect(page.locator('.todo-item')).toHaveCount(0);
  await page.getByLabel('搜索当天任务').fill('报告');
  await expect(page.locator('.todo-item')).toHaveCount(1);
  await page.getByRole('button', { name: '删除 补完报告', exact: true }).click();
  await reloadAndReturn(page);
  await page.locator('.sidebar').getByRole('button', { name: '任务清单' }).click();
  await expect(page.locator('.todo-item')).toHaveCount(0);
});

test('midnight opens a clean today but preserves unfinished tasks on their original day', async ({ page }) => {
  await boot(page, { currentTime: '2026-09-05T23:59:50+08:00' });
  await page.locator('.sidebar').getByRole('button', { name: '任务清单' }).click();
  await page.getByLabel('快速添加任务').fill('跨天保留');
  await page.getByRole('button', { name: '添加任务', exact: true }).click();
  await expect(page.locator('.todo-item')).toHaveCount(1);
  await page.clock.setFixedTime(new Date('2026-09-06T00:00:01+08:00'));
  await expect(page.getByLabel('查看任务日期')).toHaveValue('2026-09-06');
  await expect(page.locator('.todo-item')).toHaveCount(0);
  await page.getByRole('button', { name: '前一天', exact: true }).click();
  await expect(page.locator('.task-title-input').first()).toHaveValue('跨天保留');
  await page.clock.setFixedTime(new Date('2026-09-07T00:00:01+08:00'));
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(page.getByLabel('查看任务日期')).toHaveValue('2026-09-05');
});

test('future plans are scheduled against their own date and do not start today countdown', async ({ page }) => {
  const { calls } = await boot(page, { currentTime: '2026-09-05T17:30:00+08:00' });
  await page.getByRole('button', { name: '后一天', exact: true }).click();
  await page.getByLabel('快速添加任务').fill('明天的计划');
  await page.getByRole('button', { name: '添加任务', exact: true }).click();
  await expect(page.getByLabel('明天的计划 开始时间')).toHaveValue('09:00');
  await page.getByRole('button', { name: '确认该日计划', exact: true }).click();
  await expect(page.getByRole('heading', { name: '这一天的任务' })).toBeVisible();
  await expect(page.getByRole('timer')).toHaveCount(0);
  expect(calls.find(call => call.method === 'confirmPlan')?.input.day).toBe('2026-09-06');
  await page.getByRole('button', { name: '回到今天', exact: true }).click();
  await expect(page.locator('.todo-item')).toHaveCount(0);
});

test('generating additional tasks preserves existing tasks and completion', async ({ page }) => {
  await boot(page);
  await page.locator('.sidebar').getByRole('button', { name: '任务清单' }).click();
  await page.getByLabel('快速添加任务').fill('已做完的事');
  await page.getByRole('button', { name: '添加任务', exact: true }).click();
  await page.getByLabel('完成 已做完的事', { exact: true }).click();
  await expect(page.locator('.todo-item')).toHaveCount(0);
  await page.getByRole('button', { name: '批量添加' }).click();
  await page.getByLabel('今天想完成什么？').fill('新增的事');
  await page.getByRole('button', { name: '生成参考计划', exact: true }).click();
  await page.locator('.sidebar').getByRole('button', { name: '任务清单' }).click();
  await page.getByLabel('任务状态筛选').selectOption('all');
  await expect(page.locator('.todo-item')).toHaveCount(2);
  await expect(page.getByLabel('完成 已做完的事', { exact: true })).toBeChecked();
  await expect(page.getByLabel('完成 新增的事', { exact: true })).not.toBeChecked();
});

test('failed completion keeps the task pending and can be retried', async ({ page }) => {
  await boot(page, { failUpdateOnce: true });
  await page.locator('.sidebar').getByRole('button', { name: '任务清单' }).click();
  await page.getByLabel('快速添加任务').fill('保存失败后重试');
  await page.getByRole('button', { name: '添加任务', exact: true }).click();
  await page.getByLabel('完成 保存失败后重试', { exact: true }).click();
  await expect(page.getByRole('status')).toContainText('任务保存失败');
  await expect(page.getByLabel('完成 保存失败后重试', { exact: true })).not.toBeChecked();
  await page.getByLabel('完成 保存失败后重试', { exact: true }).click();
  await expect(page.locator('.todo-item')).toHaveCount(0);
  await page.getByLabel('任务状态筛选').selectOption('done');
  await expect(page.getByLabel('完成 保存失败后重试', { exact: true })).toBeChecked();
});

test('failed draft prevents date switching until retry saves the edited content', async ({ page }) => {
  const tasks = parseTaskInput('需要保存的修改');
  await boot(page, { state: { ...emptyState, tasks, schedule: buildSchedule(tasks, defaultAvailability, 0) }, failSaveOnce: true });
  await page.getByLabel('需要保存的修改 任务名称', { exact: true }).fill('重新保存后的任务');
  await expect(page.getByRole('button', { name: '重试保存当前任务' })).toBeVisible();
  await page.getByRole('button', { name: '后一天', exact: true }).click();
  await expect(page.getByLabel('查看任务日期')).toHaveValue('2026-09-05');
  await expect(page.getByRole('status')).toContainText('切换日期失败');
  await page.getByRole('button', { name: '重试保存当前任务' }).click();
  await expect(page.getByRole('button', { name: '重试保存当前任务' })).toHaveCount(0);
  await page.getByRole('button', { name: '后一天', exact: true }).click();
  await expect(page.getByLabel('查看任务日期')).toHaveValue('2026-09-06');
  await page.getByRole('button', { name: '前一天', exact: true }).click();
  await expect(page.locator('.task-title-input').first()).toHaveValue('重新保存后的任务');
});

test('review arrow controls reorder tasks, recalculate times and preserve the order after reload and confirmation', async ({ page }, info) => {
  const tasks = parseTaskInput('整理资料；撰写报告；检查邮件');
  tasks[1].duration = 60;
  const { calls, errors } = await boot(page, { state: { ...emptyState, tasks, schedule: buildSchedule(tasks, defaultAvailability, 0) } });
  await expect(page.getByRole('button', { name: '上移 整理资料', exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: '下移 检查邮件', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: '下移 整理资料', exact: true }).click();
  await expect(page.locator('.task-title-input').nth(0)).toHaveValue('撰写报告');
  await expect(page.getByLabel('撰写报告 开始时间', { exact: true })).toHaveValue('09:00');
  await expect(page.getByLabel('撰写报告 结束时间', { exact: true })).toHaveValue('10:00');
  await expect(page.getByLabel('整理资料 开始时间', { exact: true })).toHaveValue('10:00');
  await page.getByRole('button', { name: '上移 检查邮件', exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('.task-title-input').nth(1)).toHaveValue('检查邮件');
  await expect(page.getByRole('status')).toContainText('任务顺序已保存');
  await reloadAndReturn(page);
  await expect(page.locator('.task-title-input').nth(0)).toHaveValue('撰写报告');
  await expect(page.locator('.task-title-input').nth(1)).toHaveValue('检查邮件');
  await expect(page.locator('.task-title-input').nth(2)).toHaveValue('整理资料');
  await capture(page, info, 'review-task-order');
  await page.getByRole('button', { name: '确认并开始', exact: true }).click();
  await expect(page.getByRole('timer').locator('small')).toHaveText('任务倒计时');
  const saved = calls.find(call => call.method === 'confirmPlan')!.input;
  expect(saved.tasks.map((task: { title: string }) => task.title)).toEqual(['撰写报告', '检查邮件', '整理资料']);
  expect(saved.schedule.map((task: { title: string }) => task.title)).toEqual(['撰写报告', '检查邮件', '整理资料']);
  expect(errors).toEqual([]);
});

test('review drag handle moves a task to the target position without confirming the draft', async ({ page }) => {
  const tasks = parseTaskInput('整理资料；撰写报告；检查邮件');
  const { calls, errors } = await boot(page, { state: { ...emptyState, tasks, schedule: buildSchedule(tasks, defaultAvailability, 0), confirmed: true, version: 1 } });
  await page.locator('.sidebar').getByRole('button', { name: '任务清单' }).click();
  await page.locator('.task-row').first().evaluate(row => row.scrollIntoView({ block: 'start' }));
  async function dragTask(sourceName: string, targetName: string) {
    const source = page.getByRole('img', { name: '拖动排序 ' + sourceName, exact: true });
    const target = page.getByLabel(targetName + ' 任务名称', { exact: true })
      .locator('xpath=ancestor::div[contains(@class,"task-row")]');
    const sourceBox = await source.boundingBox();
    const targetBox = await target.boundingBox();
    expect(sourceBox).not.toBeNull();
    expect(targetBox).not.toBeNull();
    await page.mouse.move(sourceBox!.x + sourceBox!.width / 2, sourceBox!.y + sourceBox!.height / 2);
    await page.mouse.down();
    await page.mouse.move(targetBox!.x + targetBox!.width / 2, targetBox!.y + targetBox!.height / 2, { steps: 8 });
    const settledTargetBox = await target.boundingBox();
    expect(settledTargetBox).not.toBeNull();
    const dropRatio = sourceBox!.y > targetBox!.y ? .2 : .8;
    await page.mouse.move(
      settledTargetBox!.x + settledTargetBox!.width / 2,
      settledTargetBox!.y + settledTargetBox!.height * dropRatio,
      { steps: 4 },
    );
    await expect(page.locator('.task-drag-preview')).toBeVisible();
    await expect(page.locator('.task-drop-placeholder')).toContainText('松手放在这里');
    await page.mouse.up();
  }
  await dragTask('检查邮件', '整理资料');
  await expect(page.locator('.task-title-input').nth(0)).toHaveValue('检查邮件');
  await expect(page.getByRole('status')).toContainText('任务顺序已保存');
  expect(calls.filter(call => call.method === 'confirmPlan')).toHaveLength(0);
  await reloadAndReturn(page);
  await expect(page.getByRole('heading', { name: '今天的任务' })).toBeVisible();
  await expect(page.locator('.task-title-input').nth(0)).toHaveValue('检查邮件');
  await expect(page.getByLabel('检查邮件 开始时间', { exact: true })).toHaveValue('09:00');
  await page.locator('.task-row').first().evaluate(row => row.scrollIntoView({ block: 'start' }));
  await dragTask('检查邮件', '撰写报告');
  await expect(page.locator('.task-title-input').nth(2)).toHaveValue('检查邮件');
  await expect(page.locator('.task-row.dragging, .task-drop-placeholder, .task-drag-preview')).toHaveCount(0);
  expect(errors).toEqual([]);
});


test('home opens on the task list, adds inline and edits through a focused dialog', async ({ page }, info) => {
  const { calls, errors } = await boot(page, { view: 'list' });
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('今天的任务');
  await expect(page.getByLabel('查看任务日期')).toHaveCount(1);
  await page.getByLabel('快速添加任务').fill('检查新首页');
  await page.getByLabel('快速添加任务').press('Enter');
  await expect(page.locator('.task-title-input').first()).toHaveValue('检查新首页');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('今天的任务');
  expect(calls.filter(call => call.method === 'confirmPlan')).toHaveLength(0);
  await capture(page, info, 'home');
  const edit = page.getByRole('button', { name: '编辑 检查新首页', exact: true });
  await edit.click();
  await expect(page.getByRole('dialog', { name: '编辑任务', exact: true })).toBeVisible();
  await page.getByLabel('编辑任务名称').fill('未保存的修改');
  await capture(page, info, 'task-editor');
  await page.keyboard.press('Escape');
  await expect(edit).toBeFocused();
  await expect(page.locator('.task-title-input').first()).toHaveValue('检查新首页');
  await page.reload();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('今天的任务');
  await expect(page.locator('.task-title-input').first()).toHaveValue('检查新首页');
  expect(errors).toEqual([]);
});

test('confirmed plans open on home and navigation preserves a paused countdown', async ({ page }, info) => {
  await boot(page, { state: confirmedState(), view: 'list' });
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('今天的任务');
  await page.getByRole('button', { name: '进入执行', exact: true }).click();
  await page.getByRole('button', { name: '暂停任务', exact: true }).click();
  const paused = await page.getByRole('timer').textContent();
  await page.locator('.sidebar').getByRole('button', { name: '任务清单' }).click();
  await page.getByRole('button', { name: '进入执行', exact: true }).click();
  await expect(page.getByRole('timer')).toHaveText(paused!);
  await expect(page.getByRole('button', { name: '继续任务', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: '继续任务', exact: true }).click();
  await expect(page.getByRole('timer').locator('small')).toHaveText('任务倒计时');
  await capture(page, info, 'focused-execution');
});

test('execution guides empty and draft plans and availability is editable in review', async ({ page }, info) => {
  const { calls } = await boot(page, { view: 'list' });
  await page.getByRole('button', { name: '执行跟进', exact: true }).click();
  await page.getByRole('button', { name: '添加第一项任务', exact: true }).click();
  await page.getByLabel('快速添加任务').fill('规划一天');
  await page.getByRole('button', { name: '添加任务', exact: true }).click();
  await expect(page.locator('.todo-item')).toHaveCount(1);
  await page.getByRole('button', { name: '执行跟进', exact: true }).click();
  await page.getByRole('button', { name: '返回任务清单', exact: true }).click();
  await page.getByRole('button', { name: '可用时段', exact: true }).click();
  await page.getByLabel('时段 1 开始时间').fill('10:00');
  await expect.poll(() => calls.filter(call => call.method === 'saveDraft').at(-1)?.input.availability[0].start).toBe('10:00');
  await page.getByRole('button', { name: '完成设置', exact: true }).click();
  await expect(page.getByLabel('规划一天 开始时间')).toHaveValue('10:00');
  await expect(page.locator('.workspace-context')).toContainText('计划待确认');
  expect(calls.filter(call => call.method === 'confirmPlan')).toHaveLength(0);
  await capture(page, info, 'plan-review');
});

test('canceling destructive data removal preserves the plan', async ({ page }, info) => {
  const { calls } = await boot(page, { state: confirmedState(), view: 'list' });
  await page.getByRole('button', { name: '大模型设置', exact: true }).click();
  await page.getByText('本地数据管理', { exact: true }).click();
  await page.getByRole('button', { name: '删除全部本地数据', exact: true }).click();
  await capture(page, info, 'delete-confirmation');
  await page.getByRole('button', { name: '取消删除', exact: true }).click();
  expect(calls.filter(call => call.method === 'clearData')).toHaveLength(0);
  await expect(page.locator('.todo-item')).toHaveCount(starterTasks.length);
  await expect(page.getByRole('button', { name: '进入执行', exact: true })).toBeVisible();
});


test('settings keyboard navigation reaches collapsed data management and cycles inside the dialog', async ({ page }) => {
  await boot(page, { view: 'list' });
  await page.getByRole('button', { name: '大模型设置', exact: true }).click();
  const summary = page.locator('.data-settings summary');
  await page.getByRole('button', { name: '保存设置', exact: true }).focus();
  await page.keyboard.press('Tab');
  await expect(summary).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.getByLabel('不使用大模型', { exact: true })).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(summary).toBeFocused();
  await page.keyboard.press('Enter');
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: '删除全部本地数据', exact: true })).toBeFocused();
});


test('bulk entry is a child page with a return action that preserves its draft', async ({ page }, info) => {
  const { calls } = await boot(page, { view: 'list' });
  await expect(page.locator('.step-nav button')).toHaveCount(2);
  await expect(page.locator('.sidebar').getByRole('button', { name: /批量|确认计划/ })).toHaveCount(0);
  await page.getByRole('button', { name: '批量添加', exact: true }).click();
  await page.getByLabel('今天想完成什么？').fill('准备材料；整理笔记');
  await capture(page, info, 'bulk-with-return');
  await page.getByRole('button', { name: '返回任务清单', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('今天的任务');
  await expect(page.locator('.todo-item')).toHaveCount(0);
  await page.getByRole('button', { name: '批量添加', exact: true }).click();
  await expect(page.getByLabel('今天想完成什么？')).toHaveValue('准备材料；整理笔记');
  await page.getByRole('button', { name: '生成参考计划', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('今天的任务');
  await expect(page.locator('.todo-item')).toHaveCount(2);
  await expect(page.getByLabel('准备材料 开始时间')).toBeVisible();
  await expect(page.getByLabel('完成 准备材料', { exact: true })).toBeVisible();
  expect(calls.filter(call => call.method === 'confirmPlan')).toHaveLength(0);
  await capture(page, info, 'unified-tasks');
});

test('date selection contains only dates and a restart opens an empty today', async ({ page }, info) => {
  await boot(page, { view: 'list' });
  await page.getByRole('button', { name: '前一天', exact: true }).click();
  await page.getByLabel('快速添加任务').fill('留在昨天');
  await page.getByRole('button', { name: '添加任务', exact: true }).click();
  await expect(page.getByLabel('完成 留在昨天', { exact: true })).toBeVisible();
  const dates = page.getByLabel('按日期查看', { exact: true });
  await expect(dates).toHaveValue('2026-09-04');
  await expect(dates.locator('option')).toHaveText(['2026-09-05', '2026-09-04']);
  await page.reload();
  await expect(page.getByLabel('查看任务日期')).toHaveValue('2026-09-05');
  await expect(dates).toHaveValue('2026-09-05');
  await expect(page.locator('.todo-item')).toHaveCount(0);
  await expect(page.getByText('当天没有任务。添加任务后，可在这里调整时间并开始执行。')).toBeVisible();
  await expect(page.getByRole('button', { name: '确认并开始', exact: true })).toBeDisabled();
  await capture(page, info, 'empty-today');
  await dates.selectOption('2026-09-04');
  await expect(page.getByLabel('完成 留在昨天', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '批量添加', exact: true }).click();
  await page.getByRole('button', { name: '返回任务清单', exact: true }).click();
  await expect(dates).toHaveValue('2026-09-04');
});
