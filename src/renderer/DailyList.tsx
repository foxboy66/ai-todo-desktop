import { TaskTable, type TaskTableProps } from './TaskTable';
import { Modal } from './Modal';
import { Plus, Search, Check, ListPlus, ArrowRight } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import type { Task } from '../shared/domain';

export function DailyList({ tasks, day, today, busy, onAdd, onUpdate, onConfirm, onAvailability, plan, onCapture, confirmed, onExecute }: {
  tasks: Task[]; day: string; today: string; busy: boolean;
  onAdd: (title: string) => Promise<boolean>;
  onUpdate: (id: string, patch: Partial<Task> | null, targetDay?: string) => Promise<boolean>;
  onConfirm: () => void; onAvailability: () => void; plan: TaskTableProps; onCapture: () => void; confirmed: boolean; onExecute: () => void;
}) {
  const [pendingChecks, setPendingChecks] = useState<Record<string, boolean>>({});
  const [title, setTitle] = useState('');
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('pending');
  const [sort, setSort] = useState('created');
  const [editing, setEditing] = useState<Task | null>(null);
  const [moveTo, setMoveTo] = useState(day);
  const completed = tasks.filter(task => task.status === '已完成').length;
  const filtered = tasks.filter(task => task.title.toLocaleLowerCase().includes(query.toLocaleLowerCase()) &&
    (filter === 'all' || (filter === 'done' ? task.status === '已完成' : task.status !== '已完成')));
  if (sort === 'priority') filtered.sort((a, b) => ['高', '中', '低'].indexOf(a.priority) - ['高', '中', '低'].indexOf(b.priority));
  async function add(event: FormEvent) {
    event.preventDefault();
    if (title.trim() && await onAdd(title.trim())) setTitle('');
  }
  return <section className="daily-list" aria-label="每日任务清单">
    <div className="daily-heading heading-row"><div><h1>{day === today ? '今天的任务' : '这一天的任务'}</h1>
      <p>{tasks.length ? `${tasks.length} 项任务，已完成 ${completed} 项` : '还没有任务。记下一件要做的事，从这里开始。'}</p></div>
      <div className="heading-buttons"><button className="secondary" onClick={onCapture} disabled={busy}><ListPlus size={16} />批量添加</button><button className="secondary" onClick={onAvailability} disabled={busy}>可用时段</button><button className="primary" onClick={onConfirm} disabled={busy || !tasks.some(task => task.status !== '已完成')}>{day === today ? '确认并开始' : '确认该日计划'}<ArrowRight size={16} /></button></div></div>
    {confirmed && day === today && completed < tasks.length && <div className="execution-banner"><span><Check size={16} />计划已确认，可以开始执行。</span><button className="link-button" onClick={onExecute} disabled={busy}>进入执行<ArrowRight size={15} /></button></div>}
    <form className="quick-add" onSubmit={event => void add(event)}>
      <Plus size={18} aria-hidden="true" /><input aria-label="快速添加任务" placeholder="添加一件要做的事，回车保存" value={title} maxLength={200} onChange={event => setTitle(event.target.value)} disabled={busy} />
      <button className="primary" disabled={busy || !title.trim()}>添加任务</button>
    </form>
    <div className="list-tools">
      <label className="search-control"><Search size={16} aria-hidden="true" /><input type="search" aria-label="搜索当天任务" placeholder="搜索当天任务" value={query} onChange={event => setQuery(event.target.value)} /></label>
      <select aria-label="任务状态筛选" value={filter} onChange={event => setFilter(event.target.value)}><option value="pending">未完成</option><option value="done">已完成</option><option value="all">全部任务</option></select>
      <select aria-label="任务排序" value={sort} onChange={event => setSort(event.target.value)}><option value="created">添加顺序</option><option value="priority">优先级从高到低</option></select>
    </div>
    {tasks.length > 0 && <TaskTable {...plan} visibleTasks={filtered} pendingChecks={pendingChecks}
      onEdit={task => { setEditing({ ...task }); setMoveTo(day); }}
      onMoveToday={day < today ? task => { void onUpdate(task.id, {}, today); } : undefined}
      onToggle={(task, checked) => {
        setPendingChecks(items => ({ ...items, [task.id]: checked }));
        void onUpdate(task.id, { status: checked ? '已完成' : '待安排' }).finally(() => setPendingChecks(items => { const next = { ...items }; delete next[task.id]; return next; }));
      }} />}
    {!filtered.length && <p className="list-empty">{query ? '没有匹配的任务，试试其他关键词。' : filter === 'done' ? '还没有已完成的任务。' : tasks.length ? '当前筛选下没有任务。可以切换到全部任务查看。' : '当天没有任务。添加任务后，可在这里调整时间并开始执行。'}</p>}
    {editing && <Modal label="编辑任务" onClose={() => setEditing(null)}><form className="todo-editor surface" aria-label="编辑任务" onSubmit={event => { event.preventDefault(); void onUpdate(editing.id, editing, moveTo).then(ok => { if (ok) setEditing(null); }); }}>
      <h2>编辑任务</h2>
      <label>任务名称<input aria-label="编辑任务名称" required maxLength={200} value={editing.title} onChange={event => setEditing({ ...editing, title: event.target.value })} /></label>
      <label>完成标准<input value={editing.doneDefinition} maxLength={1000} onChange={event => setEditing({ ...editing, doneDefinition: event.target.value })} /></label>
      <div className="editor-fields"><label>耗时（分钟）<input type="number" required min={1} max={1440} value={editing.duration} onChange={event => setEditing({ ...editing, duration: Number(event.target.value) })} /></label>
        <label>优先级<select value={editing.priority} onChange={event => setEditing({ ...editing, priority: event.target.value as Task['priority'] })}><option>高</option><option>中</option><option>低</option></select></label>
        <label>任务日期<input type="date" required value={moveTo} onChange={event => setMoveTo(event.target.value)} /></label></div>
      <div className="todo-actions"><button className="primary" disabled={busy}>保存修改</button><button className="secondary" type="button" onClick={() => setEditing(null)}>取消编辑</button></div>
    </form></Modal>}
  </section>;
}
