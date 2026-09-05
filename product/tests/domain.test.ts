import { describe, expect, it } from 'vitest';
import { buildReminderNodes, buildSchedule, createDraftTask, formatReminderDueAt, formatScheduleLabel, normalizeReminderDueAt, getCheckpoints, getCurrentScheduledTask, getReminderInterval, getScheduleOverflowTasks, getSecondsUntilTaskEnd, isAvailabilityOpenAt, isTaskAvailableAt, parseTaskInput, reflowScheduleFromTask } from '../src/shared/domain';

describe('AI ToDo 领域规则', () => {
  it('创建可编辑的新计划草稿', () => {
    const task = createDraftTask(2);
    expect(task.id).toMatch(/^task-draft-\d+-2$/);
    expect(task.title).toBe('新计划');
    expect(task.doneDefinition).toBe('补充这个计划的完成标准');
    expect(task.duration).toBe(45);
    expect(task.priority).toBe('中');
    expect(task.status).toBe('待安排');
  });
  it('按任务时长生成透明提醒间隔', () => {
    expect(getReminderInterval(30)).toBeNull();
    expect(getReminderInterval(31)).toBe(30);
    expect(getReminderInterval(120)).toBe(45);
    expect(getReminderInterval(181)).toBe(60);
  });

  it('把本地时钟标签转换为当前时区的真实时间点', () => {
    const day = new Date(2026, 0, 1, 0, 0, 0);
    const dueAt = new Date(formatReminderDueAt(day, '14:00'));

    expect(dueAt.getFullYear()).toBe(2026);
    expect(dueAt.getMonth()).toBe(0);
    expect(dueAt.getDate()).toBe(1);
    expect(dueAt.getHours()).toBe(14);
    expect(dueAt.getMinutes()).toBe(0);
  });

  it('把旧版无时区提醒转换为本地时区的真实时间点', () => {
    const dueAt = new Date(normalizeReminderDueAt('2026-01-01T14:00:00'));

    expect(dueAt.getFullYear()).toBe(2026);
    expect(dueAt.getMonth()).toBe(0);
    expect(dueAt.getDate()).toBe(1);
    expect(dueAt.getHours()).toBe(14);
    expect(normalizeReminderDueAt('2026-01-01T06:00:00.000Z')).toBe('2026-01-01T06:00:00.000Z');
  });

  it('只生成结束前的检查点', () => {
    expect(getCheckpoints(9 * 60, 90)).toEqual(['09:30', '10:00']);
    expect(getCheckpoints(14 * 60, 30)).toEqual([]);
  });

  it('支持用分号或换行拆分多个任务', () => {
    const tasks = parseTaskInput('整理资料；回复邮件\n准备会议');
    expect(tasks.map((task) => task.title)).toEqual(['整理资料', '回复邮件', '准备会议']);
  });

  it('按绝对结束时刻计算倒计时，并自动识别当前执行任务', () => {
    const tasks = [
      { ...parseTaskInput('第一个任务')[0], id: 'first', duration: 60 },
      { ...parseTaskInput('第二个任务')[0], id: 'second', duration: 60 },
    ];
    const schedule = buildSchedule(tasks, [{ id: 'afternoon', start: '15:00', end: '18:00', kind: 'available' }], 15 * 60);
    expect(getCurrentScheduledTask(schedule, new Date(2026, 0, 1, 16, 27, 0))?.id).toBe('second');
    expect(getSecondsUntilTaskEnd(schedule[1], new Date(2026, 0, 1, 16, 27, 0))).toBe(48 * 60);
    expect(getSecondsUntilTaskEnd(schedule[0], new Date(2026, 0, 1, 16, 27, 0))).toBe(0);
  });

  it('修改任务截止时间后顺延后续任务，并标记超出可用时段的任务', () => {
    const tasks = [
      { ...parseTaskInput('第一个任务')[0], id: 'first', duration: 60 },
      { ...parseTaskInput('第二个任务')[0], id: 'second', duration: 60 },
      { ...parseTaskInput('第三个任务')[0], id: 'third', duration: 30 },
    ];
    const schedule = buildSchedule(tasks, [{ id: 'afternoon', start: '09:00', end: '11:00', kind: 'available' }], 9 * 60);
    const next = reflowScheduleFromTask(schedule, 'second', 10 * 60, 60);
    expect(next.map((task) => [task.startLabel, task.endLabel])).toEqual([
      ['09:00', '10:00'],
      ['10:00', '11:00'],
      ['11:15', '11:45'],
    ]);
    expect(getScheduleOverflowTasks(next, [{ id: 'afternoon', start: '09:00', end: '11:00', kind: 'available' }]).map((task) => task.id)).toEqual(['third']);
  });

  it('从当前时间开始安排，不把任务放回已经过去的时间', () => {
    const task = parseTaskInput('回复客户邮件')[0];
    const currentSchedule = buildSchedule([task], [{ id: 'morning', start: '09:00', end: '12:00', kind: 'available' }], 10 * 60 + 59);
    expect(currentSchedule[0].startLabel).toBe('10:59');

    const futureSchedule = buildSchedule([task], [
      { id: 'morning', start: '09:00', end: '10:00', kind: 'available' },
      { id: 'afternoon', start: '14:00', end: '15:00', kind: 'available' },
    ], 13 * 60);
    expect(futureSchedule[0].startLabel).toBe('14:00');
  });

  it('任务可以跨可用时段累计执行，并且提醒不会落在不可用时段', () => {
    const task = { ...parseTaskInput('完成产品首页')[0], id: 'long-task', duration: 90 };
    const schedule = buildSchedule([task], [
      { id: 'morning', start: '09:00', end: '12:00', kind: 'available' },
      { id: 'afternoon', start: '14:00', end: '18:00', kind: 'available' },
    ], 11 * 60);
    const scheduled = schedule[0];
    expect(scheduled.scheduled).toBe(true);
    expect(scheduled.segments).toEqual([
      { startMinutes: 11 * 60, endMinutes: 12 * 60, startLabel: '11:00', endLabel: '12:00' },
      { startMinutes: 14 * 60, endMinutes: 14 * 60 + 30, startLabel: '14:00', endLabel: '14:30' },
    ]);
    expect(formatScheduleLabel(scheduled)).toBe('11:00–12:00 / 14:00–14:30');
    expect(isTaskAvailableAt(scheduled, new Date(2026, 0, 1, 11, 30, 0))).toBe(true);
    expect(isTaskAvailableAt(scheduled, new Date(2026, 0, 1, 12, 30, 0))).toBe(false);
    expect(isTaskAvailableAt(scheduled, new Date(2026, 0, 1, 14, 0, 0))).toBe(true);
    const availability = [
      { id: 'morning', start: '09:00', end: '12:00', kind: 'available' as const },
      { id: 'afternoon', start: '14:00', end: '18:00', kind: 'available' as const },
    ];
    expect(isAvailabilityOpenAt(availability, new Date(2026, 0, 1, 11, 30, 0))).toBe(true);
    expect(isAvailabilityOpenAt(availability, new Date(2026, 0, 1, 12, 30, 0))).toBe(false);
    expect(isAvailabilityOpenAt(availability, new Date(2026, 0, 1, 14, 0, 0))).toBe(true);
    expect(scheduled.checkpoints).toEqual(['11:30', '14:00']);
    const reminders = buildReminderNodes(schedule, new Date(2026, 0, 1));
    expect(reminders.map((reminder) => reminder.dueAt)).toEqual([
      '2026-01-01T11:00:00',
      '2026-01-01T11:30:00',
      '2026-01-01T14:00:00',
      '2026-01-01T14:30:00',
    ]);
  });
  it('不把任务安排进不可用时间，并保留未安排任务', () => {
    const tasks = parseTaskInput('准备评审；回复邮件；整理记录');
    const schedule = buildSchedule(tasks, [{ id: 'morning', start: '09:00', end: '10:00', kind: 'available' }, { id: 'afternoon', start: '14:00', end: '15:00', kind: 'available' }]);
    expect(schedule.every((task) => task.scheduled ? task.startLabel !== '10:00' : true)).toBe(true);
    expect(schedule.some((task) => !task.scheduled)).toBe(true);
  });
});
