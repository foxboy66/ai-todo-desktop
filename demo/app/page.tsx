'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  ArrowRight,
  BellRing,
  BrainCircuit,
  CalendarDays,
  ChevronRight,
  CircleDot,
  Plus,
  Sparkles,
} from 'lucide-react';

import { CaptureView } from '@/components/demo/capture-view';
import { ExecuteView } from '@/components/demo/execute-view';
import { ReviewView } from '@/components/demo/review-view';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { blockerReasons, defaultAvailability, initialTasks, type AvailabilityBlock, type Task, type View } from '@/lib/demo-data';
import { buildSchedule, getReminderInterval } from '@/lib/demo-flow';

const steps: Array<{ id: View; label: string; number: string }> = [
  { id: 'capture', label: '录入任务', number: '01' },
  { id: 'review', label: '确认计划', number: '02' },
  { id: 'execute', label: '执行跟进', number: '03' },
];

export default function Home() {
  const [view, setView] = useState<View>('execute');
  const [tasks, setTasks] = useState<Task[]>(initialTasks);
  const [taskInput, setTaskInput] = useState('完成 MVP Demo 交互；准备下午产品评审；回复客户邮件；整理用户访谈记录；阅读技术方案');
  const [availability, setAvailability] = useState<AvailabilityBlock[]>(defaultAvailability);
  const [timeOverrides, setTimeOverrides] = useState<Record<string, { start: string; end: string }>>({});
  const [progress, setProgress] = useState(50);
  const [isRunning, setIsRunning] = useState(true);
  const [completedIds, setCompletedIds] = useState<string[]>(['task-1']);
  const [currentTaskId, setCurrentTaskId] = useState('task-2');
  const [notice, setNotice] = useState('计划已确认，下一次进度同步在 12 分钟后');
  const [blockerOpen, setBlockerOpen] = useState(false);
  const [blockerReason, setBlockerReason] = useState<string | null>(null);

  const schedule = useMemo(() => buildSchedule(tasks, availability).map((task) => {
    const override = timeOverrides[task.id];
    return override ? { ...task, startLabel: override.start, endLabel: override.end } : task;
  }), [tasks, availability, timeOverrides]);
  const currentTask = schedule.find((task) => task.id === currentTaskId) ?? schedule[1];
  const totalMinutes = tasks.reduce((sum, task) => sum + task.duration, 0);
  const reminderInterval = getReminderInterval(currentTask.duration);

  useEffect(() => {
    const modelContext = (
      document as Document & {
        modelContext?: {
          registerTool: (
            tool: {
              name: string;
              title: string;
              description: string;
              inputSchema: object;
              annotations: { readOnlyHint: boolean; untrustedContentHint: boolean };
              execute: (input: unknown) => unknown;
            },
            options?: { signal?: AbortSignal },
          ) => void | Promise<void>;
        };
      }
    ).modelContext;

    if (!modelContext?.registerTool) return;
    const lifecycle = new AbortController();

    void Promise.resolve(
      modelContext.registerTool(
        {
          name: 'navigate_demo_step',
          title: '切换 Demo 流程步骤',
          description: '在任务录入、计划确认和执行跟进三个可见步骤之间切换。',
          inputSchema: {
            type: 'object',
            properties: {
              step: { type: 'string', enum: ['capture', 'review', 'execute'] },
            },
            required: ['step'],
            additionalProperties: false,
          },
          annotations: { readOnlyHint: false, untrustedContentHint: false },
          execute(input) {
            const step =
              typeof input === 'object' && input !== null && 'step' in input
                ? (input as { step?: unknown }).step
                : undefined;
            if (step !== 'capture' && step !== 'review' && step !== 'execute') {
              throw new Error('step 必须是 capture、review 或 execute');
            }
            setView(step);
            setNotice('已切换到“' + steps.find((item) => item.id === step)?.label + '”');
            return { activeStep: step };
          },
        },
        { signal: lifecycle.signal },
      ),
    ).catch(() => undefined);

    return () => lifecycle.abort();
  }, []);

  function show(viewName: View, message?: string) {
    setView(viewName);
    if (message) setNotice(message);
  }

  function adjustDuration(id: string, delta: number) {
    setTasks((items) => items.map((task) => task.id === id ? { ...task, duration: Math.max(15, task.duration + delta) } : task));
  }

  function updateDuration(id: string, value: number) {
    setTasks((items) => items.map((task) => task.id === id ? { ...task, duration: Math.max(15, Number.isFinite(value) ? value : 15) } : task));
  }

  function handleTimeChange(id: string, field: 'start' | 'end', value: string) {
    const current = schedule.find((task) => task.id === id);
    setTimeOverrides((items) => ({ ...items, [id]: { start: items[id]?.start ?? current?.startLabel ?? '09:00', end: items[id]?.end ?? current?.endLabel ?? '10:00', [field]: value } }));
    setNotice('已修改任务时间，确认计划后才会正式应用');
  }

  function completeCurrentTask() {
    const completed = completedIds.includes(currentTask.id) ? completedIds : [...completedIds, currentTask.id];
    setCompletedIds(completed);
    const index = schedule.findIndex((task) => task.id === currentTask.id);
    const next = schedule.slice(index + 1).find((task) => task.scheduled && !completed.includes(task.id));
    if (next) {
      setCurrentTaskId(next.id);
      setProgress(0);
      setIsRunning(false);
      setNotice('任务已完成。下一项任务已准备好，开始时间仍由你决定');
    } else {
      setProgress(100);
      setIsRunning(false);
      setNotice('今天计划中的任务已全部完成');
    }
  }

  function applyReplan() {
    adjustDuration(currentTask.id, 30);
    setBlockerOpen(false);
    setBlockerReason(null);
    setNotice('已应用新计划：当前任务延长 30 分钟，后续任务已顺延');
  }

  return (
    <div className="min-h-screen bg-[#eef3f2] text-[#163033]">
      <div className="mx-auto grid min-h-screen max-w-[1680px] lg:grid-cols-[252px_minmax(0,1fr)]">
        <aside className="relative hidden overflow-hidden bg-[#12373a] px-6 py-7 text-white lg:flex lg:flex-col">
          <div className="absolute -right-20 top-24 size-52 rounded-full border border-white/10" />
          <div className="absolute -right-8 top-36 size-28 rounded-full border border-[#7ce0bd]/25" />
          <div className="relative flex items-center gap-3">
            <span className="grid size-10 place-items-center rounded-xl bg-[#a7f3d0] text-[#12373a] shadow-lg"><CircleDot className="size-5" /></span>
            <div><p className="text-[1.05rem] font-semibold">AI ToDo</p><p className="text-xs text-white/50">把计划变成行动</p></div>
          </div>
          <nav className="relative mt-14 space-y-2" aria-label="主要流程">
            {steps.map((step) => {
              const active = step.id === view;
              return (
                <button key={step.id} type="button" onClick={() => show(step.id)} className={'flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left transition ' + (active ? 'bg-white text-[#12373a] shadow-lg shadow-black/10' : 'text-white/65 hover:bg-white/8 hover:text-white')}>
                  <span className={'text-[11px] font-semibold tracking-[.16em] ' + (active ? 'text-[#2c7f68]' : 'text-white/35')}>{step.number}</span>
                  <span className="text-sm font-medium">{step.label}</span>
                  {active && <ChevronRight className="ml-auto size-4" />}
                </button>
              );
            })}
          </nav>
          <div className="relative mt-auto rounded-2xl border border-white/10 bg-white/7 p-4">
            <div className="mb-3 flex items-center gap-2 text-[#a7f3d0]"><BrainCircuit className="size-4" /><span className="text-xs font-semibold">AI 今日观察</span></div>
            <p className="text-sm leading-6 text-white/70">你上午更适合高专注任务，已经为任务之间保留 15 分钟缓冲。</p>
          </div>
        </aside>

        <main className="min-w-0">
          <header className="flex items-center justify-between border-b border-[#d8e2df] bg-white/80 px-5 py-4 backdrop-blur-xl sm:px-8 lg:px-10">
            <div className="flex items-center gap-3 lg:hidden"><span className="grid size-9 place-items-center rounded-xl bg-[#12373a] text-[#a7f3d0]"><CircleDot className="size-4" /></span><span className="font-semibold">AI ToDo</span></div>
            <div className="hidden items-center gap-3 lg:flex">
              <CalendarDays className="size-4 text-[#54706d]" />
              <span className="text-sm font-medium">2026 年 9 月 4 日 · 星期五</span>
              <span className="h-4 w-px bg-[#d8e2df]" />
              <span className="text-sm text-[#6c817f]">可用：{availability.map((slot) => slot.start + '–' + slot.end).join('、')}</span>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="border-[#9bdac5] bg-[#e8fbf3] text-[#216854]"><Sparkles data-icon="inline-start" />模拟数据</Badge>
              <Button variant="outline" className="hidden h-9 border-[#cedbd8] bg-white sm:flex" onClick={() => show('capture')}><Plus />添加任务</Button>
            </div>
          </header>

          <div className="mx-auto max-w-[1380px] px-4 py-6 sm:px-8 lg:px-10 lg:py-8">
            <div className="mb-7 flex gap-2 overflow-x-auto pb-1 lg:hidden">
              {steps.map((step) => (
                <button key={step.id} type="button" onClick={() => show(step.id)} className={'shrink-0 rounded-lg px-4 py-2 text-sm font-medium ' + (step.id === view ? 'bg-[#12373a] text-white' : 'bg-white text-[#637a77]')}>{step.label}</button>
              ))}
            </div>

            {notice && (
              <output aria-live="polite" className="mb-5 flex items-center gap-3 rounded-xl border border-[#bde6d7] bg-[#ecfbf5] px-4 py-3 text-sm text-[#245f50]">
                <BellRing className="size-4 shrink-0" /><span>{notice}</span>
                <button type="button" className="ml-auto text-xs font-semibold hover:underline" onClick={() => setNotice('')}>知道了</button>
              </output>
            )}

            {view === 'capture' && (
              <CaptureView tasks={tasks} availability={availability} taskInput={taskInput} totalMinutes={totalMinutes} onInput={setTaskInput} onAvailabilityChange={setAvailability} onNext={() => show('review', 'AI 已整理 5 个任务，并生成了一份参考计划')} />
            )}
            {view === 'review' && (
              <ReviewView
                schedule={schedule}
                availability={availability}
                totalMinutes={totalMinutes}
                onAvailabilityChange={setAvailability}
                onAdjust={adjustDuration}
                onDurationChange={updateDuration}
                onTimeChange={handleTimeChange}
                onReset={() => { setTasks(initialTasks); setAvailability(defaultAvailability); setTimeOverrides({}); setNotice('已恢复 AI 最初生成的参考计划'); }}
                onStart={() => show('execute', '计划已确认，提醒将按照任务时长动态触发')}
              />
            )}
            {view === 'execute' && (
              <ExecuteView
                schedule={schedule}
                currentTask={currentTask}
                completedIds={completedIds}
                progress={progress}
                isRunning={isRunning}
                reminderInterval={reminderInterval}
                onSelect={(id) => { setCurrentTaskId(id); setProgress(0); setNotice('已切换当前任务，尚未改变计划时间'); }}
                onProgress={(value) => { setProgress(value); setNotice('进度已同步，后续提醒会根据当前状态调整'); }}
                onBlocker={() => setBlockerOpen(true)}
                onComplete={completeCurrentTask}
                onToggle={() => { setIsRunning((value) => !value); setNotice(isRunning ? '计时已暂停，本次不会继续弹出进度提醒' : '已继续当前任务'); }}
                onReview={() => show('review')}
              />
            )}
          </div>
        </main>
      </div>

      <Dialog open={blockerOpen} onOpenChange={(open) => { setBlockerOpen(open); if (!open) setBlockerReason(null); }}>
        <DialogContent className="max-w-[560px] gap-0 overflow-hidden rounded-[24px] p-0">
          <div className="p-6">
            <DialogHeader>
              <div className="mb-3 grid size-10 place-items-center rounded-xl bg-[#fff0ec] text-[#b94f38]"><AlertCircle className="size-5" /></div>
              <DialogTitle className="text-xl text-[#193b3c]">{blockerReason ? '这是建议的新安排' : '现在遇到了什么情况？'}</DialogTitle>
              <DialogDescription className="leading-6">{blockerReason ? '系统不会直接改动你的计划，请先确认影响是否可以接受。' : '先了解原因，再决定是否需要调整剩余计划。'}</DialogDescription>
            </DialogHeader>

            {!blockerReason ? (
              <div className="mt-5 grid gap-2 sm:grid-cols-2">
                {blockerReasons.map((reason) => (
                  <button key={reason} type="button" onClick={() => setBlockerReason(reason)} className="flex items-center justify-between rounded-xl border border-[#d9e4e1] px-4 py-3 text-left text-sm font-medium text-[#34534f] transition hover:border-[#73bba5] hover:bg-[#f2fbf7]">
                    {reason}<ChevronRight className="size-4 text-[#8ca09c]" />
                  </button>
                ))}
              </div>
            ) : (
              <div className="mt-5 space-y-4">
                <div className="rounded-xl bg-[#f2f7f5] p-4"><p className="text-xs font-semibold tracking-[.08em] text-[#7c918d]">已记录原因</p><p className="mt-1 text-sm font-semibold text-[#294b47]">{blockerReason}</p></div>
                <div className="divide-y divide-[#e3ebe9] rounded-xl border border-[#d9e4e1]">
                  <div className="flex justify-between px-4 py-3 text-sm"><span className="text-[#607773]">当前任务</span><b>延长 30 分钟</b></div>
                  <div className="flex justify-between px-4 py-3 text-sm"><span className="text-[#607773]">回复客户邮件</span><b>14:00 → 14:30</b></div>
                  <div className="flex justify-between px-4 py-3 text-sm"><span className="text-[#607773]">预计结束时间</span><b>17:30 → 18:00</b></div>
                </div>
              </div>
            )}
          </div>
          {blockerReason && (
            <DialogFooter className="m-0 rounded-none border-[#e1e9e7] bg-[#f7faf9] p-4">
              <Button variant="outline" className="border-[#cbdad6] bg-white" onClick={() => setBlockerReason(null)}>返回修改原因</Button>
              <Button className="bg-[#12373a] text-white hover:bg-[#1c4b4e]" onClick={applyReplan}>确认应用新计划<ArrowRight /></Button>
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
