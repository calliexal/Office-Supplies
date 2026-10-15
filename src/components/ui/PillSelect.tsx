import { ChevronDown } from 'lucide-react';
import { useId } from 'react';

type Option<T extends string> = { value: T; label: string };

type PillSelectProps<T extends string> = {
  label: string;
  value: T;
  options: Array<Option<T>>;
  onChange: (value: T) => void;
};

export const PillSelect = <T extends string>({ label, value, options, onChange }: PillSelectProps<T>) => {
  const id = useId();
  return (
    <div className="relative">
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <select
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value as T)}
        className="h-[38px] min-w-[133px] cursor-pointer appearance-none rounded-[18px] bg-navy pl-6 pr-11 font-display text-[15px] font-semibold text-white hover:bg-navy-deep"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value} className="bg-white text-ink">
            {option.label}
          </option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute right-4 top-1/2 size-6 -translate-y-1/2 text-white" aria-hidden />
    </div>
  );
};
