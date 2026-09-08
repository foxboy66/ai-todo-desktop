import { Plus, Trash2 } from 'lucide-react';
import type { AvailabilityBlock } from '../shared/domain';
export function AvailabilityEditor({ availability, onAdd, onUpdate, onRemove }: {
  availability: AvailabilityBlock[]; onAdd: () => void;
  onUpdate: (id: string, field: 'start' | 'end', value: string) => void; onRemove: (id: string) => void;
}) {
  return <><div className="section-title">可用时段<button className="link-button" onClick={onAdd}><Plus size={15} />添加时段</button></div><div className="availability-list">{availability.map((slot, index) => <div className="availability-row" key={slot.id}><span>时段 {index + 1}</span><input type="time" value={slot.start} aria-label={`时段 ${index + 1} 开始时间`} onChange={event => onUpdate(slot.id, 'start', event.target.value)} /><b>至</b><input type="time" value={slot.end} aria-label={`时段 ${index + 1} 结束时间`} onChange={event => onUpdate(slot.id, 'end', event.target.value)} /><button className="remove-button" disabled={availability.length <= 1} onClick={() => onRemove(slot.id)} aria-label={`删除时段 ${index + 1}`}><Trash2 size={15} /></button></div>)}</div></>;
}
