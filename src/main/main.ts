import { app, BrowserWindow, ipcMain, Notification, safeStorage, type Tray } from 'electron';
import { join } from 'node:path';
import { createWindowStartup } from './window-startup';
import { createAppTray, restoreMainWindow } from './tray';
import { buildSchedule, replanTasks, type AvailabilityBlock, type ScheduledTask, type Task } from '../shared/domain';
import { estimateTasks } from './ai-gateway';
import { AiSettingsStore } from './ai-settings';
import type { AiSettingsInput } from '../shared/ai-settings';
import { ReminderScheduler } from './scheduler';
import { TodoStore } from './store';

let store: TodoStore;
let scheduler: ReminderScheduler;
let aiSettings: AiSettingsStore;
let tray: Tray;
let quitting = false;

// Isolate packaged smoke tests from the user's data.
if (process.env.AI_TODO_TEST_USER_DATA) app.setPath('userData', process.env.AI_TODO_TEST_USER_DATA);
const hasInstanceLock = app.requestSingleInstanceLock();
if (!hasInstanceLock) app.quit();

function createWindow() {
  const window = new BrowserWindow({
    show: false,
    width: 1440,
    height: 960,
    minWidth: 1080,
    minHeight: 720,
    backgroundColor: '#eef3f2',
    icon: join(__dirname, '../renderer/icon.png'),
    webPreferences: { preload: join(__dirname, '../preload.js'), contextIsolation: true, nodeIntegration: false },
  });
  const startup = createWindowStartup(() => window.show());
  window.once('ready-to-show', () => startup.paintReady());
  const onRendererReady = (event: Electron.IpcMainEvent) => {
    if (event.sender === window.webContents) startup.rendererReady();
  };
  ipcMain.on('app:renderer-ready', onRendererReady);
  window.once('closed', () => ipcMain.removeListener('app:renderer-ready', onRendererReady));
  window.loadFile(join(__dirname, '../renderer/index.html'));
  window.setMenuBarVisibility(false);
  window.on('close', (event) => {
    if (!quitting) { event.preventDefault(); window.hide(); }
  });
  return window;
}

function registerIpc() {
  ipcMain.handle('app:load', () => store.load());
  ipcMain.handle('ai:settings', () => aiSettings.get());
  ipcMain.handle('ai:save-settings', (_event, input: AiSettingsInput) => aiSettings.save(input));
  ipcMain.handle('plan:generate', async (_event, input: { rawText: string; availability: AvailabilityBlock[] }) => {
    if (typeof input.rawText !== 'string' || input.rawText.length > 5000) throw new Error('任务输入不能超过 5000 字。');
    let settings;
    try { settings = aiSettings.runtime(); } catch {
      const result = await estimateTasks(input.rawText, { enabled: false, apiKey: '', baseUrl: '', model: '' });
      return { ...result, source: 'fallback', schedule: buildSchedule(result.tasks, input.availability) };
    }
    const result = await estimateTasks(input.rawText, settings);
    return { ...result, schedule: buildSchedule(result.tasks, input.availability) };
  });
  ipcMain.handle('plan:save-draft', (_event, input: { tasks: Task[]; availability: AvailabilityBlock[]; schedule: ScheduledTask[] }) => {
    return store.saveDraft(input.tasks, input.availability, input.schedule);
  });
  ipcMain.handle('plan:confirm', (_event, input: { tasks: Task[]; availability: AvailabilityBlock[]; schedule: ScheduledTask[]; reason?: string }) => {
    const schedule = input.schedule ?? buildSchedule(input.tasks, input.availability);
    const version = store.savePlan(input.tasks, input.availability, schedule, input.reason);
    return { ...store.load(), version };
  });
  ipcMain.handle('progress:record', (_event, input: { taskId: string; eventType: string; payload?: Record<string, unknown> }) => {
    store.recordProgress(input.taskId, input.eventType, input.payload);
    return { ok: true };
  });
  ipcMain.handle('replan:suggest', (_event, input: { tasks: Task[]; availability: AvailabilityBlock[]; currentTaskId: string; reason: string }) => {
    const tasks = replanTasks(input.tasks, input.currentTaskId, input.reason);
    return { tasks, schedule: buildSchedule(tasks, input.availability), reason: input.reason };
  });
  ipcMain.handle('reminder:snooze', (_event, input: { id: string; minutes: number }) => {
    store.snoozeReminder(input.id, input.minutes);
    return { ok: true };
  });
  ipcMain.handle('data:clear', () => {
    store.clear();
    aiSettings.clear();
    return { ok: true };
  });
}

if (hasInstanceLock) app.whenReady().then(() => {
  store = new TodoStore(join(app.getPath('userData'), 'ai-todo.sqlite'));
  aiSettings = new AiSettingsStore(join(app.getPath('userData'), 'ai-settings.json'), safeStorage);
  registerIpc();
  const window = createWindow();
  tray = createAppTray(window, join(__dirname, '../renderer/icon.png'), () => app.quit());
  app.on('second-instance', () => restoreMainWindow(window));
  scheduler = new ReminderScheduler(store, window);
  scheduler.start();
  app.on('before-quit', () => { quitting = true; scheduler.stop(); store.close(); });
  app.on('activate', () => restoreMainWindow(window));
});

app.on('window-all-closed', () => {
  // Keep the tray application alive when the main window closes.
});

export { Notification, tray };
