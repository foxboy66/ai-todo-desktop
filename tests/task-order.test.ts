import { describe, expect, it } from 'vitest';
import { moveTask } from '../src/shared/task-order';
import { buildSchedule, defaultAvailability, parseTaskInput } from '../src/shared/domain';

describe('调整任务顺序', () => {
  it('向前和向后移动时保留任务字段，不修改原数组', () => {
    const tasks = parseTaskInput('甲；乙；丙');
    tasks[1].duration = 45;
    tasks[1].progress = 50;
    tasks[2].status = '已完成';
    const snapshot = structuredClone(tasks);
    const moved = moveTask(tasks, tasks[1].id, 0);
    expect(moved.map(task => task.title)).toEqual(['乙', '甲', '丙']);
    expect(moved[0]).toBe(tasks[1]);
    expect(moveTask(moved, tasks[1].id, 2).map(task => task.title)).toEqual(['甲', '丙', '乙']);
    expect(tasks).toEqual(snapshot);
  });
  it('边界、无效位置、同位置和缺失任务不改变顺序', () => {
    const tasks = parseTaskInput('甲；乙');
    for (const index of [-1, 2, 0.5, NaN, 0]) expect(moveTask(tasks, tasks[0].id, index)).toBe(tasks);
    expect(moveTask(tasks, 'missing', 1)).toBe(tasks);
    const empty: typeof tasks = [];
    expect(moveTask(empty, 'missing', 0)).toBe(empty);
  });
  it('排程遵循新顺序和各自耗时，已完成任务不占用时间', () => {
    const tasks = parseTaskInput('甲；乙；丙');
    tasks[1].duration = 60;
    tasks[2].status = '已完成';
    const schedule = buildSchedule(moveTask(tasks, tasks[1].id, 0), defaultAvailability, 0);
    expect(schedule.map(task => task.title)).toEqual(['乙', '甲', '丙']);
    expect(schedule[0].startLabel).toBe('09:00');
    expect(schedule[0].endLabel).toBe('10:00');
    expect(schedule[1].startLabel).toBe('10:00');
    expect(schedule[2].scheduled).toBe(false);
    expect(schedule[2].status).toBe('已完成');
  });
});
