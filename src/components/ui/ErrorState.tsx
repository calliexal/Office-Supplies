import { AlertTriangle } from 'lucide-react';
import { toUserMessage } from '@/api';
import { Button } from './Button';

export const ErrorState = ({ error, onRetry }: { error: unknown; onRetry?: () => void }) => (
  <div role="alert" className="flex flex-col items-center gap-3 px-4 py-10 text-center">
    <AlertTriangle className="size-8 text-warning" aria-hidden />
    <p className="max-w-sm text-sm text-ink-500">{toUserMessage(error)}</p>
    {onRetry && (
      <Button variant="navy" size="sm" onClick={onRetry}>
        Try again
      </Button>
    )}
  </div>
);
