import { BellRing, Check, ChevronRight, Clock3, Pause, Play } from 'lucide-react';
import { formatScheduleLabel, type ScheduledTask } from '../shared/domain';
function countdownLabel(seconds: number) {
  const safe = Math.max(0, Math.round(seconds));
  return [Math.floor(safe / 3600), Math.floor(safe % 3600 / 60), safe % 60].map(value => String(value).padStart(2, '0')).join(':');
}
export function Execute({ schedule, currentTask, progress, countdownSeconds, isActiveTask, isRunning, reminderInterval, pausedCountdownSeconds, nextTask, onSelect, onProgress, onComplete, onToggleRunning, onStartNext, onBlocker, onReview }: {
  schedule: ScheduledTask[]; currentTask: ScheduledTask; progress: number; countdownSeconds: number; countdownTotalSeconds: number;
  isActiveTask: boolean; isRunning: boolean; reminderInterval: number | null; pausedCountdownSeconds: number | null; nextTask?: ScheduledTask;
  onSelect: (id: string) => void; onProgress: (value: number) => void; onComplete: () => void; onToggleRunning: () => void;
  onStartNext: () => void; onBlocker: () => void; onReview: () => void;
}) {
  const done = currentTask.status === '已完成';
  const canAct = isActiveTask && !done;
  const label = done ? '任务已完成' : pausedCountdownSeconds !== null ? '倒计时已暂停' : isRunning && isActiveTask ? '任务倒计时' : isActiveTask ? '等待开始' : '等待前置任务';
  return <section>
    <div className="heading-row"><div><h1>执行跟进</h1><p>提前完成时，可手动开始下一项或等待原计划时间。</p></div><button className="secondary" onClick={onReview}>查看完整计划</button></div>
    <div className="execute-grid">
      <div className="focus-card">
        <div className="focus-top"><div><span className="focus-kicker">{done ? '已完成' : isActiveTask ? '当前任务' : '待执行'}</span><h2>{currentTask.title}</h2><p>{currentTask.doneDefinition}</p></div><span className="time-chip"><Clock3 size={14} />{formatScheduleLabel(currentTask)}</span></div>
        <div className="countdown-ring" role="timer" aria-label="任务倒计时" aria-live="off"><small>{label}</small><strong>{countdownLabel(countdownSeconds)}</strong></div>
        <div className="focus-footer">
          {done ? nextTask ? <><button className="primary" onClick={onStartNext}>开始下一任务<ChevronRight size={16} /></button><span className="waiting-next">否则将在 {nextTask.startLabel} 按原计划自动开始</span></> : <p className="completion-message"><Check size={18} />计划中的任务已全部完成。</p> : <><button className="secondary" disabled={!canAct} onClick={onToggleRunning}>{isRunning ? <Pause size={16} /> : <Play size={16} />}{isRunning ? '暂停任务' : '继续任务'}</button><button className="primary" disabled={!canAct} onClick={onComplete}><Check size={17} />标记为已完成</button></>}
        </div>
        <div className="progress-section"><div className="progress-caption"><span>任务进度</span><strong>{progress}%</strong></div><div className="progress-track" role="progressbar" aria-label="当前任务进度" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress}><i style={{ width: progress + '%' }} /></div><div className="quick-actions">{[25, 50, 75].map(value => <button key={value} className={progress === value ? 'selected' : ''} disabled={!canAct} onClick={() => onProgress(value)}>完成 {value}%</button>)}<button className="blocker-button" disabled={!canAct} onClick={onBlocker}>遇到阻碍</button></div></div>
        <p className="reminder-hint"><BellRing size={15} />{reminderInterval ? `每 ${reminderInterval} 分钟提醒同步进度` : '仅在任务开始和结束时提醒'}</p>
      </div>
      <aside className="timeline"><div className="section-title"><strong>任务顺序</strong><small>{schedule.filter(task => task.status === '已完成').length} / {schedule.length} 已完成</small></div><div className="timeline-items">{schedule.map((task, index) => <button key={task.id} className={'timeline-item' + (task.id === currentTask.id ? ' active' : '') + (task.status === '已完成' ? ' done' : '')} aria-current={task.id === currentTask.id ? 'true' : undefined} onClick={() => onSelect(task.id)}><span className="timeline-dot">{task.status === '已完成' ? <Check size={12} /> : index + 1}</span><span><strong>{task.title}</strong><small>{formatScheduleLabel(task)}</small></span></button>)}</div>{nextTask && <p className="timeline-note">下一项：{nextTask.title}</p>}</aside>
    </div>
  </section>;
}
