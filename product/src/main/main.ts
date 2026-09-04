import { app, BrowserWindow, ipcMain, Menu, Notification, nativeImage, Tray } from 'electron';
import { join } from 'node:path';
import { buildSchedule, replanTasks, type AvailabilityBlock, type ScheduledTask, type Task } from '../shared/domain';
import { parseTasksWithGateway } from './ai-gateway';
import { ReminderScheduler } from './scheduler';
import { TodoStore } from './store';

let store: TodoStore;
let scheduler: ReminderScheduler;

function createWindow() {
  const window = new BrowserWindow({
    width: 1440,
    height: 960,
    minWidth: 1080,
    minHeight: 720,
    backgroundColor: '#eef3f2',
    webPreferences: { preload: join(__dirname, '../preload.js'), contextIsolation: true, nodeIntegration: false },
  });
  window.loadFile(join(__dirname, '../renderer/index.html'));
  return window;
}

function registerIpc() {
  ipcMain.handle('app:load', () => store.load());
  ipcMain.handle('plan:generate', async (_event, input: { rawText: string; availability: AvailabilityBlock[] }) => {
    const tasks = await parseTasksWithGateway(input.rawText);
    return { tasks, schedule: buildSchedule(tasks, input.availability) };
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
    return { ok: true };
  });
}

app.whenReady().then(() => {
  store = new TodoStore(join(app.getPath('userData'), 'ai-todo.sqlite'));
  registerIpc();
  const window = createWindow();
  const tray = new Tray(nativeImage.createEmpty());
  tray.setToolTip('AI ToDo');
  tray.setContextMenu(Menu.buildFromTemplate([{ label: '打开 AI ToDo', click: () => window.show() }, { label: '退出', click: () => app.quit() }]));
  scheduler = new ReminderScheduler(store, window);
  scheduler.start();
  app.on('before-quit', () => { scheduler.stop(); store.close(); });
  app.on('activate', () => window.show());
});

app.on('window-all-closed', () => {
  // Keep the tray application alive when the main window closes.
});

export { Notification };
