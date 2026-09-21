import { createPortal } from 'react-dom';
import { useAuth } from './Auth';
import { MetroPicker } from './MetroPicker';
import { Select } from './Select';
import { RoomSelect } from './RoomSelect';
import { useEffect, useState, useRef, type FormEvent } from 'react';
import { Search, ArrowUpRight, LoaderCircle, SlidersHorizontal } from 'lucide-react';
import { cianSearchSchema, buildCianSearchUrl, searchCities, type CianSearch } from '@rent/shared';
import { api, type Job } from './api';
const legacyKey = 'mesto-search-criteria-v1';
export function SearchPanel({
  searching,
  onStarted,
  onSearch,
  onQuery,
  localCount,
  onClearSearch,
}: {
  searching: boolean;
  onQuery: (query: string) => void;
  onSearch: (criteria: CianSearch) => void;
  localCount: number | null;
  onClearSearch: () => void;
  onStarted: (job: Job) => void;
}) {
  const { user } = useAuth();
  const key = legacyKey + ':' + (user?.id || 'guest');
  const [footer, setFooter] = useState<HTMLElement | null>(null);
  useEffect(() => {
    setFooter(document.getElementById('load-more-cian'));
  }, []);
  const panelRef = useRef<HTMLElement>(null);
  const [compact, setCompact] = useState(false);
  const [headerSlot, setHeaderSlot] = useState<HTMLElement | null>(null);
  useEffect(() => {
    setHeaderSlot(document.getElementById('compact-search-slot'));
    const observer = new IntersectionObserver(
      ([entry]) => {
        setCompact(!entry.isIntersecting && entry.boundingClientRect.bottom <= 72);
      },
      { rootMargin: '-72px 0px 0px 0px', threshold: 0 },
    );
    if (panelRef.current) observer.observe(panelRef.current);
    return () => observer.disconnect();
  }, []);
  const [criteria, setCriteria] = useState<CianSearch>(() => {
    try {
      const saved = localStorage.getItem(key) || localStorage.getItem(legacyKey);
      if (saved) {
        const parsed = cianSearchSchema.safeParse(JSON.parse(saved));
        if (parsed.success)
          return { ...parsed.data, limit: 10, pages: 3, onlyNew: true, source: 'all' };
      }
    } catch {}
    return cianSearchSchema.parse({});
  });
  // Restore the form and the applied local filter together, without starting a parser job.
  useEffect(() => {
    try {
      const saved = localStorage.getItem(key) || localStorage.getItem(legacyKey);
      if (saved && cianSearchSchema.safeParse(JSON.parse(saved)).success) onSearch(criteria);
      else onClearSearch();
    } catch {}
  }, []);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const change = <K extends keyof CianSearch>(field: K, value: CianSearch[K]) =>
    setCriteria((prev) => ({ ...prev, [field]: value }));
  useEffect(() => {
    if (!cianSearchSchema.safeParse(criteria).success) return;
    try {
      localStorage.setItem(key, JSON.stringify(criteria));
    } catch {}
  }, [criteria]);
  const parsed = cianSearchSchema.safeParse(criteria);
  const preview = parsed.success ? buildCianSearchUrl(parsed.data) : null;
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!parsed.success) {
      setError(parsed.error.issues.map((x) => x.message).join('. '));
      return;
    }
    setError('');
    onSearch(parsed.data);
    setBusy(true);

    try {
      const result = await api<{ reason: string; job: Job | null }>('/search', 'POST', parsed.data);

      if (result.job) onStarted(result.job);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const fresh = async () => {
    setError('');
    if (!parsed.success) {
      setError(parsed.error.issues.map((x) => x.message).join('. '));
      return;
    }
    setBusy(true);
    try {
      onSearch(parsed.data);
      const result = await api<Job>('/search/cian', 'POST', parsed.data);
      onStarted(result);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const range = (label: string, min: 'minRent' | 'minArea', max: 'maxRent' | 'maxArea') => (
    <div className="search-range" role="group" aria-label={label}>
      <span className="field-caption">{label}</span>
      <div className="range-control">
        <label className="range-half">
          <span>От</span>
          <input
            aria-label={label + ' от'}
            type="number"
            inputMode="decimal"
            min="0"
            max={min === 'minArea' ? 1000 : 10000000}
            step={min === 'minArea' ? '0.1' : '1'}
            value={criteria[min] ?? ''}
            onChange={(e) => change(min, e.target.value === '' ? null : Number(e.target.value))}
            placeholder="—"
          />
        </label>
        <label className="range-half">
          <span>До</span>
          <input
            aria-label={label + ' до'}
            type="number"
            inputMode="decimal"
            min="0"
            max={min === 'minArea' ? 1000 : 10000000}
            step={min === 'minArea' ? '0.1' : '1'}
            value={criteria[max] ?? ''}
            onChange={(e) => change(max, e.target.value === '' ? null : Number(e.target.value))}
            placeholder="—"
          />
        </label>
      </div>
    </div>
  );
  return (
    <section
      ref={panelRef}
      className="search-panel home-search"
      id="cian-search"
      aria-label="Поиск квартир на Циане"
    >
      <div className="search-panel-heading">
        <div>
          <h2>Найти квартиру</h2>
          <p>Выберите, что важно. Мы найдём подходящие варианты и проверим свежие предложения.</p>
        </div>
        {preview && (
          <a
            aria-label="Посмотреть поиск на Циане"
            className="search-platform"
            href={preview}
            target="_blank"
            rel="noreferrer"
            title="Открыть поиск на Циане"
          >
            Циан <ArrowUpRight size={15} />
          </a>
        )}
      </div>
      <form onSubmit={submit}>
        <label className="unified-search-query search-field">
          <Search size={18} />
          <input
            aria-label="Поиск по адресу или метро"
            value={criteria.query}
            onChange={(e) => {
              change('query', e.target.value);
              onQuery(e.target.value);
            }}
            placeholder="Адрес или район"
            maxLength={120}
          />
        </label>
        <div className="home-search-groups">
          <section className="home-search-group" aria-label="Расположение">
            <h3>Расположение</h3>
            <label className="field">
              <span className="field-caption">Город</span>
              <Select
                aria-label="Город"
                value={criteria.region}
                onChange={(e) =>
                  setCriteria((prev) => ({
                    ...prev,
                    region: e.target.value as CianSearch['region'],
                    metroStations: [],
                  }))
                }
              >
                {Object.entries(searchCities).map(([id, name]) => (
                  <option key={id} value={id}>
                    {name}
                  </option>
                ))}
              </Select>
            </label>
            <MetroPicker
              key={criteria.region}
              region={criteria.region}
              selected={criteria.metroStations}
              onChange={(ids) => change('metroStations', ids)}
            />
            <label className="field">
              <span className="field-caption">Пешком до метро</span>
              <Select
                aria-label="Пешком до метро"
                value={criteria.metroMinutes ?? ''}
                onChange={(e) =>
                  change('metroMinutes', e.target.value === '' ? null : Number(e.target.value))
                }
              >
                <option value="">Не важно</option>
                {[5, 10, 15, 20, 30].map((m) => (
                  <option key={m} value={m}>
                    До {m} минут
                  </option>
                ))}
              </Select>
            </label>
          </section>
          <section className="home-search-group" aria-label="Квартира">
            <h3>Квартира</h3>
            <div className="search-rooms">
              <span>Комнат</span>
              <div>
                {[0, 1, 2, 3, 4, 5].map((n) => (
                  <button
                    type="button"
                    aria-pressed={criteria.rooms.includes(n)}
                    key={n}
                    onClick={() =>
                      change(
                        'rooms',
                        criteria.rooms.includes(n)
                          ? criteria.rooms.filter((r) => r !== n)
                          : [...criteria.rooms, n],
                      )
                    }
                  >
                    {n === 0 ? 'Студия' : n}
                  </button>
                ))}
              </div>
            </div>
            {range('Площадь, м²', 'minArea', 'maxArea')}
            <label className="field">
              <span className="field-caption">Минимальный этаж</span>
              <input
                type="number"
                min="1"
                max="200"
                value={criteria.minFloor ?? ''}
                placeholder="Любой"
                onChange={(e) =>
                  change('minFloor', e.target.value === '' ? null : Number(e.target.value))
                }
              />
            </label>
          </section>
          <section className="home-search-group" aria-label="Бюджет">
            <h3>Бюджет</h3>
            {range('Аренда в месяц, ₽', 'minRent', 'maxRent')}
            <label className="field">
              <span className="field-caption">На въезд до, ₽</span>
              <input
                type="number"
                min="0"
                value={criteria.maxMoveIn ?? ''}
                onChange={(e) =>
                  change('maxMoveIn', e.target.value ? Number(e.target.value) : null)
                }
                placeholder="Без ограничений"
              />
            </label>
            <label className="check-label">
              <input
                type="checkbox"
                checked={criteria.noCommission}
                onChange={(e) => change('noCommission', e.target.checked)}
              />
              <span>
                Без комиссии<small>Без оплаты услуг агента</small>
              </span>
            </label>
          </section>
        </div>
        <div className="search-footer">
          <button
            type="button"
            className="text-button search-reset"
            onClick={() => {
              onClearSearch();
              setCriteria(cianSearchSchema.parse({}));
            }}
          >
            Сбросить условия
          </button>
          <div>
            <button className="button primary" disabled={busy}>
              {busy ? <LoaderCircle size={18} className="spin" /> : <Search size={18} />} Найти
              квартиры
            </button>
          </div>
        </div>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
      </form>
      {compact &&
        headerSlot &&
        createPortal(
          <form className="compact-search" aria-label="Быстрый поиск квартир" onSubmit={submit}>
            <Select
              aria-label="Город поиска"
              className="compact-city"
              value={criteria.region}
              onChange={(e) =>
                setCriteria((prev) => ({
                  ...prev,
                  region: e.target.value as CianSearch['region'],
                  metroStations: [],
                }))
              }
            >
              {Object.entries(searchCities).map(([id, name]) => (
                <option key={id} value={id}>
                  {name}
                </option>
              ))}
            </Select>
            <RoomSelect value={criteria.rooms} onChange={(rooms) => change('rooms', rooms)} />
            <label className="compact-price">
              <input
                aria-label="Аренда до"
                type="number"
                min="0"
                placeholder="Бюджет до"
                value={criteria.maxRent ?? ''}
                onChange={(e) => change('maxRent', e.target.value ? Number(e.target.value) : null)}
              />
              <span>₽</span>
            </label>
            <MetroPicker
              triggerLabel="Метро в быстром поиске"
              key={'compact-' + criteria.region}
              region={criteria.region}
              selected={criteria.metroStations}
              onChange={(ids) => change('metroStations', ids)}
            />
            <label className="compact-commission">
              <input
                type="checkbox"
                checked={criteria.noCommission}
                onChange={(e) => change('noCommission', e.target.checked)}
              />
              Без комиссии
            </label>
            <button
              type="button"
              className="compact-all"
              aria-label="Все условия поиска"
              title="Все условия поиска"
              onClick={() =>
                panelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
              }
            >
              <SlidersHorizontal size={17} />
            </button>
            <button
              type="submit"
              className="compact-submit"
              aria-label="Найти по условиям"
              disabled={busy}
            >
              {busy ? <LoaderCircle className="spin" size={17} /> : <Search size={17} />}
            </button>
          </form>,
          headerSlot,
        )}
      {footer &&
        createPortal(
          <button
            className="button secondary"
            disabled={busy || searching || !['all', 'cian'].includes(criteria.source)}
            onClick={() => void fresh()}
          >
            {busy ? <LoaderCircle size={18} className="spin" /> : <Search size={18} />}
            Ещё загрузить с Циана
          </button>,
          footer,
        )}
    </section>
  );
}
