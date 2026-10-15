import { Minus, Plus } from 'lucide-react';
import { cn } from '@/lib/cn';

type QuantityStepperProps = {
  value: number;
  max: number;
  onChange: (value: number) => void;
  onStep: (delta: 1 | -1) => void;
  label: string;
  disabled?: boolean;
};

export const QuantityStepper = ({ value, max, onChange, onStep, label, disabled = false }: QuantityStepperProps) => {
  const canIncrement = !disabled && value < max;
  const canDecrement = !disabled && value > 0;
  const buttonClass =
    'grid h-[30px] w-[29px] shrink-0 place-items-center rounded-[5px] bg-navy text-white transition-opacity disabled:cursor-not-allowed disabled:opacity-40';

  return (
    <div role="group" aria-label={label} className="flex h-[30px] w-[100px] items-center rounded-[5px] border border-navy bg-white">
      <button type="button" className={buttonClass} disabled={!canIncrement} onClick={() => onStep(1)} aria-label={`Increase ${label}`}>
        <Plus className="size-5" strokeWidth={2.5} aria-hidden />
      </button>
      <input
        type="number"
        inputMode="numeric"
        min={0}
        max={max}
        value={value}
        disabled={disabled}
        aria-label={label}
        onChange={(event) => onChange(Number(event.target.value))}
        onFocus={(event) => event.target.select()}
        className={cn(
          'w-full min-w-0 bg-transparent text-center font-display text-[15px] font-medium [appearance:textfield] focus:outline-none [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none',
          value === 0 ? 'text-ink-400' : 'text-black',
        )}
      />
      <button type="button" className={buttonClass} disabled={!canDecrement} onClick={() => onStep(-1)} aria-label={`Decrease ${label}`}>
        <Minus className="size-5" strokeWidth={2.5} aria-hidden />
      </button>
    </div>
  );
};
