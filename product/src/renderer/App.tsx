import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  AlertCircle,
  BellRing,
  CalendarClock,
  Check,
  ChevronRight,
  CircleDot,
  Clock3,
  Plus,
  RotateCcw,
  Settings2,
  Sparkles,
  Sprout,
  Sun,
  Trash2,
  X,
} from "lucide-react";
import {
  buildSchedule,
  createDraftTask,
  defaultAvailability,
  formatScheduleLabel,
  getCurrentScheduledTask,
  getReminderInterval,
  getScheduleOverflowTasks,
  getScheduleSegments,
  getSecondsUntilTaskEnd,
  reflowScheduleFromTask,
  parseTime,
  starterTasks,
  type AvailabilityBlock,
  type Priority,
  type ScheduledTask,
  type Task,
} from "@/shared/domain";
import { normalizeBlockerReason, shouldShowBlockerPrompt } from "./blocker";

type View = "capture" | "review" | "execute";
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
function minutesLabel(value: number) {
  return `${Math.floor(value / 60)} 小时 ${value % 60} 分`;
}
function countdownLabel(seconds: number) {
  const safe = Math.max(0, Math.round(seconds));
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const remainingSeconds = safe % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(remainingSeconds).padStart(2, '0')}`;
}
function todayLabel() {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "long",
    day: "numeric",
    weekday: "long",
  }).format(new Date());
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

function CatFriend() {
  return (
    <figure className="cat-companion">
      <img className="cat-friend" src="./fluffy-cat.png" alt="陪伴你的小猫" width={1280} height={1280} decoding="async" />
      <figcaption>
        <strong>一点点，也在向前。</strong>
        <p>我陪你，把今天慢慢过好。</p>
      </figcaption>
    </figure>
  );
}

function Modal({
  children,
  onClose,
  label,
}: {
  children: ReactNode;
  onClose: () => void;
  label: string;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = dialogRef.current;
    const previousFocus = document.activeElement as HTMLElement | null;
    dialog?.showModal();
    return () => {
      dialog?.close();
      previousFocus?.focus();
    };
  }, []);
  return (
    <dialog
      ref={dialogRef}
      className="modal"
      aria-label={label}
      onKeyDown={(event) => {
        if (event.key !== "Tab") return;
        const controls = Array.from(
          event.currentTarget.querySelectorAll<HTMLElement>(
            'button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex="0"]',
          ),
        );
        const first = controls[0],
          last = controls[controls.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      {children}
    </dialog>
  );
}

export function App() {
  const [view, setView] = useState<View>("capture");
  const [tasks, setTasks] = useState<Task[]>(starterTasks);
  const [availability, setAvailability] = useState<AvailabilityBlock[]>(defaultAvailability);
  const [schedule, setSchedule] = useState<ScheduledTask[]>(() =>
    buildSchedule(starterTasks, defaultAvailability),
  );
  const [taskInput, setTaskInput] = useState("");
  const [notice, setNotice] = useState("本地数据已准备好。先输入今天想完成的事情。");
  const [loading, setLoading] = useState(false);
  const [version, setVersion] = useState(0);
  const [currentTaskId, setCurrentTaskId] = useState(starterTasks[0].id);
  const [manuallySelectedTaskId, setManuallySelectedTaskId] = useState<string | null>(null);
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);
  const [now, setNow] = useState(() => new Date());
  const [isRunning, setIsRunning] = useState(false);
  const [pausedCountdownSeconds, setPausedCountdownSeconds] = useState<number | null>(null);
  const [progress, setProgress] = useState<Record<string, number>>({});
  const [blocker, setBlocker] = useState<{
    reason?: string;
    suggestion?: { tasks: Task[]; schedule: ScheduledTask[] };
  }>({});
  const [blockerOpen, setBlockerOpen] = useState(false);
  const [customReason, setCustomReason] = useState("");
  const [reminderAlert, setReminderAlert] = useState<ReminderAlert | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);

  useEffect(() => {
    void window.aiTodo
      .load()
      .then((state) => {
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
          setView(state.confirmed ? "execute" : "review");
          setNotice(`已恢复本地计划 v${state.version}`);
        }
      })
      .catch(() => setNotice("暂时无法读取本地计划，但仍可继续编辑。"));
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

  function setStep(next: View) {
    setView(next);
    setNotice(
      next === "capture"
        ? "修改任务和可用时段后，生成一份新的参考计划。"
        : next === "review"
          ? "这是草稿计划，确认后才会启动提醒。"
          : "计划已确认，按照当前节奏继续推进。",
    );
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
    void window.aiTodo
      .saveDraft({
        tasks: draftTasks,
        availability: draftAvailability,
        schedule: draftSchedule,
      })
      .catch(() => setNotice("本地草稿保存失败，请检查后重试。"));
  }

  async function generatePlan() {
    setLoading(true);
    try {
      const result = await window.aiTodo.generatePlan({ rawText: taskInput, availability });
      persistDraft(result.tasks, availability, result.schedule);
      setTasks(result.tasks);
      setSchedule(result.schedule);
      setCurrentTaskId(result.tasks[0]?.id ?? "");
      setActiveTaskId(null);
      setPausedCountdownSeconds(null);
      setView("review");
      setNotice(`AI 已整理 ${result.tasks.length} 个任务，并保存为本地草稿。`);
    } catch {
      setNotice("生成计划失败，请检查连接后重试。输入的任务仍然保留。");
    } finally {
      setLoading(false);
    }
  }

  async function confirmPlan(reason?: string) {
    const result = (await window.aiTodo.confirmPlan({ tasks, availability, schedule, reason })) as {
      schedule: ScheduledTask[];
      version: number;
    };
    setSchedule(result.schedule);
    setVersion(result.version);
    const firstTask = getCurrentScheduledTask(result.schedule, now);
    setCurrentTaskId(firstTask?.id ?? "");
    setActiveTaskId(firstTask?.id ?? null);
    setManuallySelectedTaskId(null);
    setIsRunning(false);
    setPausedCountdownSeconds(null);
    setView("execute");
    setNotice(`计划 v${result.version} 已确认，提醒节点已保存。`);
  }

  function updateTask(id: string, patch: Partial<Task>) {
    const nextTasks = tasks.map((task) => (task.id === id ? { ...task, ...patch } : task));
    const nextSchedule =
      patch.duration !== undefined
        ? buildSchedule(nextTasks, availability)
        : schedule.map((task) => (task.id === id ? { ...task, ...patch } : task));
    setTasks(nextTasks);
    setSchedule(nextSchedule);
    persistDraft(nextTasks, availability, nextSchedule);
  }
  function addTask() {
    const task = createDraftTask(tasks.length);
    const nextTasks = [...tasks, task];
    const nextSchedule = buildSchedule(nextTasks, availability);
    setTasks(nextTasks);
    setSchedule(nextSchedule);
    persistDraft(nextTasks, availability, nextSchedule);
    setNotice("已添加新计划并保存草稿，请补充任务名称、完成标准、优先级和耗时。");
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
  function addAvailability() {
    const nextAvailability = [
      ...availability,
      { id: `slot-${Date.now()}`, start: "19:00", end: "20:00", kind: "available" as const },
    ];
    setAvailability(nextAvailability);
    if (view === "review") persistDraft(tasks, nextAvailability, schedule);
  }
  function updateAvailability(id: string, field: "start" | "end", value: string) {
    const nextAvailability = availability.map((slot) =>
      slot.id === id ? { ...slot, [field]: value } : slot,
    );
    setAvailability(nextAvailability);
    if (view === "review") persistDraft(tasks, nextAvailability, schedule);
  }

  function updateProgress(value: number) {
    if (!currentTask) return;
    if (activeTaskId !== currentTask.id && currentTask.status !== "已完成") {
      setNotice("请先完成当前执行中的任务，再同步后续任务进度。");
      return;
    }
    setProgress((items) => ({ ...items, [currentTask.id]: value }));
    void window.aiTodo.recordProgress({
      taskId: currentTask.id,
      eventType: `progress_${value}`,
      payload: { value },
    });
    setNotice(`已记录 ${value}% 进度，后续提醒会根据当前状态调整。`);
  }

  function completeTask() {
    if (!currentTask) return;
    if (activeTaskId !== currentTask.id) {
      setNotice("请先完成当前执行中的任务，再进入后续任务。");
      return;
    }
    updateProgress(100);
    const completedTasks = tasks.map((task) =>
      task.id === currentTask.id ? { ...task, status: "已完成" as const } : task,
    );
    const completedSchedule = schedule.map((task) =>
      task.id === currentTask.id ? { ...task, status: "已完成" as const } : task,
    );
    setTasks(completedTasks);
    setSchedule(completedSchedule);
    const next = getNextPendingTask(schedule, currentTask.id);
    setActiveTaskId(null);
    setIsRunning(false);
    setPausedCountdownSeconds(null);
    if (next) {
      setNotice("“" + currentTask.title + "”已完成，点击“开始下一任务”继续，后续时间会自动前移。");
    } else {
      setNotice("今天计划中的任务已全部完成。");
    }
  }

  function startNextTask() {
    if (!currentTask || !nextTask) return;
    const nowMinutes = now.getHours() * 60 + now.getMinutes();
    const nextSchedule = reflowScheduleFromTask(schedule, nextTask.id, nowMinutes, nextTask.duration);
    setSchedule(nextSchedule);
    setCurrentTaskId(nextTask.id);
    setActiveTaskId(nextTask.id);
    setManuallySelectedTaskId(null);
    setPausedCountdownSeconds(null);
    setIsRunning(true);
    setNotice("已开始“" + nextTask.title + "”，后续任务时间已按实际开始时间自动前移。");
  }

  async function chooseReason(reason: string) {
    const normalizedReason = normalizeBlockerReason(reason);
    if (!currentTask || !normalizedReason) return;
    const suggestion = await window.aiTodo.suggestReplan({
      tasks,
      availability,
      currentTaskId: currentTask.id,
      reason: normalizedReason,
    });
    setBlocker({ reason: normalizedReason, suggestion });
  }

  async function applyReplan() {
    if (!blocker.suggestion) return;
    persistDraft(blocker.suggestion.tasks, availability, blocker.suggestion.schedule);
    setTasks(blocker.suggestion.tasks);
    setSchedule(blocker.suggestion.schedule);

    setBlocker({});
    setBlockerOpen(false);
    setCustomReason("");
    setNotice("已生成新的重排草稿，确认后才会更新提醒和今日时间线。");
    setView("review");
  }

  async function clearData() {
    await window.aiTodo.clearData();
    setTasks([]);
    setSchedule([]);
    setAvailability(defaultAvailability);
    setVersion(0);
    setActiveTaskId(null);
    setProgress({});
    setView("capture");
    setNotice("本地数据已删除。");
  }

  if (!currentTask && view === "execute") setStep("capture");

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">
            <Sprout size={24} />
          </span>
          <div>
            <strong>AI ToDo</strong>
            <small>让每一天，慢慢开花</small>
          </div>
        </div>
        <nav className="step-nav" aria-label="主要流程">
          {(
            [
              ["capture", "录入任务", "01"],
              ["review", "确认计划", "02"],
              ["execute", "执行跟进", "03"],
            ] as Array<[View, string, string]>
          ).map(([id, label, number]) => (
            <button
              key={id}
              className={view === id ? "step active" : "step"}
              aria-current={view === id ? "step" : undefined}
              onClick={() => setStep(id)}
            >
              <span>{number}</span>
              {label}
              {view === id && <ChevronRight size={16} />}
            </button>
          ))}
        </nav>
        <CatFriend />
        <div className="sidebar-note">
          <span className="status-dot" />
          <strong>安心存在这台设备</strong>
          <p>任务、计划和执行记录保存在本地。</p>
        </div>
        <button className="quiet-button" onClick={() => void clearData()}>
          <Trash2 size={15} />
          删除全部本地数据
        </button>
      </aside>

      <main className="main-content">
        <header className="topbar">
          <div className="date">
            <CalendarClock size={17} />
            {todayLabel()}
            <span className="date-divider" />
            <span className="available-summary">
              可用：
              {availability.map((slot) => `${slot.start}–${slot.end}`).join("、") || "尚未设置"}
            </span>
          </div>
          <div className="top-actions">
            <span className="local-pill">
              <span className="status-dot" />
              本地模式
            </span>
            <button
              className="icon-button"
              title="设置可用时段"
              aria-label="设置可用时段"
              onClick={() => setStep("capture")}
            >
              <Settings2 size={17} />
            </button>
          </div>
        </header>
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
          {view === "capture" && (
            <Capture
              tasks={tasks}
              availability={availability}
              taskInput={taskInput}
              plannedMinutes={plannedMinutes}
              loading={loading}
              onInput={setTaskInput}
              onGenerate={() => void generatePlan()}
              onAddAvailability={addAvailability}
              onUpdateAvailability={updateAvailability}
              onRemoveAvailability={(id) =>
                setAvailability((items) => items.filter((item) => item.id !== id))
              }
            />
          )}
          {view === "review" && (
            <Review
              tasks={tasks}
              schedule={schedule}
              availability={availability}
              version={version}
              onUpdateTask={updateTask}
              onAddTask={addTask}
              onUpdateTime={updateTime}
              onRemoveTask={removeTask}
              onConfirm={() => void confirmPlan()}
              onBack={() => setStep("capture")}
            />
          )}
          {view === "execute" && currentTask && (
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
                setBlockerOpen(true);
              }}
              onReview={() => setStep("review")}
            />
          )}
        </div>
      </main>

      {shouldShowBlockerPrompt(view, blockerOpen, blocker.reason) && (
        <Modal label="现在遇到了什么情况？" onClose={() => setBlockerOpen(false)}>
          <div className="modal-icon">
            <AlertCircle size={20} />
          </div>
          <h2>现在遇到了什么情况？</h2>
          <p>先了解原因，再决定是否需要调整剩余计划。</p>
          <div className="reason-grid">
            {reasons.map((reason) => (
              <button key={reason} onClick={() => void chooseReason(reason)}>
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
              onClick={() => void chooseReason(customReason)}
            >
              使用此原因
            </button>
          </div>
          <button
            className="modal-close"
            onClick={() => {
              setBlocker({});
              setCustomReason("");
              setBlockerOpen(false);
            }}
          >
            暂时不调整
          </button>
        </Modal>
      )}
      {blockerOpen && blocker.reason && blocker.suggestion && (
        <Modal label="这是建议的新安排" onClose={() => setBlockerOpen(false)}>
          <div className="modal-icon success">
            <Sparkles size={20} />
          </div>
          <h2>这是建议的新安排</h2>
          <p>原因已记录，系统不会直接修改当前计划。</p>
          <div className="reason-chip">已记录：{blocker.reason}</div>
          <div className="impact-list">
            {blocker.suggestion.schedule
              .filter((task) => task.scheduled)
              .slice(0, 4)
              .map((task) => (
                <div key={task.id}>
                  <span>{task.title}</span>
                  <strong>{formatScheduleLabel(task)}</strong>
                </div>
              ))}
          </div>
          <div className="modal-actions">
            <button
              className="secondary"
              onClick={() => {
                setBlocker({});
                setCustomReason("");
                setBlockerOpen(true);
              }}
            >
              返回
            </button>
            <button className="primary" onClick={() => void applyReplan()}>
              生成重排草稿
              <ChevronRight size={16} />
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

function Capture({
  tasks,
  availability,
  taskInput,
  plannedMinutes,
  loading,
  onInput,
  onGenerate,
  onAddAvailability,
  onUpdateAvailability,
  onRemoveAvailability,
}: {
  tasks: Task[];
  availability: AvailabilityBlock[];
  taskInput: string;
  plannedMinutes: number;
  loading: boolean;
  onInput: (value: string) => void;
  onGenerate: () => void;
  onAddAvailability: () => void;
  onUpdateAvailability: (id: string, field: "start" | "end", value: string) => void;
  onRemoveAvailability: (id: string) => void;
}) {
  return (
    <section>
      <div className="heading-row">
        <div>
          <span className="eyebrow">
            <Sun size={16} />
            今天也从容一点
          </span>
          <h1>把今天，安排得刚刚好。</h1>
          <p>写下想做的事，让 AI 帮你理一理。一步一步来就好。</p>
        </div>
        <span className="heading-meta">
          <BellRing size={14} />
          确认计划后，才会开启提醒
        </span>
      </div>
      <div className="capture-grid">
        <div className="surface">
          <div className="section-title">
            <Clock3 size={17} />
            今天什么时候有空？
            <button className="link-button" onClick={onAddAvailability}>
              <Plus size={15} />
              添加时段
            </button>
          </div>
          <div className="availability-list">
            {availability.map((slot, index) => (
              <div className="availability-row" key={slot.id}>
                <span>时段 {index + 1}</span>
                <input
                  type="time"
                  value={slot.start}
                  aria-label={`时段 ${index + 1} 开始时间`}
                  onChange={(event) => onUpdateAvailability(slot.id, "start", event.target.value)}
                />
                <b>至</b>
                <input
                  type="time"
                  value={slot.end}
                  aria-label={`时段 ${index + 1} 结束时间`}
                  onChange={(event) => onUpdateAvailability(slot.id, "end", event.target.value)}
                />
                <button
                  className="remove-button"
                  disabled={availability.length <= 1}
                  onClick={() => onRemoveAvailability(slot.id)}
                  aria-label={`删除时段 ${index + 1}`}
                >
                  <Trash2 size={15} />
                </button>
              </div>
            ))}
          </div>
          <div className="divider" />
          <label className="field-label" htmlFor="task-input">
            <strong>今天想完成什么？</strong>
            <span className="field-hint">（支持用分号或换行分隔多个任务）</span>
          </label>
          <textarea
            id="task-input"
            value={taskInput}
            onChange={(event) => onInput(event.target.value)}
            placeholder="例如：准备周会材料；回复客户邮件；跑步 30 分钟"
          />
          <div className="form-footer">
            <button
              className="primary"
              onClick={onGenerate}
              disabled={loading || !taskInput.trim()}
            >
              {loading ? (
                "正在整理…"
              ) : (
                <>
                  <Sparkles size={16} />
                  生成参考计划
                </>
              )}
            </button>
          </div>
        </div>
        <aside className="ai-preview">
          <div className="ai-preview-head">
            <div>
              <strong>AI 识别预览</strong>
              <small>当前任务参考，生成后可逐项修改</small>
            </div>
            <span>{tasks.length} 项</span>
          </div>
          <div className="preview-items">
            {tasks.slice(0, 5).map((task) => (
              <div key={task.id}>
                <i data-priority={task.priority}>{task.priority}</i>
                <span>{task.title}</span>
                <b>{task.duration} 分</b>
              </div>
            ))}
          </div>
          <p>
            <Sparkles size={14} />
            当前估计共需 <strong>{minutesLabel(plannedMinutes)}</strong>，排程会避开不可用时间。
          </p>
        </aside>
      </div>
      <p className="capture-footnote">
        <Sprout size={14} />
        计划里，也可以留一点休息的时间。
      </p>
    </section>
  );
}

function ScheduleTime({
  task,
  onUpdateTime,
}: {
  task: ScheduledTask;
  onUpdateTime: (id: string, field: "start" | "end", value: string) => void;
}) {
  const segments = getScheduleSegments(task);
  const startValue = task.startMinutes !== null ? task.startLabel : "";
  const endValue = task.endMinutes !== null ? task.endLabel : "";
  return (
    <div className={task.scheduled ? undefined : "manual-time"}>
      {segments.length > 1 && <><small>跨可用时段</small><small>编辑后按连续时间重排</small></>}
      <div>
        <input
          type="time"
          value={startValue}
          onChange={(event) => onUpdateTime(task.id, "start", event.target.value)}
          aria-label={task.title + " 开始时间"}
        />
        <span>至</span>
        <input
          type="time"
          value={endValue}
          onChange={(event) => onUpdateTime(task.id, "end", event.target.value)}
          aria-label={task.title + " 结束时间"}
        />
      </div>
      {!task.scheduled && <small>手动安排</small>}
    </div>
  );
}
function Review({
  tasks,
  schedule,
  availability,
  version,
  onUpdateTask,
  onAddTask,
  onUpdateTime,
  onRemoveTask,
  onConfirm,
  onBack,
}: {
  tasks: Task[];
  schedule: ScheduledTask[];
  availability: AvailabilityBlock[];
  version: number;
  onUpdateTask: (id: string, patch: Partial<Task>) => void;
  onAddTask: () => void;
  onUpdateTime: (id: string, field: "start" | "end", value: string) => void;
  onRemoveTask: (id: string) => void;
  onConfirm: () => void;
  onBack: () => void;
}) {
  const unscheduled = schedule.filter((task) => !task.scheduled).length;
  const overflowTasks = getScheduleOverflowTasks(schedule, availability);
  return (
    <section>
      <div className="heading-row">
        <div>
          <span className="eyebrow">参考计划 · 草稿{version ? ` · v${version + 1}` : ""}</span>
          <h1>这份安排合适吗？</h1>
          <p>AI 负责提出建议，最终时间始终由你确认。</p>
        </div>
        <div className="heading-buttons">
          <button className="secondary" onClick={onAddTask}>
            <Plus size={16} />
            添加计划
          </button>
          <button className="secondary" onClick={onBack}>
            <RotateCcw size={16} />
            重新录入
          </button>
          <button className="primary" onClick={onConfirm}>
            确认并开始
            <ChevronRight size={16} />
          </button>
        </div>
      </div>
      <div className="review-grid">
        <div className="surface table-surface">
          <div className="table-head">
            <span>时间</span>
            <span>任务与完成标准</span>
            <span>优先级</span>
            <span>耗时 / 操作</span>
          </div>
          {!schedule.length && (
            <div className="empty-state">
              <Sprout size={24} />
              <p>还没有任务，先添加一项想完成的事。</p>
              <button className="secondary" onClick={onAddTask}>
                <Plus size={16} />
                添加第一项计划
              </button>
            </div>
          )}
          {schedule.map((task) => (
            <div className="task-row" key={task.id}>
              <div className="time-cell">
                <ScheduleTime task={task} onUpdateTime={onUpdateTime} />
              </div>
              <div className="task-main">
                <input
                  className="task-title-input"
                  value={task.title}
                  onChange={(event) => onUpdateTask(task.id, { title: event.target.value })}
                  aria-label={`${task.title} 任务名称`}
                />
                <input
                  className="task-definition-input"
                  value={task.doneDefinition}
                  onChange={(event) =>
                    onUpdateTask(task.id, { doneDefinition: event.target.value })
                  }
                  aria-label={`${task.title} 完成标准`}
                />
              </div>
              <div className="priority-cell">
                <select
                  value={task.priority}
                  data-priority={task.priority}
                  onChange={(event) =>
                    onUpdateTask(task.id, { priority: event.target.value as Priority })
                  }
                  aria-label={`${task.title} 优先级`}
                >
                  <option>高</option>
                  <option>中</option>
                  <option>低</option>
                </select>
              </div>
              <div className="task-actions">
                <input
                  type="number"
                  min="1"
                  step="5"
                  value={task.duration}
                  aria-label={`${task.title} 预计耗时（分钟）`}
                  onChange={(event) =>
                    onUpdateTask(task.id, {
                      duration: Math.max(1, Number(event.target.value) || 1),
                    })
                  }
                />
                <span>分</span>
                <button
                  className="remove-button"
                  onClick={() => onRemoveTask(task.id)}
                  aria-label={`删除${task.title}`}
                >
                  <Trash2 size={15} />
                </button>
              </div>
            </div>
          ))}
        </div>
        <aside className="review-aside">
          <div className="dark-card">
            <Sparkles size={18} />
            <h3>排程说明</h3>
            <p>
              任务会按顺序跨可用时段累计执行；不可用时段自动暂停，不创建提醒。不同任务直接衔接，
              所有时间冲突都会明确展示。
            </p>
            <div className="stat-row">
              <div>
                <strong>{schedule.filter((task) => task.scheduled).length}</strong>
                <small>已安排任务</small>
              </div>
              <div>
                <strong>
                  {Math.floor(tasks.reduce((sum, task) => sum + task.duration, 0) / 60)}h
                </strong>
                <small>专注时间</small>
              </div>
            </div>
          </div>
          <div className={unscheduled || overflowTasks.length ? "warning-card" : "info-card"}>
            <AlertCircle size={17} />
            <div>
              <strong>
                {unscheduled
                  ? unscheduled + " 项任务暂未安排"
                  : overflowTasks.length
                    ? overflowTasks.length + " 项任务超出今日可用时段"
                    : "当前没有时间冲突"}
              </strong>
              <p>
                {unscheduled
                  ? "可以减少耗时、增加可用时段，或确认后稍后处理。"
                  : overflowTasks.length
                    ? "已按任务耗时继续往后排，请确认是否接受今天可用时段之外的执行时间。"
                    : "修改会自动保存为本地草稿，确认后才会创建和启动提醒节点。"}
              </p>
            </div>
          </div>
          <div className="info-card">
            <BellRing size={17} />
            <div>
              <strong>提醒规则透明</strong>
              <p>30 分钟以内不设置中途检查点；更长任务按 30～60 分钟间隔检查。</p>
            </div>
          </div>
        </aside>
      </div>
    </section>
  );
}

function Execute({
  schedule,
  currentTask,
  progress,
  countdownSeconds,
  countdownTotalSeconds,
  isActiveTask,
  isRunning,
  reminderInterval,
  pausedCountdownSeconds,
  nextTask,
  onSelect,
  onProgress,
  onComplete,
  onToggleRunning,
  onStartNext,
  onBlocker,
  onReview,
}: {
  schedule: ScheduledTask[];
  currentTask: ScheduledTask;
  progress: number;
  countdownSeconds: number;
  countdownTotalSeconds: number;
  isActiveTask: boolean;
  isRunning: boolean;
  reminderInterval: number | null;
  pausedCountdownSeconds: number | null;
  nextTask?: ScheduledTask;
  onSelect: (id: string) => void;
  onProgress: (value: number) => void;
  onComplete: () => void;
  onToggleRunning: () => void;
  onStartNext: () => void;
  onBlocker: () => void;
  onReview: () => void;
}) {
  const upcoming = schedule
    .filter((task) => task.id !== currentTask.id && task.scheduled && task.status !== "已完成")
    .slice(0, 3);
  const countdownProgress = countdownTotalSeconds > 0 ? countdownSeconds / countdownTotalSeconds : 0;
  return (
    <section>
      <div className="heading-row">
        <div>
          <span className="eyebrow">今日执行台</span>
          <h1>按现在的节奏继续</h1>
          <p>当前任务进度 {progress}%，完成后再衔接下一项。</p>
        </div>
        <button className="secondary" onClick={onReview}>
          <Settings2 size={16} />
          查看完整计划
        </button>
      </div>
      <div className="execute-grid">
        <aside className="surface timeline">
          <div className="section-title">
            <div>
              <strong>今天的节奏</strong>
              <small>
                {schedule.length} 项任务 ·{" "}
                {schedule.filter((task) => task.scheduled).length ? "已安排" : "待安排"}
              </small>
            </div>
            <CalendarClock size={18} />
          </div>
          <div className="timeline-items">
            {schedule.map((task) => (
              <button
                key={task.id}
                className={
                  task.id === currentTask.id
                    ? "timeline-item active"
                    : task.status === "已完成"
                      ? "timeline-item done"
                      : "timeline-item"
                }
                onClick={() => onSelect(task.id)}
              >
                <span className="timeline-dot">
                  {task.status === "已完成" && <Check size={11} />}
                </span>
                <span>
                  <small>{task.startLabel}</small>
                  <strong>{task.title}</strong>
                </span>
              </button>
            ))}
          </div>
        </aside>
        <div className="focus-card">
          <div className="focus-orbit one" />
          <div className="focus-orbit two" />
          <div className="focus-content">
            <div className="focus-top">
              <div>
                <span className="focus-kicker">
                  <CircleDot size={14} />
                  {isActiveTask ? "正在执行" : currentTask.status === "已完成" ? "已完成" : "等待前置任务"}
                </span>
                <h2>{currentTask.title}</h2>
                <p>完成标准：{currentTask.doneDefinition}</p>
              </div>
              <span className="time-chip">{formatScheduleLabel(currentTask)}</span>
            </div>
            <div className="progress-area">
              <div
                className="progress-ring"
                role="progressbar"
                aria-label="当前任务进度"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={progress}
                style={{
                  background: `conic-gradient(var(--green) ${progress * 3.6}deg, #d5e3cb 0deg)`,
                }}
              >
                <div>
                  <strong>{progress}%</strong>
                  <small>已同步进度</small>
                </div>
              </div>
              <div
                className="countdown-ring"
                role="timer"
                aria-label="任务倒计时"
                aria-live="polite"
                style={{
                  background: `conic-gradient(var(--green) ${countdownProgress * 360}deg, #d5e3cb 0deg)`,
                }}
              >
                <div>
                  <strong>{countdownLabel(countdownSeconds)}</strong>
                  <small>
                    {currentTask.status === "已完成"
                      ? "任务已完成"
                      : pausedCountdownSeconds !== null
                        ? "倒计时已暂停"
                        : isRunning
                          ? isActiveTask
                            ? "任务倒计时"
                            : "等待前置任务"
                          : "等待开始"}
                  </small>
                </div>
              </div>
            </div>
            <div className="progress-copy">
              <div className="progress-track">
                <i style={{ width: `${progress}%` }} />
              </div>
              <div className="reminder-card">
                <BellRing size={16} />
                <div>
                  <strong>
                    {reminderInterval ? `每 ${reminderInterval} 分钟同步一次` : "不设置中途提醒"}
                  </strong>
                  <small>你可以在任何时候手动同步状态。</small>
                </div>
              </div>
            </div>
            <div className="quick-label">快速同步</div>
            <div className="quick-actions">
              {[25, 50, 75].map((value) => (
                <button
                  key={value}
                  className={progress === value ? "selected" : ""}
                  onClick={() => onProgress(value)}
                >
                  完成 {value}%
                </button>
              ))}
              <button className="danger-quick" onClick={onBlocker}>
                遇到阻碍
              </button>
            </div>
            <div className="focus-footer">
              {currentTask.status === "已完成" && nextTask ? (
                <button className="primary light" onClick={onStartNext}>
                  <ChevronRight size={17} />
                  开始下一任务
                </button>
              ) : (
                <>
                  <button className="secondary" onClick={onToggleRunning}>
                    {isRunning ? "暂停任务" : "继续任务"}
                  </button>
                  <button className="primary light" onClick={onComplete}>
                    <Check size={17} />
                    标记为已完成
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
        <aside className="execute-aside">
          <div className="surface upcoming">
            <div className="section-title">
              <div>
                <strong>接下来</strong>
                <small>根据当前计划自动衔接</small>
              </div>
              <Clock3 size={18} />
            </div>
            {upcoming.map((task) => (
              <div className="upcoming-item" key={task.id}>
                <span>{task.startLabel}</span>
                <div>
                  <strong>{task.title}</strong>
                  <small>{task.duration} 分钟</small>
                </div>
              </div>
            ))}
            {!upcoming.length && (
              <p className="empty-state">没有其他待执行的安排，专心做好眼前这一件。</p>
            )}
          </div>
          <div className="why-card">
            <Sparkles size={16} />
            <strong>为什么这样提醒？</strong>
            <p>
              确认耗时为 {currentTask.duration} 分钟，因此采用
              {reminderInterval ? `每 ${reminderInterval} 分钟` : "仅结束时"}的检查节奏。
            </p>
          </div>
        </aside>
      </div>
    </section>
  );
}
