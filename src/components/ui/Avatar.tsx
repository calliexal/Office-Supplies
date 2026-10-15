import { initialsOf } from '@/lib/format';
import { cn } from '@/lib/cn';

export const Avatar = ({ name, className }: { name: string; className?: string }) => (
  <span
    aria-hidden
    className={cn(
      'grid size-[51px] shrink-0 place-items-center rounded-full bg-navy font-display text-base font-semibold text-white',
      className,
    )}
  >
    {initialsOf(name)}
  </span>
);
