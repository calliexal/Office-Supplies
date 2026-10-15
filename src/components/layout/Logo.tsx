import { ClipboardList } from 'lucide-react';
import { cn } from '@/lib/cn';

const SIZES = {
  sm: { box: 'h-[56px] gap-2', badge: 'size-9 rounded-lg', glyph: 'size-5', text: 'text-xs' },
  md: { box: 'h-[90px] gap-3', badge: 'size-12 rounded-xl', glyph: 'size-7', text: 'text-base' },
  lg: { box: 'h-[91px] gap-2.5', badge: 'size-11 rounded-xl', glyph: 'size-6', text: 'text-[15px]' },
} as const;

export const Logo = ({ size = 'lg', className }: { size?: keyof typeof SIZES; className?: string }) => {
  const s = SIZES[size];
  return (
    <span className={cn('flex w-fit shrink-0 items-center', s.box, className)}>
      <span aria-hidden className={cn('grid place-items-center bg-brand text-white', s.badge)}>
        <ClipboardList className={s.glyph} strokeWidth={2} />
      </span>
      <span className={cn('font-display font-bold leading-tight text-navy', s.text)}>
        Office
        <br />
        Supplies
      </span>
    </span>
  );
};
