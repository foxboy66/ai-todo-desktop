import { AvailabilityEditor } from './AvailabilityEditor';
import { ArrowLeft, BellRing, Sparkles, Sprout } from 'lucide-react';
import { localDayText } from '../shared/daily';
import type { Task, AvailabilityBlock } from '../shared/domain';
function minutesLabel(value: number) { return Math.floor(value / 60) + ' 小时 ' + value % 60 + ' 分'; }
export function Capture({
  day,
  tasks,
  availability,
  taskInput,
  plannedMinutes,
  loading,
  onBack,
  onInput,
  onGenerate,
  onAddAvailability,
  onUpdateAvailability,
  onRemoveAvailability,
}: {
  day: string;
  tasks: Task[];
  availability: AvailabilityBlock[];
  taskInput: string;
  plannedMinutes: number;
  loading: boolean;
  onBack: () => void;
  onInput: (value: string) => void;
  onGenerate: () => void;
  onAddAvailability: () => void;
  onUpdateAvailability: (id: string, field: "start" | "end", value: string) => void;
  onRemoveAvailability: (id: string) => void;
}) {
  return (
    <section>
      <button className="link-button back-button" disabled={loading} onClick={onBack}><ArrowLeft size={16} />返回任务清单</button>
      <div className="heading-row">
        <div>

          <h1>批量添加</h1>
          <p>每行一项任务，生成后可调整顺序和时间。</p>
        </div>
        <span className="heading-meta">
          <BellRing size={14} />
          确认计划后，才会开启提醒
        </span>
      </div>
      <div className="capture-grid">
        <div className="surface">
          <AvailabilityEditor availability={availability} onAdd={onAddAvailability} onUpdate={onUpdateAvailability} onRemove={onRemoveAvailability} />
          <div className="divider" />
          <label className="field-label" htmlFor="task-input">
            <strong>{day === localDayText() ? "今天想完成什么？" : "这一天想完成什么？"}</strong>
            <span className="field-hint">（支持用分号或换行分隔多个任务）</span>
          </label>
          <textarea
            id="task-input"
            maxLength={5000}
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
              <strong>任务预览</strong>
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
