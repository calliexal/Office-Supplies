import { cn } from '@/lib/cn';

export const Skeleton = ({ className }: { className?: string }) => (
  <span aria-hidden className={cn('block animate-pulse rounded-md bg-navy/10', className)} />
);
