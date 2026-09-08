import { Notification, shell, type BrowserWindow } from 'electron';
import type { ReminderNode } from '../shared/domain';
import type { TodoStore } from './store';

function isDestroyedError(error: unknown) {
  return error instanceof Error && error.message.includes('Object has been destroyed');
}

export class ReminderScheduler {
  private timer: NodeJS.Timeout | undefined;
  private stopped = false;
  private lastTick: Date | null = null;

  constructor(private readonly store: TodoStore, private readonly window: BrowserWindow) {}

  start() {
    if (this.timer) clearInterval(this.timer);
    this.lastTick = null;
    this.stopped = false;
    this.tick();
    this.timer = setInterval(() => this.tick(), 10_000);
  }

  stop() {
    this.stopped = true;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
  }

  private tick() {
    if (this.stopped) return;
    const now = new Date();
    // A large polling gap means suspend/resume or a blocked process. Do not replay
    // reminders from that gap, just as we do not replay them on a fresh launch.
    const since = this.lastTick && now.getTime() - this.lastTick.getTime() <= 30_000 && now >= this.lastTick ? this.lastTick : now;
    this.lastTick = now;
    for (const reminder of this.store.getDueReminders(now, since)) {
      this.store.markReminderSent(reminder.id);
      const isEndReminder = reminder.kind === 'end';
      try {
        if (Notification.isSupported()) {
          new Notification({
            title: isEndReminder ? 'AI ToDo · 任务结束' : 'AI ToDo · 进度同步',
            body: isEndReminder ? '任务预计到达结束时间了，实际进展如何？' : '花半分钟同步一下当前进度。',
            silent: false,
          }).show();
        }
      } catch (error) {
        if (!isDestroyedError(error)) throw error;
      }
      try {
        shell.beep();
      } catch (error) {
        if (!isDestroyedError(error)) throw error;
      }
      this.sendToRenderer(reminder);
    }
  }

  private sendToRenderer(reminder: ReminderNode) {
    if (this.window.isDestroyed() || this.window.webContents.isDestroyed()) return;
    try {
      this.window.webContents.send('reminder:due', reminder);
    } catch (error) {
      if (!isDestroyedError(error)) throw error;
    }
  }
}
