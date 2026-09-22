import { useState, useRef, useEffect } from 'react';
import { Heart, Meh, Trash2, SlidersHorizontal } from 'lucide-react';
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
  useEffect(() => {
    if (!open || alwaysOpen) return;
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', escape);
    return () => document.removeEventListener('keydown', escape);
  }, [open, alwaysOpen]);
  const selected = ratingCategory(value);
  const SelectedIcon =
    choices.find((choice) => choice.value === selected)?.Icon || SlidersHorizontal;
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
          onClick={() => onChange(!alwaysOpen && selected === score ? null : score)}
          title={label}
        >
          <Icon size={18} strokeWidth={1.8} />
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
      <div className="rating-bubble">
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
          <SelectedIcon size={18} strokeWidth={1.8} />
        </button>
        <div className="rating-popover" inert={!open} aria-hidden={!open}>
          {options}
        </div>
      </div>
    </div>
  );
}
