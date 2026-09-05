import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  AlertCircle,
  BellRing,
  CalendarClock,
  Check,
  ChevronRight,
  CircleDot,
  Clock3,
  Pause,
  Play,
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
  formatTime,
  getCheckpoints,
  getReminderInterval,
  getScheduleSegments,
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

function CatFriend() {
  return (
    <svg className="cat-friend" viewBox="0 0 148 140" role="img" aria-label="陪伴你的小猫">
      <ellipse cx="75" cy="129" rx="47" ry="6" fill="#dce6d0" />
      <path d="M103 116c28 3 32-23 18-29" fill="none" stroke="#b7c89e" strokeWidth="13" strokeLinecap="round" />
      <path d="M103 116c28 3 32-23 18-29" fill="none" stroke="#f3edda" strokeWidth="10" strokeLinecap="round" />
      <path d="M48 77c-7 13-10 30-7 42 7 13 58 13 65 0 3-14-2-31-10-42Z" fill="#f3edda" stroke="#b7c89e" strokeWidth="1.5" />
      <ellipse cx="74" cy="105" rx="18" ry="20" fill="#fffaf0" />
      <path d="M35 52 34 22q0-7 6-3l22 15q12-4 24 0l22-15q6-4 6 3l-1 30c7 9 9 22 3 31-12 18-71 18-84 0-6-9-4-22 3-31Z" fill="#f7f1e1" stroke="#b7c89e" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="m41 29 1 18 14-8Z" fill="#edcbb8" />
      <path d="m107 29-1 18-14-8Z" fill="#edcbb8" />
      <path d="m68 36 2 8m9-8-2 8" stroke="#d7c7a6" strokeWidth="3" strokeLinecap="round" />
      <ellipse cx="57" cy="62" rx="3" ry="4" fill="#496240" />
      <ellipse cx="91" cy="62" rx="3" ry="4" fill="#496240" />
      <ellipse cx="45" cy="73" rx="7" ry="4" fill="#edcbb8" />
      <ellipse cx="103" cy="73" rx="7" ry="4" fill="#edcbb8" />
      <path d="M70 70q4-3 8 0l-4 4Z" fill="#ba927c" />
      <path d="M74 74c-1 6-7 6-9 2m9-2c1 6 7 6 9 2" fill="none" stroke="#687b58" strokeWidth="1.5" strokeLinecap="round" />
      <path d="m28 65 13 3m-14 8 13-1m80-10-13 3m14 8-13-1" stroke="#9cae8b" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M48 89q26 11 52 0L77 107Z" fill="#9fbe80" />
      <path d="m70 96 7 3" stroke="#eaf3e2" strokeWidth="2" strokeLinecap="round" />
      <path d="M50 112v9q8 8 16 0v-8m17 0v8q8 8 16 0v-9" fill="#f7f1e1" stroke="#b7c89e" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
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
  const [taskInput, setTaskInput] = useState(
    "完成产品首页；准备下午产品评审；回复客户邮件；整理用户访谈记录",
  );
  const [notice, setNotice] = useState("本地数据已准备好。先输入今天想完成的事情。");
  const [loading, setLoading] = useState(false);
  const [version, setVersion] = useState(0);
  const [currentTaskId, setCurrentTaskId] = useState(starterTasks[0].id);
  const [progress, setProgress] = useState<Record<string, number>>({});
  const [running, setRunning] = useState(false);
  const [blocker, setBlocker] = useState<{
    reason?: string;
    suggestion?: { tasks: Task[]; schedule: ScheduledTask[] };
  }>({});
  const [blockerOpen, setBlockerOpen] = useState(false);
  const [customReason, setCustomReason] = useState("");

  useEffect(() => {
    void window.aiTodo
      .load()
      .then((state) => {
        if (state.tasks.length) {
          setTasks(state.tasks);
          setAvailability(state.availability);
          setSchedule(
            state.schedule.length ? state.schedule : buildSchedule(state.tasks, state.availability),
          );
          setVersion(state.version);
          setCurrentTaskId(
            state.tasks.find((task) => task.status !== "已完成")?.id ?? state.tasks[0].id,
          );
          setView(state.confirmed ? "execute" : "review");
          setNotice(`已恢复本地计划 v${state.version}`);
        }
      })
      .catch(() => setNotice("暂时无法读取本地计划，但仍可继续编辑。"));
    return window.aiTodo.onReminder(() => setNotice("提醒：花半分钟同步一下当前任务进度。"));
  }, []);

  const currentTask =
    schedule.find((task) => task.id === currentTaskId) ??
    schedule.find((task) => task.scheduled) ??
    schedule[0];
  const currentProgress = currentTask ? (progress[currentTask.id] ?? 0) : 0;
  const plannedMinutes = totalMinutes(tasks);
  const reminderInterval = currentTask ? getReminderInterval(currentTask.duration) : null;

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

  async function generatePlan() {
    setLoading(true);
    try {
      const result = await window.aiTodo.generatePlan({ rawText: taskInput, availability });
      setTasks(result.tasks);
      setSchedule(result.schedule);
      setCurrentTaskId(result.tasks[0]?.id ?? "");
      setView("review");
      setNotice(`AI 已整理 ${result.tasks.length} 个任务，并生成参考计划。`);
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
    setView("execute");
    setNotice(`计划 v${result.version} 已确认，提醒节点已保存。`);
  }

  function updateTask(id: string, patch: Partial<Task>) {
    const nextTasks = tasks.map((task) => (task.id === id ? { ...task, ...patch } : task));
    setTasks(nextTasks);
    if (patch.duration !== undefined) {
      setSchedule(buildSchedule(nextTasks, availability));
    } else {
      setSchedule((items) => items.map((task) => (task.id === id ? { ...task, ...patch } : task)));
    }
  }
  function addTask() {
    const task = createDraftTask(tasks.length);
    const nextTasks = [...tasks, task];
    setTasks(nextTasks);
    setSchedule(buildSchedule(nextTasks, availability));
    setNotice("已添加新计划，请补充任务名称、完成标准、优先级和耗时。");
  }
  function updateTime(id: string, field: "start" | "end", value: string) {
    const current = schedule.find((task) => task.id === id);
    if (!current || !value) return;
    if (getScheduleSegments(current).length > 1) {
      setNotice("跨可用时段任务请通过修改耗时或可用时段后重新生成计划。");
      return;
    }
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
    const duration = field === "end" ? Math.max(15, endMinutes - startMinutes) : current.duration;
    const segment = {
      startMinutes,
      endMinutes: startMinutes + duration,
      startLabel: formatTime(startMinutes),
      endLabel: formatTime(startMinutes + duration),
    };
    if (field === "end")
      setTasks((items) => items.map((task) => (task.id === id ? { ...task, duration } : task)));
    setSchedule((items) =>
      items.map((task) =>
        task.id === id
          ? {
              ...task,
              duration,
              scheduled: true,
              startMinutes,
              endMinutes: startMinutes + duration,
              startLabel: formatTime(startMinutes),
              endLabel: formatTime(startMinutes + duration),
              checkpoints: getCheckpoints(startMinutes, duration),
              segments: [segment],
              status: task.status === "待安排" ? "已安排" : task.status,
            }
          : task,
      ),
    );
    setNotice("已修改任务时间，确认计划后才会正式应用。");
  }
  function addAvailability() {
    setAvailability((items) => [
      ...items,
      { id: `slot-${Date.now()}`, start: "19:00", end: "20:00", kind: "available" },
    ]);
  }
  function updateAvailability(id: string, field: "start" | "end", value: string) {
    setAvailability((items) =>
      items.map((slot) => (slot.id === id ? { ...slot, [field]: value } : slot)),
    );
  }

  function updateProgress(value: number) {
    if (!currentTask) return;
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
    updateProgress(100);
    updateTask(currentTask.id, { status: "已完成" });
    const next = schedule.find(
      (task) => task.id !== currentTask.id && task.scheduled && (progress[task.id] ?? 0) < 100,
    );
    if (next) {
      setCurrentTaskId(next.id);
      setNotice(`“${currentTask.title}”已完成，下一项是“${next.title}”。`);
    } else setNotice("今天计划中的任务已全部完成。");
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
        <div className="sidebar-garden">
          <CatFriend />
          <strong>一点点，也在向前。</strong>
          <p>留一点空白，给生活和自己。</p>
        </div>
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
              version={version}
              onUpdateTask={updateTask}
              onAddTask={addTask}
              onUpdateTime={updateTime}
              onRemoveTask={(id) => {
                setTasks((items) => items.filter((task) => task.id !== id));
                setSchedule((items) => items.filter((task) => task.id !== id));
              }}
              onConfirm={() => void confirmPlan()}
              onBack={() => setStep("capture")}
            />
          )}
          {view === "execute" && currentTask && (
            <Execute
              schedule={schedule}
              currentTask={currentTask}
              progress={currentProgress}
              running={running}
              reminderInterval={reminderInterval}
              onSelect={setCurrentTaskId}
              onProgress={updateProgress}
              onComplete={completeTask}
              onToggle={() => setRunning((value) => !value)}
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
            今天想完成什么？
          </label>
          <textarea
            id="task-input"
            value={taskInput}
            onChange={(event) => onInput(event.target.value)}
            placeholder="例如：准备周会材料；回复客户邮件；跑步 30 分钟"
          />
          <div className="form-footer">
            <span className="helper">支持用分号或换行分隔多个任务</span>
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
  if (segments.length > 1) {
    return (
      <div className="time-segments" title="任务会在不可用时段暂停，不发送提醒">
        <div>
          {segments.map((segment) => (
            <span key={`${task.id}-${segment.startMinutes}`}>
              {segment.startLabel}–{segment.endLabel}
            </span>
          ))}
        </div>
        <small>跨可用时段</small>
      </div>
    );
  }
  const startValue = task.startMinutes !== null ? task.startLabel : "";
  const endValue = task.endMinutes !== null ? task.endLabel : "";
  return (
    <div className={task.scheduled ? undefined : "manual-time"}>
      <div>
        <input
          type="time"
          value={startValue}
          onChange={(event) => onUpdateTime(task.id, "start", event.target.value)}
          aria-label={`${task.title} 开始时间`}
        />
        <span>至</span>
        <input
          type="time"
          value={endValue}
          onChange={(event) => onUpdateTime(task.id, "end", event.target.value)}
          aria-label={`${task.title} 结束时间`}
        />
      </div>
      {!task.scheduled && <small>手动安排</small>}
    </div>
  );
}
function Review({
  tasks,
  schedule,
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
  version: number;
  onUpdateTask: (id: string, patch: Partial<Task>) => void;
  onAddTask: () => void;
  onUpdateTime: (id: string, field: "start" | "end", value: string) => void;
  onRemoveTask: (id: string) => void;
  onConfirm: () => void;
  onBack: () => void;
}) {
  const unscheduled = schedule.filter((task) => !task.scheduled).length;
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
                  min="15"
                  step="5"
                  value={task.duration}
                  aria-label={`${task.title} 预计耗时（分钟）`}
                  onChange={(event) =>
                    onUpdateTask(task.id, {
                      duration: Math.max(15, Number(event.target.value) || 15),
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
              任务会按顺序跨可用时段累计执行；不可用时段自动暂停，不创建提醒。不同任务之间保留 15
              分钟缓冲，所有时间冲突都会明确展示。
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
          <div className={unscheduled ? "warning-card" : "info-card"}>
            <AlertCircle size={17} />
            <div>
              <strong>{unscheduled ? `${unscheduled} 项任务暂未安排` : "当前没有时间冲突"}</strong>
              <p>
                {unscheduled
                  ? "可以减少耗时、增加可用时段，或确认后稍后处理。"
                  : "确认计划后才会创建和启动提醒节点。"}
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
  running,
  reminderInterval,
  onSelect,
  onProgress,
  onComplete,
  onToggle,
  onBlocker,
  onReview,
}: {
  schedule: ScheduledTask[];
  currentTask: ScheduledTask;
  progress: number;
  running: boolean;
  reminderInterval: number | null;
  onSelect: (id: string) => void;
  onProgress: (value: number) => void;
  onComplete: () => void;
  onToggle: () => void;
  onBlocker: () => void;
  onReview: () => void;
}) {
  const upcoming = schedule
    .filter((task) => task.id !== currentTask.id && task.scheduled && task.status !== "已完成")
    .slice(0, 3);
  const initialCountdownSeconds = Math.max(0, Math.round(currentTask.duration * 60 * (1 - progress / 100)));
  const [countdownSeconds, setCountdownSeconds] = useState(initialCountdownSeconds);
  useEffect(() => {
    setCountdownSeconds(initialCountdownSeconds);
  }, [currentTask.id, currentTask.duration, progress, initialCountdownSeconds]);
  useEffect(() => {
    if (!running || countdownSeconds <= 0) return undefined;
    const timer = window.setInterval(() => {
      setCountdownSeconds((value) => Math.max(0, value - 1));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [running, currentTask.id, countdownSeconds <= 0]);
  const countdownProgress = initialCountdownSeconds > 0 ? countdownSeconds / initialCountdownSeconds : 0;
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
                onClick={() => task.scheduled && onSelect(task.id)}
                disabled={!task.scheduled}
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
                  正在执行
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
                  <small>任务倒计时</small>
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
              <button className="primary light" onClick={onComplete}>
                <Check size={17} />
                标记为已完成
              </button>
              <button className="secondary dark" onClick={onToggle}>
                {running ? <Pause size={16} /> : <Play size={16} />}
                {running ? "暂停任务" : "继续任务"}
              </button>
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
