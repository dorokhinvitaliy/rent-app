import { useEffect, useId, useRef, useState, type CSSProperties } from 'react';
import { SlidersHorizontal, X } from 'lucide-react';
const levels = [
  { value: 5, label: 'Отличный вариант', color: '#32996b' },
  { value: 4, label: 'Нравится', color: '#92ad59' },
  { value: 3, label: 'Нужно подумать', color: '#d0ad50' },
  { value: 2, label: 'Есть сомнения', color: '#d88650' },
  { value: 1, label: 'Не подходит', color: '#c96868' },
];
export function Rating({
  value,
  onChange,
  disabled,
  title,
}: {
  value: number | null;
  onChange: (v: number | null) => void;
  disabled: boolean;
  title: string;
}) {
  const [hovered, setHovered] = useState(false);
  const [open, setOpen] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [preview, setPreview] = useState<number | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const id = useId();
  const shown = open || (hovered && !dismissed);
  const selected = levels.find((l) => l.value === value);
  const active = levels.find((l) => l.value === (preview ?? value));
  useEffect(() => {
    if (!hovered) {
      setDismissed(false);
      setPreview(null);
      if (!root.current?.querySelector(':focus-visible')) setOpen(false);
    }
  }, [hovered]);
  useEffect(() => {
    if (!open) return;
    const outside = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', outside);
    return () => document.removeEventListener('pointerdown', outside);
  }, [open]);
  useEffect(() => {
    if (!shown) return;
    const escape = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      setOpen(false);
      setDismissed(true);
      setPreview(null);
      trigger.current?.focus();
    };
    document.addEventListener('keydown', escape);
    return () => document.removeEventListener('keydown', escape);
  }, [shown]);
  return (
    <div
      className="personal-rating"
      data-expanded={shown}
      ref={root}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.stopPropagation();
          setOpen(false);
          setDismissed(true);
          setPreview(null);
          trigger.current?.focus();
        }
      }}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) {
          setOpen(false);
          setPreview(null);
        }
      }}
    >
      <div
        className="rating-island"
        onPointerEnter={(e) => {
          if (e.pointerType === 'mouse') setHovered(true);
        }}
        onPointerLeave={() => setHovered(false)}
      >
        <button
          ref={trigger}
          type="button"
          className="rating-summary"
          aria-expanded={shown}
          aria-controls={id}
          onClick={() => {
            setOpen(!open);
            setDismissed(open);
          }}
          aria-label={'Оценить ' + title}
          title={selected ? `${value}/5 · ${selected.label}` : 'Оценить вариант'}
        >
          {selected ? (
            <i style={{ background: selected.color }} />
          ) : (
            <SlidersHorizontal size={13} />
          )}
          {selected && (
            <span>
              {value}
              <small>/5</small>
            </span>
          )}
          <span className="rating-live-label">{active?.label || 'Моя оценка'}</span>
        </button>
        <div className="rating-popover" hidden={!shown} id={id} onFocus={() => setOpen(true)}>
          <div className="rating-popover-heading">
            <button
              type="button"
              className="rating-clear"
              aria-label="Сбросить оценку"
              title="Сбросить оценку"
              disabled={disabled || value === null}
              onClick={() => onChange(null)}
            >
              <X size={14} />
            </button>
          </div>
          <div
            className="rating-thermometer"
            role="group"
            aria-label={'Оценка ' + title}
            onMouseLeave={() => setPreview(null)}
          >
            {levels.map((level) => (
              <button
                type="button"
                key={level.value}
                style={{ '--rating-color': level.color } as CSSProperties}
                aria-label={`${level.value} из 5 — ${level.label}`}
                aria-pressed={value === level.value}
                disabled={disabled}
                onMouseEnter={() => setPreview(level.value)}
                onFocus={() => setPreview(level.value)}
                onClick={() => onChange(level.value)}
                data-preview={preview === level.value}
              >
                <i />
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
