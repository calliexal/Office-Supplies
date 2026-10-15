import { useEffect, useId, useRef, type ReactNode } from 'react';
import { cn } from '@/lib/cn';

type DialogProps = {
  open: boolean;
  onClose: () => void;
  children: (ids: { labelId: string; descriptionId: string }) => ReactNode;
  className?: string;
  dismissible?: boolean;
};

export const Dialog = ({ open, onClose, children, className, dismissible = true }: DialogProps) => {
  const ref = useRef<HTMLDialogElement>(null);
  const restoreFocusTo = useRef<HTMLElement | null>(null);
  const labelId = useId();
  const descriptionId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      restoreFocusTo.current = document.activeElement as HTMLElement | null;
      dialog.showModal?.();
      if (!dialog.showModal) dialog.setAttribute('open', '');
    }
    if (!open && dialog.open) {
      dialog.close?.();
      dialog.removeAttribute('open');
      restoreFocusTo.current?.focus?.();
    }
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={labelId}
      aria-describedby={descriptionId}
      onCancel={(event) => {
        event.preventDefault();
        if (dismissible) onClose();
      }}
      onClick={(event) => {
        if (dismissible && event.target === event.currentTarget) onClose();
      }}
      className={cn(
        'm-auto max-h-[calc(100dvh-32px)] w-[calc(100%-32px)] overflow-y-auto rounded-[10px] bg-white p-0 text-ink shadow-xl',
        'open:animate-[dialog-in_160ms_ease-out]',
        className,
      )}
    >
      {open && children({ labelId, descriptionId })}
    </dialog>
  );
};
