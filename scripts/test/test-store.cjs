const { spawnSync } = require('node:child_process');
// Test the real SQLite binary using the same ABI as the desktop app.
if (!process.versions.electron) {
  const result = spawnSync(require('electron'), [__filename], { env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }, stdio: 'inherit', windowsHide: true });
  if (result.error) throw result.error;
  process.exit(result.status ?? 1);
}
const assert = require('node:assert/strict');
const { mkdtempSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const Database = require('better-sqlite3');
const { TodoStore } = require('../../dist/main/store');
const { buildSchedule, defaultAvailability, formatReminderDueAt } = require('../../dist/shared/domain');
const { localDayText, parseDay } = require('../../dist/shared/daily');
const dir = mkdtempSync(join(tmpdir(), 'ai-todo-store-'));
const path = join(dir, 'test.sqlite');
let store;
let checks = 0;
function check(name, fn) { fn(); checks++; console.log('PASS ' + name); }
const task = (id, title = id) => ({ id, title, duration: 30, priority: '中', doneDefinition: '完成', status: '待安排' });
const schedule = tasks => buildSchedule(tasks, defaultAvailability, 0);
try {
  store = new TodoStore(path);
  check('每日任务和计划版本独立，空日期不带入昨天任务', () => {
    store.savePlan([task('yesterday')], defaultAvailability, schedule([task('yesterday')]), undefined, '2026-09-05');
    assert.equal(store.load('2026-09-06').tasks.length, 0);
    store.saveDraft([task('today')], defaultAvailability, schedule([task('today')]), '2026-09-06');
    assert.equal(store.load('2026-09-05').tasks[0].id, 'yesterday');
    assert.equal(store.load('2026-09-06').version, 0);
    assert.equal(store.load('2026-09-05').history.length, 1);
  });
  check('完成和部分进度写入数据库，重启后保持，支持撤销', () => {
    store.recordProgress('today', 'progress_50', { value: 50 }, '2026-09-06');
    assert.equal(store.load('2026-09-06').tasks[0].progress, 50);
    store.recordProgress('today', 'progress_100', { value: 100 }, '2026-09-06');
    store.close(); store = new TodoStore(path);
    assert.equal(store.load('2026-09-06').tasks[0].status, '已完成');
    assert.ok(store.load('2026-09-06').tasks[0].completedAt);
    store.updateTask('2026-09-06', 'today', { status: '待安排' });
    assert.equal(store.load('2026-09-06').tasks[0].progress, 0);
    assert.equal(store.load('2026-09-06').tasks[0].completedAt, undefined);
  });
  check('手动移期保留其他任务，并同时保存编辑内容', () => {
    store.updateTask('2026-09-05', 'yesterday', { title: '补做昨日任务', duration: 45 }, '2026-09-06');
    assert.equal(store.load('2026-09-05').tasks.length, 0);
    assert.equal(store.load('2026-09-06').tasks.length, 2);
    assert.equal(store.load('2026-09-06').tasks[1].title, '补做昨日任务');
    assert.equal(store.load('2026-09-06').tasks[1].duration, 45);
    assert.equal(store.load('2026-09-06').confirmed, false);
    assert.throws(() => store.updateTask('2026-09-06', 'yesterday', {}, '2026-02-30'));
    assert.equal(store.load('2026-09-06').tasks.length, 2);
  });
  check('昨日提醒过期，其他日期的修改不会删除今日提醒，完成后取消提醒', () => {
    const a = [task('a')], b = [task('b')];
    store.savePlan(a, defaultAvailability, schedule(a), undefined, '2026-09-07');
    store.savePlan(b, defaultAvailability, schedule(b), undefined, '2026-09-08');
    store.saveDraft([], defaultAvailability, [], '2026-09-06');
    const due = store.getDueReminders(new Date('2026-09-08T09:00:05'));
    assert.equal(due.length, 1); assert.equal(due[0].taskId, 'b');
    store.markReminderSent(due[0].id);
    store.savePlan(b, defaultAvailability, schedule(b), undefined, '2026-09-08');
    assert.equal(store.getDueReminders(new Date('2026-09-08T09:00:05')).length, 0);
    store.updateTask('2026-09-08', 'b', { status: '已完成' });
    assert.equal(store.getDueReminders(new Date('2026-09-08T10:00:00')).length, 0);
  });
  check('启动静默跳过超过单批上限的当天积压，保留任务和后续提醒', () => {
    const backlog = Array.from({ length: 25 }, (_, index) => ({ ...task('backlog-' + index), duration: 1 }));
    const later = task('later');
    const all = [...backlog, later];
    store.savePlan(all, defaultAvailability, schedule(all), undefined, '2026-09-09');
    const openedAt = new Date('2026-09-09T09:24:30');
    assert.equal(store.getDueReminders(openedAt, openedAt).length, 0);
    assert.equal(store.getDueReminders(new Date('2026-09-09T09:24:40'), openedAt).length, 0);
    assert.equal(store.load('2026-09-09').tasks.length, 26);
    assert.equal(store.load('2026-09-09').tasks[0].status, '待安排');
    assert.equal(store.load('2026-09-09').confirmed, true);
    const due = store.getDueReminders(new Date('2026-09-09T09:25:05'), new Date('2026-09-09T09:24:55'));
    assert.ok(due.some(node => node.taskId === 'later' && node.kind === 'start'));
    assert.equal(due.length, 2);
    due.forEach(node => store.markReminderSent(node.id));
    store.close(); store = new TodoStore(path);
    assert.equal(store.getDueReminders(new Date('2026-09-09T09:25:10')).length, 0);
    store.savePlan(all, defaultAvailability, schedule(all), undefined, '2026-09-09');
    assert.equal(store.getDueReminders(new Date('2026-09-09T09:25:15')).length, 0);
    const resumedAt = new Date('2026-09-09T11:00:00');
    assert.equal(store.getDueReminders(resumedAt, resumedAt).length, 0);
  });
  check('任务删除和日期统计保存正确', () => {
    store.updateTask('2026-09-07', 'a', null);
    assert.equal(store.load('2026-09-07').tasks.length, 0);
    assert.deepEqual(store.listDays().find(day => day.day === '2026-09-08'), { day: '2026-09-08', total: 1, completed: 1, pending: 0 });
  });
  store.close();
  const legacyPath = join(dir, 'legacy.sqlite');
  const db = new Database(legacyPath);
  db.exec(`CREATE TABLE tasks(id TEXT PRIMARY KEY, payload TEXT); CREATE TABLE availability_windows(id TEXT PRIMARY KEY, payload TEXT);
    CREATE TABLE plans(id TEXT PRIMARY KEY, day TEXT, current_version INTEGER, status TEXT); CREATE TABLE plan_versions(id TEXT PRIMARY KEY, plan_id TEXT, version_no INTEGER, payload TEXT, reason TEXT, created_at TEXT);
    CREATE TABLE reminders(id TEXT PRIMARY KEY, task_id TEXT, kind TEXT, due_at TEXT, status TEXT); CREATE TABLE progress_events(id TEXT PRIMARY KEY, task_id TEXT, event_type TEXT, payload TEXT, created_at TEXT);`);
  db.prepare('INSERT INTO tasks VALUES (?, ?)').run('old', JSON.stringify(task('old')));
  db.prepare('INSERT INTO tasks VALUES (?, ?)').run('pending', JSON.stringify(task('pending')));
  for (const slot of defaultAvailability) db.prepare('INSERT INTO availability_windows VALUES (?, ?)').run(slot.id, JSON.stringify(slot));
  db.prepare('INSERT INTO plans VALUES (?, ?, ?, ?)').run('today', '2026-09-01', 2, 'confirmed');
  const legacyDay = '2026-09-05';
  db.prepare('INSERT INTO plan_versions VALUES (?, ?, ?, ?, ?, ?)').run('today-v2', 'today', 2, JSON.stringify({ schedule: schedule([task('old'), task('pending')]) }), null, new Date(legacyDay + 'T08:00:00').toISOString());
  db.prepare('INSERT INTO progress_events VALUES (?, ?, ?, ?, ?)').run('event', 'old', 'progress_100', '{"value":100}', new Date(legacyDay + 'T10:00:00').toISOString());
  db.prepare('INSERT INTO reminders VALUES (?, ?, ?, ?, ?)').run('reminder-pending-start', 'pending', 'start', formatReminderDueAt(parseDay(legacyDay), '09:30'), 'sent');
  db.close();
  check('旧版日期字段滞后时按快照日期迁移，恢复已完成记录并保留历史备份', () => {
    store = new TodoStore(legacyPath);
    const saved = store.load(legacyDay);
    assert.equal(saved.tasks.length, 2); assert.equal(saved.tasks[0].status, '已完成');
    assert.equal(saved.schedule[0].status, '已完成');
    assert.equal(saved.version, 2); assert.equal(saved.history.length, 1);
    assert.equal(store.load('2026-09-06').tasks.length, 0);
    assert.equal(store.getDueReminders(new Date(legacyDay + 'T09:45:00')).length, 0);
    store.close(); store = new TodoStore(legacyPath);
    assert.equal(store.load(legacyDay).tasks.length, 2);
    const inspect = new Database(legacyPath); assert.equal(inspect.prepare('SELECT COUNT(*) AS n FROM tasks').get().n, 2); inspect.close();
  });
  check('清空后不从旧版备份复活任务', () => {
    store.clear(); store.close(); store = new TodoStore(legacyPath);
    assert.equal(store.listDays().length, 0);
    assert.equal(store.load(localDayText()).tasks.length, 0);
  });
  console.log(checks + ' SQLite integration checks passed');
} finally { store?.close(); rmSync(dir, { recursive: true, force: true }); }
