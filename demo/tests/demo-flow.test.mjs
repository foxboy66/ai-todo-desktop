import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildSchedule,
  formatTime,
  getCheckpoints,
  getReminderInterval,
} from '../lib/demo-flow.js';

test('formats minutes as a 24-hour time', () => {
  assert.equal(formatTime(545), '09:05');
  assert.equal(formatTime(1050), '17:30');
});

test('uses transparent reminder intervals based on confirmed duration', () => {
  assert.equal(getReminderInterval(30), null);
  assert.equal(getReminderInterval(31), 30);
  assert.equal(getReminderInterval(90), 30);
  assert.equal(getReminderInterval(120), 45);
  assert.equal(getReminderInterval(181), 60);
});

test('creates only in-progress checkpoints before the end time', () => {
  assert.deepEqual(getCheckpoints(9 * 60, 90), ['09:30', '10:00']);
  assert.deepEqual(getCheckpoints(14 * 60, 30), []);
});

test('moves a task to the afternoon when it does not fit before lunch', () => {
  const schedule = buildSchedule([
    { id: 'a', title: '任务 A', duration: 90, priority: '高', doneDefinition: '完成' },
    { id: 'b', title: '任务 B', duration: 60, priority: '高', doneDefinition: '完成' },
    { id: 'c', title: '任务 C', duration: 45, priority: '中', doneDefinition: '完成' },
  ]);

  assert.equal(schedule[0].startLabel, '09:00');
  assert.equal(schedule[1].startLabel, '10:45');
  assert.equal(schedule[2].startLabel, '14:00');
});

test('marks work beyond the available day as unscheduled', () => {
  const schedule = buildSchedule([
    { id: 'a', title: '长任务 A', duration: 180, priority: '高', doneDefinition: '完成' },
    { id: 'b', title: '长任务 B', duration: 240, priority: '高', doneDefinition: '完成' },
    { id: 'c', title: '额外任务', duration: 60, priority: '低', doneDefinition: '完成' },
  ]);

  assert.equal(schedule.at(-1)?.scheduled, false);
  assert.equal(schedule.at(-1)?.startLabel, '未安排');
});
