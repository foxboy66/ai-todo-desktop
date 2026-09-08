import { getCurrentMinutes, type PlanSnapshot } from './domain';

export function localDayText(day = new Date()) {
  return [day.getFullYear(), String(day.getMonth() + 1).padStart(2, '0'), String(day.getDate()).padStart(2, '0')].join('-');
}
export function parseDay(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error('日期格式无效');
  const date = new Date(value + 'T12:00:00');
  if (!Number.isFinite(date.getTime()) || localDayText(date) !== value) throw new Error('日期无效');
  return date;
}
export function shiftDay(value: string, offset: number) {
  const date = parseDay(value);
  date.setDate(date.getDate() + offset);
  return localDayText(date);
}
export function scheduleStart(day: string, now = new Date()) {
  parseDay(day);
  return day === localDayText(now) ? getCurrentMinutes(now) : 0;
}
export type DaySummary = { day: string; total: number; completed: number; pending: number };
export type DailyState = PlanSnapshot & { day: string; history: Array<{ version: number; createdAt: string; reason?: string }> };
