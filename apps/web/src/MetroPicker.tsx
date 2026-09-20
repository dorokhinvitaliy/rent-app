import { useId, useState } from 'react';
import { ChevronDown, Search, X, TrainFront } from 'lucide-react';
import { metroStations, normalizeMetro, type CianSearch } from '@rent/shared';

export function MetroPicker({
  region,
  selected,
  onChange,
}: {
  region: CianSearch['region'];
  selected: number[];
  onChange: (ids: number[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const id = useId();
  const stations = metroStations.filter((s) => s.region === region);
  const chosen = stations.filter((s) => s.ids.some((id) => selected.includes(id)));
  const filtered = stations.filter((s) => normalizeMetro(s.name).includes(normalizeMetro(query)));
  const toggle = (ids: number[]) =>
    onChange(
      ids.some((id) => selected.includes(id))
        ? selected.filter((id) => !ids.includes(id))
        : [...new Set([...selected, ...ids])],
    );
  return (
    <div
      className="metro-picker"
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          setOpen(false);
          e.stopPropagation();
        }
      }}
    >
      <button
        type="button"
        className="metro-picker-trigger"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen(!open)}
      >
        <TrainFront size={18} />
        <span>Желаемые станции метро</span>
        <small>{chosen.length ? `Выбрано: ${chosen.length}` : 'Любые станции'}</small>
        <ChevronDown size={16} />
      </button>
      {chosen.length > 0 && (
        <div className="metro-chips">
          {(open ? chosen : chosen.slice(0, 2)).map((s) => (
            <button
              type="button"
              key={s.ids[0]}
              onClick={() => toggle(s.ids)}
              aria-label={`Убрать станцию ${s.name}`}
            >
              <i style={{ backgroundColor: s.color }} />
              {s.name}
              <X size={13} />
            </button>
          ))}
          {!open && chosen.length > 2 && (
            <button type="button" className="metro-overflow" onClick={() => setOpen(true)}>
              Ещё {chosen.length - 2}
            </button>
          )}
          {open && (
            <button type="button" className="metro-clear" onClick={() => onChange([])}>
              Очистить
            </button>
          )}
        </div>
      )}
      {open && (
        <div className="metro-picker-panel" id={id}>
          <label className="metro-search">
            <Search size={17} />
            <input
              autoFocus
              type="search"
              aria-label="Найти станцию метро"
              placeholder="Начните вводить название станции"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>
          <div className="metro-options" role="group" aria-label="Станции метро">
            {filtered.map((s) => (
              <label key={s.ids[0]} className="metro-option">
                <input
                  type="checkbox"
                  checked={s.ids.some((id) => selected.includes(id))}
                  onChange={() => toggle(s.ids)}
                />
                <i style={{ backgroundColor: s.color }} />
                <span>{s.name}</span>
              </label>
            ))}
            {!filtered.length && (
              <p className="metro-empty">Станция не найдена. Попробуйте другое название.</p>
            )}
          </div>
          <div className="metro-picker-footer">
            <span>
              Подойдет любая выбранная станция.
              <br />
              Время пешком задается выше.
            </span>
            <button type="button" className="button secondary" onClick={() => setOpen(false)}>
              Готово
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
