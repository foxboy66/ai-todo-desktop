import type { Task } from './domain';

/** Move an existing task to a zero-based position without changing its fields. */
export function moveTask(tasks: Task[], taskId: string, targetIndex: number): Task[] {
  const sourceIndex = tasks.findIndex(task => task.id === taskId);
  if (sourceIndex < 0 || !Number.isInteger(targetIndex) || targetIndex < 0 || targetIndex >= tasks.length || sourceIndex === targetIndex) return tasks;
  const reordered = [...tasks];
  const [task] = reordered.splice(sourceIndex, 1);
  reordered.splice(targetIndex, 0, task);
  return reordered;
}
