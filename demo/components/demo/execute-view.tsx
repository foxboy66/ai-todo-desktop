import {
  BellRing,
  Check,
  ListChecks,
  MessageCircleQuestion,
  Pause,
  Play,
  SlidersHorizontal,
  Target,
  TimerReset,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Progress, ProgressLabel, ProgressValue } from '@/components/ui/progress';
import type { Task } from '@/lib/demo-data';

type ScheduledTask = Task & {
  scheduled: boolean;
  startLabel: string;
  endLabel: string;
};

type Props = {
  schedule: ScheduledTask[];
  currentTask: ScheduledTask;
  completedIds: string[];
  progress: number;
  isRunning: boolean;
  reminderInterval: number | null;
  onSelect: (id: string) => void;
  onProgress: (value: number) => void;
  onBlocker: () => void;
  onComplete: () => void;
  onToggle: () => void;
  onReview: () => void;
};

export function ExecuteView({
  schedule,
  currentTask,
  completedIds,
  progress,
  isRunning,
  reminderInterval,
  onSelect,
  onProgress,
  onBlocker,
  onComplete,
  onToggle,
  onReview,
}: Props) {
  const upcoming = schedule
    .filter((task) => task.scheduled && task.id !== currentTask.id && !completedIds.includes(task.id))
    .slice(0, 3);

  return (
    <section aria-labelledby="execute-title">
      <div className="mb-7 flex flex-col justify-between gap-4 md:flex-row md:items-end">
        <div>
          <p className="section-kicker">今日执行台</p>
          <h1 id="execute-title" className="page-title">上午好，按现在的节奏继续</h1>
          <p className="page-subtitle">你已完成 {completedIds.length} 项，当前任务进度 {progress}%。</p>
        </div>
        <Button variant="outline" className="h-10 self-start border-[#cbdad6] bg-white md:self-auto" onClick={onReview}>
          <SlidersHorizontal />
          查看完整计划
        </Button>
      </div>

      <div className="grid gap-5 xl:grid-cols-[270px_minmax(430px,1fr)_300px]">
        <aside className="surface p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-[#254643]">今天的节奏</p>
              <p className="mt-1 text-xs text-[#82928f]">5 项任务 · 2 段可用时间</p>
            </div>
            <ListChecks className="size-5 text-[#3b806e]" />
          </div>
          <div className="relative mt-6 space-y-1">
            <div className="absolute bottom-5 left-[7px] top-4 w-px bg-[#dce7e4]" />
            {schedule.map((task) => {
              const done = completedIds.includes(task.id);
              const active = task.id === currentTask.id;
              return (
                <button key={task.id} type="button" onClick={() => task.scheduled && !done && onSelect(task.id)} className={'relative flex w-full gap-3 rounded-xl px-1 py-3 text-left transition ' + (active ? 'bg-[#edf8f4] pr-2' : 'hover:bg-[#f7faf9]')}>
                  <span className={'relative z-10 mt-0.5 grid size-[15px] shrink-0 place-items-center rounded-full border-2 ' + (done ? 'border-[#2c8a70] bg-[#2c8a70] text-white' : active ? 'border-[#2c8a70] bg-white' : 'border-[#b9cac6] bg-white')}>
                    {done && <Check className="size-2.5" />}
                  </span>
                  <span className="min-w-0">
                    <span className={'block text-xs font-semibold ' + (active ? 'text-[#236b58]' : 'text-[#81918e]')}>{task.startLabel}</span>
                    <span className={'mt-1 block text-sm leading-5 ' + (done ? 'text-[#8b9b98] line-through' : active ? 'font-semibold text-[#173c3d]' : 'text-[#496360]')}>{task.title}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </aside>

        <div className="focus-card">
          <div className="focus-orbit focus-orbit-one" />
          <div className="focus-orbit focus-orbit-two" />
          <div className="relative">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-2 text-[#a7f3d0]">
                  <Target className="size-4" />
                  <span className="text-xs font-semibold tracking-[.12em]">正在执行</span>
                </div>
                <h2 className="mt-4 max-w-xl text-2xl font-semibold tracking-[-.03em] sm:text-3xl">{currentTask.title}</h2>
                <p className="mt-2 text-sm text-white/55">完成标准：{currentTask.doneDefinition}</p>
              </div>
              <span className="rounded-lg border border-white/10 bg-white/8 px-3 py-2 text-xs text-white/65">{currentTask.startLabel}–{currentTask.endLabel}</span>
            </div>

            <div className="mt-9 grid items-center gap-7 sm:grid-cols-[176px_minmax(0,1fr)]">
              <div className="relative mx-auto grid size-44 place-items-center">
                <div className="absolute inset-0 rounded-full" style={{ background: 'conic-gradient(#a7f3d0 ' + progress * 3.6 + 'deg, rgba(255,255,255,.1) 0deg)' }} />
                <div className="absolute inset-[10px] rounded-full bg-[#153b3e]" />
                <div className="relative text-center"><p className="text-4xl font-semibold tabular-nums">{progress}%</p><p className="mt-1 text-xs text-white/45">已同步进度</p></div>
              </div>
              <div>
                <div className="flex items-center justify-between text-sm"><span className="text-white/55">预计剩余</span><span className="font-semibold">27 分钟</span></div>
                <Progress value={progress} className="mt-3 gap-2 [&_[data-slot=progress-track]]:h-2 [&_[data-slot=progress-track]]:bg-white/10 [&_[data-slot=progress-indicator]]:bg-[#a7f3d0]">
                  <ProgressLabel className="sr-only">任务进度</ProgressLabel><ProgressValue className="sr-only" />
                </Progress>
                <div className="mt-5 flex items-start gap-3 rounded-xl border border-white/10 bg-white/6 p-3">
                  <BellRing className="mt-0.5 size-4 shrink-0 text-[#a7f3d0]" />
                  <div><p className="text-sm font-medium">{reminderInterval ? '每 ' + reminderInterval + ' 分钟同步一次' : '不设置中途提醒'}</p><p className="mt-1 text-xs leading-5 text-white/45">下一次询问在 12 分钟后，反馈后自动更新。</p></div>
                </div>
              </div>
            </div>

            <div className="mt-8">
              <p className="mb-3 text-xs font-semibold tracking-[.12em] text-white/40">快速同步</p>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {[25, 50, 75].map((value) => (
                  <button key={value} type="button" onClick={() => onProgress(value)} className={'rounded-xl border px-3 py-3 text-sm font-semibold transition ' + (progress === value ? 'border-[#a7f3d0] bg-[#a7f3d0] text-[#12373a]' : 'border-white/12 bg-white/6 text-white/75 hover:bg-white/12')}>
                    完成 {value}%
                  </button>
                ))}
                <button type="button" onClick={onBlocker} className="rounded-xl border border-[#ff9f8c]/25 bg-[#ff826b]/12 px-3 py-3 text-sm font-semibold text-[#ffc3b7] transition hover:bg-[#ff826b]/20">遇到阻碍</button>
              </div>
            </div>

            <div className="mt-6 flex flex-col gap-2 border-t border-white/10 pt-6 sm:flex-row">
              <Button size="lg" className="h-11 flex-1 bg-[#a7f3d0] text-[#12373a] hover:bg-[#c2f8df]" onClick={onComplete}><Check />标记为已完成</Button>
              <Button size="lg" variant="outline" className="h-11 border-white/15 bg-white/5 text-white hover:bg-white/10 hover:text-white" onClick={onToggle}>
                {isRunning ? <Pause /> : <Play />}{isRunning ? '暂停任务' : '继续任务'}
              </Button>
            </div>
          </div>
        </div>

        <aside className="space-y-5">
          <div className="surface p-5">
            <div className="flex items-center justify-between">
              <div><p className="text-sm font-semibold text-[#254643]">接下来</p><p className="mt-1 text-xs text-[#82928f]">根据当前计划自动衔接</p></div>
              <TimerReset className="size-5 text-[#3b806e]" />
            </div>
            <div className="mt-5 space-y-4">
              {upcoming.map((task, index) => (
                <div key={task.id} className="flex items-start gap-3 border-b border-[#e6ecea] pb-4 last:border-0 last:pb-0">
                  <span className="mt-0.5 text-xs font-semibold text-[#7b908c]">{task.startLabel}</span>
                  <div><p className="text-sm font-semibold leading-5 text-[#254643]">{task.title}</p><p className="mt-1 text-xs text-[#849592]">{index === 0 ? '前有 15 分钟缓冲' : task.duration + ' 分钟'}</p></div>
                </div>
              ))}
            </div>
          </div>
          <div className="rounded-[24px] border border-[#d9e4e1] bg-[#f8fbfa] p-5">
            <div className="flex items-center gap-2"><MessageCircleQuestion className="size-4 text-[#2d7d68]" /><p className="text-sm font-semibold text-[#31534f]">为什么这样提醒？</p></div>
            <p className="mt-3 text-sm leading-6 text-[#6a817d]">确认耗时为 {currentTask.duration} 分钟，因此采用{reminderInterval ? '每 ' + reminderInterval + ' 分钟' : '仅结束时'}的检查节奏。</p>
          </div>
        </aside>
      </div>
    </section>
  );
}
