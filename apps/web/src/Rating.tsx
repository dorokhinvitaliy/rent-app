import { Check, X } from 'lucide-react';
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
  const selected = levels.find((l) => l.value === value);
  return (
    <div className="personal-rating">
      <div className="rating-caption">
        <span>Моя оценка</span>
        <b>{selected ? `${value}/5 · ${selected.label}` : 'Пока без оценки'}</b>
      </div>
      <div className="rating-scale" role="group" aria-label={'Оценка ' + title}>
        {levels.map((level) => (
          <button
            type="button"
            key={level.value}
            style={{ '--rating-color': level.color } as React.CSSProperties}
            aria-label={`${level.value} из 5 — ${level.label}`}
            title={`${level.value} из 5 — ${level.label}`}
            aria-pressed={value === level.value}
            disabled={disabled}
            onClick={() => onChange(level.value)}
          >
            <i />
            {value === level.value ? (
              <Check size={13} strokeWidth={2.5} />
            ) : (
              <span>{level.value}</span>
            )}
          </button>
        ))}
        <button
          type="button"
          className="rating-clear"
          aria-label="Сбросить оценку"
          title="Сбросить оценку"
          disabled={disabled || value === null}
          onClick={() => onChange(null)}
        >
          <X size={13} />
        </button>
      </div>
    </div>
  );
}
