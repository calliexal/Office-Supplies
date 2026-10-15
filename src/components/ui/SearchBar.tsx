import { ListFilter, Search, X } from 'lucide-react';
import { useId, type ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { Popover } from './Popover';

type SearchBarProps = {
  value: string;
  onChange: (value: string) => void;
  label: string;
  filterContent?: ReactNode;
  hasActiveFilters?: boolean;
};

export const SearchBar = ({ value, onChange, label, filterContent, hasActiveFilters = false }: SearchBarProps) => {
  const inputId = useId();
  return (
    <div className="flex gap-[15px]">
      <div className="relative flex h-14 min-w-0 flex-1 items-center rounded-[10px] bg-white focus-within:ring-2 focus-within:ring-brand">
        <label htmlFor={inputId} className="sr-only">
          {label}
        </label>
        <input
          id={inputId}
          type="search"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder="Search..."
          autoComplete="off"
          className="h-full w-full rounded-[10px] bg-transparent pl-[29px] pr-20 text-sm text-ink placeholder:text-ink-500/80 focus:outline-none [&::-webkit-search-cancel-button]:hidden"
        />
        {value && (
          <button
            type="button"
            onClick={() => onChange('')}
            aria-label="Clear search"
            className="absolute right-12 grid size-7 place-items-center rounded text-ink-500 hover:text-ink"
          >
            <X className="size-4" aria-hidden />
          </button>
        )}
        <Search className="pointer-events-none absolute right-4 size-6 text-ink-700" strokeWidth={1.75} aria-hidden />
      </div>
      {filterContent !== undefined && <Popover
        label="Filters"
        trigger={({ open, toggle, id }) => (
          <button
            type="button"
            onClick={toggle}
            aria-expanded={open}
            aria-controls={id}
            aria-label={hasActiveFilters ? 'Filters (active)' : 'Filters'}
            className={cn('relative grid size-14 shrink-0 place-items-center rounded-[10px] bg-navy text-white hover:bg-navy-deep')}
          >
            <ListFilter className="size-[30px]" strokeWidth={1.75} aria-hidden />
            {hasActiveFilters && <span aria-hidden className="absolute right-2 top-2 size-2.5 rounded-full bg-brand" />}
          </button>
        )}
      >
        {filterContent}
      </Popover>}
    </div>
  );
};
