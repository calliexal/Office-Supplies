import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { PageMeta } from '@/api';

export const Pagination = ({ meta, onPageChange }: { meta: PageMeta; onPageChange: (page: number) => void }) => {
  const lastPage = Math.max(1, Math.ceil(meta.total / meta.pageSize));
  if (lastPage <= 1) return null;
  const from = (meta.page - 1) * meta.pageSize + 1;
  const to = Math.min(meta.page * meta.pageSize, meta.total);
  const button = 'grid size-9 place-items-center rounded-md bg-navy text-white hover:bg-navy-deep disabled:cursor-not-allowed disabled:opacity-40';

  return (
    <nav aria-label="Pagination" className="mt-6 flex items-center justify-between gap-4 text-sm text-ink-500">
      <p aria-live="polite">
        Showing {from}–{to} of {meta.total}
      </p>
      <div className="flex gap-2">
        <button type="button" className={button} onClick={() => onPageChange(meta.page - 1)} disabled={meta.page <= 1} aria-label="Previous page">
          <ChevronLeft className="size-5" aria-hidden />
        </button>
        <button type="button" className={button} onClick={() => onPageChange(meta.page + 1)} disabled={meta.page >= lastPage} aria-label="Next page">
          <ChevronRight className="size-5" aria-hidden />
        </button>
      </div>
    </nav>
  );
};
