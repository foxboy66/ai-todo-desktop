import { useEffect, useState } from 'react';
import { AlertCircle, BellRing, CalendarClock, Check, ChevronRight, CircleDot, Clock3, Pause, Play, Plus, RotateCcw, Settings2, Sparkles, Trash2, X } from 'lucide-react';
import { buildSchedule, defaultAvailability, formatTime, getCheckpoints, getReminderInterval, parseTime, starterTasks, type AvailabilityBlock, type Priority, type ScheduledTask, type Task } from '@/shared/domain';
import { normalizeBlockerReason, shouldShowBlockerPrompt } from './blocker';

type View = 'capture' | 'review' | 'execute';
const reasons = ['耗时比预期更长', '临时事项打断', '任务内容不清楚', '缺少资料或条件', '精力不足', '优先级发生变化'];

function totalMinutes(tasks: Task[]) { return tasks.reduce((sum, task) => sum + task.duration, 0); }
function minutesLabel(value: number) { return `${Math.floor(value / 60)} 小时 ${value % 60} 分`; }
function todayLabel() { return new Intl.DateTimeFormat('zh-CN', { month: 'long', day: 'numeric', weekday: 'long' }).format(new Date()); }

export function App() {
  const [view, setView] = useState<View>('capture');
  const [tasks, setTasks] = useState<Task[]>(starterTasks);
  const [availability, setAvailability] = useState<AvailabilityBlock[]>(defaultAvailability);
  const [schedule, setSchedule] = useState<ScheduledTask[]>(() => buildSchedule(starterTasks, defaultAvailability));
  const [taskInput, setTaskInput] = useState('完成产品首页；准备下午产品评审；回复客户邮件；整理用户访谈记录');
  const [notice, setNotice] = useState('本地数据已准备好。先输入今天想完成的事情。');
  const [loading, setLoading] = useState(false);
  const [version, setVersion] = useState(0);
  const [currentTaskId, setCurrentTaskId] = useState(starterTasks[0].id);
  const [progress, setProgress] = useState<Record<string, number>>({});
  const [running, setRunning] = useState(false);
  const [blocker, setBlocker] = useState<{ reason?: string; suggestion?: { tasks: Task[]; schedule: ScheduledTask[] } }>({});
  const [blockerOpen, setBlockerOpen] = useState(false);
  const [customReason, setCustomReason] = useState('');

  useEffect(() => {
    void window.aiTodo.load().then((state) => {
      if (state.tasks.length) {
        setTasks(state.tasks);
        setAvailability(state.availability);
        setSchedule(state.schedule.length ? state.schedule : buildSchedule(state.tasks, state.availability));
        setVersion(state.version);
        setCurrentTaskId(state.tasks.find((task) => task.status !== '已完成')?.id ?? state.tasks[0].id);
        setView(state.confirmed ? 'execute' : 'review');
        setNotice(`已恢复本地计划 v${state.version}`);
      }
    }).catch(() => setNotice('暂时无法读取本地计划，但仍可继续编辑。'));
    return window.aiTodo.onReminder(() => setNotice('提醒：花半分钟同步一下当前任务进度。'));
  }, []);

  const currentTask = schedule.find((task) => task.id === currentTaskId) ?? schedule.find((task) => task.scheduled) ?? schedule[0];
  const currentProgress = currentTask ? progress[currentTask.id] ?? 0 : 0;
  const plannedMinutes = totalMinutes(tasks);
  const reminderInterval = currentTask ? getReminderInterval(currentTask.duration) : null;

  function setStep(next: View) {
    setView(next);
    setNotice(next === 'capture' ? '修改任务和可用时段后，生成一份新的参考计划。' : next === 'review' ? '这是草稿计划，确认后才会启动提醒。' : '计划已确认，按照当前节奏继续推进。');
  }

  async function generatePlan() {
    setLoading(true);
    try {
      const result = await window.aiTodo.generatePlan({ rawText: taskInput, availability });
      setTasks(result.tasks);
      setSchedule(result.schedule);
      setCurrentTaskId(result.tasks[0]?.id ?? '');
      setView('review');
      setNotice(`AI 已整理 ${result.tasks.length} 个任务，并生成参考计划。`);
    } finally { setLoading(false); }
  }

  async function confirmPlan(reason?: string) {
    const result = await window.aiTodo.confirmPlan({ tasks, availability, schedule, reason }) as { schedule: ScheduledTask[]; version: number };
    setSchedule(result.schedule);
    setVersion(result.version);
    setView('execute');
    setNotice(`计划 v${result.version} 已确认，提醒节点已保存。`);
  }

  function updateTask(id: string, patch: Partial<Task>) {
    setTasks((items) => items.map((task) => task.id === id ? { ...task, ...patch } : task));
    setSchedule(buildSchedule(tasks.map((task) => task.id === id ? { ...task, ...patch } : task), availability));
  }

  function updateTime(id: string, field: 'start' | 'end', value: string) {
    const current = schedule.find((task) => task.id === id);
    if (!current || !current.scheduled) return;
    const startMinutes = parseTime(field === 'start' ? value : current.startLabel);
    const endMinutes = field === 'end' ? parseTime(value) : startMinutes + current.duration;
    const duration = field === 'end' ? Math.max(15, endMinutes - startMinutes) : current.duration;
    if (field === 'end') setTasks((items) => items.map((task) => task.id === id ? { ...task, duration } : task));
    setSchedule((items) => items.map((task) => task.id === id ? { ...task, duration, startMinutes, endMinutes: startMinutes + duration, startLabel: formatTime(startMinutes), endLabel: formatTime(startMinutes + duration), checkpoints: getCheckpoints(startMinutes, duration) } : task));
    setNotice('已修改任务时间，确认计划后才会正式应用。');
  }
  function addAvailability() { setAvailability((items) => [...items, { id: `slot-${Date.now()}`, start: '19:00', end: '20:00', kind: 'available' }]); }
  function updateAvailability(id: string, field: 'start' | 'end', value: string) { setAvailability((items) => items.map((slot) => slot.id === id ? { ...slot, [field]: value } : slot)); }

  function updateProgress(value: number) {
    if (!currentTask) return;
    setProgress((items) => ({ ...items, [currentTask.id]: value }));
    void window.aiTodo.recordProgress({ taskId: currentTask.id, eventType: `progress_${value}`, payload: { value } });
    setNotice(`已记录 ${value}% 进度，后续提醒会根据当前状态调整。`);
  }

  function completeTask() {
    if (!currentTask) return;
    updateProgress(100);
    updateTask(currentTask.id, { status: '已完成' });
    const next = schedule.find((task) => task.id !== currentTask.id && task.scheduled && (progress[task.id] ?? 0) < 100);
    if (next) { setCurrentTaskId(next.id); setNotice(`“${currentTask.title}”已完成，下一项是“${next.title}”。`); }
    else setNotice('今天计划中的任务已全部完成。');
  }

  async function chooseReason(reason: string) {
    const normalizedReason = normalizeBlockerReason(reason);
    if (!currentTask || !normalizedReason) return;
    const suggestion = await window.aiTodo.suggestReplan({ tasks, availability, currentTaskId: currentTask.id, reason: normalizedReason });
    setBlocker({ reason: normalizedReason, suggestion });
  }

  async function applyReplan() {
    if (!blocker.suggestion) return;
    setTasks(blocker.suggestion.tasks);
    setSchedule(blocker.suggestion.schedule);

    setBlocker({});
    setBlockerOpen(false);
    setCustomReason('');
    setNotice('已生成新的重排草稿，确认后才会更新提醒和今日时间线。');
    setView('review');
  }

  async function clearData() {
    await window.aiTodo.clearData();
    setTasks([]); setSchedule([]); setAvailability(defaultAvailability); setVersion(0); setProgress({}); setView('capture');
    setNotice('本地数据已删除。');
  }

  if (!currentTask && view === 'execute') setStep('capture');

  return <div className="app-shell">
    <aside className="sidebar">
      <div className="brand"><span className="brand-mark"><CircleDot size={20} /></span><div><strong>AI ToDo</strong><small>把计划变成行动</small></div></div>
      <nav className="step-nav" aria-label="主要流程">
        {([['capture', '录入任务', '01'], ['review', '确认计划', '02'], ['execute', '执行跟进', '03']] as Array<[View, string, string]>).map(([id, label, number]) => <button key={id} className={view === id ? 'step active' : 'step'} onClick={() => setStep(id)}><span>{number}</span>{label}{view === id && <ChevronRight size={16} />}</button>)}
      </nav>
      <div className="sidebar-note"><Sparkles size={16} /><strong>本地优先</strong><p>任务、计划版本和执行记录保存在当前设备的 SQLite 数据库中。</p></div>
      <button className="quiet-button" onClick={() => void clearData()}><Trash2 size={15} />删除全部本地数据</button>
    </aside>

    <main className="main-content">
      <header className="topbar"><div className="date"><CalendarClock size={17} />{todayLabel()}<span />可用：{availability.map((slot) => `${slot.start}–${slot.end}`).join('、') || '尚未设置'}</div><div className="top-actions"><span className="local-pill"><span className="status-dot" />SQLite 本地模式</span><button className="icon-button" title="设置"><Settings2 size={17} /></button></div></header>
      <div className="content-wrap">
        <div className="notice" aria-live="polite"><BellRing size={16} /><span>{notice}</span><button onClick={() => setNotice('')}><X size={15} /></button></div>
        {view === 'capture' && <Capture tasks={tasks} availability={availability} taskInput={taskInput} plannedMinutes={plannedMinutes} loading={loading} onInput={setTaskInput} onGenerate={() => void generatePlan()} onAddAvailability={addAvailability} onUpdateAvailability={updateAvailability} onRemoveAvailability={(id) => setAvailability((items) => items.filter((item) => item.id !== id))} />}
        {view === 'review' && <Review tasks={tasks} schedule={schedule} version={version} onUpdateTask={updateTask} onUpdateTime={updateTime} onRemoveTask={(id) => { setTasks((items) => items.filter((task) => task.id !== id)); setSchedule((items) => items.filter((task) => task.id !== id)); }} onConfirm={() => void confirmPlan()} onBack={() => setStep('capture')} />}
        {view === 'execute' && currentTask && <Execute schedule={schedule} currentTask={currentTask} progress={currentProgress} running={running} reminderInterval={reminderInterval} onSelect={setCurrentTaskId} onProgress={updateProgress} onComplete={completeTask} onToggle={() => setRunning((value) => !value)} onBlocker={() => { setBlocker({}); setCustomReason(''); setBlockerOpen(true); }} onReview={() => setStep('review')} />}
      </div>
    </main>

    {shouldShowBlockerPrompt(view, blockerOpen, blocker.reason) && <div className="modal-backdrop"><div className="modal"><div className="modal-icon"><AlertCircle size={20} /></div><h2>现在遇到了什么情况？</h2><p>先了解原因，再决定是否需要调整剩余计划。</p><div className="reason-grid">{reasons.map((reason) => <button key={reason} onClick={() => void chooseReason(reason)}>{reason}<ChevronRight size={16} /></button>)}</div><div className="custom-reason"><input value={customReason} onChange={(event) => setCustomReason(event.target.value)} placeholder="输入其他原因" aria-label="自定义阻碍原因" /><button className="secondary" disabled={!normalizeBlockerReason(customReason)} onClick={() => void chooseReason(customReason)}>使用此原因</button></div><button className="modal-close" onClick={() => { setBlocker({}); setCustomReason(''); setBlockerOpen(false); }}>暂时不调整</button></div></div>}
    {blockerOpen && blocker.reason && blocker.suggestion && <div className="modal-backdrop"><div className="modal"><div className="modal-icon success"><Sparkles size={20} /></div><h2>这是建议的新安排</h2><p>原因已记录，系统不会直接修改当前计划。</p><div className="reason-chip">已记录：{blocker.reason}</div><div className="impact-list">{blocker.suggestion.schedule.filter((task) => task.scheduled).slice(0, 4).map((task) => <div key={task.id}><span>{task.title}</span><strong>{task.startLabel}–{task.endLabel}</strong></div>)}</div><div className="modal-actions"><button className="secondary" onClick={() => { setBlocker({}); setCustomReason(''); setBlockerOpen(true); }}>返回</button><button className="primary" onClick={() => void applyReplan()}>生成重排草稿<ChevronRight size={16} /></button></div></div></div>}
  </div>;
}

function Capture({ tasks, availability, taskInput, plannedMinutes, loading, onInput, onGenerate, onAddAvailability, onUpdateAvailability, onRemoveAvailability }: { tasks: Task[]; availability: AvailabilityBlock[]; taskInput: string; plannedMinutes: number; loading: boolean; onInput: (value: string) => void; onGenerate: () => void; onAddAvailability: () => void; onUpdateAvailability: (id: string, field: 'start' | 'end', value: string) => void; onRemoveAvailability: (id: string) => void }) {
  return <section><div className="heading-row"><div><span className="eyebrow">规划今天</span><h1>先把脑子里的事情倒出来</h1><p>不必整理格式，AI 会把它们变成可确认的任务。</p></div><span className="heading-meta">计划确认前不会启动提醒</span></div><div className="capture-grid"><div className="surface"><div className="section-title"><Clock3 size={17} />今天什么时候有空？<button className="link-button" onClick={onAddAvailability}><Plus size={15} />添加时段</button></div><div className="availability-list">{availability.map((slot, index) => <div className="availability-row" key={slot.id}><span>时段 {index + 1}</span><input type="time" value={slot.start} onChange={(event) => onUpdateAvailability(slot.id, 'start', event.target.value)} /><b>至</b><input type="time" value={slot.end} onChange={(event) => onUpdateAvailability(slot.id, 'end', event.target.value)} /><button className="remove-button" disabled={availability.length <= 1} onClick={() => onRemoveAvailability(slot.id)}><Trash2 size={15} /></button></div>)}</div><div className="divider" /><label className="field-label" htmlFor="task-input">今天想完成什么？</label><textarea id="task-input" value={taskInput} onChange={(event) => onInput(event.target.value)} placeholder="例如：准备周会材料；回复客户邮件；跑步 30 分钟" /><div className="form-footer"><span className="helper">支持用分号或换行分隔多个任务</span><button className="primary" onClick={onGenerate} disabled={loading || !taskInput.trim()}>{loading ? '正在整理…' : <><Sparkles size={16} />生成参考计划</>}</button></div></div><aside className="ai-preview"><div className="ai-preview-head"><div><strong>AI 识别预览</strong><small>生成后可逐项修改</small></div><span>{tasks.length} 项</span></div><div className="preview-items">{tasks.slice(0, 5).map((task) => <div key={task.id}><i>{task.priority}</i><span>{task.title}</span><b>{task.duration} 分</b></div>)}</div><p><Sparkles size={14} />当前估计共需 <strong>{minutesLabel(plannedMinutes)}</strong>，排程会避开不可用时间。</p></aside></div></section>;
}

function Review({ tasks, schedule, version, onUpdateTask, onUpdateTime, onRemoveTask, onConfirm, onBack }: { tasks: Task[]; schedule: ScheduledTask[]; version: number; onUpdateTask: (id: string, patch: Partial<Task>) => void; onUpdateTime: (id: string, field: 'start' | 'end', value: string) => void; onRemoveTask: (id: string) => void; onConfirm: () => void; onBack: () => void }) {
  const unscheduled = schedule.filter((task) => !task.scheduled).length;
  return <section><div className="heading-row"><div><span className="eyebrow">参考计划 · 草稿{version ? ` · v${version + 1}` : ''}</span><h1>这份安排合适吗？</h1><p>AI 负责提出建议，最终时间始终由你确认。</p></div><div className="heading-buttons"><button className="secondary" onClick={onBack}><RotateCcw size={16} />重新录入</button><button className="primary" onClick={onConfirm}>确认并开始<ChevronRight size={16} /></button></div></div><div className="review-grid"><div className="surface table-surface"><div className="table-head"><span>时间</span><span>任务与完成标准</span><span>耗时 / 操作</span></div>{schedule.map((task) => <div className="task-row" key={task.id}><div className="time-cell">{task.scheduled ? <><input type="time" value={task.startLabel} onChange={(event) => onUpdateTime(task.id, 'start', event.target.value)} aria-label={`${task.title} 开始时间`} /><span>至</span><input type="time" value={task.endLabel} onChange={(event) => onUpdateTime(task.id, 'end', event.target.value)} aria-label={`${task.title} 结束时间`} /></> : <strong className="unscheduled">未安排</strong>}</div><div className="task-main"><input className="task-title-input" value={task.title} onChange={(event) => onUpdateTask(task.id, { title: event.target.value })} /><p>{task.doneDefinition}</p><select value={task.priority} onChange={(event) => onUpdateTask(task.id, { priority: event.target.value as Priority })}><option>高</option><option>中</option><option>低</option></select></div><div className="task-actions"><input type="number" min="15" step="5" value={task.duration} onChange={(event) => onUpdateTask(task.id, { duration: Math.max(15, Number(event.target.value) || 15) })} /><span>分</span><button className="remove-button" onClick={() => onRemoveTask(task.id)} aria-label={`删除${task.title}`}><Trash2 size={15} /></button></div></div>)}</div><aside className="review-aside"><div className="dark-card"><Sparkles size={18} /><h3>排程说明</h3><p>任务按当前顺序填入可用时段，每项之间保留 15 分钟缓冲。所有冲突都会明确展示。</p><div className="stat-row"><div><strong>{schedule.filter((task) => task.scheduled).length}</strong><small>已安排任务</small></div><div><strong>{Math.floor(tasks.reduce((sum, task) => sum + task.duration, 0) / 60)}h</strong><small>专注时间</small></div></div></div><div className={unscheduled ? 'warning-card' : 'info-card'}><AlertCircle size={17} /><div><strong>{unscheduled ? `${unscheduled} 项任务暂未安排` : '当前没有时间冲突'}</strong><p>{unscheduled ? '可以减少耗时、增加可用时段，或确认后稍后处理。' : '确认计划后才会创建和启动提醒节点。'}</p></div></div><div className="info-card"><BellRing size={17} /><div><strong>提醒规则透明</strong><p>30 分钟以内不设置中途检查点；更长任务按 30～60 分钟间隔检查。</p></div></div></aside></div></section>;
}

function Execute({ schedule, currentTask, progress, running, reminderInterval, onSelect, onProgress, onComplete, onToggle, onBlocker, onReview }: { schedule: ScheduledTask[]; currentTask: ScheduledTask; progress: number; running: boolean; reminderInterval: number | null; onSelect: (id: string) => void; onProgress: (value: number) => void; onComplete: () => void; onToggle: () => void; onBlocker: () => void; onReview: () => void }) {
  const upcoming = schedule.filter((task) => task.id !== currentTask.id && task.scheduled && task.status !== '已完成').slice(0, 3);
  const remaining = Math.max(0, Math.round(currentTask.duration * (1 - progress / 100)));
  return <section><div className="heading-row"><div><span className="eyebrow">今日执行台</span><h1>按现在的节奏继续</h1><p>当前任务进度 {progress}%，完成后再衔接下一项。</p></div><button className="secondary" onClick={onReview}><Settings2 size={16} />查看完整计划</button></div><div className="execute-grid"><aside className="surface timeline"><div className="section-title"><div><strong>今天的节奏</strong><small>{schedule.length} 项任务 · {schedule.filter((task) => task.scheduled).length ? '已安排' : '待安排'}</small></div><CalendarClock size={18} /></div><div className="timeline-items">{schedule.map((task) => <button key={task.id} className={task.id === currentTask.id ? 'timeline-item active' : task.status === '已完成' ? 'timeline-item done' : 'timeline-item'} onClick={() => task.scheduled && onSelect(task.id)} disabled={!task.scheduled}><span className="timeline-dot">{task.status === '已完成' && <Check size={11} />}</span><span><small>{task.startLabel}</small><strong>{task.title}</strong></span></button>)}</div></aside><div className="focus-card"><div className="focus-orbit one" /><div className="focus-orbit two" /><div className="focus-content"><div className="focus-top"><div><span className="focus-kicker"><CircleDot size={14} />正在执行</span><h2>{currentTask.title}</h2><p>完成标准：{currentTask.doneDefinition}</p></div><span className="time-chip">{currentTask.startLabel}–{currentTask.endLabel}</span></div><div className="progress-area"><div className="progress-ring" style={{ background: `conic-gradient(#a7f3d0 ${progress * 3.6}deg, rgba(255,255,255,.1) 0deg)` }}><div><strong>{progress}%</strong><small>已同步进度</small></div></div><div className="progress-copy"><div className="remaining"><span>预计剩余</span><strong>{minutesLabel(remaining)}</strong></div><div className="progress-track"><i style={{ width: `${progress}%` }} /></div><div className="reminder-card"><BellRing size={16} /><div><strong>{reminderInterval ? `每 ${reminderInterval} 分钟同步一次` : '不设置中途提醒'}</strong><small>你可以在任何时候手动同步状态。</small></div></div></div></div><div className="quick-label">快速同步</div><div className="quick-actions">{[25, 50, 75].map((value) => <button key={value} className={progress === value ? 'selected' : ''} onClick={() => onProgress(value)}>完成 {value}%</button>)}<button className="danger-quick" onClick={onBlocker}>遇到阻碍</button></div><div className="focus-footer"><button className="primary light" onClick={onComplete}><Check size={17} />标记为已完成</button><button className="secondary dark" onClick={onToggle}>{running ? <Pause size={16} /> : <Play size={16} />}{running ? '暂停任务' : '继续任务'}</button></div></div></div><aside className="execute-aside"><div className="surface upcoming"><div className="section-title"><div><strong>接下来</strong><small>根据当前计划自动衔接</small></div><Clock3 size={18} /></div>{upcoming.map((task) => <div className="upcoming-item" key={task.id}><span>{task.startLabel}</span><div><strong>{task.title}</strong><small>{task.duration} 分钟</small></div></div>)}</div><div className="why-card"><Sparkles size={16} /><strong>为什么这样提醒？</strong><p>确认耗时为 {currentTask.duration} 分钟，因此采用{reminderInterval ? `每 ${reminderInterval} 分钟` : '仅结束时'}的检查节奏。</p></div></aside></div></section>;
}
