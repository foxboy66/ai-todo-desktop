import Database from 'better-sqlite3';
import { formatReminderDueAt } from '../shared/domain';
import type { AvailabilityBlock, PlanSnapshot, ReminderNode, ScheduledTask, Task } from '../shared/domain';

function localDayText(day: Date) {
  const year = day.getFullYear();
  const month = String(day.getMonth() + 1).padStart(2, '0');
  const date = String(day.getDate()).padStart(2, '0');
  return [year, month, date].join('-');
}

type StoredState = PlanSnapshot & { history: Array<{ version: number; createdAt: string; reason?: string }> };

export class TodoStore {
  private readonly db: Database.Database;

  constructor(filePath: string) {
    this.db = new Database(filePath);
    this.db.pragma('journal_mode = WAL');
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS tasks (id TEXT PRIMARY KEY, payload TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS availability_windows (id TEXT PRIMARY KEY, payload TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS plans (id TEXT PRIMARY KEY, day TEXT NOT NULL, current_version INTEGER NOT NULL DEFAULT 0, status TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS plan_versions (id TEXT PRIMARY KEY, plan_id TEXT NOT NULL, version_no INTEGER NOT NULL, payload TEXT NOT NULL, reason TEXT, created_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS reminders (id TEXT PRIMARY KEY, task_id TEXT NOT NULL, kind TEXT NOT NULL, due_at TEXT NOT NULL, status TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS progress_events (id TEXT PRIMARY KEY, task_id TEXT NOT NULL, event_type TEXT NOT NULL, payload TEXT NOT NULL, created_at TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS idx_reminders_pending_due ON reminders(status, due_at);
    `);
  }

  load(): StoredState {
    const taskRows = this.db.prepare('SELECT payload FROM tasks ORDER BY rowid').all() as Array<{ payload: string }>;
    const availabilityRows = this.db.prepare('SELECT payload FROM availability_windows ORDER BY rowid').all() as Array<{ payload: string }>;
    const plan = this.db.prepare('SELECT current_version, status FROM plans WHERE id = ?').get('today') as { current_version: number; status: string } | undefined;
    const version = plan?.current_version ?? 0;
    const versionRow = version ? this.db.prepare('SELECT payload FROM plan_versions WHERE plan_id = ? AND version_no = ?').get('today', version) as { payload: string } | undefined : undefined;
    const payload = versionRow ? JSON.parse(versionRow.payload) as { schedule: ScheduledTask[] } : undefined;
    const historyRows = this.db.prepare('SELECT version_no, created_at, reason FROM plan_versions WHERE plan_id = ? ORDER BY version_no DESC').all('today') as Array<{ version_no: number; created_at: string; reason?: string }>;
    return {
      tasks: taskRows.map((row) => JSON.parse(row.payload) as Task),
      availability: availabilityRows.map((row) => JSON.parse(row.payload) as AvailabilityBlock),
      schedule: payload?.schedule ?? [],
      version,
      confirmed: plan?.status === 'confirmed',
      history: historyRows.map((row) => ({ version: row.version_no, createdAt: row.created_at, reason: row.reason })),
    };
  }

  savePlan(tasks: Task[], availability: AvailabilityBlock[], schedule: ScheduledTask[], reason?: string, day = new Date()) {
    const save = this.db.transaction(() => {
      const existing = this.db.prepare('SELECT current_version FROM plans WHERE id = ?').get('today') as { current_version: number } | undefined;
      const version = (existing?.current_version ?? 0) + 1;
      this.db.prepare('DELETE FROM tasks').run();
      this.db.prepare('DELETE FROM availability_windows').run();
      this.db.prepare('DELETE FROM reminders').run();
      const insertTask = this.db.prepare('INSERT INTO tasks (id, payload) VALUES (?, ?)');
      tasks.forEach((task) => insertTask.run(task.id, JSON.stringify(task)));
      const insertAvailability = this.db.prepare('INSERT INTO availability_windows (id, payload) VALUES (?, ?)');
      availability.forEach((block) => insertAvailability.run(block.id, JSON.stringify(block)));
      this.db.prepare('INSERT INTO plans (id, day, current_version, status) VALUES (?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET current_version = excluded.current_version, status = excluded.status').run('today', localDayText(day), version, 'confirmed');
      this.db.prepare('INSERT INTO plan_versions (id, plan_id, version_no, payload, reason, created_at) VALUES (?, ?, ?, ?, ?, ?)').run(`today-v${version}`, 'today', version, JSON.stringify({ schedule }), reason ?? null, new Date().toISOString());
      const insertReminder = this.db.prepare('INSERT INTO reminders (id, task_id, kind, due_at, status) VALUES (?, ?, ?, ?, ?)');
      schedule.flatMap((task) => task.scheduled ? [
        { id: `reminder-${task.id}-start`, kind: 'start', dueAt: task.startLabel },
        ...task.checkpoints.map((label, index) => ({ id: `reminder-${task.id}-checkpoint-${index}`, kind: 'checkpoint', dueAt: label })),
        { id: `reminder-${task.id}-end`, kind: 'end', dueAt: task.endLabel },
      ] : []).forEach((reminder) => {
        const taskId = schedule.find((task) => reminder.id.includes(task.id))?.id;
        insertReminder.run(reminder.id, taskId, reminder.kind, formatReminderDueAt(day, reminder.dueAt), 'pending');
      });
      return version;
    });
    return save();
  }

  recordProgress(taskId: string, eventType: string, payload: Record<string, unknown> = {}) {
    this.db.prepare('INSERT INTO progress_events (id, task_id, event_type, payload, created_at) VALUES (?, ?, ?, ?, ?)').run(`event-${Date.now()}-${Math.random().toString(16).slice(2)}`, taskId, eventType, JSON.stringify(payload), new Date().toISOString());
  }

  getDueReminders(now = new Date()) {
    return this.db.prepare("SELECT id, task_id as taskId, kind, due_at as dueAt, status FROM reminders WHERE status = 'pending' AND due_at <= ? ORDER BY due_at LIMIT 20").all(now.toISOString()) as ReminderNode[];
  }

  markReminderSent(id: string) {
    this.db.prepare("UPDATE reminders SET status = 'sent' WHERE id = ? AND status = 'pending'").run(id);
  }

  snoozeReminder(id: string, minutes: number) {
    const reminder = this.db.prepare("SELECT due_at as dueAt FROM reminders WHERE id = ? AND status = 'pending'").get(id) as { dueAt: string } | undefined;
    if (!reminder) return;
    const dueAt = new Date(reminder.dueAt);
    dueAt.setMinutes(dueAt.getMinutes() + minutes);
    this.db.prepare("UPDATE reminders SET due_at = ? WHERE id = ? AND status = 'pending'").run(dueAt.toISOString(), id);
  }

  clear() {
    this.db.exec('DELETE FROM tasks; DELETE FROM availability_windows; DELETE FROM plans; DELETE FROM plan_versions; DELETE FROM reminders; DELETE FROM progress_events;');
  }

  close() {
    this.db.close();
  }
}
