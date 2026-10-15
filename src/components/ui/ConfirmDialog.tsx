import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { Button } from './Button';
import { Dialog } from './Dialog';

type Tone = 'brand' | 'danger';

const toneStyles: Record<Tone, { iconBg: string; title: string; action: 'primary' | 'danger' }> = {
  brand: { iconBg: 'bg-brand-soft', title: 'text-brand', action: 'primary' },
  danger: { iconBg: 'bg-danger-tint', title: 'text-danger', action: 'danger' },
};

type ConfirmDialogProps = {
  open: boolean;
  tone: Tone;
  icon: ReactNode;
  title: string;
  description: string;
  confirmLabel: string;
  cancelLabel?: string;
  loading?: boolean;
  error?: string | null;
  onConfirm: () => void;
  onCancel: () => void;
};

export const ConfirmDialog = ({
  open,
  tone,
  icon,
  title,
  description,
  confirmLabel,
  cancelLabel = 'Cancel',
  loading = false,
  error,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) => {
  const style = toneStyles[tone];
  return (
    <Dialog open={open} onClose={onCancel} dismissible={!loading} className="max-w-[456px]">
      {({ labelId, descriptionId }) => (
        <div className="flex flex-col items-center px-[23px] pb-[35px] pt-[50px] text-center">
          <div className={cn('grid size-[84px] place-items-center rounded-full', style.iconBg)} aria-hidden>
            {icon}
          </div>
          <h2 id={labelId} className={cn('mt-[18px] font-display text-2xl font-bold', style.title)}>
            {title}
          </h2>
          <p id={descriptionId} className="mt-1 max-w-[312px] text-[15px] text-ink-500">
            {description}
          </p>
          {error && (
            <p role="alert" className="mt-4 w-full rounded-md bg-danger-soft px-3 py-2 text-sm text-danger">
              {error}
            </p>
          )}
          <div className="mt-[47px] grid w-full grid-cols-2 gap-4">
            <Button variant="outline" onClick={onCancel} disabled={loading} autoFocus>
              {cancelLabel}
            </Button>
            <Button variant={style.action} onClick={onConfirm} loading={loading}>
              {confirmLabel}
            </Button>
          </div>
        </div>
      )}
    </Dialog>
  );
};
