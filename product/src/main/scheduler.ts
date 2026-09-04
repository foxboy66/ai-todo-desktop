import { Notification, type BrowserWindow } from 'electron';
import { TodoStore } from './store';

export class ReminderScheduler {
  private timer: NodeJS.Timeout | undefined;

  constructor(private readonly store: TodoStore, private readonly window: BrowserWindow) {}

  start() {
    this.tick();
    this.timer = setInterval(() => this.tick(), 10_000);
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
  }

  private tick() {
    for (const reminder of this.store.getDueReminders()) {
      this.store.markReminderSent(reminder.id);
      if (Notification.isSupported()) {
        new Notification({ title: 'AI ToDo · 进度同步', body: reminder.kind === 'end' ? '任务预计到达结束时间了，实际进展如何？' : '花半分钟同步一下当前进度。' }).show();
      }
      this.window.webContents.send('reminder:due', reminder);
    }
  }
}
