import { describe, expect, it } from 'vitest';
import { buildReminderNodes, buildSchedule, createDraftTask, formatScheduleLabel, getCheckpoints, getReminderInterval, isTaskAvailableAt, parseTaskInput } from '../src/shared/domain';

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

  it('只生成结束前的检查点', () => {
    expect(getCheckpoints(9 * 60, 90)).toEqual(['09:30', '10:00']);
    expect(getCheckpoints(14 * 60, 30)).toEqual([]);
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
