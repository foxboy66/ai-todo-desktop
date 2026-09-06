const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { _electron: electron } = require('playwright');
const { listPackage } = require('@electron/asar');
const root = path.resolve(__dirname, '..');
(async () => {
  const profile = await fs.mkdtemp(path.join(os.tmpdir(), 'ai-todo-desktop-test-'));
  const executablePath = path.resolve(process.env.AI_TODO_TEST_EXE || path.join(root, 'release/win-unpacked/AI ToDo.exe'));
  const archiveFiles = listPackage(path.join(path.dirname(executablePath), 'resources/app.asar'));
  assert(!archiveFiles.some(file => /(^|[/\\])\.env($|\.)|\.sqlite$|ai-settings\.json$/.test(file)), 'Package must not include private configuration/data');
  let app;
  const launch = async () => {
    const env = { ...process.env, AI_TODO_TEST_USER_DATA: profile };
    delete env.ELECTRON_RUN_AS_NODE;
    delete env.DEEPSEEK_API_KEY;
    delete env.AI_GATEWAY_URL;
    app = await electron.launch({ executablePath, env, timeout: 30000 });
    const page = await app.firstWindow();
    await page.waitForFunction(() => Boolean(window.aiTodo));
    return page;
  };
  try {
    let page = await launch();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    const requests = [];
    await app.evaluate(({ session }) => {
      globalThis.__testNetworkRequests = [];
      session.defaultSession.webRequest.onBeforeRequest({ urls: ['http://*/*', 'https://*/*'] }, (details, callback) => {
        globalThis.__testNetworkRequests.push(details.url);
        callback({ cancel: true });
      });
    });
    assert.equal((await page.evaluate(() => window.aiTodo.getAiSettings())).enabled, false);
    await page.getByRole('dialog', { name: '欢迎使用 AI ToDo' }).waitFor();
    await page.waitForFunction(() => !document.querySelector('.startup-screen'));
    let visible = false;
    for (let attempt = 0; attempt < 100; attempt++) {
      visible = await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isVisible());
      if (visible) break;
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    assert.equal(visible, true, 'The prepared welcome window must become visible');
    await fs.mkdir(path.join(root, 'test-results'), { recursive: true });
    await page.screenshot({ path: path.join(root, 'test-results/desktop-welcome.png') });
    await page.getByRole('button', { name: '开始使用', exact: true }).click();
    await page.getByRole('dialog').waitFor({ state: 'detached' });
    assert.equal((await page.evaluate(() => window.aiTodo.getAiSettings())).setupCompleted, true);
    await page.getByLabel('时段 1 开始时间').fill('00:00');
    await page.getByLabel('时段 1 结束时间').fill('23:59');
    await page.getByRole('button', { name: '删除时段 2' }).click();
    await page.getByLabel('今天想完成什么？').fill('写测试报告；准备会议');
    await page.getByRole('button', { name: '生成参考计划' }).click();
    await page.getByRole('heading', { name: '这份安排合适吗？' }).waitFor();
    assert.equal(await page.getByLabel('写测试报告 预计耗时（分钟）').inputValue(), '30');
    await page.waitForFunction(async () => (await window.aiTodo.load()).tasks.length === 2);
    requests.push(...await app.evaluate(() => globalThis.__testNetworkRequests));
    assert.deepEqual(requests, [], 'Local mode must not request network');
    await page.getByRole('button', { name: '确认并开始', exact: true }).click();
    await page.getByRole('heading', { name: '按现在的节奏继续' }).waitFor();
    assert.equal(await page.getByRole('timer').locator('small').textContent(), '任务倒计时');
    assert.equal(await page.locator('.top-actions').getByRole('button', { name: '大模型设置', exact: true }).textContent(), '大模型设置');
    await page.getByRole('button', { name: '暂停任务', exact: true }).click();
    assert.equal(await page.getByRole('timer').locator('small').textContent(), '倒计时已暂停');
    await page.getByRole('button', { name: '继续任务', exact: true }).click();
    assert.equal(await page.getByRole('timer').locator('small').textContent(), '任务倒计时');
    await page.screenshot({ path: path.join(root, 'test-results/desktop-execute.png') });
    // Exercise real IPC and Windows encryption with a non-secret test key; no model request.
    const saved = await page.evaluate(async () => {
      const config = await window.aiTodo.getAiSettings();
      return window.aiTodo.saveAiSettings({ ...config, enabled: true, apiKey: 'smoke-test-key-only' });
    });
    assert.equal(saved.hasApiKey, true);
    assert.equal(saved.apiKey, undefined);
    assert(!(await fs.readFile(path.join(profile, 'ai-settings.json'), 'utf8')).includes('smoke-test-key-only'));
    await app.close(); app = undefined;
    page = await launch();
    assert.equal((await page.evaluate(() => window.aiTodo.getAiSettings())).enabled, true);
    await page.getByRole('heading', { name: '按现在的节奏继续' }).waitFor();
    assert.equal(await page.getByRole('timer').locator('small').textContent(), '任务倒计时');
    assert.equal(await page.getByRole('dialog', { name: '欢迎使用 AI ToDo' }).count(), 0);
    assert.equal((await page.evaluate(() => window.aiTodo.load())).tasks.length, 2);
    await page.getByRole('button', { name: '大模型设置', exact: true }).click();
    assert.equal(await page.getByLabel('API Key', { exact: true }).inputValue(), '');
    await fs.mkdir(path.join(root, 'test-results'), { recursive: true });
    await page.screenshot({ path: path.join(root, 'test-results/desktop-settings.png') });
    await page.getByLabel('不使用大模型', { exact: true }).check();
    await page.getByRole('button', { name: '保存设置' }).click();
    await page.getByRole('dialog').waitFor({ state: 'detached' });
    assert.equal((await page.evaluate(() => window.aiTodo.getAiSettings())).enabled, false);
    await page.screenshot({ path: path.join(root, 'test-results/desktop-local.png') });
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].close());
    assert.equal(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isDestroyed()), false);
    assert.equal(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isVisible()), false);
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].show());
    await page.evaluate(() => window.aiTodo.clearData());
    assert.equal((await page.evaluate(() => window.aiTodo.load())).tasks.length, 0);
    assert.equal((await page.evaluate(() => window.aiTodo.getAiSettings())).hasApiKey, false);
    assert.deepEqual(errors, []);
    console.log('PASS: packaged launch, real SQLite/IPC, offline 30 minutes, encrypted settings, restart, tray and clear data');
  } finally {
    if (app) await app.close();
    await fs.rm(profile, { recursive: true, force: true });
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
