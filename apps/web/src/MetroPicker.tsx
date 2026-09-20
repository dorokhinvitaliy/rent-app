import { useId, useLayoutEffect, useRef, useState } from 'react';
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
  const [onlySelected, setOnlySelected] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const id = useId();
  useLayoutEffect(() => {
    list.current?.scrollTo(0, 0);
  }, [query, onlySelected, open]);
  const stations = metroStations.filter((s) => s.region === region);
  const chosen = stations.filter((s) => s.ids.some((id) => selected.includes(id)));
  const filtered = (onlySelected ? chosen : stations).filter((s) =>
    normalizeMetro(s.name).includes(normalizeMetro(query)),
  );
  const toggle = (ids: number[]) =>
    onChange(
      ids.some((id) => selected.includes(id))
        ? selected.filter((id) => !ids.includes(id))
        : [...new Set([...selected, ...ids])],
    );
  const position = () => {
    if (!panel.current || !trigger.current) return;
    const rect = trigger.current.getBoundingClientRect();
    const viewport = window.visualViewport;
    const height = viewport?.height ?? innerHeight;
    const offset = viewport?.offsetTop ?? 0;
    const mobile = innerWidth <= 600;
    const width = mobile ? innerWidth - 24 : Math.min(520, innerWidth - 32);
    const spaceBelow = height + offset - rect.bottom - 16;
    const above = !mobile && spaceBelow < 320 && rect.top - offset > spaceBelow;
    Object.assign(panel.current.style, {
      width: `${width}px`,
      left: `${mobile ? 12 : Math.max(16, Math.min(rect.right - width, innerWidth - width - 16))}px`,
      top: mobile ? 'auto' : above ? 'auto' : `${rect.bottom + 8}px`,
      bottom: mobile
        ? `${Math.max(12, innerHeight - height - offset + 12)}px`
        : above
          ? `${innerHeight - rect.top + 8}px`
          : 'auto',
      maxHeight: `${mobile ? height - 24 : Math.max(200, above ? rect.top - offset - 24 : spaceBelow)}px`,
    });
  };
  useLayoutEffect(() => {
    if (!open) return;
    position();
    search.current?.focus({ preventScroll: true });
    window.addEventListener('resize', position);
    window.addEventListener('scroll', position, true);
    window.visualViewport?.addEventListener('resize', position);
    return () => {
      window.removeEventListener('resize', position);
      window.removeEventListener('scroll', position, true);
      window.visualViewport?.removeEventListener('resize', position);
    };
  }, [open]);
  const close = () => {
    panel.current?.hidePopover();
    trigger.current?.focus({ preventScroll: true });
  };
  return (
    <div className="metro-picker metro-refined">
      <button
        ref={trigger}
        type="button"
        className="metro-picker-trigger"
        aria-label="Желаемые станции метро"
        aria-expanded={open}
        aria-controls={id}
        aria-haspopup="dialog"
        onClick={() => {
          if (open) close();
          else {
            position();
            panel.current?.showPopover();
          }
        }}
      >
        <span className="metro-trigger-icon">
          <TrainFront size={20} />
        </span>
        <span className="metro-trigger-copy">
          <span>Рядом с метро</span>
          <strong>
            {chosen.length
              ? chosen
                  .slice(0, 2)
                  .map((s) => s.name)
                  .join(', ')
              : 'Выберите станции'}
          </strong>
        </span>
        {chosen.length > 0 && (
          <span className="metro-trigger-count" aria-label={`Выбрано станций: ${chosen.length}`}>
            {chosen.length}
          </span>
        )}
        <ChevronDown size={16} className="metro-trigger-chevron" />
      </button>
      <div
        ref={panel}
        id={id}
        popover="auto"
        className="metro-popover"
        role="dialog"
        aria-label="Выбор станций метро"
        onToggle={(e) => {
          const next = e.newState === 'open';
          setOpen(next);
          if (!next) {
            setQuery('');
            setOnlySelected(false);
          }
        }}
      >
        <div className="metro-popover-heading">
          <div>
            <h3>Где будем искать?</h3>
            <p>Подойдёт любая из выбранных станций</p>
          </div>
          <button
            type="button"
            className="metro-dismiss"
            aria-label="Закрыть выбор метро"
            onClick={close}
          >
            <X size={18} />
          </button>
        </div>
        <div className="metro-search-wrap">
          <label className="metro-search">
            <Search size={17} />
            <input
              ref={search}
              type="search"
              aria-label="Найти станцию метро"
              placeholder="Название станции"
              onKeyDown={(e) => {
                if (e.key === 'Enter') e.preventDefault();
              }}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>
        </div>
        <div className="metro-view-switch" role="group" aria-label="Отображение станций">
          <button type="button" aria-pressed={!onlySelected} onClick={() => setOnlySelected(false)}>
            Все станции
          </button>
          <button type="button" aria-pressed={onlySelected} onClick={() => setOnlySelected(true)}>
            Выбранные <span>{chosen.length}</span>
          </button>
        </div>
        <div ref={list} className="metro-station-list" role="group" aria-label="Станции метро">
          {filtered.map((s) => (
            <label key={s.ids[0]} className="metro-station-row">
              <span aria-hidden="true" className="metro-line-mark" style={{ color: s.color }}>
                м
              </span>
              <span>{s.name}</span>
              <input
                type="checkbox"
                checked={s.ids.some((id) => selected.includes(id))}
                onChange={() => toggle(s.ids)}
              />
            </label>
          ))}
          {!filtered.length && (
            <div className="metro-no-results">
              <TrainFront size={25} />
              <b>{query ? 'Не нашли такую станцию' : 'Пока ничего не выбрано'}</b>
              <p>
                {query
                  ? 'Проверьте название или сократите запрос'
                  : 'Отметьте подходящие станции в общем списке'}
              </p>
              <button
                type="button"
                onClick={() => {
                  setQuery('');
                  setOnlySelected(false);
                }}
              >
                Показать все станции
              </button>
            </div>
          )}
        </div>
        <div className="metro-popover-footer">
          <button
            type="button"
            className="metro-reset"
            disabled={!chosen.length}
            onClick={() => onChange([])}
          >
            Сбросить
          </button>
          <span aria-live="polite">
            {chosen.length ? `Выбрано: ${chosen.length}` : 'Любая станция'}
          </span>
          <button type="button" className="button primary" onClick={close}>
            Готово
          </button>
        </div>
      </div>
    </div>
  );
}
