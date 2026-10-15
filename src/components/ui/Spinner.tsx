import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/cn';

export const Spinner = ({ className, label = 'Loading' }: { className?: string; label?: string }) => (
  <Loader2 role="status" aria-label={label} className={cn('size-5 animate-spin', className)} />
);

export const FullPageSpinner = ({ label }: { label: string }) => (
  <div className="grid min-h-screen place-items-center bg-sky">
    <Spinner className="size-8 text-navy" label={label} />
  </div>
);
