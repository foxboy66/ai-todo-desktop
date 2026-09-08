import { describe, expect, it } from 'vitest';
import { localDayText, parseDay, shiftDay, scheduleStart } from '../src/shared/daily';
import { buildSchedule, defaultAvailability, parseTaskInput } from '../src/shared/domain';
describe('每日任务', () => {
  it('用本地日期隔离，并正确跨越月份、年份和闰日', () => {
    expect(localDayText(new Date(2026, 8, 7, 0, 1))).toBe('2026-09-07');
    expect(shiftDay('2026-01-01', -1)).toBe('2025-12-31');
    expect(shiftDay('2024-03-01', -1)).toBe('2024-02-29');
    expect(() => parseDay('2026-02-30')).toThrow();
    expect(() => parseDay('2026-9-7')).toThrow();
  });
  it('未来日期不会受今天当前时间限制', () => {
    const now = new Date(2026, 8, 7, 17, 30);
    expect(scheduleStart('2026-09-07', now)).toBe(1050);
    expect(scheduleStart('2026-09-08', now)).toBe(0);
  });
  it('已完成任务不占用重新排程的时间', () => {
    const tasks = parseTaskInput('已经完成；下一件事');
    tasks[0].status = '已完成';
    const schedule = buildSchedule(tasks, defaultAvailability, 0);
    expect(schedule[0].scheduled).toBe(false);
    expect(schedule[0].status).toBe('已完成');
    expect(schedule[1].startLabel).toBe('09:00');
  });
});
