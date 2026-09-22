import { useState, useRef } from 'react';
import { Heart, Meh, Trash2, SlidersHorizontal, X } from 'lucide-react';
const choices = [
  { value: 5, label: 'Нравится', Icon: Heart },
  { value: 3, label: 'Думаю', Icon: Meh },
  { value: 1, label: 'Мусор', Icon: Trash2 },
];
export const ratingCategory = (value: number | null | undefined) =>
  value == null ? null : value >= 4 ? 5 : value >= 2 ? 3 : 1;
export const ratingLabel = (value: number | null | undefined) =>
  choices.find((c) => c.value === ratingCategory(value))?.label || '';
export function Rating({
  value,
  onChange,
  disabled,
  title,
  alwaysOpen = false,
}: {
  value: number | null;
  onChange: (value: number | null) => void;
  disabled: boolean;
  title: string;
  alwaysOpen?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const selected = ratingCategory(value);
  const options = (
    <div className="rating-options" role="group" aria-label={'Оценка ' + title}>
      {choices.map(({ value: score, label, Icon }) => (
        <button
          key={score}
          type="button"
          data-score={score}
          aria-label={label}
          aria-pressed={selected === score}
          disabled={disabled}
          onClick={() => onChange(score)}
        >
          <Icon size={16} />
          <span>{label}</span>
        </button>
      ))}
    </div>
  );
  if (alwaysOpen) return options;
  return (
    <div
      ref={root}
      className="personal-rating three-rating"
      data-expanded={open}
      onMouseLeave={() => {
        if (!root.current?.contains(document.activeElement)) setOpen(false);
      }}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
      }}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.stopPropagation();
          setOpen(false);
        }
      }}
    >
      <button
        type="button"
        className="rating-summary"
        title={ratingLabel(value) || 'Оценить вариант'}
        aria-label={'Оценить ' + title}
        aria-expanded={open}
        onMouseEnter={() => setOpen(true)}
        onFocus={() => setOpen(true)}
        onClick={() => setOpen(true)}
      >
        <SlidersHorizontal size={13} />
        <span>{ratingLabel(value) || 'Оценить'}</span>
      </button>
      <div className="rating-popover" hidden={!open}>
        {options}
        {value !== null && (
          <button
            className="three-rating-clear"
            type="button"
            aria-label="Сбросить оценку"
            disabled={disabled}
            onClick={() => onChange(null)}
          >
            <X size={12} />
            Сбросить
          </button>
        )}
      </div>
    </div>
  );
}
