import { useAuth } from './Auth';
import { MetroPicker } from './MetroPicker';
import { Select } from './Select';
import { useEffect, useState, type FormEvent } from 'react';
import {
  Search,
  ArrowUpRight,
  LoaderCircle,
  SlidersHorizontal,
  CheckCircle2,
  X,
} from 'lucide-react';
import { cianSearchSchema, buildCianSearchUrl, searchCities, type CianSearch } from '@rent/shared';
import { api, type Job } from './api';
const legacyKey = 'mesto-search-criteria-v1';
export function SearchPanel({
  job,
  running,
  onStarted,
  onCancel,
  onOpenBrowser,
  onSearch,
  localCount,
  onClearSearch,
}: {
  onSearch: (criteria: CianSearch) => void;
  localCount: number | null;
  onClearSearch: () => void;
  job?: Job;
  running: boolean;
  onStarted: (job: Job) => void;
  onCancel: (id: string) => void;
  onOpenBrowser: (id: string) => void;
}) {
  const { user } = useAuth();
  const key = legacyKey + ':' + (user?.id || 'guest');
  const [searched, setSearched] = useState('');
  const [criteria, setCriteria] = useState<CianSearch>(() => {
    try {
      const saved = localStorage.getItem(key) || localStorage.getItem(legacyKey);
      if (saved) {
        const parsed = cianSearchSchema.safeParse(JSON.parse(saved));
        if (parsed.success) return parsed.data;
      }
    } catch {}
    return cianSearchSchema.parse({});
  });
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [expanded, setExpanded] = useState(false);
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
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!parsed.success) {
      setError(parsed.error.issues.map((x) => x.message).join('. '));
      return;
    }
    setError('');
    onSearch(parsed.data);
    setSearched(JSON.stringify(criteria));
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
    <fieldset className="search-range">
      <legend>{label}</legend>
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
    </fieldset>
  );
  return (
    <section className="search-panel" id="cian-search" aria-label="Поиск квартир на Циане">
      <div className="search-panel-heading">
        <div>
          <h2>Найти квартиру</h2>
          <p>Сначала найдём в нашей базе. При необходимости загрузим свежие с Циана.</p>
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
        <div className="search-main-fields">
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
          {range('Аренда в месяц, ₽', 'minRent', 'maxRent')}
          {range('Площадь, м²', 'minArea', 'maxArea')}
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
        </div>
        <div className="search-secondary-fields">
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
          <MetroPicker
            key={criteria.region}
            region={criteria.region}
            selected={criteria.metroStations}
            onChange={(ids) => change('metroStations', ids)}
          />
        </div>
        <div className="search-options-row">
          <button
            type="button"
            className="search-more"
            aria-expanded={expanded}
            onClick={() => setExpanded(!expanded)}
          >
            <SlidersHorizontal size={16} />
            Еще параметры
            {(criteria.noCommission || criteria.minFloor != null) && (
              <b className="search-extra-count">
                {Number(criteria.noCommission) + Number(criteria.minFloor != null)}
              </b>
            )}
          </button>
          <span>Выбранные параметры сохраняются автоматически</span>
        </div>
        {expanded && (
          <div className="search-extra">
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
            <label className="field">
              <span className="field-caption">Собрать до</span>
              <Select
                aria-label="Собрать до"
                value={criteria.limit}
                onChange={(e) => change('limit', Number(e.target.value))}
              >
                {[5, 10, 20, 30].map((v) => (
                  <option key={v} value={v}>
                    {v} квартир
                  </option>
                ))}
              </Select>
            </label>
            <label className="field">
              <span className="field-caption">Просмотреть до</span>
              <Select
                aria-label="Просмотреть до"
                value={criteria.pages}
                onChange={(e) => change('pages', Number(e.target.value))}
              >
                {[1, 2, 3].map((v) => (
                  <option key={v} value={v}>
                    {v} стр.
                  </option>
                ))}
              </Select>
            </label>
            <label className="check-label">
              <input
                type="checkbox"
                checked={criteria.noCommission}
                onChange={(e) => change('noCommission', e.target.checked)}
              />
              Без комиссии
            </label>
          </div>
        )}
        <div className="search-footer">
          <label className="search-only-new check-label">
            <input
              type="checkbox"
              checked={criteria.onlyNew}
              onChange={(e) => change('onlyNew', e.target.checked)}
            />
            <span>
              Искать только новые объявления
              <small>Снимите отметку, чтобы обновить сохранённые</small>
            </span>
          </label>
          <div>
            <button className="button primary">
              <Search size={18} /> Найти квартиры
            </button>
          </div>
        </div>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
      </form>
      {searched === JSON.stringify(criteria) && localCount !== null && (
        <div className="database-search-result" role="status">
          <div>
            <b>
              {localCount ? `В нашей базе: ${localCount}` : 'В базе пока нет подходящих квартир'}
            </b>
            <p>
              {localCount < 10
                ? 'Мало вариантов? Проверим свежие объявления на Циане.'
                : 'Можно посмотреть результаты или дополнить их свежими объявлениями.'}
            </p>
            <button
              type="button"
              className="text-button"
              onClick={() => {
                onClearSearch();
                setSearched('');
              }}
            >
              Показать всю базу
            </button>
          </div>
          <button
            type="button"
            className="button secondary"
            disabled={busy || running}
            onClick={() => void fresh()}
          >
            {busy || running ? <LoaderCircle size={16} className="spin" /> : <Search size={16} />}{' '}
            {running ? 'Поиск выполняется' : 'Найти свежие объявления'}
          </button>
        </div>
      )}
      {job && (
        <div
          className={'search-progress ' + (job.status === 'failed' ? 'failed' : '')}
          role="status"
        >
          {['running', 'waiting'].includes(job.status) ? (
            <LoaderCircle size={20} className="spin" />
          ) : job.status === 'failed' ? (
            <X size={20} />
          ) : (
            <CheckCircle2 size={20} />
          )}
          <div>
            <b>{job.message}</b>
            <p>
              Просмотрено: {job.scanned ?? 0} · Подошло: {job.count} · Не подтверждено / не подошло:{' '}
              {job.skipped ?? 0}
            </p>
            {job.added !== undefined && (
              <p>
                Новых: {job.added} · Обновлено: {job.updated ?? 0} · Уже в подборке, пропущено:{' '}
                {job.alreadySaved ?? 0}
              </p>
            )}
            {job.warnings.length > 0 && (
              <details>
                <summary>Подробности проверки ({job.warnings.length})</summary>
                {job.warnings.map((w, i) => (
                  <p key={i}>{w}</p>
                ))}
              </details>
            )}
          </div>
          {job.canOpenBrowser && (
            <button
              type="button"
              className="button secondary"
              onClick={() => onOpenBrowser(job.id)}
            >
              Открыть окно проверки
            </button>
          )}
          {['running', 'waiting'].includes(job.status) && (
            <button type="button" onClick={() => onCancel(job.id)}>
              Остановить
            </button>
          )}
        </div>
      )}
    </section>
  );
}
