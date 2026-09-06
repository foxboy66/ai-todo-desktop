const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const net = require('node:net');
const { spawn, execFileSync } = require('node:child_process');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '..');
const delay = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
(async () => {
  const profile = await fs.mkdtemp(path.join(os.tmpdir(), 'ai-todo-portable-test-'));
  const server = net.createServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  await new Promise(resolve => server.close(resolve));
  const env = { ...process.env, AI_TODO_TEST_USER_DATA: profile };
  delete env.ELECTRON_RUN_AS_NODE;
  const version = require('../package.json').version;
  const executable = path.join(root, 'release', 'AI-ToDo-' + version + '-x64-portable.exe');
  const child = spawn(executable, ['--remote-debugging-port=' + port, '--remote-debugging-address=127.0.0.1'], { env, windowsHide: true, stdio: 'ignore' });
  let browser;
  try {
    let endpoint;
    for (let attempt = 0; attempt < 90; attempt++) {
      try {
        const response = await fetch('http://127.0.0.1:' + port + '/json/version', { signal: AbortSignal.timeout(500) });
        endpoint = (await response.json()).webSocketDebuggerUrl;
        if (endpoint) break;
      } catch { /* The portable launcher is still extracting the app. */ }
      if (child.exitCode !== null) throw new Error('Portable launcher exited: ' + child.exitCode);
      await delay(500);
    }
    assert(endpoint, 'Portable app did not expose its test debugging endpoint');
    browser = await chromium.connectOverCDP(endpoint);
    const page = browser.contexts()[0].pages()[0];
    await page.waitForFunction(() => Boolean(window.aiTodo));
    assert.equal((await page.evaluate(() => window.aiTodo.getAiSettings())).enabled, false);
    await page.getByRole('dialog', { name: '欢迎使用 AI ToDo' }).waitFor();
    await page.getByRole('button', { name: '开始使用', exact: true }).click();
    await page.getByRole('dialog').waitFor({ state: 'detached' });
    await page.getByLabel('今天想完成什么？').fill('验证便携版');
    await page.getByRole('button', { name: '生成参考计划' }).click();
    await page.getByRole('heading', { name: '这份安排合适吗？' }).waitFor();
    assert.equal(await page.getByLabel('验证便携版 预计耗时（分钟）').inputValue(), '30');
    console.log('PASS: portable self-extraction, launch, real IPC and local 30-minute task generation');
  } finally {
    if (browser) await browser.close();
    if (child.exitCode === null) {
      // Terminate only the test launcher and its own child processes.
      try { execFileSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' }); } catch { /* It may have exited already. */ }
    }
    await fs.rm(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
  }
})().catch(error => { console.error(error); process.exitCode = 1; });