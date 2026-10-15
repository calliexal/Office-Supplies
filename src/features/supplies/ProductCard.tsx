import { Package, Plus } from 'lucide-react';
import { memo } from 'react';
import type { Supply } from '@/api';
import { cn } from '@/lib/cn';
import { QuantityStepper } from './QuantityStepper';

type ProductCardProps = {
  supply: Supply;
  draft: number;
  remaining: number;
  inCart: number;
  onDraftChange: (supply: Supply, value: number) => void;
  onDraftStep: (supply: Supply, delta: 1 | -1) => void;
  onAdd: (supply: Supply) => void;
};

export const ProductCard = memo(({ supply, draft, remaining, inCart, onDraftChange, onDraftStep, onAdd }: ProductCardProps) => {
  const isOutOfStock = supply.stock === 0;
  const isMaxed = !isOutOfStock && remaining === 0;

  return (
    <article className="flex flex-col rounded-[10px] bg-white pb-[10px] pl-3 pr-[9px] pt-[14px]">
      <div className="relative h-[110px] overflow-hidden rounded-[5px] bg-white">
        {supply.imageUrl ? (
          <img src={supply.imageUrl} alt="" loading="lazy" decoding="async" className="size-full object-contain" />
        ) : (
          <div className="grid size-full place-items-center bg-sky text-navy/40">
            <Package className="size-10" aria-hidden />
          </div>
        )}
        {inCart > 0 && (
          <span className="absolute right-1 top-1 rounded-full bg-navy px-2 py-0.5 text-[10px] font-semibold text-white">
            {inCart} in summary
          </span>
        )}
      </div>

      <h3 className="mt-4 font-display text-sm font-bold text-black">{supply.name}</h3>
      <p className={cn('mt-[3px] font-display text-[10px] font-medium', isOutOfStock ? 'text-danger' : 'text-ink-500')}>
        Stock: {supply.stock} {supply.unit}
        {isMaxed && ' · all added'}
      </p>

      <div className="mt-auto flex items-center justify-between pt-5">
        <QuantityStepper
          label={`${supply.name} quantity`}
          value={draft}
          max={remaining}
          disabled={isOutOfStock || isMaxed}
          onChange={(value) => onDraftChange(supply, value)}
          onStep={(delta) => onDraftStep(supply, delta)}
        />
        <button
          type="button"
          onClick={() => onAdd(supply)}
          disabled={isOutOfStock || isMaxed}
          aria-label={isOutOfStock ? `${supply.name} is out of stock` : `Add ${Math.max(draft, 1)} ${supply.name} to request`}
          className="grid size-[39px] place-items-center rounded-full bg-brand text-white transition-colors hover:bg-[#dd6533] disabled:cursor-not-allowed disabled:bg-ink-500"
        >
          <Plus className="size-6" strokeWidth={2.25} aria-hidden />
        </button>
      </div>
    </article>
  );
});
ProductCard.displayName = 'ProductCard';
