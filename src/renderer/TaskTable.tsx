import { Fragment, useRef, useState, type DragEvent, type PointerEvent } from 'react';
import { AlertCircle, ArrowDown, ArrowUp, GripVertical, Trash2 } from 'lucide-react';
import { getScheduleSegments, getScheduleOverflowTasks, type Task, type ScheduledTask, type AvailabilityBlock, type Priority } from '../shared/domain';
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
export type TaskTableProps = {
  tasks: Task[]; schedule: ScheduledTask[]; availability: AvailabilityBlock[];
  onUpdateTask: (id: string, patch: Partial<Task>) => void;
  onUpdateTime: (id: string, field: 'start' | 'end', value: string) => void;
  onRemoveTask: (id: string) => void;
  onReorderTask: (id: string, targetIndex: number) => void;
};
export function TaskTable({ tasks, schedule, availability, onUpdateTask, onUpdateTime, onRemoveTask, onReorderTask, visibleTasks, onEdit, onToggle, pendingChecks, onMoveToday }: TaskTableProps & {
  visibleTasks: Task[]; onEdit: (task: Task) => void; onToggle: (task: Task, checked: boolean) => void;
  pendingChecks: Record<string, boolean>; onMoveToday?: (task: Task) => void;
}) {
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<{ id: string; position: 'before' | 'after'; index: number } | null>(null);
  const dropTargetRef = useRef<typeof dropTarget>(null);
  const unscheduled = schedule.filter((task) => !task.scheduled && task.status !== "已完成").length;
  const overflowTasks = getScheduleOverflowTasks(schedule, availability);

  function getDropPosition(clientY: number, rect: DOMRect, sourceIndex: number, hoveredIndex: number) {
    const ratio = (clientY - rect.top) / rect.height;
    if (ratio < .35) return 'before' as const;
    if (ratio > .65) return 'after' as const;
    return sourceIndex > hoveredIndex ? 'before' as const : 'after' as const;
  }

  function updateDropTarget(task: ScheduledTask, clientY: number) {
    const row = document.querySelector<HTMLElement>(`.task-row[data-task-id="${CSS.escape(task.id)}"]`);
    if (!row || !draggingId || draggingId === task.id) return;
    const rect = row.getBoundingClientRect();
    const sourceIndex = schedule.findIndex(item => item.id === draggingId);
    const hoveredIndex = schedule.findIndex(item => item.id === task.id);
    const position = getDropPosition(clientY, rect, sourceIndex, hoveredIndex);
    const slot = hoveredIndex + (position === 'after' ? 1 : 0);
    const index = Math.max(0, Math.min(schedule.length - 1, slot > sourceIndex ? slot - 1 : slot));
    const target = { id: task.id, position, index } as const;
    dropTargetRef.current = target;
    setDropTarget(target);
  }

  function finishDrag() {
    if (draggingId && dropTargetRef.current) onReorderTask(draggingId, dropTargetRef.current.index);
    setDraggingId(null);
    dropTargetRef.current = null;
    setDropTarget(null);
  }

  function handleDragOver(event: DragEvent<HTMLDivElement>, task: ScheduledTask) {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    if (draggingId) updateDropTarget(task, event.clientY);
  }

  function handleTouchStart(event: PointerEvent<HTMLSpanElement>, taskId: string) {
    if (event.pointerType !== 'touch') return;
    event.currentTarget.setPointerCapture(event.pointerId);
    setDraggingId(taskId);
  }

  function handleTouchMove(event: PointerEvent<HTMLSpanElement>) {
    if (event.pointerType !== 'touch' || !draggingId) return;
    const row = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>('.task-row');
    const targetTask = row ? schedule.find(task => task.id === row.dataset.taskId) : undefined;
    if (targetTask) updateDropTarget(targetTask, event.clientY);
  }

  return (
    <section>
      <div className="review-grid">
        <div className="surface table-surface">
          <div className="table-head"><span /><span>任务与完成标准</span><span>时间</span><span>优先级</span><span>耗时 / 操作</span></div>
          {visibleTasks.map(item => { const index = schedule.findIndex(task => task.id === item.id); const task = schedule[index]; if (!task) return null; const showBefore = dropTarget?.id === task.id && dropTarget.position === 'before'; const showAfter = dropTarget?.id === task.id && dropTarget.position === 'after'; return (
            <Fragment key={task.id}>
            {showBefore && <div className="task-drop-placeholder" aria-hidden="true"><span>放在这里</span></div>}
            <div
              data-task-id={task.id}
              className={'task-row todo-item' + (task.status === '已完成' ? ' done' : '') + (draggingId === task.id ? ' dragging' : '')}
              onDragOver={event => handleDragOver(event, task)}
              onDrop={event => {
                event.preventDefault();
                const sourceId = draggingId ?? event.dataTransfer.getData('text/plain');
                const sourceIndex = schedule.findIndex(item => item.id === sourceId);
                const rect = event.currentTarget.getBoundingClientRect();
                const position = getDropPosition(event.clientY, rect, sourceIndex, index);
                const slot = index + (position === 'after' ? 1 : 0);
                const droppedOnHandle = (event.target as Element).closest('.task-drag-handle');
                const targetIndex = droppedOnHandle
                  ? index
                  : Math.max(0, Math.min(schedule.length - 1, slot > sourceIndex ? slot - 1 : slot));
                if (sourceId) onReorderTask(sourceId, targetIndex);
                setDraggingId(null);
                dropTargetRef.current = null;
                setDropTarget(null);
              }}
            >
              <input className="task-check" type="checkbox" aria-label={'完成 ' + task.title} checked={pendingChecks[task.id] ?? task.status === '已完成'} onChange={event => onToggle(task, event.target.checked)} />
              <div className="time-cell">
                <ScheduleTime task={task} onUpdateTime={onUpdateTime} />
              </div>
              <div className="task-main">
                <div className="task-order" aria-label={task.title + ' 排序'}>
                  <span
                    className="task-drag-handle"
                    draggable
                    role="img"
                    aria-label={'拖动排序 ' + task.title}
                    title="拖动到目标任务的位置"
                    onDragStart={event => {
                      event.dataTransfer.effectAllowed = 'move';
                      event.dataTransfer.setData('text/plain', task.id);
                      setDraggingId(task.id);
                    }}
                    onDragEnd={() => { setDraggingId(null); dropTargetRef.current = null; setDropTarget(null); }}
                    onPointerDown={event => handleTouchStart(event, task.id)}
                    onPointerMove={handleTouchMove}
                    onPointerUp={event => { if (event.pointerType === 'touch') finishDrag(); }}
                    onPointerCancel={() => { setDraggingId(null); dropTargetRef.current = null; setDropTarget(null); }}
                  ><GripVertical size={16} /></span>
                  <span className="task-position">第 {index + 1} 项</span>
                <div className="row-tools"><button className="link-button" aria-label={'编辑 ' + task.title} onClick={() => onEdit(task)}>编辑</button>{onMoveToday && task.status !== '已完成' && <button className="link-button" aria-label={'移到今天 ' + task.title} onClick={() => onMoveToday(task)}>移到今天</button>}</div>
                  <button type="button" className="order-button" disabled={index === 0} aria-label={'上移 ' + task.title} title="上移一项" onClick={() => onReorderTask(task.id, index - 1)}><ArrowUp size={14} /></button>
                  <button type="button" className="order-button" disabled={index === schedule.length - 1} aria-label={'下移 ' + task.title} title="下移一项" onClick={() => onReorderTask(task.id, index + 1)}><ArrowDown size={14} /></button>
                </div>

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
                  aria-label={`删除 ${task.title}`}
                >
                  <Trash2 size={15} />
                </button>
              </div>
            </div>
            {showAfter && <div className="task-drop-placeholder" aria-hidden="true"><span>放在这里</span></div>}
            </Fragment>
          ); })}
        </div>
        <aside className="review-aside">
          {(unscheduled > 0 || overflowTasks.length > 0) && <div className="warning-card"><AlertCircle size={17} /><div><strong>{unscheduled ? unscheduled + ' 项任务暂未安排' : overflowTasks.length + ' 项任务超出今日可用时段'}</strong><p>请调整耗时、任务时间或可用时段，再确认计划。</p></div></div>}
          <details className="plan-help"><summary>排程与提醒说明</summary><p>拖动手柄或点击箭头改变顺序后，会按可用时段重新排程，替换手动设置的时间。已完成任务不占用新排程。</p><p>修改自动保存为草稿，再次确认后更新提醒。不可用时段不发送提醒；30 分钟以内不设置中途检查点。</p><p>{schedule.filter(task => task.scheduled).length} 项已安排，共 {tasks.reduce((sum, task) => sum + task.duration, 0)} 分钟。</p></details>
        </aside>
      </div>
    </section>
  );
}
