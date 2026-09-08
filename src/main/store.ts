import Database from 'better-sqlite3';
import { buildSchedule, defaultAvailability, formatReminderDueAt, normalizeReminderDueAt } from '../shared/domain';
import { localDayText, parseDay, scheduleStart, type DailyState, type DaySummary } from '../shared/daily';
import type { AvailabilityBlock, ReminderNode, ScheduledTask, Task } from '../shared/domain';

export class TodoStore {
  private readonly db: Database.Database;

  constructor(filePath: string) {
    this.db = new Database(filePath);
    this.db.pragma('journal_mode = WAL');
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS daily_state (day TEXT PRIMARY KEY, payload TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS daily_versions (day TEXT NOT NULL, version INTEGER NOT NULL, payload TEXT NOT NULL, reason TEXT, created_at TEXT NOT NULL, PRIMARY KEY(day, version));
      CREATE TABLE IF NOT EXISTS daily_reminders (id TEXT PRIMARY KEY, day TEXT NOT NULL, task_id TEXT NOT NULL, kind TEXT NOT NULL, due_at TEXT NOT NULL, status TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS idx_daily_reminders_due ON daily_reminders(status, due_at);
      CREATE TABLE IF NOT EXISTS daily_events (id INTEGER PRIMARY KEY, day TEXT NOT NULL, task_id TEXT NOT NULL, event_type TEXT NOT NULL, payload TEXT NOT NULL, created_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS store_migrations (name TEXT PRIMARY KEY);
    `);
    this.migrateLegacy();
  }

  private migrateLegacy() {
    this.db.transaction(() => {
      if (this.db.prepare('SELECT name FROM store_migrations WHERE name = ?').get('daily-v1')) return;
      const legacyExists = this.db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='plans'").get();
      if (legacyExists) {
        const plan = this.db.prepare("SELECT day, current_version, status FROM plans WHERE id='today'").get() as { day: string; current_version: number; status: string } | undefined;
        if (plan) {
          const rows = this.db.prepare("SELECT version_no, payload, reason, created_at FROM plan_versions WHERE plan_id='today' ORDER BY created_at DESC").all() as Array<{ version_no: number; payload: string; reason: string; created_at: string }>;
          const snapshot = rows.find(row => row.version_no === (plan.status === 'draft' ? 0 : plan.current_version));
          // Old confirmed saves did not update plans.day. The snapshot timestamp identifies
          // the last edited day; retain all original tables as a migration backup.
          const day = snapshot ? localDayText(new Date(snapshot.created_at)) : plan.day;
          parseDay(day);
          const tasks = (this.db.prepare('SELECT payload FROM tasks ORDER BY rowid').all() as Array<{ payload: string }>).map(row => JSON.parse(row.payload) as Task);
          const availability = (this.db.prepare('SELECT payload FROM availability_windows ORDER BY rowid').all() as Array<{ payload: string }>).map(row => JSON.parse(row.payload) as AvailabilityBlock);
          const events = this.db.prepare('SELECT task_id, event_type, payload, created_at FROM progress_events ORDER BY created_at, rowid').all() as Array<{ task_id: string; event_type: string; payload: string; created_at: string }>;
          for (const event of events) {
            const task = tasks.find(item => item.id === event.task_id);
            const value = (JSON.parse(event.payload) as { value?: number }).value;
            if (task && typeof value === 'number' && value >= 0 && value <= 100) {
              task.progress = value;
              if (value === 100) { task.status = '已完成'; task.completedAt = event.created_at; }
            }
            this.db.prepare('INSERT INTO daily_events(day, task_id, event_type, payload, created_at) VALUES (?, ?, ?, ?, ?)').run(day, event.task_id, event.event_type, event.payload, event.created_at);
          }
          const schedule = ((snapshot ? JSON.parse(snapshot.payload).schedule : []) as ScheduledTask[]).map(item => ({ ...item, ...tasks.find(task => task.id === item.id) }));
          const state: DailyState = { day, tasks, availability, schedule, version: plan.current_version, confirmed: plan.status === 'confirmed', history: [] };
          this.write(state);
          for (const row of rows.filter(item => item.version_no > 0)) this.db.prepare('INSERT OR IGNORE INTO daily_versions VALUES (?, ?, ?, ?, ?)').run(day, row.version_no, row.payload, row.reason, row.created_at);
          if (state.confirmed) {
            this.replaceReminders(state);
            const oldReminders = this.db.prepare('SELECT task_id, kind, due_at, status FROM reminders').all() as Array<{ task_id: string; kind: string; due_at: string; status: string }>;
            for (const reminder of oldReminders) this.db.prepare('UPDATE daily_reminders SET status=? WHERE day=? AND task_id=? AND kind=? AND due_at=?').run(reminder.status, day, reminder.task_id, reminder.kind, normalizeReminderDueAt(reminder.due_at));
          }
        }
      }
      this.db.prepare('INSERT INTO store_migrations VALUES (?)').run('daily-v1');
    })();
  }

  load(day = localDayText()): DailyState {
    parseDay(day);
    const row = this.db.prepare('SELECT payload FROM daily_state WHERE day = ?').get(day) as { payload: string } | undefined;
    const state: DailyState = row ? JSON.parse(row.payload) : { day, tasks: [], availability: structuredClone(defaultAvailability), schedule: [], version: 0, confirmed: false };
    state.history = this.db.prepare('SELECT version, created_at as createdAt, reason FROM daily_versions WHERE day = ? ORDER BY version DESC').all(day) as DailyState['history'];
    return state;
  }

  listDays(): DaySummary[] {
    return (this.db.prepare('SELECT day, payload FROM daily_state ORDER BY day DESC').all() as Array<{ day: string; payload: string }>).map(row => {
      const tasks = (JSON.parse(row.payload) as DailyState).tasks;
      const completed = tasks.filter(task => task.status === '已完成').length;
      return { day: row.day, total: tasks.length, completed, pending: tasks.filter(task => task.status !== '已完成' && task.status !== '已取消').length };
    }).filter(day => day.total > 0);
  }

  private write(state: DailyState) {
    this.db.prepare('INSERT INTO daily_state(day, payload) VALUES (?, ?) ON CONFLICT(day) DO UPDATE SET payload=excluded.payload').run(state.day, JSON.stringify({ ...state, history: [] }));
  }

  private replaceReminders(state: DailyState) {
    const previous = this.db.prepare('SELECT id, due_at, status FROM daily_reminders WHERE day = ?').all(state.day) as Array<{ id: string; due_at: string; status: string }>;
    this.db.prepare('DELETE FROM daily_reminders WHERE day = ?').run(state.day);
    if (!state.confirmed) return;
    const insert = this.db.prepare('INSERT INTO daily_reminders VALUES (?, ?, ?, ?, ?, ?)');
    for (const task of state.schedule) {
      if (!task.scheduled || task.status === '已完成' || task.status === '已取消') continue;
      const nodes = [{ kind: 'start', label: task.startLabel }, ...task.checkpoints.map(label => ({ kind: 'checkpoint', label })), { kind: 'end', label: task.endLabel }];
      nodes.forEach((node, index) => {
        const id = `${state.day}:${task.id}:${index}`;
        const dueAt = formatReminderDueAt(parseDay(state.day), node.label);
        const old = previous.find(item => item.id === id && item.due_at === dueAt);
        insert.run(id, state.day, task.id, node.kind, dueAt, old?.status ?? 'pending');
      });
    }
  }

  savePlan(tasks: Task[], availability: AvailabilityBlock[], schedule: ScheduledTask[], reason?: string, date: Date | string = localDayText()) {
    const day = typeof date === 'string' ? date : localDayText(date);
    return this.db.transaction(() => {
      const state = this.load(day);
      const version = state.version + 1;
      const next = { ...state, tasks, availability, schedule, version, confirmed: true };
      this.write(next);
      this.db.prepare('INSERT INTO daily_versions VALUES (?, ?, ?, ?, ?)').run(day, version, JSON.stringify(next), reason ?? null, new Date().toISOString());
      this.replaceReminders(next);
      return version;
    })();
  }

  saveDraft(tasks: Task[], availability: AvailabilityBlock[], schedule: ScheduledTask[], date: Date | string = localDayText()) {
    const day = typeof date === 'string' ? date : localDayText(date);
    return this.db.transaction(() => {
      const state = { ...this.load(day), tasks, availability, schedule, confirmed: false };
      this.write(state);
      this.replaceReminders(state);
      return state;
    })();
  }

  updateTask(day: string, taskId: string, patch: Partial<Task> | null, targetDay?: string) {
    return this.db.transaction(() => {
      const state = this.load(day);
      const task = state.tasks.find(item => item.id === taskId);
      if (!task) throw new Error('任务不存在，请重新加载');
      if (targetDay && targetDay !== day) {
        const target = this.load(targetDay);
        if (target.tasks.some(item => item.id === taskId)) throw new Error('目标日期已存在此任务');
        const moved = { ...task, ...patch, id: task.id, status: '待安排' as const, completedAt: undefined };
        if (!moved.title.trim() || !Number.isFinite(moved.duration) || moved.duration < 1 || moved.duration > 1440) throw new Error('任务内容无效');
        if (task.status === '已完成') moved.progress = 0;
        target.tasks.push(moved);
        target.schedule = buildSchedule(target.tasks, target.availability, scheduleStart(targetDay));
        target.confirmed = false;
        this.write(target);
        this.replaceReminders(target);
        state.tasks = state.tasks.filter(item => item.id !== taskId);
        state.schedule = state.schedule.filter(item => item.id !== taskId);
      } else if (patch === null) {
        state.tasks = state.tasks.filter(item => item.id !== taskId);
        state.schedule = state.schedule.filter(item => item.id !== taskId);
      } else {
        const updated = { ...task, ...patch, id: task.id };
        if (updated.status === '已完成') { updated.progress = 100; updated.completedAt ??= new Date().toISOString(); }
        else { updated.completedAt = undefined; if (task.status === '已完成') updated.progress = 0; }
        if (!updated.title.trim() || !Number.isFinite(updated.duration) || updated.duration < 1 || updated.duration > 1440) throw new Error('请填写任务名称和 1–1440 分钟的耗时');
        state.tasks = state.tasks.map(item => item.id === taskId ? updated : item);
        state.schedule = state.schedule.map(item => item.id === taskId ? { ...item, ...updated } : item);
        if (patch.duration !== undefined || patch.priority !== undefined || (task.status === '已完成' && updated.status !== '已完成')) {
          state.confirmed = false;
          state.schedule = buildSchedule(state.tasks, state.availability, scheduleStart(day));
        }
      }
      this.write(state);
      this.replaceReminders(state);
      return state;
    })();
  }

  recordProgress(taskId: string, eventType: string, payload: Record<string, unknown> = {}, day = localDayText()) {
    this.db.transaction(() => {
      const value = payload.value;
      if (typeof value !== 'number' || value < 0 || value > 100 || !Number.isFinite(value)) throw new Error('进度需要在 0–100 之间');
      this.updateTask(day, taskId, { progress: value, status: value === 100 ? '已完成' : '部分完成' });
      this.db.prepare('INSERT INTO daily_events(day, task_id, event_type, payload, created_at) VALUES (?, ?, ?, ?, ?)').run(day, taskId, eventType, JSON.stringify(payload), new Date().toISOString());
    })();
  }

  getDueReminders(now = new Date(), notBefore = new Date(now.getTime() - 30_000)) {
    // Expire the entire backlog before applying the delivery limit. Startup/resume
    // uses now as the cutoff, so missing progress never triggers catch-up alerts.
    const start = new Date(now); start.setHours(0, 0, 0, 0);
    const cutoff = new Date(Math.max(start.getTime(), notBefore.getTime()));
    return this.db.transaction(() => {
      this.db.prepare("UPDATE daily_reminders SET status='expired' WHERE status='pending' AND due_at < ?").run(cutoff.toISOString());
      return this.db.prepare("SELECT id, task_id as taskId, kind, due_at as dueAt, status FROM daily_reminders WHERE status='pending' AND due_at >= ? AND due_at <= ? ORDER BY due_at LIMIT 20").all(cutoff.toISOString(), now.toISOString()) as ReminderNode[];
    })();
  }
  markReminderSent(id: string) { this.db.prepare("UPDATE daily_reminders SET status='sent' WHERE id=? AND status='pending'").run(id); }
  snoozeReminder(id: string, minutes: number) {
    if (!Number.isFinite(minutes) || minutes <= 0 || minutes > 1440) throw new Error('延后分钟数无效');
    const row = this.db.prepare("SELECT due_at FROM daily_reminders WHERE id=? AND status='pending'").get(id) as { due_at: string } | undefined;
    if (row) this.db.prepare('UPDATE daily_reminders SET due_at=? WHERE id=?').run(new Date(new Date(row.due_at).getTime() + minutes * 60000).toISOString(), id);
  }
  clear() {
    this.db.transaction(() => {
      for (const table of ['daily_state', 'daily_versions', 'daily_reminders', 'daily_events', 'tasks', 'availability_windows', 'plans', 'plan_versions', 'reminders', 'progress_events']) {
        if (this.db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").get(table)) this.db.exec(`DELETE FROM ${table}`);
      }
    })();
  }
  close() { this.db.close(); }
}
