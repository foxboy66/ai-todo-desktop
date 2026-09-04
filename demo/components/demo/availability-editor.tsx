import { Clock3, Plus, Trash2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { AvailabilityBlock } from '@/lib/demo-data';

type Props = {
  blocks: AvailabilityBlock[];
  onChange: (blocks: AvailabilityBlock[]) => void;
};

export function AvailabilityEditor({ blocks, onChange }: Props) {
  function updateBlock(id: string, key: 'start' | 'end', value: string) {
    onChange(blocks.map((block) => block.id === id ? { ...block, [key]: value } : block));
  }

  function addBlock() {
    const id = 'slot-' + Date.now();
    onChange([...blocks, { id, start: '19:00', end: '20:00' }]);
  }

  return (
    <div className="availability-editor">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Clock3 className="size-4 text-[#2d806a]" />
          <p className="text-sm font-semibold text-[#2c4e4a]">今天什么时候有空？</p>
        </div>
        <button type="button" onClick={addBlock} className="flex items-center gap-1 text-xs font-semibold text-[#2d806a] hover:underline">
          <Plus className="size-3.5" />添加时段
        </button>
      </div>
      <div className="space-y-2">
        {blocks.map((block, index) => (
          <div key={block.id} className="flex flex-wrap items-center gap-2">
            <span className="w-14 text-xs font-medium text-[#7a8e8a]">时段 {index + 1}</span>
            <Input type="time" aria-label={'时段 ' + (index + 1) + ' 开始时间'} value={block.start} onChange={(event) => updateBlock(block.id, 'start', event.target.value)} className="h-9 w-[122px] border-[#cfddd9] bg-white" />
            <span className="text-xs text-[#8ba09b]">至</span>
            <Input type="time" aria-label={'时段 ' + (index + 1) + ' 结束时间'} value={block.end} onChange={(event) => updateBlock(block.id, 'end', event.target.value)} className="h-9 w-[122px] border-[#cfddd9] bg-white" />
            <Button type="button" size="icon-sm" variant="ghost" aria-label={'删除时段 ' + (index + 1)} disabled={blocks.length <= 1} onClick={() => onChange(blocks.filter((item) => item.id !== block.id))}>
              <Trash2 />
            </Button>
          </div>
        ))}
      </div>
      <p className="mt-3 text-xs leading-5 text-[#82948f]">排程只会使用这些时间段；修改后参考计划会自动重新计算。</p>
    </div>
  );
}
