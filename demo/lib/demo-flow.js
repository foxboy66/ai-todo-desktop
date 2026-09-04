/**
 * @typedef {{ id: string; start: string; end: string }} AvailabilityBlock
 * @typedef {{ id: string; title: string; duration: number; priority: '高' | '中' | '低'; doneDefinition: string }} PlanTask
 */

/** @param {string} value */
export function parseTime(value) {
  const [hours, minutes] = value.split(':').map(Number);
  return hours * 60 + minutes;
}

/** @param {number} minutes */
export function formatTime(minutes) {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
}

/** @param {number} duration */
export function getReminderInterval(duration) {
  if (duration <= 30) return null;
  if (duration <= 90) return 30;
  if (duration <= 180) return 45;
  return 60;
}

/** @param {number} startMinutes @param {number} duration */
export function getCheckpoints(startMinutes, duration) {
  const interval = getReminderInterval(duration);
  if (!interval) return [];
  const checkpoints = [];
  for (let elapsed = interval; elapsed < duration; elapsed += interval) {
    checkpoints.push(formatTime(startMinutes + elapsed));
  }
  return checkpoints;
}

/**
 * @param {PlanTask[]} tasks
 * @param {AvailabilityBlock[]} availability
 */
export function buildSchedule(tasks, availability = [
  { id: 'slot-1', start: '09:00', end: '12:00' },
  { id: 'slot-2', start: '14:00', end: '18:00' },
]) {
  const blocks = availability
    .map((block) => ({ ...block, startMinutes: parseTime(block.start), endMinutes: parseTime(block.end) }))
    .filter((block) => block.endMinutes > block.startMinutes)
    .sort((a, b) => a.startMinutes - b.startMinutes);
  const buffer = 15;
  let blockIndex = 0;
  let cursor = blocks[0]?.startMinutes ?? 0;

  return tasks.map((task) => {
    let scheduled = false;
    let startMinutes = 0;
    let endMinutes = 0;

    while (blockIndex < blocks.length) {
      const block = blocks[blockIndex];
      cursor = Math.max(cursor, block.startMinutes);
      if (cursor + task.duration <= block.endMinutes) {
        scheduled = true;
        startMinutes = cursor;
        endMinutes = cursor + task.duration;
        cursor = endMinutes + buffer;
        break;
      }
      blockIndex += 1;
      cursor = blocks[blockIndex]?.startMinutes ?? 0;
    }

    if (!scheduled) {
      return { ...task, scheduled: false, startMinutes: null, endMinutes: null, startLabel: '未安排', endLabel: '', checkpoints: [] };
    }

    return {
      ...task,
      scheduled: true,
      startMinutes,
      endMinutes,
      startLabel: formatTime(startMinutes),
      endLabel: formatTime(endMinutes),
      checkpoints: getCheckpoints(startMinutes, task.duration),
    };
  });
}
