import { AvailabilityEditor } from './AvailabilityEditor';
import { AppShell } from './AppShell';
import { Modal } from './Modal';
import { Capture } from './TaskCapture';
import { Execute } from './ExecutionView';
import { moveTask } from '../shared/task-order';
import { DailyList } from './DailyList';
import { localDayText, scheduleStart, type DaySummary } from '../shared/daily';
import type { PlanSnapshot } from '../shared/domain';
import { defaultAiSettings, type AiSettings } from '../shared/ai-settings';
import { AiSettingsForm } from './AiSettingsForm';
import { useEffect, useRef, useState } from "react";
import { AlertCircle, BellRing, ChevronRight, Clock3, PencilLine, X } from 'lucide-react';
import {
  buildSchedule,
  createDraftTask,
  defaultAvailability,
  getCurrentScheduledTask,
  getReminderInterval,
  getScheduleOverflowTasks,
  getSecondsUntilTaskEnd,
  reflowScheduleFromTask,
  parseTime,
  type AvailabilityBlock,
  type ScheduledTask,
  type Task,
} from "@/shared/domain";
import { normalizeBlockerReason, shouldShowBlockerPrompt } from "./blocker";

type View = "capture" | "execute" | "list";
const reasons = [
  "耗时比预期更长",
  "临时事项打断",
  "任务内容不清楚",
  "缺少资料或条件",
  "精力不足",
  "优先级发生变化",
];

function totalMinutes(tasks: Task[]) {
  return tasks.reduce((sum, task) => sum + task.duration, 0);
}
function getNextPendingTask(schedule: ScheduledTask[], currentTaskId: string) {
  const currentIndex = schedule.findIndex((task) => task.id === currentTaskId);
  if (currentIndex < 0) return undefined;
  return schedule.slice(currentIndex + 1).find((task) => task.status !== "已完成");
}

type ReminderAlert = {
  kind: "start" | "checkpoint" | "end";
  title: string;
  body: string;
};

function playReminderTone(audioContextRef: { current: AudioContext | null }) {
  try {
    const AudioContextConstructor = window.AudioContext;
    if (!AudioContextConstructor) return;
    const context = audioContextRef.current ?? new AudioContextConstructor();
    audioContextRef.current = context;
    const startTime = context.currentTime;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(880, startTime);
    oscillator.frequency.setValueAtTime(660, startTime + 0.12);
    gain.gain.setValueAtTime(0.0001, startTime);
    gain.gain.exponentialRampToValueAtTime(0.14, startTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, startTime + 0.38);
    oscillator.connect(gain).connect(context.destination);
    oscillator.start(startTime);
    oscillator.stop(startTime + 0.38);
    void context.resume();
  } catch {
    // Electron's native system beep remains the fallback.
  }
}

export function App() {
  const [day, setDay] = useState(() => localDayText());
  const dayRef = useRef(day);
  const previousToday = useRef(localDayText());
  const [days, setDays] = useState<DaySummary[]>([]);
  const pendingSave = useRef<Promise<boolean>>(Promise.resolve(true));
  const initialReadFailed = useRef(false);
  const [saveFailed, setSaveFailed] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [startupReady, setStartupReady] = useState(false);
  const [aiSettings, setAiSettings] = useState<AiSettings>(defaultAiSettings);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [availabilityOpen, setAvailabilityOpen] = useState(false);
  const [clearConfirmOpen, setClearConfirmOpen] = useState(false);
  const [view, setView] = useState<View>("list");
  const [tasks, setTasks] = useState<Task[]>([]);
  const [availability, setAvailability] = useState<AvailabilityBlock[]>(defaultAvailability);
  const [schedule, setSchedule] = useState<ScheduledTask[]>([]);
  const [taskInput, setTaskInput] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(false);
  const [, setVersion] = useState(0);
  const [currentTaskId, setCurrentTaskId] = useState("");
  const [manuallySelectedTaskId, setManuallySelectedTaskId] = useState<string | null>(null);
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);
  const [now, setNow] = useState(() => new Date());
  const [isRunning, setIsRunning] = useState(false);
  const [pausedCountdownSeconds, setPausedCountdownSeconds] = useState<number | null>(null);
  const [progress, setProgress] = useState<Record<string, number>>({});
  const [blocker, setBlocker] = useState<{ reason?: string }>({});
  const [blockerOpen, setBlockerOpen] = useState(false);
  const [customReason, setCustomReason] = useState("");
  const [customDelay, setCustomDelay] = useState("");
  const [blockerEdit, setBlockerEdit] = useState<{
    title: string;
    priority: Task['priority'];
    start: string;
    end: string;
  } | null>(null);
  const [blockerEditError, setBlockerEditError] = useState("");
  const [reminderAlert, setReminderAlert] = useState<ReminderAlert | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);

  useEffect(() => {
    const settingsLoad = window.aiTodo.getAiSettings().then((settings) => {
      setAiSettings(settings);
      setSettingsOpen(!settings.setupCompleted);
    }).catch(() => {
      setSettingsOpen(true);
      setNotice('AI 设置读取失败，请重新选择使用方式。任务仍可按默认 30 分钟生成。');
    });
    const planLoad = window.aiTodo
      .load(dayRef.current)
      .then((state) => {
        setAvailability(state.availability);
        setConfirmed(state.confirmed);
        setProgress(Object.fromEntries(state.tasks.map(task => [task.id, task.progress ?? (task.status === "已完成" ? 100 : 0)])));
        void refreshDays();
        if (state.tasks.length) {
          const restoredSchedule = state.schedule.length
            ? state.schedule
            : buildSchedule(state.tasks, state.availability);
          const restoredCurrentTask = state.confirmed
            ? getCurrentScheduledTask(restoredSchedule)
            : undefined;
          setTasks(state.tasks);
          setAvailability(state.availability);
          setSchedule(restoredSchedule);
          setVersion(state.version);
          setCurrentTaskId(
            restoredCurrentTask?.id ??
              state.tasks.find((task) => task.status !== "已完成")?.id ??
              state.tasks[0].id,
          );
          setActiveTaskId(
            state.confirmed
              ? restoredCurrentTask?.id ??
                  restoredSchedule.find((task) => task.scheduled && task.status !== "已完成")?.id ??
                  null
              : null
          );
          setIsRunning(state.confirmed && Boolean(restoredCurrentTask));
          setView("list");
          setNotice(`已恢复本地计划 v${state.version}`);
        }
      })
      .catch(() => { initialReadFailed.current = true; setNotice("暂时无法读取本地计划。请点击回到今天重新读取，成功后再保存任务。"); });
    void Promise.all([settingsLoad, planLoad]).then(() => setStartupReady(true));
    return window.aiTodo.onReminder((reminder) => {
      const reminderKind =
        reminder && typeof reminder === "object" && "kind" in reminder ? reminder.kind : undefined;
      const kind: ReminderAlert["kind"] =
        reminderKind === "end" ? "end" : reminderKind === "start" ? "start" : "checkpoint";
      const isEndReminder = kind === "end";
      setReminderAlert({
        kind,
        title: isEndReminder ? "任务结束提醒" : kind === "start" ? "任务开始提醒" : "需要同步进度",
        body: isEndReminder
          ? "任务已经到达计划结束时间，记录一下实际完成情况。"
          : kind === "start"
            ? "任务已经到开始时间，先同步一下当前状态吧。"
            : "已经到达进度同步时间，更新一下当前任务状态吧。",
      });
      setNotice(
        isEndReminder ? "提醒：任务已到结束时间，请同步实际进展。" : "提醒：该同步一下当前任务进度了。",
      );
      playReminderTone(audioContextRef);
    });
  }, []);

  useEffect(() => {
    if (!startupReady) return;
    // Tell the main process only after restored state and the welcome dialog have painted.
    let secondFrame = 0;
    const firstFrame = window.requestAnimationFrame(() => {
      secondFrame = window.requestAnimationFrame(() => window.aiTodo.rendererReady());
    });
    return () => { window.cancelAnimationFrame(firstFrame); window.cancelAnimationFrame(secondFrame); };
  }, [startupReady]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (view !== "execute" || manuallySelectedTaskId || !isRunning) return;
    const nextTask = getCurrentScheduledTask(schedule, now);
    const selectedTask = schedule.find((task) => task.id === currentTaskId);
    const nowMinutes = now.getHours() * 60 + now.getMinutes() + now.getSeconds() / 60;
    if (
      nextTask &&
      (!selectedTask ||
        (selectedTask.endMinutes !== null && selectedTask.endMinutes <= nowMinutes && nextTask.id !== selectedTask.id))
    ) {
      setCurrentTaskId(nextTask.id);
      setActiveTaskId(nextTask.id);
    }
  }, [currentTaskId, isRunning, manuallySelectedTaskId, now, schedule, view]);

  const currentTask =
    schedule.find((task) => task.id === currentTaskId) ??
    schedule.find((task) => task.scheduled) ??
    schedule[0];
  const currentProgress = currentTask ? (progress[currentTask.id] ?? 0) : 0;
  const plannedMinutes = totalMinutes(tasks);
  const reminderInterval = currentTask ? getReminderInterval(currentTask.duration) : null;
  const countdownTotalSeconds = currentTask ? Math.max(0, Math.round(currentTask.duration * 60)) : 0;
  const liveCountdownSeconds = currentTask ? getSecondsUntilTaskEnd(currentTask, now) : 0;
  const countdownSeconds = currentTask
    ? currentTask.status === "已完成"
      ? 0
      : pausedCountdownSeconds ?? liveCountdownSeconds
    : 0;
  const nextTask = currentTask ? getNextPendingTask(schedule, currentTask.id) : undefined;

  async function refreshDays() {
    try { setDays(await window.aiTodo.listDays()); } catch { setNotice('日期记录读取失败，请稍后重试。'); }
  }

  function restoreState(state: PlanSnapshot, selectedDay = day) {
    setTasks(state.tasks); setSchedule(state.schedule); setAvailability(state.availability);
    setVersion(state.version); setConfirmed(state.confirmed);
    setProgress(Object.fromEntries(state.tasks.map(task => [task.id, task.progress ?? (task.status === '已完成' ? 100 : 0)])));
    setCurrentTaskId(state.tasks.find(task => task.status !== '已完成')?.id ?? state.tasks[0]?.id ?? '');
    const restored = state.confirmed && selectedDay === localDayText() ? getCurrentScheduledTask(state.schedule) : undefined;
    if (restored) setCurrentTaskId(restored.id);
    setActiveTaskId(restored?.id ?? null); setIsRunning(Boolean(restored)); setPausedCountdownSeconds(null); setManuallySelectedTaskId(null);
  }

  async function changeDay(nextDay: string) {
    if (!nextDay || loading) return;
    setLoading(true);
    try {
      if (!await pendingSave.current) throw new Error('保存失败');
      const state = await window.aiTodo.load(nextDay);
      initialReadFailed.current = false;
      dayRef.current = nextDay; setDay(nextDay); restoreState(state, nextDay);
      setView('list'); setTaskInput(''); setBlockerOpen(false); setBlocker({}); setReminderAlert(null);
      setNotice(nextDay === localDayText() ? '已打开今天的任务。其他日期的未完成任务仍保留在原日期。' : '正在查看 ' + nextDay + ' 的任务，可以编辑或手动移期。');
      await refreshDays();
    } catch { setNotice('切换日期失败，请先确认当前任务已保存，再重试。'); }
    finally { setLoading(false); }
  }

  useEffect(() => {
    const today = localDayText(now);
    if (today === previousToday.current || loading || !startupReady) return;
    const wasToday = day === previousToday.current;
    previousToday.current = today;
    if (wasToday) void changeDay(today);
  }, [now, day, loading, startupReady]);

  useEffect(() => {
    const focus = () => setNow(new Date());
    window.addEventListener('focus', focus);
    return () => window.removeEventListener('focus', focus);
  }, []);

  async function editListTask(id: string, patch: Partial<Task> | null, targetDay?: string) {
    setLoading(true);
    try {
      if (!await pendingSave.current) throw new Error('保存失败');
      const state = await window.aiTodo.updateTask({ day, taskId: id, patch, targetDay });
      restoreState(state); await refreshDays();
      setNotice(targetDay && targetDay !== day ? '任务已移到 ' + targetDay + '，请在目标日期重新确认排程。' : patch === null ? '任务已删除。' : state.confirmed ? '任务已保存。' : '任务已保存；如需定时提醒，请重新确认计划。');
      return true;
    } catch { setNotice('任务保存失败，内容仍保留，请重试。'); return false; }
    finally { setLoading(false); }
  }

  async function quickAdd(title: string) {
    setLoading(true);
    const nextTasks = [...tasks, { ...createDraftTask(tasks.length), id: crypto.randomUUID(), title }];
    const nextSchedule = buildSchedule(nextTasks, availability, scheduleStart(day));
    const ok = await persistDraft(nextTasks, availability, nextSchedule);
    if (ok) { setTasks(nextTasks); setSchedule(nextSchedule); setNotice('任务已保存，默认 30 分钟，可在编辑中修改。'); }
    setLoading(false); return ok;
  }

  function setStep(next: View) {
    setView(next);
    if (!initialReadFailed.current && !saveFailed) setNotice('');
  }

  function selectTask(id: string) {
    setCurrentTaskId(id);
    setManuallySelectedTaskId(id);
    setPausedCountdownSeconds(null);
  }

  function persistDraft(
    draftTasks: Task[],
    draftAvailability: AvailabilityBlock[],
    draftSchedule: ScheduledTask[],
  ) {
    if (initialReadFailed.current) { setNotice('请先点击回到今天重新读取原有任务，再保存，避免覆盖本地数据。'); return Promise.resolve(false); }
    const savingDay = day;
    const save = pendingSave.current.then(() => window.aiTodo.saveDraft({ day: savingDay, tasks: draftTasks, availability: draftAvailability, schedule: draftSchedule }))
      .then(async () => { setSaveFailed(false); setConfirmed(false); await refreshDays(); return true; })
      .catch(() => { setSaveFailed(true); setNotice('本地草稿保存失败，请重试保存后再切换日期。'); return false; });
    pendingSave.current = save;
    return save;
  }

  async function generatePlan() {
    setLoading(true);
    try {
      const result = await window.aiTodo.generatePlan({ day, rawText: taskInput, availability });
      const allTasks = [...tasks, ...result.tasks.map(task => ({ ...task, id: crypto.randomUUID() }))];
      const allSchedule = buildSchedule(allTasks, availability, scheduleStart(day));
      if (!await persistDraft(allTasks, availability, allSchedule)) throw new Error('保存失败');
      setTasks(allTasks); setSchedule(allSchedule); setTaskInput('');
      setCurrentTaskId(allTasks[0]?.id ?? "");
      setActiveTaskId(null);
      setPausedCountdownSeconds(null);
      setView("list");
      setNotice(result.source === 'ai'
        ? '已使用大模型估算耗时，并保存为本地草稿。'
        : result.source === 'fallback'
          ? '大模型暂不可用，已按每项 30 分钟生成任务并保存草稿，可手动修改耗时。'
          : '已按每项 30 分钟生成 ' + result.tasks.length + ' 个任务，并保存为本地草稿。');
    } catch {
      setNotice("生成计划失败，请检查连接后重试。输入的任务仍然保留。");
    } finally {
      setLoading(false);
    }
  }

  async function confirmPlan(reason?: string) {
    setLoading(true);
    try {
    if (!await pendingSave.current) throw new Error('保存失败');
    const result = (await window.aiTodo.confirmPlan({ day, tasks, availability, schedule, reason })) as {
      schedule: ScheduledTask[];
      version: number;
    };
    setSchedule(result.schedule);
    setVersion(result.version);
    const firstTask = getCurrentScheduledTask(result.schedule, now);
    setCurrentTaskId(firstTask?.id ?? "");
    setActiveTaskId(firstTask?.id ?? null);
    setManuallySelectedTaskId(null);
    setIsRunning(Boolean(firstTask));
    setPausedCountdownSeconds(null);
    setConfirmed(true);
    setView(day === localDayText() ? "execute" : "list");
    if (day !== localDayText()) { setIsRunning(false); setActiveTaskId(null); }
    setNotice('计划 v' + result.version + ' 已确认，提醒按 ' + day + ' 的时间生效。');
    await refreshDays();
    } catch { setNotice('确认计划失败，草稿仍保留，请重试。'); }
    finally { setLoading(false); }
  }

  function updateTask(id: string, patch: Partial<Task>) {
    const nextTasks = tasks.map((task) => (task.id === id ? { ...task, ...patch } : task));
    const nextSchedule =
      patch.duration !== undefined
        ? buildSchedule(nextTasks, availability, scheduleStart(day))
        : schedule.map((task) => (task.id === id ? { ...task, ...patch } : task));
    setTasks(nextTasks);
    setSchedule(nextSchedule);
    persistDraft(nextTasks, availability, nextSchedule);
  }
  function reorderTask(id: string, targetIndex: number) {
    if (loading) return;
    const nextTasks = moveTask(tasks, id, targetIndex);
    if (nextTasks === tasks) return;
    const nextSchedule = buildSchedule(nextTasks, availability, scheduleStart(day));
    setTasks(nextTasks);
    setSchedule(nextSchedule);
    setConfirmed(false);
    setIsRunning(false);
    setActiveTaskId(null);
    setPausedCountdownSeconds(null);
    void persistDraft(nextTasks, availability, nextSchedule).then(saved => {
      if (saved) setNotice('任务顺序已保存，时间已按可用时段重新安排。确认计划后更新提醒。');
    });
  }

  function removeTask(id: string) {
    const nextTasks = tasks.filter((task) => task.id !== id);
    const nextSchedule = schedule.filter((task) => task.id !== id);
    setTasks(nextTasks);
    setSchedule(nextSchedule);
    persistDraft(nextTasks, availability, nextSchedule);
  }
  function updateTime(id: string, field: "start" | "end", value: string) {
    const current = schedule.find((task) => task.id === id);
    if (!current || !value) return;
    const typedMinutes = parseTime(value);
    const startMinutes =
      field === "start"
        ? typedMinutes
        : (current.startMinutes ?? Math.max(0, typedMinutes - current.duration));
    const endMinutes =
      field === "end" ? typedMinutes : (current.endMinutes ?? startMinutes + current.duration);
    if (endMinutes <= startMinutes) {
      setNotice("结束时间需要晚于开始时间。");
      return;
    }
    const duration = field === "end" ? endMinutes - startMinutes : current.duration;
    const nextSchedule = reflowScheduleFromTask(schedule, id, startMinutes, duration);
    const nextTasks =
      field === "end"
        ? tasks.map((task) => (task.id === id ? { ...task, duration } : task))
        : tasks;
    if (field === "end") setTasks(nextTasks);
    setSchedule(nextSchedule);
    persistDraft(nextTasks, availability, nextSchedule);
    const overflowTasks = getScheduleOverflowTasks(nextSchedule, availability);
    setNotice(
      overflowTasks.length
        ? "已修改任务时间并保存草稿，后续 " + overflowTasks.length + " 项已按耗时继续安排，但结束时间超出今日可用时段。"
        : "已修改任务时间并保存草稿，后续任务已顺延；确认后才会启动提醒。",
    );
  }
  function removeAvailability(id: string) {
    const nextAvailability = availability.filter(item => item.id !== id);
    const nextSchedule = buildSchedule(tasks, nextAvailability, scheduleStart(day));
    setAvailability(nextAvailability); setSchedule(nextSchedule);
    persistDraft(tasks, nextAvailability, nextSchedule);
  }
  function addAvailability() {
    const nextAvailability = [
      ...availability,
      { id: `slot-${Date.now()}`, start: "19:00", end: "20:00", kind: "available" as const },
    ];
    setAvailability(nextAvailability);
    const nextSchedule = buildSchedule(tasks, nextAvailability, scheduleStart(day));
    setSchedule(nextSchedule);
    persistDraft(tasks, nextAvailability, nextSchedule);
  }
  function updateAvailability(id: string, field: "start" | "end", value: string) {
    const nextAvailability = availability.map((slot) =>
      slot.id === id ? { ...slot, [field]: value } : slot,
    );
    setAvailability(nextAvailability);
    const nextSchedule = buildSchedule(tasks, nextAvailability, scheduleStart(day));
    setSchedule(nextSchedule);
    persistDraft(tasks, nextAvailability, nextSchedule);
  }

  async function updateProgress(value: number) {
    if (!currentTask || loading) return;
    if (activeTaskId !== currentTask.id && currentTask.status !== "已完成") {
      setNotice("请先完成当前执行中的任务，再同步后续任务进度。");
      return;
    }
    setLoading(true);
    try {
    if (!await pendingSave.current) throw new Error("保存失败");
    await window.aiTodo.recordProgress({
      day,
      taskId: currentTask.id,
      eventType: `progress_${value}`,
      payload: { value },
    });
    setProgress((items) => ({ ...items, [currentTask.id]: value }));
    setTasks(items => items.map(task => task.id === currentTask.id ? { ...task, progress: value, status: value === 100 ? '已完成' : '部分完成' } : task));
    setSchedule(items => items.map(task => task.id === currentTask.id ? { ...task, progress: value, status: value === 100 ? '已完成' : '部分完成' } : task));
    await refreshDays();
    setNotice('已记录 ' + value + '% 进度。'); return true;
    } catch { setNotice('进度保存失败，请重试。'); return false; }
    finally { setLoading(false); }
  }

  async function completeTask() {
    if (!currentTask) return;
    if (activeTaskId !== currentTask.id) {
      setNotice("请先完成当前执行中的任务，再进入后续任务。");
      return;
    }
    if (!await updateProgress(100)) return;
    const completedTasks = tasks.map((task) =>
      task.id === currentTask.id ? { ...task, status: "已完成" as const, progress: 100, completedAt: new Date().toISOString() } : task,
    );
    const completedSchedule = schedule.map((task) =>
      task.id === currentTask.id ? { ...task, status: "已完成" as const, progress: 100, completedAt: new Date().toISOString() } : task,
    );
    setPausedCountdownSeconds(null);
    const next = getNextPendingTask(completedSchedule, currentTask.id);
    if (next) {
      const nowMinutes = now.getHours() * 60 + now.getMinutes();
      const nextSchedule = reflowScheduleFromTask(completedSchedule, next.id, nowMinutes, next.duration);
      setLoading(true);
      try {
        if (!await pendingSave.current) throw new Error("保存失败");
        const state = await window.aiTodo.confirmPlan({
          day,
          tasks: completedTasks,
          availability,
          schedule: nextSchedule,
          reason: "完成后自动开始下一任务",
        });
        setVersion(state.version);
        setTasks(completedTasks);
        setSchedule(nextSchedule);
        setCurrentTaskId(next.id);
        setActiveTaskId(next.id);
        setManuallySelectedTaskId(null);
        setIsRunning(true);
        setNotice("“" + currentTask.title + "”已完成，已自动开始“" + next.title + "”，后续时间已前移。");
        return;
      } catch {
        setTasks(completedTasks);
        setSchedule(completedSchedule);
        setActiveTaskId(null);
        setIsRunning(false);
        setNotice("“" + currentTask.title + "”已完成，但下一任务自动开始失败，请点击“开始下一任务”重试。");
        return;
      } finally {
        setLoading(false);
      }
    }
    setTasks(completedTasks);
    setSchedule(completedSchedule);
    setActiveTaskId(null);
    setIsRunning(false);
    setNotice("今天计划中的任务已全部完成。");
  }

  async function startNextTask() {
    if (!currentTask || !nextTask || loading) return;
    setLoading(true);
    const nowMinutes = now.getHours() * 60 + now.getMinutes();
    const nextSchedule = reflowScheduleFromTask(schedule, nextTask.id, nowMinutes, nextTask.duration);
    try {
      if (!await pendingSave.current) throw new Error('保存失败');
      const state = await window.aiTodo.confirmPlan({ day, tasks, availability, schedule: nextSchedule, reason: '开始下一任务' });
      setVersion(state.version);
    } catch { setNotice('开始任务失败，请重试。'); return; }
    finally { setLoading(false); }
    setSchedule(nextSchedule);
    setCurrentTaskId(nextTask.id);
    setActiveTaskId(nextTask.id);
    setManuallySelectedTaskId(null);
    setPausedCountdownSeconds(null);
    setIsRunning(true);
    setNotice("已开始“" + nextTask.title + "”，后续任务时间已按实际开始时间自动前移。");
  }

  function closeBlockerFlow() {
    setBlocker({});
    setCustomReason("");
    setCustomDelay("");
    setBlockerEdit(null);
    setBlockerEditError("");
    setBlockerOpen(false);
  }

  function chooseReason(reason: string) {
    const normalizedReason = normalizeBlockerReason(reason);
    if (!currentTask || !normalizedReason) return;
    setBlocker({ reason: normalizedReason });
    setCustomDelay("");
  }

  async function commitBlockerAdjustment(
    nextTasks: Task[],
    nextSchedule: ScheduledTask[],
    reason: string,
    successNotice: string,
    pausedSeconds?: number,
  ) {
    setLoading(true);
    try {
      if (!await pendingSave.current) throw new Error('保存失败');
      const state = await window.aiTodo.confirmPlan({
        day,
        tasks: nextTasks,
        availability,
        schedule: nextSchedule,
        reason,
      });
      setTasks(state.tasks);
      setSchedule(state.schedule);
      setVersion(state.version);
      setConfirmed(true);
      if (pausedSeconds !== undefined) setPausedCountdownSeconds(pausedSeconds);
      closeBlockerFlow();
      setNotice(successNotice);
    } catch {
      setNotice('计划调整失败，当前安排未改变，请重试。');
    } finally {
      setLoading(false);
    }
  }

  function delayCurrentTask(minutes: number) {
    if (!currentTask || !blocker.reason || !Number.isInteger(minutes) || minutes < 1 || minutes > 1440) return;
    const startMinutes = currentTask.startMinutes ?? now.getHours() * 60 + now.getMinutes();
    const duration = currentTask.duration + minutes;
    const nextTasks = tasks.map(task => task.id === currentTask.id ? { ...task, duration } : task);
    const nextSchedule = reflowScheduleFromTask(schedule, currentTask.id, startMinutes, duration);
    const pausedSeconds = pausedCountdownSeconds === null ? undefined : pausedCountdownSeconds + minutes * 60;
    void commitBlockerAdjustment(
      nextTasks,
      nextSchedule,
      `遇到阻碍：${blocker.reason}；当前任务延时 ${minutes} 分钟`,
      `“${currentTask.title}”已延时 ${minutes} 分钟，后续任务和提醒已顺延。`,
      pausedSeconds,
    );
  }

  function openBlockerEditor() {
    if (!currentTask) return;
    const startMinutes = currentTask.startMinutes ?? now.getHours() * 60 + now.getMinutes();
    const endMinutes = currentTask.endMinutes ?? startMinutes + currentTask.duration;
    const label = (minutes: number) => {
      const value = Math.max(0, Math.min(1439, Math.round(minutes)));
      return `${String(Math.floor(value / 60)).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`;
    };
    setBlockerEdit({
      title: currentTask.title,
      priority: currentTask.priority,
      start: label(startMinutes),
      end: label(endMinutes),
    });
    setBlockerEditError("");
  }

  function saveBlockerEdit() {
    if (!currentTask || !blocker.reason || !blockerEdit) return;
    const title = blockerEdit.title.trim();
    const startMinutes = parseTime(blockerEdit.start);
    const endMinutes = parseTime(blockerEdit.end);
    if (!title) {
      setBlockerEditError('请输入任务名称。');
      return;
    }
    if (endMinutes <= startMinutes) {
      setBlockerEditError('结束时间需要晚于开始时间。');
      return;
    }
    const duration = endMinutes - startMinutes;
    const nextTasks = tasks.map(task => task.id === currentTask.id
      ? { ...task, title, priority: blockerEdit.priority, duration }
      : task);
    const nextSchedule = reflowScheduleFromTask(schedule, currentTask.id, startMinutes, duration)
      .map(task => task.id === currentTask.id ? { ...task, title, priority: blockerEdit.priority } : task);
    const pausedSeconds = pausedCountdownSeconds === null
      ? undefined
      : Math.max(0, Math.round((endMinutes - (now.getHours() * 60 + now.getMinutes() + now.getSeconds() / 60)) * 60));
    void commitBlockerAdjustment(
      nextTasks,
      nextSchedule,
      `遇到阻碍：${blocker.reason}；快捷修改任务与时段`,
      `“${title}”及对应时段已更新，后续任务和提醒已同步。`,
      pausedSeconds,
    );
  }

  async function clearData() {
    await pendingSave.current;
    await window.aiTodo.clearData();
    pendingSave.current = Promise.resolve(true); initialReadFailed.current = false; setSaveFailed(false); setIsRunning(false);
    setDays([]); setConfirmed(false);
    setTasks([]);
    setSchedule([]);
    setAvailability(defaultAvailability);
    setVersion(0);
    setActiveTaskId(null);
    setProgress({});
    setView("list");
    setSettingsOpen(false); setClearConfirmOpen(false);
    setAiSettings(defaultAiSettings);
    setNotice("本地数据已删除。");
  }

  if (!startupReady) return <div className="startup-screen" role="status">正在读取本地计划…</div>;

  return (
    <div className="app-shell">
      {settingsOpen && <Modal label={aiSettings.setupCompleted ? "大模型设置" : "欢迎使用 AI ToDo"} onClose={() => { if (aiSettings.setupCompleted) setSettingsOpen(false); }}>
        <AiSettingsForm firstRun={!aiSettings.setupCompleted} settings={aiSettings} onClose={() => setSettingsOpen(false)} onSaved={(saved) => {
          setAiSettings(saved);
          setSettingsOpen(false);
          setNotice(saved.enabled ? "已启用大模型估时，下次生成任务时生效。" : "已切换为本地模式，新任务默认 30 分钟。已有任务保持原耗时。");
        }} />
        {aiSettings.setupCompleted && <details className="data-settings"><summary>本地数据管理</summary><p>任务和设置只保存在这台设备上。</p><button className="danger-button" disabled={loading} onClick={() => { setSettingsOpen(false); setClearConfirmOpen(true); }}>删除全部本地数据</button></details>}
      </Modal>}
      {availabilityOpen && <Modal label="可用时段" onClose={() => setAvailabilityOpen(false)}><h2>设置可用时段</h2><p>修改后自动保存为草稿并重新排程，确认计划后更新提醒。</p><AvailabilityEditor availability={availability} onAdd={addAvailability} onUpdate={updateAvailability} onRemove={removeAvailability} /><div className="modal-actions"><button className="primary" onClick={() => setAvailabilityOpen(false)}>完成设置</button></div></Modal>}
      {clearConfirmOpen && <Modal label="删除全部本地数据" onClose={() => setClearConfirmOpen(false)}><h2>删除全部本地数据？</h2><p>将删除所有日期的任务、计划、进度和大模型设置。此操作无法撤销。</p><div className="modal-actions"><button className="secondary" onClick={() => setClearConfirmOpen(false)}>取消删除</button><button className="danger-button" disabled={loading} onClick={() => void clearData()}>确认删除全部数据</button></div></Modal>}
      <AppShell view={view} day={day} today={localDayText(now)} days={days} busy={loading} confirmed={confirmed} taskCount={tasks.length}
        aiEnabled={aiSettings.enabled} onNavigate={setStep} onDay={next => void changeDay(next)} onSettings={() => setSettingsOpen(true)}>
        <div className="content-wrap">

          <div className={notice ? "notice" : "notice empty"} role="status" aria-live="polite">
            {notice && (
              <>
                <BellRing size={16} />
                <span>{notice}</span>
                <button aria-label="关闭提示" onClick={() => setNotice("")}>
                  <X size={15} />
                </button>
              </>
            )}
          </div>
          {reminderAlert && (
            <div
              className={reminderAlert.kind === "end" ? "reminder-alert end" : "reminder-alert"}
              role="alertdialog"
              aria-live="assertive"
              aria-label={reminderAlert.title}
            >
              <div className="reminder-alert-mark">
                <BellRing size={18} />
              </div>
              <div className="reminder-alert-copy">
                <span>AI ToDo · 及时提醒</span>
                <strong>{reminderAlert.title}</strong>
                <p>{reminderAlert.body}</p>
              </div>
              <button
                className="reminder-alert-close"
                aria-label="关闭提醒"
                onClick={() => setReminderAlert(null)}
              >
                <X size={16} />
              </button>
              <button className="reminder-alert-confirm" onClick={() => setReminderAlert(null)}>
                知道了
              </button>
            </div>
          )}
          {saveFailed && <button className="secondary" disabled={loading} onClick={() => void persistDraft(tasks, availability, schedule)}>重试保存当前任务</button>}
          <fieldset className="work-area" disabled={loading}>
          {view === 'list' && <DailyList key={day} day={day} today={localDayText(now)} tasks={tasks} busy={loading} onAdd={quickAdd} onUpdate={editListTask}
            onConfirm={() => void confirmPlan()} onAvailability={() => setAvailabilityOpen(true)}
            plan={{ tasks, schedule, availability, onUpdateTask: updateTask, onUpdateTime: updateTime, onRemoveTask: removeTask, onReorderTask: reorderTask }}
            onCapture={() => setStep('capture')} confirmed={confirmed} onExecute={() => setStep('execute')} />}
          {view === "capture" && (
            <Capture
              onBack={() => setStep("list")}
              day={day}
              tasks={tasks}
              availability={availability}
              taskInput={taskInput}
              plannedMinutes={plannedMinutes}
              loading={loading}
              onInput={setTaskInput}
              onGenerate={() => void generatePlan()}
              onAddAvailability={addAvailability}
              onUpdateAvailability={updateAvailability}
              onRemoveAvailability={removeAvailability}
            />
          )}
          {view === "execute" && day === localDayText(now) && confirmed && currentTask && (
            <Execute
              schedule={schedule}
              currentTask={currentTask}
              progress={currentProgress}
              countdownSeconds={countdownSeconds}
              countdownTotalSeconds={countdownTotalSeconds}
              isActiveTask={activeTaskId === currentTask.id}
              isRunning={isRunning}
              reminderInterval={reminderInterval}
              pausedCountdownSeconds={pausedCountdownSeconds}
              nextTask={nextTask}
              onSelect={selectTask}
              onProgress={updateProgress}
              onComplete={completeTask}
              onStartNext={startNextTask}
              onToggleRunning={() => {
                if (!currentTask || currentTask.status === "已完成") return;
                if (isRunning) {
                  setPausedCountdownSeconds(liveCountdownSeconds);
                  setIsRunning(false);
                  setNotice("任务已暂停，倒计时已冻结。");
                } else {
                  setPausedCountdownSeconds(null);
                  setIsRunning(true);
                  setNotice("任务已继续，倒计时已按当前时间重新计算。");
                }
              }}
              onBlocker={() => {
                setBlocker({});
                setCustomReason("");
                setCustomDelay("");
                setBlockerEdit(null);
                setBlockerEditError("");
                setBlockerOpen(true);
              }}
              onReview={() => setStep("list")}
            />
          )}
          {view === 'execute' && (day !== localDayText(now) || !confirmed || !currentTask) && <section className="empty-state execution-empty"><h1>执行跟进</h1><p>{day !== localDayText(now) ? '执行跟进用于今天的任务。可返回今天，或先为这一天制定计划。' : !tasks.length ? '先添加任务，再安排时间开始执行。' : '计划尚未确认。请先检查任务时间并确认。'}</p><button className="primary" onClick={() => day !== localDayText(now) ? void changeDay(localDayText(now)) : setStep('list')}>{day !== localDayText(now) ? '打开今天的任务' : tasks.length ? '返回任务清单' : '添加第一项任务'}</button></section>}
          </fieldset>
        </div>
      </AppShell>

      {shouldShowBlockerPrompt(view, blockerOpen, blocker.reason) && (
        <Modal label="现在遇到了什么情况？" onClose={closeBlockerFlow}>
          <div className="modal-icon">
            <AlertCircle size={20} />
          </div>
          <h2>现在遇到了什么情况？</h2>
          <p>先了解原因，再决定是否需要调整剩余计划。</p>
          <div className="reason-grid">
            {reasons.map((reason) => (
              <button key={reason} onClick={() => chooseReason(reason)}>
                {reason}
                <ChevronRight size={16} />
              </button>
            ))}
          </div>
          <div className="custom-reason">
            <input
              value={customReason}
              onChange={(event) => setCustomReason(event.target.value)}
              placeholder="输入其他原因"
              aria-label="自定义阻碍原因"
            />
            <button
              className="secondary"
              disabled={!normalizeBlockerReason(customReason)}
              onClick={() => chooseReason(customReason)}
            >
              使用此原因
            </button>
          </div>
          <button
            className="modal-close"
            onClick={closeBlockerFlow}
          >
            暂时不调整
          </button>
        </Modal>
      )}
      {blockerOpen && blocker.reason && !blockerEdit && currentTask && (
        <Modal label="需要多一点时间吗？" onClose={closeBlockerFlow}>
          <div className="modal-icon">
            <Clock3 size={20} />
          </div>
          <h2>需要多一点时间吗？</h2>
          <p>延长当前任务的结束时间，后续任务和提醒会一起顺延。</p>
          <div className="reason-chip">已记录：{blocker.reason}</div>
          <div className="delay-task-summary">
            <strong>{currentTask.title}</strong>
            <span>{currentTask.startLabel}–{currentTask.endLabel}</span>
          </div>
          <div className="delay-options" aria-label="延时时长">
            {[10, 20, 30].map(minutes => (
              <button key={minutes} className="delay-option" aria-label={`延时 ${minutes} 分钟`} disabled={loading} onClick={() => delayCurrentTask(minutes)}>
                <strong>+{minutes}</strong><span>分钟</span>
              </button>
            ))}
          </div>
          <form className="custom-delay" onSubmit={event => {
            event.preventDefault();
            const minutes = Number(customDelay);
            if (Number.isInteger(minutes) && minutes > 0 && minutes <= 1440) delayCurrentTask(minutes);
          }}>
            <label htmlFor="custom-delay">自定义时长</label>
            <div><input id="custom-delay" type="number" min="1" max="1440" step="1" placeholder="输入分钟数" value={customDelay} onChange={event => setCustomDelay(event.target.value)} /><button className="secondary" disabled={loading || !Number.isInteger(Number(customDelay)) || Number(customDelay) < 1 || Number(customDelay) > 1440}>延时</button></div>
          </form>
          <div className="blocker-alternative">
            <span>延时不能解决？</span>
            <button className="link-button" onClick={openBlockerEditor}><PencilLine size={14} />直接修改任务与时段</button>
          </div>
          <button className="modal-close" onClick={() => setBlocker({})}>
            返回选择原因
          </button>
        </Modal>
      )}
      {blockerOpen && blocker.reason && blockerEdit && currentTask && (
        <Modal label="快捷修改任务与时段" onClose={closeBlockerFlow}>
          <div className="modal-icon"><PencilLine size={20} /></div>
          <h2>快捷修改任务与时段</h2>
          <p>保存后，后续任务和提醒会从新的结束时间继续顺延。</p>
          <form className="blocker-editor" onSubmit={event => { event.preventDefault(); saveBlockerEdit(); }}>
            <label>任务名称<input required maxLength={200} value={blockerEdit.title} onChange={event => setBlockerEdit({ ...blockerEdit, title: event.target.value })} /></label>
            <div className="blocker-editor-grid">
              <label>优先级<select value={blockerEdit.priority} onChange={event => setBlockerEdit({ ...blockerEdit, priority: event.target.value as Task['priority'] })}><option>高</option><option>中</option><option>低</option></select></label>
              <label>开始时间<input type="time" required value={blockerEdit.start} onChange={event => setBlockerEdit({ ...blockerEdit, start: event.target.value })} /></label>
              <label>结束时间<input type="time" required value={blockerEdit.end} onChange={event => setBlockerEdit({ ...blockerEdit, end: event.target.value })} /></label>
            </div>
            {blockerEditError && <p className="blocker-edit-error" role="alert">{blockerEditError}</p>}
            <div className="modal-actions">
              <button type="button" className="secondary" onClick={() => { setBlockerEdit(null); setBlockerEditError(""); }}>返回延时选项</button>
              <button className="primary" disabled={loading}>保存并更新时间</button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
