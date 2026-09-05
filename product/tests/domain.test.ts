import { describe, expect, it } from 'vitest';
import { buildSchedule, getCheckpoints, getReminderInterval, parseTaskInput } from '../src/shared/domain';

describe('AI ToDo 领域规则', () => {
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

  it('不把任务安排进不可用时间，并保留未安排任务', () => {
    const tasks = parseTaskInput('准备评审；回复邮件；整理记录');
    const schedule = buildSchedule(tasks, [{ id: 'morning', start: '09:00', end: '10:00', kind: 'available' }, { id: 'afternoon', start: '14:00', end: '15:00', kind: 'available' }]);
    expect(schedule.every((task) => task.scheduled ? task.startLabel !== '10:00' : true)).toBe(true);
    expect(schedule.some((task) => !task.scheduled)).toBe(true);
  });
});
