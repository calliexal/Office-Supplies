import { Minus } from 'lucide-react';
import { useId } from 'react';
import { REQUEST_NOTE_MAX } from '@/api';
import { PICKUP_LOCATION } from '@/config';
import { pluralize } from '@/lib/format';
import { cn } from '@/lib/cn';
import type { CartLine } from './cart';

type RequestSummaryCardProps = {
  lines: CartLine[];
  totalQuantity: number;
  note: string;
  onNoteChange: (note: string) => void;
  onRemove: (supplyId: string) => void;
  onSubmit: () => void;
};

export const RequestSummaryCard = ({ lines, totalQuantity, note, onNoteChange, onRemove, onSubmit }: RequestSummaryCardProps) => {
  const isEmpty = lines.length === 0;
  const noteId = useId();
  const noteHintId = useId();

  return (
    <section aria-labelledby="summary-title" className="rounded-[10px] bg-white px-[14px] pb-7 pt-[23px]">
      <div className="px-[5px]">
        <h2 id="summary-title" className="font-display text-base font-bold text-black">
          Requests Summary
        </h2>
        <p className="text-sm font-medium text-ink-500" aria-live="polite">
          {pluralize(lines.length, 'Item')} Selected
        </p>
      </div>

      <div className="mt-[47px]">
        <div className="flex justify-between border-b border-ink-500/60 px-[9px] pb-1 font-display text-xs font-semibold text-ink-500">
          <span>Name</span>
          <span>Qty</span>
        </div>
        <ul className="space-y-2 px-[9px] pt-2">
          {isEmpty ? (
            <li className="flex justify-between text-xs">
              <span className="font-medium text-black">-</span>
              <span className="text-ink-500">-</span>
            </li>
          ) : (
            lines.map((line) => (
              <li key={line.supplyId} className="flex items-center justify-between gap-2 text-xs">
                <span className="min-w-0 truncate font-medium text-black">{line.name}</span>
                <span className="flex shrink-0 items-center gap-2">
                  <span className="text-ink-500">x{line.quantity}</span>
                  <button
                    type="button"
                    onClick={() => onRemove(line.supplyId)}
                    aria-label={`Remove ${line.name} from request`}
                    className="grid h-[13px] w-4 place-items-center rounded-sm bg-danger text-white hover:bg-[#e83634]"
                  >
                    <Minus className="size-3" strokeWidth={3} aria-hidden />
                  </button>
                </span>
              </li>
            ))
          )}
        </ul>
        <hr className="mt-3 border-t border-dashed border-navy" aria-hidden />
      </div>

      <dl className="mt-2 space-y-[5px] px-[5px]">
        <div className="flex items-center justify-between">
          <dt className="text-xs font-medium text-ink-500">Total Qty:</dt>
          <dd className="text-base font-semibold text-black">{totalQuantity}</dd>
        </div>
        <div>
          <dt className="text-xs font-medium text-ink-500">PickUp Location:</dt>
          <dd className="text-sm font-semibold text-black">{PICKUP_LOCATION}</dd>
        </div>
      </dl>

      <div className="mt-4 px-[5px]">
        <label htmlFor={noteId} className="text-xs font-medium text-ink-500">
          Note for General Affair <span className="font-normal text-ink-400">(optional)</span>
        </label>
        <textarea
          id={noteId}
          value={note}
          onChange={(event) => onNoteChange(event.target.value)}
          maxLength={REQUEST_NOTE_MAX}
          rows={3}
          aria-describedby={noteHintId}
          placeholder="e.g. For the Monday training"
          className="mt-1 block w-full resize-y rounded-md border border-ink-400 px-2 py-1.5 text-xs text-ink placeholder:text-ink-400 focus:border-navy focus:outline-none focus:ring-2 focus:ring-navy/20"
        />
        <p id={noteHintId} className="mt-0.5 text-right text-[10px] text-ink-400">
          {note.length}/{REQUEST_NOTE_MAX}
        </p>
      </div>

      <div className="mt-4 flex justify-end">
        <button
          type="button"
          onClick={onSubmit}
          disabled={isEmpty}
          className={cn(
            'h-[43px] w-[173px] rounded-[10px] text-sm font-bold text-white transition-colors',
            isEmpty ? 'cursor-not-allowed bg-ink-600' : 'bg-brand hover:bg-[#dd6533]',
          )}
        >
          Submit Requests
        </button>
      </div>
    </section>
  );
};
