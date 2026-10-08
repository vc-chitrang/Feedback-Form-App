import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import { arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { ArrowDown, ArrowUp, Copy, GripVertical, RotateCcw, Trash2 } from 'lucide-react';
import { t, type Question } from '@ff/form-schema';
import { cx } from '@ff/form-renderer';
import { Badge, IconButton } from '../../components/ui';
import { QUESTION_ICONS } from '../../lib/questionIcons';

export type ItemStatus = 'new' | 'edited' | 'same';

interface ListProps {
  questions: Question[];
  locale: string;
  selectedUid: string | null;
  onSelect: (uid: string) => void;
  onReorder: (from: number, to: number) => void;
  onDuplicate: (uid: string) => void;
  onDelete: (uid: string) => void;
  statusOf: (q: Question) => ItemStatus;
  answerCounts: Record<string, number>;
  issuesByUid: Record<string, 'error' | 'warning'>;
  readOnly: boolean;
  removed: Question[];
  onRestore: (q: Question) => void;
}

const fmt = new Intl.NumberFormat(undefined, { notation: 'compact' });

function Row({ q, index, total, props }: { q: Question; index: number; total: number; props: ListProps }) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id: q.uid,
    disabled: props.readOnly,
  });
  const Icon = QUESTION_ICONS[q.type];
  const selected = props.selectedUid === q.uid;
  const status = props.statusOf(q);
  const count = props.answerCounts[q.uid] ?? 0;
  const issue = props.issuesByUid[q.uid];
  const label = t(q.label, props.locale);

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={cx(
        'group relative flex items-center gap-1 rounded-xl bg-white pr-1 ring-1 transition',
        selected ? 'ring-2 ring-stone-900' : 'ring-stone-200 hover:ring-stone-300',
        isDragging && 'z-10 shadow-lg',
        q.type === 'section' && 'bg-stone-50',
      )}
    >
      {!props.readOnly ? (
        <button
          ref={setActivatorNodeRef}
          type="button"
          aria-label={`Drag to reorder question ${index + 1}`}
          className="flex cursor-grab touch-none items-center gap-1 self-stretch pl-1.5 text-stone-300 hover:text-stone-600 active:cursor-grabbing"
          {...attributes}
          {...listeners}
        >
          <GripVertical className="size-4" />
          <span className="w-4 text-center text-xs font-medium text-stone-400 tabular-nums">{index + 1}</span>
        </button>
      ) : (
        // Read-only: number alone, vertically centred like the drag handle.
        <span className="flex w-7 items-center justify-end self-stretch text-xs font-medium text-stone-400 tabular-nums">{index + 1}</span>
      )}
      <button type="button" onClick={() => props.onSelect(q.uid)} className="flex min-w-0 flex-1 items-start gap-2.5 py-2.5 pl-1 text-left focus-visible:outline-none">
        <Icon className="mt-0.5 size-4 shrink-0 text-stone-500" aria-hidden />
        <span className="min-w-0 flex-1">
          <span className={cx('line-clamp-2 text-sm', label ? 'text-stone-900' : 'text-stone-400 italic')}>{label || 'Untitled question'}</span>
          <span className="mt-1 flex flex-wrap gap-1">
            {q.required && q.type !== 'section' && <Badge>Required</Badge>}
            {status === 'new' && <Badge tone="blue">New</Badge>}
            {status === 'edited' && <Badge tone="amber">Edited</Badge>}
            {count > 0 && <Badge tone="neutral">{fmt.format(count)} {count === 1 ? 'answer' : 'answers'}</Badge>}
            {issue && <Badge tone={issue === 'error' ? 'red' : 'amber'}>{issue === 'error' ? 'Needs fixing' : 'Check'}</Badge>}
          </span>
        </span>
      </button>
      {!props.readOnly && (
        <div className="flex flex-col opacity-100 transition sm:opacity-0 sm:group-focus-within:opacity-100 sm:group-hover:opacity-100">
          <div className="flex">
            <IconButton label="Move up" disabled={index === 0} onClick={() => props.onReorder(index, index - 1)}>
              <ArrowUp className="size-3.5" />
            </IconButton>
            <IconButton label="Move down" disabled={index === total - 1} onClick={() => props.onReorder(index, index + 1)}>
              <ArrowDown className="size-3.5" />
            </IconButton>
          </div>
          <div className="flex">
            <IconButton label="Duplicate" onClick={() => props.onDuplicate(q.uid)}>
              <Copy className="size-3.5" />
            </IconButton>
            <IconButton label="Delete" onClick={() => props.onDelete(q.uid)} className="hover:bg-red-50 hover:text-red-700">
              <Trash2 className="size-3.5" />
            </IconButton>
          </div>
        </div>
      )}
    </li>
  );
}

export function QuestionList(props: ListProps) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const ids = props.questions.map((q) => q.uid);

  const onDragEnd = (e: DragEndEvent) => {
    if (!e.over || e.active.id === e.over.id) return;
    const from = ids.indexOf(String(e.active.id));
    const to = ids.indexOf(String(e.over.id));
    if (from >= 0 && to >= 0) props.onReorder(from, to);
  };

  return (
    <div>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={ids} strategy={verticalListSortingStrategy}>
          <ol className="space-y-2" aria-label="Questions">
            {props.questions.map((q, i) => (
              <Row key={q.uid} q={q} index={i} total={props.questions.length} props={props} />
            ))}
          </ol>
        </SortableContext>
      </DndContext>

      {props.removed.length > 0 && (
        <div className="mt-5 rounded-xl border border-dashed border-stone-300 p-3">
          <p className="mb-2 text-xs font-semibold tracking-wide text-stone-500 uppercase">Removed in this draft</p>
          <p className="mb-2 text-xs text-stone-500">Their existing answers stay in reports and exports.</p>
          <ul className="space-y-1">
            {props.removed.map((q) => (
              <li key={q.uid} className="flex items-center justify-between gap-2 text-sm">
                <span className="truncate text-stone-500 line-through">{t(q.label, props.locale) || 'Untitled'}</span>
                {!props.readOnly && (
                  <button type="button" onClick={() => props.onRestore(q)} className="flex shrink-0 items-center gap-1 text-xs font-medium text-stone-700 hover:text-stone-950">
                    <RotateCcw className="size-3" /> Restore
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export { arrayMove };
