import { useState, useRef, useEffect, Fragment } from 'react';
import { Heart, Meh, Trash2, SlidersHorizontal, MessageCircle } from 'lucide-react';
const choices = [
  { value: 5, label: 'Нравится', Icon: Heart },
  { value: 3, label: 'Думаю', Icon: Meh },
  { value: 1, label: 'Точно нет', Icon: Trash2 },
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
  onComment,
}: {
  value: number | null;
  onChange: (value: number | null) => void;
  disabled: boolean;
  title: string;
  alwaysOpen?: boolean;
  onComment?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [preview, setPreview] = useState<number | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const dismissed = useRef(false);
  useEffect(() => {
    if (alwaysOpen) return;
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        dismissed.current = true;
        setOpen(false);
      }
    };
    document.addEventListener('keydown', escape);
    return () => document.removeEventListener('keydown', escape);
  }, [alwaysOpen]);
  const selected = ratingCategory(value);
  const SelectedIcon =
    choices.find((choice) => choice.value === selected)?.Icon || SlidersHorizontal;
  const options = (
    <div className="rating-options" role="group" aria-label={'Оценка ' + title}>
      {choices.map(({ value: score, label, Icon }) => (
        <Fragment key={score}>
          {score === 1 && onComment && (
            <button
              type="button"
              className="rating-comment-action"
              aria-label="Добавить комментарий"
              title="Добавить комментарий"
              onClick={onComment}
            >
              <MessageCircle size={18} strokeWidth={1.8} />
            </button>
          )}
          <button
            key={score}
            type="button"
            data-score={score}
            aria-label={label}
            aria-pressed={selected === score}
            disabled={disabled}
            onClick={() => onChange(selected === score ? null : score)}
            title={alwaysOpen ? label : undefined}
            onMouseEnter={() => setPreview(score)}
            onFocus={() => setPreview(score)}
          >
            <Icon size={18} strokeWidth={1.8} />
          </button>
        </Fragment>
      ))}
    </div>
  );
  if (alwaysOpen) return options;
  return (
    <div
      ref={root}
      className="personal-rating three-rating"
      data-expanded={open}
      data-score={selected ?? undefined}
      onMouseLeave={() => {
        setPreview(null);
        if (!root.current?.contains(document.activeElement)) setOpen(false);
      }}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
      }}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.stopPropagation();
          dismissed.current = true;
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
          onMouseEnter={() => {
            if (!dismissed.current) setOpen(true);
          }}
          onFocus={() => {
            if (!dismissed.current) setOpen(true);
          }}
          onClick={() => {
            dismissed.current = false;
            setOpen(true);
          }}
        >
          <SelectedIcon size={18} strokeWidth={1.8} />
        </button>
        <div className="rating-popover" inert={!open} aria-hidden={!open}>
          {options}
          <span className="rating-explanation" aria-hidden="true" key={preview ?? selected ?? 0}>
            {ratingLabel(preview ?? selected)}
          </span>
        </div>
      </div>
    </div>
  );
}
