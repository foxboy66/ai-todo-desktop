/**
 * @typedef {{
 *   id: string;
 *   title: string;
 *   duration: number;
 *   priority: '高' | '中' | '低';
 *   doneDefinition: string;
 * }} PlanTask
 */

/**
 * @param {number} minutes
 */
export function formatTime(minutes) {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
}

/**
 * @param {number} duration
 * @returns {number | null}
 */
export function getReminderInterval(duration) {
  if (duration <= 30) return null;
  if (duration <= 90) return 30;
  if (duration <= 180) return 45;
  return 60;
}

/**
 * @param {number} startMinutes
 * @param {number} duration
 */
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
 */
export function buildSchedule(tasks) {
  const morningEnd = 12 * 60;
  const afternoonStart = 14 * 60;
  const dayEnd = 18 * 60;
  const buffer = 15;
  let cursor = 9 * 60;

  return tasks.map((task, index) => {
    if (cursor < morningEnd && cursor + task.duration > morningEnd) {
      cursor = afternoonStart;
    }
    if (cursor >= morningEnd && cursor < afternoonStart) {
      cursor = afternoonStart;
    }

    if (cursor + task.duration > dayEnd) {
      return {
        ...task,
        scheduled: false,
        startMinutes: null,
        endMinutes: null,
        startLabel: '未安排',
        endLabel: '',
        checkpoints: [],
      };
    }

    const startMinutes = cursor;
    const endMinutes = startMinutes + task.duration;
    cursor = endMinutes + (index === tasks.length - 1 ? 0 : buffer);

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
