import { AlertCircle, ArrowRight, GripVertical, RotateCcw, Sparkles } from 'lucide-react';

import { AvailabilityEditor } from '@/components/demo/availability-editor';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { AvailabilityBlock, Priority, Task } from '@/lib/demo-data';

type ScheduledTask = Task & { scheduled: boolean; startLabel: string; endLabel: string };
type Props = {
  schedule: ScheduledTask[];
  availability: AvailabilityBlock[];
  totalMinutes: number;
  onAvailabilityChange: (blocks: AvailabilityBlock[]) => void;
  onAdjust: (id: string, delta: number) => void;
  onDurationChange: (id: string, value: number) => void;
  onTimeChange: (id: string, field: 'start' | 'end', value: string) => void;
  onReset: () => void;
  onStart: () => void;
};

function priorityTone(priority: Priority) {
  if (priority === '高') return 'border-[#ff8d78]/40 bg-[#fff0ec] text-[#9d3522]';
  if (priority === '中') return 'border-[#f5c86a]/40 bg-[#fff8e6] text-[#805b0c]';
  return 'border-[#99b9b4]/40 bg-[#edf4f2] text-[#365e58]';
}

export function ReviewView({ schedule, availability, totalMinutes, onAvailabilityChange, onAdjust, onDurationChange, onTimeChange, onReset, onStart }: Props) {
  return (
    <section aria-labelledby="review-title">
      <div className="mb-7 flex flex-col justify-between gap-4 md:flex-row md:items-end">
        <div><p className="section-kicker">参考计划</p><h1 id="review-title" className="page-title">这份安排合适吗？</h1><p className="page-subtitle">AI 负责提出建议，最终时间始终由你确认。</p></div>
        <div className="flex gap-2"><Button variant="outline" className="h-10 border-[#cbdad6] bg-white" onClick={onReset}><RotateCcw />恢复建议</Button><Button className="h-10 bg-[#12373a] px-4 text-white hover:bg-[#1c4b4e]" onClick={onStart}>确认并开始<ArrowRight /></Button></div>
      </div>

      <div className="surface mb-5 p-5 sm:p-6">
        <AvailabilityEditor blocks={availability} onChange={onAvailabilityChange} />
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_330px]">
        <div className="surface overflow-hidden">
          <div className="grid grid-cols-[150px_minmax(0,1fr)_180px] border-b border-[#e0e8e6] bg-[#f7faf9] px-5 py-3 text-xs font-semibold tracking-[.08em] text-[#758885]"><span>时间（可修改）</span><span>任务</span><span className="text-right">预计耗时</span></div>
          <div className="divide-y divide-[#e5ecea]">
            {schedule.map((task) => (
              <div key={task.id} className="grid grid-cols-[150px_minmax(0,1fr)_180px] items-center gap-3 px-5 py-4 transition hover:bg-[#f9fbfa]">
                <div className="flex items-center gap-1.5">
                  {task.scheduled ? <><Input type="time" aria-label={task.title + ' 开始时间'} value={task.startLabel} onChange={(event) => onTimeChange(task.id, 'start', event.target.value)} className="h-8 w-[70px] border-[#cfddd9] bg-white px-2 text-xs" /><span className="text-xs text-[#8a9b98]">至</span><Input type="time" aria-label={task.title + ' 结束时间'} value={task.endLabel} onChange={(event) => onTimeChange(task.id, 'end', event.target.value)} className="h-8 w-[70px] border-[#cfddd9] bg-white px-2 text-xs" /></> : <span className="text-sm font-semibold text-[#9d5e4f]">未安排</span>}
                </div>
                <div className="flex min-w-0 items-center gap-3"><GripVertical className="hidden size-4 shrink-0 text-[#a8b6b3] sm:block" /><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><p className="truncate text-sm font-semibold text-[#1d3b3d]">{task.title}</p><span className={'rounded-md border px-1.5 py-0.5 text-[11px] font-semibold ' + priorityTone(task.priority)}>{task.priority}优先</span></div><p className="mt-1 truncate text-xs text-[#748885]">{task.doneDefinition}</p></div></div>
                <div className="flex items-center justify-end gap-1"><Button size="icon-sm" variant="ghost" aria-label={'减少 ' + task.title + ' 的预计耗时'} onClick={() => onAdjust(task.id, -15)}>−</Button><Input type="number" min="15" step="5" aria-label={task.title + ' 预计耗时'} value={task.duration} onChange={(event) => onDurationChange(task.id, Number(event.target.value))} className="h-8 w-[72px] border-[#cfddd9] bg-white px-2 text-center text-sm font-semibold" /><span className="text-xs text-[#82948f]">分</span><Button size="icon-sm" variant="ghost" aria-label={'增加 ' + task.title + ' 的预计耗时'} onClick={() => onAdjust(task.id, 15)}>+</Button></div>
              </div>
            ))}
          </div>
        </div>

        <aside className="space-y-4">
          <div className="rounded-[22px] bg-[#153b3e] p-5 text-white"><div className="flex items-center gap-2 text-[#a7f3d0]"><Sparkles className="size-4" /><span className="text-sm font-semibold">排程说明</span></div><p className="mt-4 text-sm leading-6 text-white/70">任务会顺序填入你提供的可用时段；每项任务之间保留 15 分钟缓冲。时间不够时会明确标出未安排。</p><div className="mt-5 grid grid-cols-2 gap-3 border-t border-white/10 pt-4"><div><p className="text-2xl font-semibold">{schedule.filter((item) => item.scheduled).length}</p><p className="mt-1 text-xs text-white/45">已安排任务</p></div><div><p className="text-2xl font-semibold">{Math.floor(totalMinutes / 60)}h {totalMinutes % 60}m</p><p className="mt-1 text-xs text-white/45">专注时间</p></div></div></div>
          <div className="rounded-[22px] border border-[#f0d9a8] bg-[#fff9ea] p-5"><div className="flex items-center gap-2 text-[#835e11]"><AlertCircle className="size-4" /><span className="text-sm font-semibold">提醒策略</span></div><p className="mt-3 text-sm leading-6 text-[#806d47]">90 分钟任务会安排 2 次进度确认；短于 30 分钟的任务不主动打断。修改耗时后，检查点会一起更新。</p></div>
        </aside>
      </div>
    </section>
  );
}
