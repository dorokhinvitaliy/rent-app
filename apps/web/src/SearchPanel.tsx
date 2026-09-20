import { Select } from './Select';
import { useState, type FormEvent } from 'react';
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
const key = 'mesto-search-criteria-v1';
export function SearchPanel({
  job,
  running,
  onStarted,
  onCancel,
}: {
  job?: Job;
  running: boolean;
  onStarted: (job: Job) => void;
  onCancel: (id: string) => void;
}) {
  const [criteria, setCriteria] = useState<CianSearch>(() => {
    try {
      const saved = localStorage.getItem(key);
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
  const parsed = cianSearchSchema.safeParse(criteria);
  const preview = parsed.success ? buildCianSearchUrl(parsed.data) : null;
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    if (!parsed.success) {
      setError(parsed.error.issues.map((x) => x.message).join('. '));
      return;
    }
    setBusy(true);
    try {
      const result = await api<Job>('/search/cian', 'POST', parsed.data);
      try {
        localStorage.setItem(key, JSON.stringify(parsed.data));
      } catch {}
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
            placeholder="Не важно"
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
            placeholder="Не важно"
          />
        </label>
      </div>
    </fieldset>
  );
  return (
    <section className="search-panel" id="cian-search" aria-label="Поиск квартир на Циане">
      <div className="search-panel-heading">
        <div>
          <span className="search-overline">
            <i />
            ПОИСК НА ЦИАНЕ
          </span>
          <h2>Квартира по вашим правилам.</h2>
          <p>Выберите главное. Подходящие объявления соберем в вашу подборку.</p>
        </div>
        <span className="search-platform">
          Циан <ArrowUpRight size={15} />
        </span>
      </div>
      <form onSubmit={submit}>
        <div className="search-main-fields">
          <label className="field">
            Город
            <Select
              aria-label="Город"
              value={criteria.region}
              onChange={(e) => change('region', e.target.value as CianSearch['region'])}
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
            Пешком до метро
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
          <small>{criteria.rooms.length ? 'Можно выбрать несколько' : 'Любое количество'}</small>
          <button
            type="button"
            className="search-more"
            aria-expanded={expanded}
            onClick={() => setExpanded(!expanded)}
          >
            <SlidersHorizontal size={16} />
            Еще параметры
          </button>
        </div>
        {expanded && (
          <div className="search-extra">
            <label className="field">
              Минимальный этаж
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
              Собрать до
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
              Просмотреть до
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
          <p>
            Объявления напрямую с Циана.
            <br />
            <span>Если появится капча, пройдите ее в открывшемся браузере.</span>
          </p>
          <div>
            {preview && (
              <a href={preview} target="_blank" rel="noreferrer">
                Посмотреть поиск на Циане <ArrowUpRight size={14} />
              </a>
            )}
            <button className="button primary" disabled={busy || running}>
              {busy || running ? <LoaderCircle size={18} className="spin" /> : <Search size={18} />}{' '}
              {running ? 'Поиск выполняется' : 'Найти квартиры'}
            </button>
          </div>
        </div>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
      </form>
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
            {job.warnings.length > 0 && (
              <details>
                <summary>Подробности проверки ({job.warnings.length})</summary>
                {job.warnings.map((w, i) => (
                  <p key={i}>{w}</p>
                ))}
              </details>
            )}
          </div>
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
