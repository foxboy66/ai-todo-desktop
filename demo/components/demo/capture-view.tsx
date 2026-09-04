import { Clock3, Sparkles } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import type { Task } from '@/lib/demo-data';

type Props = {
  tasks: Task[];
  taskInput: string;
  totalMinutes: number;
  onInput: (value: string) => void;
  onNext: () => void;
};

export function CaptureView({
  tasks,
  taskInput,
  totalMinutes,
  onInput,
  onNext,
}: Props) {
  return (
    <section aria-labelledby="capture-title">
      <div className="mb-7 flex flex-col justify-between gap-4 md:flex-row md:items-end">
        <div>
          <p className="section-kicker">规划今天</p>
          <h1 id="capture-title" className="page-title">先把脑子里的事情倒出来</h1>
          <p className="page-subtitle">不必整理格式，AI 会把它们变成可确认的任务。</p>
        </div>
        <div className="flex items-center gap-2 text-sm text-[#607774]">
          <Clock3 className="size-4" />
          可用时段：09:00–12:00、14:00–18:00
        </div>
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.2fr)_minmax(340px,.8fr)]">
        <div className="surface p-5 sm:p-7">
          <label htmlFor="task-input" className="mb-3 block text-sm font-semibold text-[#284845]">
            今天想完成什么？
          </label>
          <Textarea
            id="task-input"
            value={taskInput}
            onChange={(event) => onInput(event.target.value)}
            className="min-h-48 resize-none border-[#cbdad6] bg-[#f8fbfa] p-4 text-base leading-7 shadow-none"
          />
          <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
            <div className="flex gap-2">
              <span className="rounded-lg bg-[#edf4f2] px-3 py-2 text-xs text-[#59736f]">+ 截止时间</span>
              <span className="rounded-lg bg-[#edf4f2] px-3 py-2 text-xs text-[#59736f]">+ 优先级</span>
            </div>
            <Button size="lg" className="h-11 bg-[#12373a] px-5 text-white hover:bg-[#1c4b4e]" onClick={onNext}>
              <Sparkles />
              生成参考计划
            </Button>
          </div>
        </div>

        <aside className="overflow-hidden rounded-[24px] bg-[#153b3e] p-6 text-white shadow-[0_18px_50px_rgba(24,59,56,.14)]">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold">AI 已识别的任务</p>
              <p className="mt-1 text-xs text-white/50">字段可以在下一步修改</p>
            </div>
            <Badge className="bg-[#a7f3d0] text-[#12373a]">{tasks.length} 项</Badge>
          </div>
          <div className="mt-5 space-y-2.5">
            {tasks.slice(0, 4).map((task) => (
              <div key={task.id} className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/7 px-3 py-3">
                <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-white/10 text-xs font-semibold">{task.priority}</span>
                <span className="min-w-0 flex-1 truncate text-sm">{task.title}</span>
                <span className="text-xs text-white/45">{task.duration} 分</span>
              </div>
            ))}
          </div>
          <p className="mt-5 flex items-start gap-2 text-xs leading-5 text-white/55">
            <Sparkles className="mt-0.5 size-3.5 shrink-0 text-[#a7f3d0]" />
            预计共需 {Math.floor(totalMinutes / 60)} 小时 {totalMinutes % 60} 分，当前可用时间可以容纳全部任务。
          </p>
        </aside>
      </div>
    </section>
  );
}
