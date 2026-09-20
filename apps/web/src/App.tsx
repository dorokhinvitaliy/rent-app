import { Select } from './Select';
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import {
  ArrowDownToLine,
  ArrowRight,
  ArrowUpRight,
  Building2,
  Calculator,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Database,
  Heart,
  House,
  LayoutGrid,
  Link2,
  LoaderCircle,
  MapPin,
  Plus,
  Search,
  SlidersHorizontal,
  Sparkles,
  SquareArrowOutUpRight,
  Trash2,
  X,
  FileCode2,
  Globe,
  Layers3,
  ImageOff,
} from 'lucide-react';
import { costs, sourceNames, listingSchema, type Listing, type ListingInput } from '@rent/shared';
import { api, type Job } from './api';
import { SearchPanel } from './SearchPanel';
const rub = (n: number) =>
  new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 }).format(n) + ' ₽';
const plural = (n: number, one: string, few: string, many: string) => {
  const form = new Intl.PluralRules('ru').select(n);
  return form === 'one' ? one : form === 'few' ? few : many;
};
const cx = (...v: (string | false | undefined)[]) => v.filter(Boolean).join(' ');
const statusNames: Record<string, string> = {
  running: 'В процессе',
  waiting: 'Ожидает проверки',
  done: 'Завершен',
  partial: 'С замечаниями',
  failed: 'Ошибка',
  cancelled: 'Отменен',
};
const initial = listingSchema.parse({ title: 'Новая квартира', rent: 60000 });
function IconButton({
  label,
  onClick,
  children,
  active = false,
}: {
  label: string;
  onClick: () => void;
  children: ReactNode;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      className={cx('icon-button', active && 'active')}
      onClick={onClick}
    >
      {children}
    </button>
  );
}
function Photo({ src, alt, className = '' }: { src?: string; alt: string; className?: string }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [src]);
  return !src || failed ? (
    <div className={'photo-placeholder ' + className}>
      <ImageOff size={30} />
      <span>Фотография недоступна</span>
    </div>
  ) : (
    <img
      className={className}
      src={src}
      alt={alt}
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
    />
  );
}
function Modal({
  title,
  onClose,
  children,
  wide = false,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current!;
    d.showModal();
    return () => d.close();
  }, []);
  return (
    <dialog
      ref={ref}
      className={cx('modal', wide && 'wide')}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal-inner">
        <div className="modal-head">
          <h2>{title}</h2>
          <IconButton label="Закрыть" onClick={onClose}>
            <X size={20} />
          </IconButton>
        </div>
        {children}
      </div>
    </dialog>
  );
}
export default function App() {
  const [resultsOnly, setResultsOnly] = useState(false);
  const [searchJobId, setSearchJobId] = useState<string | null>(null);
  const [listings, setListings] = useState<Listing[]>([]),
    [jobs, setJobs] = useState<Job[]>([]),
    [view, setView] = useState('all'),
    [query, setQuery] = useState(''),
    [source, setSource] = useState('all'),
    [rooms, setRooms] = useState('all'),
    [maxPrice, setMaxPrice] = useState(''),
    [maxEntry, setMaxEntry] = useState(''),
    [sort, setSort] = useState('new'),
    [filters, setFilters] = useState(false),
    [noFee, setNoFee] = useState(false);
  const [loading, setLoading] = useState(true),
    [loadError, setLoadError] = useState(''),
    [notice, setNotice] = useState(''),
    [importOpen, setImportOpen] = useState(false),
    [edit, setEdit] = useState<Listing | null | 'new'>(null),
    [detail, setDetail] = useState<string | null>(null),
    [busy, setBusy] = useState(false),
    [months, setMonths] = useState(12),
    [selected, setSelected] = useState<string[]>([]),
    [compare, setCompare] = useState(false),
    [confirmDelete, setConfirmDelete] = useState<Listing | null>(null);
  const refresh = async () => {
    try {
      const [ls, js] = await Promise.all([api<Listing[]>('/listings'), api<Job[]>('/imports')]);
      setListings(ls);
      setJobs(js);
      setLoadError('');
    } catch (e) {
      setLoadError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    void refresh();
    const t = setInterval(() => void refresh(), 4000);
    return () => clearInterval(t);
  }, []);
  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(''), 6500);
    return () => clearTimeout(t);
  }, [notice]);
  const action = async (fn: () => Promise<unknown>, message?: string) => {
    setBusy(true);
    try {
      await fn();
      await refresh();
      if (message) setNotice(message);
    } catch (e) {
      setNotice((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const favorites = listings.filter((l) => l.favorite),
    demo = listings.some((l) => l.demo);
  const searchJob = jobs.find((j) => j.id === searchJobId);
  const running = jobs.some((j) => ['running', 'waiting'].includes(j.status));
  const visible = listings
    .filter(
      (l) =>
        (view !== 'favorites' || l.favorite) &&
        (view !== 'all' ||
          !resultsOnly ||
          !searchJobId ||
          (searchJob?.listingIds || []).includes(l.id)) &&
        (source === 'all' || l.source === source) &&
        (rooms === 'all' || (rooms === '3+' ? (l.rooms ?? -1) >= 3 : l.rooms === Number(rooms))) &&
        (!maxPrice || l.rent <= Number(maxPrice)) &&
        (!maxEntry || costs(l).moveIn <= Number(maxEntry)) &&
        (!noFee || l.commission === 0) &&
        `${l.title} ${l.address} ${l.metro}`.toLowerCase().includes(query.toLowerCase()),
    )
    .sort((a, b) =>
      sort === 'rent'
        ? a.rent - b.rent
        : sort === 'entry'
          ? costs(a).moveIn - costs(b).moveIn
          : b.createdAt.localeCompare(a.createdAt),
    );
  const current = listings.find((l) => l.id === detail);
  const toggle = (l: Listing) =>
    action(() => api('/listings/' + l.id, 'PATCH', { favorite: !l.favorite }));
  const reset = () => {
    setSource('all');
    setRooms('all');
    setMaxPrice('');
    setMaxEntry('');
    setNoFee(false);
    setQuery('');
  };
  const download = async (ids: string[]) => {
    try {
      const res = await fetch(
        '/api/export.xlsx?' + new URLSearchParams({ ids: ids.join(','), months: String(months) }),
      );
      if (!res.ok) throw new Error('Не удалось создать XLSX');
      const url = URL.createObjectURL(await res.blob());
      const a = document.createElement('a');
      a.href = url;
      a.download = 'mesto-apartments.xlsx';
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setNotice('Таблица XLSX скачана');
    } catch (e) {
      setNotice((e as Error).message);
    }
  };
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a className="brand" href="/" aria-label="Место — главная">
          <span className="brand-icon">
            <House size={22} strokeWidth={2.1} />
          </span>
          место<span className="brand-dot">.</span>
        </a>
        <div className="workspace">
          <span className="workspace-icon">М</span>
          <div>
            <b>Мой поиск</b>
            <small>Личное пространство</small>
          </div>
        </div>
        <div className="nav-caption">ПРОСТРАНСТВО</div>
        <nav>
          {[
            ['all', 'Все квартиры', LayoutGrid, listings.length],
            ['favorites', 'Избранное', Heart, favorites.length],
            ['imports', 'Источники и импорт', Layers3, null],
          ].map(([key, label, Icon, count]) => {
            const I = Icon as typeof House;
            return (
              <button
                key={String(key)}
                className={cx('nav-item', view === key && 'chosen')}
                onClick={() => setView(String(key))}
              >
                <I size={19} />
                <span>{String(label)}</span>
                {count !== null && <small>{String(count)}</small>}
              </button>
            );
          })}
        </nav>
        <div className="sidebar-tip">
          <span className="tip-icon">
            <Sparkles size={19} />
          </span>
          <h3>Найти свое место</h3>
          <p>
            Собирайте варианты вместе.
            <br />
            Сравнивайте полную стоимость.
            <br />
            Выбирайте без спешки.
          </p>
          <button onClick={() => setImportOpen(true)}>
            Добавить квартиру <ArrowUpRight size={15} />
          </button>
        </div>
        <div className="local-status">
          <span className="status-dot" />
          <div>
            <b>Локальное хранилище</b>
            <small>Ваши данные — на вашем устройстве</small>
          </div>
          <Database size={16} />
        </div>
        <div className="profile">
          <span>В</span>
          <div>
            <b>Ваше пространство</b>
            <small>Локальная версия · 0.1</small>
          </div>
        </div>
      </aside>
      <main>
        <header className="topbar">
          <div>
            Мой поиск <ChevronRight size={14} />{' '}
            <span>
              {view === 'imports'
                ? 'Источники и импорт'
                : view === 'favorites'
                  ? 'Избранное'
                  : 'Все квартиры'}
            </span>
          </div>
          <span className="privacy">
            <span className="status-dot" /> Сохранено локально
          </span>
        </header>
        <div className="page">
          <div className="page-heading">
            <div className="heading-copy">
              <div className="eyebrow">ВАШ ЛИЧНЫЙ ПОИСК ЖИЛЬЯ</div>
              <h1>
                {view === 'imports'
                  ? 'Все источники. Одно место.'
                  : view === 'favorites'
                    ? 'Ближе к своему дому.'
                    : 'Найдите свое место.'}
              </h1>
              <p>
                {view === 'imports'
                  ? 'Соберите квартиры с разных площадок в одну понятную подборку.'
                  : 'Квартиры, которые вам подходят. Стоимость, в которой всё понятно.'}
              </p>
            </div>
            <div className="heading-actions">
              {view !== 'imports' && (
                <button
                  className="button secondary"
                  disabled={!visible.length}
                  onClick={() => void download(visible.map((l) => l.id))}
                >
                  <ArrowDownToLine size={17} />
                  Экспорт XLSX
                </button>
              )}
              <button className="button primary" onClick={() => setImportOpen(true)}>
                <Plus size={18} />
                Добавить квартиру
              </button>
            </div>
          </div>
          {loadError && (
            <div className="error-banner" role="alert">
              Сервер недоступен: {loadError}.{' '}
              <button onClick={() => void refresh()}>Повторить</button>
            </div>
          )}
          {view === 'all' && (
            <SearchPanel
              job={searchJob || jobs.find((j) => ['running', 'waiting'].includes(j.status))}
              running={running}
              onStarted={(job) => {
                setJobs((js) => [job, ...js]);
                setSearchJobId(job.id);
                setResultsOnly(false);
                reset();
              }}
              onOpenBrowser={(id) =>
                void action(() => api('/imports/' + id + '/open-browser', 'POST', {}))
              }
              onCancel={(id) => void action(() => api('/imports/' + id + '/cancel', 'POST', {}))}
            />
          )}
          {view === 'all' && searchJobId && (
            <div className="search-results-context">
              <span>
                {resultsOnly
                  ? `Результаты этого запуска: ${visible.length}`
                  : `Вся подборка: ${listings.length} · Найдено в этом запуске: ${searchJob?.count ?? 0}`}
              </span>
              <button onClick={() => setResultsOnly(!resultsOnly)}>
                {resultsOnly
                  ? 'Показать всю сохраненную подборку'
                  : 'Показать только результаты запуска'}
              </button>
            </div>
          )}
          {view === 'imports' ? (
            <>
              <div className="source-grid">
                {(['cian', 'yandex'] as const).map((s) => (
                  <div className="source-card" key={s}>
                    <span className={'source-logo ' + s}>{s === 'cian' ? 'ц' : 'Я'}</span>
                    <span className="pill">Браузерный импорт</span>
                    <h2>{sourceNames[s]}</h2>
                    <p>
                      {s === 'cian'
                        ? 'Объявление или до 3 страниц каталога долгосрочной аренды.'
                        : 'Экспериментальный адаптер: ссылка на объявление или страницу поиска.'}
                    </p>
                    <button className="button secondary" onClick={() => setImportOpen(true)}>
                      Импортировать <ArrowUpRight size={16} />
                    </button>
                  </div>
                ))}
              </div>
              <div className="info-box">
                <Globe size={22} />
                <div>
                  <b>Сбор работает в фоне</b>
                  <p>
                    Обычно окно браузера не открывается. При капче нажмите «Открыть окно проверки» и
                    пройдите ее вручную — сбор продолжится. При изменении разметки доступен импорт
                    сохраненного HTML и ручное добавление. Сессия браузера остается на этом
                    компьютере.
                  </p>
                </div>
              </div>
              <div className="section-title">
                <h2>История импорта</h2>
                <span>{jobs.length} запусков</span>
              </div>
              {!jobs.length ? (
                <div className="empty compact">
                  <Clock3 />
                  <h3>История начинается с первой квартиры</h3>
                  <p>Здесь появятся результаты и замечания к импорту.</p>
                </div>
              ) : (
                <div className="job-list">
                  {jobs.map((j) => (
                    <div className="job" key={j.id}>
                      <span className={cx('job-icon', j.status === 'failed' && 'error')}>
                        {['running', 'waiting'].includes(j.status) ? (
                          <LoaderCircle className="spin" size={19} />
                        ) : j.status === 'failed' ? (
                          <X size={19} />
                        ) : (
                          <Check size={19} />
                        )}
                      </span>
                      <div>
                        <b>{j.message}</b>
                        {j.added !== undefined && (
                          <p className="import-counts">
                            Новых: {j.added} · Обновлено: {j.updated ?? 0} · Уже сохранено:{' '}
                            {j.alreadySaved ?? 0}
                          </p>
                        )}
                        <a href={j.url} target="_blank" rel="noreferrer">
                          {j.url}
                        </a>
                        {j.warnings.length > 0 && (
                          <details>
                            <summary>Замечания: {j.warnings.length}</summary>
                            {j.warnings.map((w, i) => (
                              <p key={i}>{w}</p>
                            ))}
                          </details>
                        )}
                      </div>
                      <span className="job-status">
                        {statusNames[j.status]}
                        <small>{new Date(j.createdAt).toLocaleString('ru-RU')}</small>
                      </span>
                      {j.canOpenBrowser && (
                        <button
                          className="button secondary"
                          onClick={() =>
                            void action(() => api('/imports/' + j.id + '/open-browser', 'POST', {}))
                          }
                        >
                          Открыть окно проверки
                        </button>
                      )}
                      {['running', 'waiting'].includes(j.status) && (
                        <button
                          className="text-button"
                          onClick={() =>
                            void action(() => api('/imports/' + j.id + '/cancel', 'POST', {}))
                          }
                        >
                          Отменить
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </>
          ) : (
            <>
              <section className="stats">
                <div className="stat">
                  <span className="stat-icon">
                    <Building2 size={21} />
                  </span>
                  <div>
                    <p>Всего сохранено</p>
                    <b>
                      {listings.length}
                      <span>{plural(listings.length, 'квартира', 'квартиры', 'квартир')}</span>
                    </b>
                  </div>
                  <span className="stat-hint">Без повторов</span>
                </div>
                <div className="stat">
                  <span className="stat-icon">
                    <Heart size={21} />
                  </span>
                  <div>
                    <p>В избранном</p>
                    <b>
                      {favorites.length}
                      <span>{plural(favorites.length, 'вариант', 'варианта', 'вариантов')}</span>
                    </b>
                  </div>
                </div>
                <div className="stat">
                  <span className="stat-icon">
                    <Calculator size={21} />
                  </span>
                  <div>
                    <p>
                      Минимум на въезд{listings.some((l) => costs(l).incomplete) ? ' · от' : ''}
                    </p>
                    <b>
                      {listings.length
                        ? rub(Math.min(...listings.map((l) => costs(l).moveIn)))
                        : '—'}
                    </b>
                  </div>
                </div>
              </section>
              <div className="collection-heading">
                <div>
                  <h2>
                    {view === 'favorites'
                      ? 'Избранные квартиры'
                      : searchJobId && resultsOnly
                        ? 'Результаты поиска'
                        : 'Сохраненные квартиры'}
                  </h2>
                  <span className="count-badge">{visible.length}</span>
                </div>
                <span className="collection-sub">
                  {visible.length} показано · {listings.length} всего сохранено
                </span>
              </div>
              <div className="filter-bar">
                <label className="search-field">
                  <Search size={18} />
                  <input
                    aria-label="Поиск по адресу или метро"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Адрес, район или метро"
                  />
                </label>
                <Select
                  aria-label="Источник"
                  value={source}
                  onChange={(e) => setSource(e.target.value)}
                >
                  <option value="all">Все источники</option>
                  <option value="cian">Циан</option>
                  <option value="yandex">Яндекс Недвижимость</option>
                  <option value="manual">Вручную</option>
                </Select>
                <Select
                  aria-label="Количество комнат"
                  value={rooms}
                  onChange={(e) => setRooms(e.target.value)}
                >
                  <option value="all">Комнат</option>
                  <option value="0">Студия</option>
                  <option value="1">1 комната</option>
                  <option value="2">2 комнаты</option>
                  <option value="3+">3 и больше</option>
                </Select>
                <label className="price-filter">
                  <input
                    type="number"
                    aria-label="Максимальная аренда"
                    min="0"
                    value={maxPrice}
                    onChange={(e) => setMaxPrice(e.target.value)}
                    placeholder="Бюджет до"
                  />
                  <span>₽</span>
                </label>
                <button
                  className={cx('filter-button', filters && 'active')}
                  onClick={() => setFilters(!filters)}
                >
                  <SlidersHorizontal size={17} />
                  <span>Фильтры</span>
                  {(maxEntry || noFee) && <i />}
                </button>
              </div>
              {filters && (
                <div className="extra-filters">
                  <label className="entry-filter">
                    <span>Бюджет на въезд</span>
                    <input
                      type="number"
                      min="0"
                      value={maxEntry}
                      onChange={(e) => setMaxEntry(e.target.value)}
                      placeholder="Без ограничений"
                    />
                  </label>
                  <label className="check-label">
                    <input
                      type="checkbox"
                      checked={noFee}
                      onChange={(e) => setNoFee(e.target.checked)}
                    />{' '}
                    Без комиссии
                  </label>
                  <span className="filter-note">
                    При неизвестных расходах показана минимальная сумма на въезд.
                  </span>
                </div>
              )}
              <div className="results-line">
                <div className="source-tabs">
                  <button
                    className={cx(source === 'all' && 'selected')}
                    onClick={() => setSource('all')}
                  >
                    Все квартиры
                  </button>
                  <button
                    className={cx(source === 'cian' && 'selected')}
                    onClick={() => setSource('cian')}
                  >
                    <i className="cian-dot" />
                    Циан
                  </button>
                  <button
                    className={cx(source === 'yandex' && 'selected')}
                    onClick={() => setSource('yandex')}
                  >
                    <i className="yandex-dot" />
                    Яндекс
                  </button>
                </div>
                <label className="sort">
                  Сортировка:{' '}
                  <Select
                    aria-label="Сортировка"
                    value={sort}
                    onChange={(e) => setSort(e.target.value)}
                  >
                    <option value="new">Сначала новые</option>
                    <option value="rent">Дешевле в месяц</option>
                    <option value="entry">Меньше на въезд</option>
                  </Select>
                </label>
              </div>
              {demo && (
                <div className="demo-banner">
                  <span>
                    <Sparkles size={15} />
                    Демо-подборка · вымышленные объявления, фотографии для примера
                  </span>
                  <button
                    disabled={busy}
                    onClick={() =>
                      void action(
                        () => api('/demo', 'DELETE', {}),
                        'Демонстрационные квартиры удалены',
                      )
                    }
                  >
                    Убрать демо <X size={13} />
                  </button>
                </div>
              )}
              {loading ? (
                <div className="empty">
                  <LoaderCircle className="spin" />
                  <p>Открываем вашу подборку…</p>
                </div>
              ) : !visible.length ? (
                <div className="empty">
                  <span className="empty-art">
                    <House size={42} />
                  </span>
                  <h2>
                    {listings.length
                      ? 'Здесь пока нет подходящих квартир'
                      : 'У хорошего поиска есть свое место'}
                  </h2>
                  <p>
                    {listings.length
                      ? 'Измените фильтры или добавьте варианты в избранное.'
                      : 'Укажите параметры в форме выше и нажмите «Найти квартиры». Здесь появятся объявления с Циана.'}
                  </p>
                  <div>
                    <button
                      className="button primary"
                      onClick={() =>
                        listings.length && !(searchJobId && resultsOnly)
                          ? reset()
                          : document
                              .getElementById('cian-search')
                              ?.scrollIntoView({ behavior: 'smooth' })
                      }
                    >
                      {listings.length && !(searchJobId && resultsOnly)
                        ? 'Сбросить фильтры'
                        : 'Настроить поиск'}
                      <ArrowRight size={17} />
                    </button>
                    {!listings.length && (
                      <button
                        className="button secondary"
                        disabled={busy}
                        onClick={() =>
                          void action(() => api('/demo', 'POST', {}), 'Демо-подборка добавлена')
                        }
                      >
                        Открыть демо · вымышленные цены
                      </button>
                    )}
                  </div>
                </div>
              ) : (
                <div className="cards">
                  {visible.map((l) => (
                    <Card
                      key={l.id}
                      listing={l}
                      open={() => setDetail(l.id)}
                      favorite={() => void toggle(l)}
                      selected={selected.includes(l.id)}
                      select={() =>
                        setSelected((s) =>
                          s.includes(l.id)
                            ? s.filter((x) => x !== l.id)
                            : s.length < 4
                              ? [...s, l.id]
                              : (setNotice('Можно сравнить до 4 квартир'), s),
                        )
                      }
                    />
                  ))}
                </div>
              )}
              <footer className="page-footer">
                <span>
                  <House size={14} /> Найдите место, где вам хорошо.
                </span>
                <span>Цены и условия уточняйте у владельца объявления</span>
              </footer>
            </>
          )}
        </div>
      </main>
      {selected.filter((id) => listings.some((l) => l.id === id)).length > 0 && (
        <div className="compare-tray">
          <span>
            <Layers3 size={19} />
            Выбрано: {selected.filter((id) => listings.some((l) => l.id === id)).length}
          </span>
          <button onClick={() => setCompare(true)}>
            Сравнить расходы <ArrowRight size={16} />
          </button>
          <IconButton label="Снять выбор" onClick={() => setSelected([])}>
            <X size={17} />
          </IconButton>
        </div>
      )}
      {notice && (
        <div className="toast" role="status">
          {notice}
          <IconButton label="Закрыть уведомление" onClick={() => setNotice('')}>
            <X size={16} />
          </IconButton>
        </div>
      )}
      {importOpen && (
        <ImportModal
          onClose={() => setImportOpen(false)}
          onManual={() => {
            setImportOpen(false);
            setEdit('new');
          }}
          onDone={async (message, browser) => {
            await refresh();
            setNotice(message);
            setImportOpen(false);
            if (browser) setView('imports');
          }}
        />
      )}
      {edit && (
        <EditModal
          listing={edit === 'new' ? null : edit}
          onClose={() => setEdit(null)}
          onSave={async (data) => {
            await api(
              edit === 'new' ? '/listings' : '/listings/' + edit.id,
              edit === 'new' ? 'POST' : 'PATCH',
              data,
            );
            await refresh();
            setEdit(null);
            setNotice('Квартира сохранена');
          }}
        />
      )}
      {current && (
        <Detail
          listing={current}
          months={months}
          setMonths={setMonths}
          onClose={() => setDetail(null)}
          onEdit={() => {
            setDetail(null);
            setEdit(current);
          }}
          onFavorite={() => void toggle(current)}
          onDelete={() => setConfirmDelete(current)}
          onSaveNotes={async (notes) => {
            await api('/listings/' + current.id, 'PATCH', { notes });
            await refresh();
            setNotice('Заметка сохранена');
          }}
        />
      )}
      {confirmDelete && (
        <Modal title="Удалить квартиру?" onClose={() => setConfirmDelete(null)}>
          <p className="muted">
            «{confirmDelete.title}» будет удалена из локальной подборки вместе с заметками.
          </p>
          <div className="form-actions">
            <button className="button secondary" onClick={() => setConfirmDelete(null)}>
              Оставить
            </button>
            <button
              className="button danger"
              disabled={busy}
              onClick={() =>
                void action(async () => {
                  await api('/listings/' + confirmDelete.id, 'DELETE', {});
                  setDetail(null);
                  setSelected((s) => s.filter((id) => id !== confirmDelete.id));
                  setConfirmDelete(null);
                }, 'Квартира удалена')
              }
            >
              Удалить
            </button>
          </div>
        </Modal>
      )}
      {compare && (
        <Modal title="Сравните полную стоимость" wide onClose={() => setCompare(false)}>
          <Term months={months} setMonths={setMonths} />
          <div className="table-scroll">
            <table className="comparison">
              <thead>
                <tr>
                  <th>Расходы</th>
                  {listings
                    .filter((l) => selected.includes(l.id))
                    .map((l) => (
                      <th key={l.id}>
                        {l.title}
                        <small>{l.address}</small>
                      </th>
                    ))}
                </tr>
              </thead>
              <tbody>
                {[
                  'Аренда / месяц',
                  'ЖКУ / месяц',
                  'Комиссия',
                  'Возвратный залог',
                  'Прочие расходы',
                  'На въезд',
                  'За весь срок без залога',
                  'Среднее / месяц',
                ].map((name, i) => (
                  <tr key={name}>
                    <td>{name}</td>
                    {listings
                      .filter((l) => selected.includes(l.id))
                      .map((l) => {
                        const c = costs(l, months);
                        const values = [
                          l.rent,
                          l.utilities,
                          l.commission === null ? null : c.fee,
                          l.deposit,
                          l.otherCosts,
                          c.moveIn,
                          c.total,
                          c.average,
                        ];
                        return (
                          <td key={l.id}>
                            {values[i] === null
                              ? 'Не указано'
                              : `${i >= 5 && c.incomplete ? 'от ' : ''}${rub(values[i]!)}`}
                          </td>
                        );
                      })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="muted">
            Залог предполагается возвратным. Суммы «от» не включают неизвестные платежи.
          </p>
          <div className="form-actions">
            <button className="button primary" onClick={() => void download(selected)}>
              <ArrowDownToLine size={17} />
              Экспорт сравнения
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
function Card({
  listing: l,
  open,
  favorite,
  select,
  selected,
}: {
  listing: Listing;
  open: () => void;
  favorite: () => void;
  select: () => void;
  selected: boolean;
}) {
  const c = costs(l);
  const [photoIndex, setPhotoIndex] = useState(0);
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  const swiped = useRef(false);
  const photo = Math.min(photoIndex, Math.max(0, l.photos.length - 1));
  return (
    <article className={cx('apartment-card', selected && 'card-selected')}>
      <div
        className="card-image"
        onPointerMove={(e) => {
          if (e.pointerType !== 'mouse' || l.photos.length < 2) return;
          const rect = e.currentTarget.getBoundingClientRect();
          const fraction = (e.clientX - rect.left) / rect.width;
          setPhotoIndex(
            Math.max(0, Math.min(l.photos.length - 1, Math.floor(fraction * l.photos.length))),
          );
        }}
        onPointerLeave={(e) => {
          if (e.pointerType === 'mouse') setPhotoIndex(0);
        }}
      >
        <button
          className="image-open"
          onClick={() => {
            if (swiped.current) {
              swiped.current = false;
              return;
            }
            open();
          }}
          onDragStart={(e) => e.preventDefault()}
          onTouchStart={(e) => {
            swiped.current = false;
            const t = e.touches[0];
            touchStart.current = { x: t.clientX, y: t.clientY };
          }}
          onTouchCancel={() => {
            touchStart.current = null;
          }}
          onTouchEnd={(e) => {
            const start = touchStart.current;
            touchStart.current = null;
            if (!start || l.photos.length < 2) return;
            const t = e.changedTouches[0],
              dx = t.clientX - start.x,
              dy = t.clientY - start.y;
            if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy)) {
              swiped.current = true;
              setPhotoIndex((photo + (dx < 0 ? 1 : -1) + l.photos.length) % l.photos.length);
            }
          }}
          onKeyDown={(e) => {
            if (l.photos.length > 1 && ['ArrowLeft', 'ArrowRight'].includes(e.key)) {
              e.preventDefault();
              setPhotoIndex(
                (photo + (e.key === 'ArrowRight' ? 1 : -1) + l.photos.length) % l.photos.length,
              );
            }
          }}
          aria-label={'Открыть ' + l.title}
          aria-description="Перемещайте курсор по фотографии или используйте стрелки клавиатуры для просмотра фото. На телефоне — свайп."
        >
          <Photo src={l.photos[photo]} alt={l.title} />
        </button>
        <span className={'source-tag ' + l.source}>
          <i />
          {sourceNames[l.source]}
          {l.demo && <small> · демо</small>}
        </span>
        <button
          className={cx('heart-button', l.favorite && 'hearted')}
          aria-label={l.favorite ? 'Убрать из избранного' : 'В избранное'}
          onClick={favorite}
        >
          <Heart size={18} fill={l.favorite ? 'currentColor' : 'none'} />
        </button>
        {l.commission === 0 && <span className="no-commission">Без комиссии</span>}
        {l.photos.length > 1 && (
          <>
            <div className="card-photo-dots" aria-hidden="true">
              {Array.from({ length: Math.min(5, l.photos.length) }, (_, i) => (
                <i
                  key={i}
                  className={
                    i ===
                    Math.min(
                      4,
                      Math.floor((photo * Math.min(5, l.photos.length)) / l.photos.length),
                    )
                      ? 'current'
                      : ''
                  }
                />
              ))}
            </div>
          </>
        )}
        {l.photos.length > 0 && (
          <span className="photo-count">
            {photo + 1} / {l.photos.length}
          </span>
        )}
      </div>
      <div className="card-content">
        <button className="card-title" onClick={open}>
          {l.rooms === 0 ? 'Студия' : l.rooms ? `${l.rooms}-комн. квартира` : l.title}
          {l.area ? ` · ${l.area} м²` : ''}
          {l.floor ? ` · ${l.floor} этаж` : ''}
        </button>
        <div className="card-price">
          <b>{rub(l.rent)}</b>
          <span>/ месяц</span>
          <label title="Добавить к сравнению" className="compare-checkbox">
            <input
              type="checkbox"
              checked={selected}
              onChange={select}
              aria-label={'Сравнить ' + l.title}
            />
            <span>Сравнить</span>
          </label>
        </div>
        <p className="card-address">{l.address || 'Адрес не указан'}</p>
        <p className="metro">
          <span className="metro-symbol">м</span>
          {l.metro || 'Метро не указано'}
          {l.metroMinutes !== null && (
            <>
              <span className="metro-divider">·</span>
              <span>{l.metroMinutes} мин. пешком</span>
            </>
          )}
        </p>
        <div className="card-cost">
          <span>На въезд{c.incomplete ? ' · от' : ''}</span>
          <b>{rub(c.moveIn)}</b>
        </div>
        <button className="card-detail" onClick={open}>
          Подробнее и расчет <ArrowRight size={15} />
        </button>
      </div>
    </article>
  );
}
function Term({ months, setMonths }: { months: number; setMonths: (v: number) => void }) {
  return (
    <label className="term">
      Планирую снимать{' '}
      <Select
        aria-label="Планирую снимать"
        value={months}
        onChange={(e) => setMonths(Number(e.target.value))}
      >
        {[1, 3, 6, 12, 24, 36].map((n) => (
          <option key={n} value={n}>
            {n} мес.
          </option>
        ))}
      </Select>
    </label>
  );
}
function Detail({
  listing: l,
  months,
  setMonths,
  onClose,
  onEdit,
  onFavorite,
  onDelete,
  onSaveNotes,
}: {
  listing: Listing;
  months: number;
  setMonths: (v: number) => void;
  onClose: () => void;
  onEdit: () => void;
  onFavorite: () => void;
  onDelete: () => void;
  onSaveNotes: (notes: string) => Promise<void>;
}) {
  const [photo, setPhoto] = useState(0),
    [notes, setNotes] = useState(l.notes),
    [saving, setSaving] = useState(false),
    [error, setError] = useState('');
  const c = costs(l, months);
  return (
    <Modal title={l.title} wide onClose={onClose}>
      <div className="detail-layout">
        <section>
          <div className="gallery">
            <Photo src={l.photos[photo]} alt={l.title} />
            {l.photos.length > 1 && (
              <div className="gallery-controls">
                <IconButton
                  label="Предыдущее фото"
                  onClick={() => setPhoto((photo + l.photos.length - 1) % l.photos.length)}
                >
                  <ChevronLeft />
                </IconButton>
                <span>
                  {photo + 1} / {l.photos.length}
                </span>
                <IconButton
                  label="Следующее фото"
                  onClick={() => setPhoto((photo + 1) % l.photos.length)}
                >
                  <ChevronRight />
                </IconButton>
              </div>
            )}
          </div>
          <p className="detail-address">
            <MapPin size={17} />
            {l.address || 'Адрес не указан'}
          </p>
          <div className="detail-facts">
            <span>{l.area ? `${l.area} м²` : 'Площадь не указана'}</span>
            <span>
              {l.rooms === 0 ? 'Студия' : l.rooms ? `${l.rooms} комн.` : 'Комнаты не указаны'}
            </span>
            <span>{l.floor ? `${l.floor} этаж` : 'Этаж не указан'}</span>
          </div>
          {l.demo && (
            <div className="notice-box">
              Демонстрационный пример. Фото и адрес не относятся к реальному объявлению.
            </div>
          )}
          <p className="description">{l.description || 'Описание пока не добавлено.'}</p>
          <div className="detail-buttons">
            {l.url && (
              <a className="button secondary" href={l.url} target="_blank" rel="noreferrer">
                На {sourceNames[l.source]} <SquareArrowOutUpRight size={15} />
              </a>
            )}
            <button className="button secondary" onClick={onFavorite}>
              <Heart size={16} fill={l.favorite ? 'currentColor' : 'none'} />
              {l.favorite ? 'В избранном' : 'Сохранить'}
            </button>
            <button className="text-button" onClick={onEdit}>
              Редактировать
            </button>
          </div>
          <label className="notes-label">
            Мои заметки
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              maxLength={5000}
              placeholder="Что понравилось? Что уточнить у владельца?"
              rows={3}
            />
          </label>
          {error && <p className="form-error">{error}</p>}
          <button
            className="text-button"
            disabled={saving || notes === l.notes}
            onClick={async () => {
              setSaving(true);
              try {
                await onSaveNotes(notes);
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setSaving(false);
              }
            }}
          >
            Сохранить заметку
          </button>
          <div className="detail-bottom">
            <small>Обновлено {new Date(l.updatedAt).toLocaleDateString('ru-RU')}</small>
            <button className="text-button delete-text" onClick={onDelete}>
              <Trash2 size={14} />
              Удалить
            </button>
          </div>
        </section>
        <section className="calculator">
          <div className="calculator-heading">
            <span>
              <Calculator size={20} />
            </span>
            <div>
              <h3>Без скрытых расходов</h3>
              <p>Полная стоимость вашего решения</p>
            </div>
          </div>
          <Term months={months} setMonths={setMonths} />
          <div className="cost-rows">
            {[
              ['Аренда / месяц', l.rent],
              ['Коммунальные / месяц', l.utilities],
              ['Возвратный залог', l.deposit],
              [
                'Комиссия' +
                  (l.commissionType === 'percent' && l.commission !== null
                    ? ` · ${l.commission}%`
                    : ''),
                l.commission === null ? null : c.fee,
              ],
              ['Прочие при въезде', l.otherCosts],
            ].map(([name, value]) => (
              <div key={String(name)}>
                <span>{name}</span>
                <b>{value === null ? 'Не указано' : rub(Number(value))}</b>
              </div>
            ))}
          </div>
          <div className="entry-total">
            <span>Понадобится на въезд</span>
            <strong>
              {c.incomplete && <small>от </small>}
              {rub(c.moveIn)}
            </strong>
            <p>Первый месяц + все разовые платежи</p>
          </div>
          <div className="cost-rows totals">
            <div>
              <span>В месяц с коммунальными</span>
              <b>
                {l.utilities === null ? 'от ' : ''}
                {rub(c.monthly)}
              </b>
            </div>
            <div>
              <span>За {months} мес. без залога</span>
              <b>
                {c.incomplete ? 'от ' : ''}
                {rub(c.total)}
              </b>
            </div>
            <div>
              <span>В среднем за месяц</span>
              <b>
                {c.incomplete ? 'от ' : ''}
                {rub(c.average)}
              </b>
            </div>
          </div>
          <p className="calculator-note">
            Залог учитывается при въезде и предполагается возвратным. Комиссия и разовые расходы
            распределены на выбранный срок.
          </p>
          {c.incomplete && (
            <div className="notice-box">
              Есть неизвестные расходы. Уточните суммы — сейчас показана нижняя оценка.
            </div>
          )}
          <button className="button secondary full" onClick={onEdit}>
            Изменить условия расчета <ArrowUpRight size={16} />
          </button>
        </section>
      </div>
    </Modal>
  );
}
function ImportModal({
  onClose,
  onManual,
  onDone,
}: {
  onClose: () => void;
  onManual: () => void;
  onDone: (message: string, browser: boolean) => Promise<void>;
}) {
  const [mode, setMode] = useState('browser'),
    [url, setUrl] = useState(''),
    [html, setHtml] = useState(''),
    [fileName, setFileName] = useState(''),
    [limit, setLimit] = useState(10),
    [pages, setPages] = useState(1),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      if (mode === 'browser') {
        await api('/imports/browser', 'POST', { url, limit, pages });
        await onDone('Браузер открывается. Ход сбора — в истории импорта.', true);
      } else {
        const r = await api<{ count: number; added: number; updated: number; warnings: string[] }>(
          '/imports/html',
          'POST',
          {
            url,
            html,
          },
        );
        await onDone(`Новых: ${r.added}. Обновлено: ${r.updated}. ${r.warnings.join(' ')}`, false);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal title="Еще на шаг ближе к дому" onClose={onClose}>
      <p className="modal-subtitle">Добавьте квартиру или соберите подборку по ссылке.</p>
      <div className="import-tabs">
        <button className={cx(mode === 'browser' && 'selected')} onClick={() => setMode('browser')}>
          <Globe size={17} />В браузере
        </button>
        <button className={cx(mode === 'html' && 'selected')} onClick={() => setMode('html')}>
          <FileCode2 size={17} />
          HTML-файл
        </button>
        <button onClick={onManual}>
          <Plus size={17} />
          Вручную
        </button>
      </div>
      <form onSubmit={submit}>
        <label className="field">
          Ссылка на объявление или поиск
          <div className="input-with-icon">
            <Link2 size={18} />
            <input
              required
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://www.cian.ru/rent/flat/…"
            />
          </div>
        </label>
        {mode === 'browser' ? (
          <>
            <div className="form-grid">
              <label className="field">
                <span className="field-caption">Максимум квартир</span>
                <Select
                  aria-label="Максимум квартир"
                  value={limit}
                  onChange={(e) => setLimit(Number(e.target.value))}
                >
                  <option value={5}>5 квартир</option>
                  <option value={10}>10 квартир</option>
                  <option value={20}>20 квартир</option>
                  <option value={30}>30 квартир</option>
                </Select>
              </label>
              <label className="field">
                <span className="field-caption">Страниц каталога</span>
                <Select
                  aria-label="Страниц каталога"
                  value={pages}
                  onChange={(e) => setPages(Number(e.target.value))}
                >
                  {[1, 2, 3].map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </Select>
              </label>
            </div>
            <div className="notice-box">
              <Globe size={18} />
              <span>
                Откроется отдельный Chromium. Если площадка попросит проверку, пройдите ее в этом
                окне. Приложение подождет до 3 минут и продолжит сбор.
              </span>
            </div>
            <p className="muted">
              Поддерживается долгосрочная аренда. Циан — основной адаптер, Яндекс —
              экспериментальный. Сохраненные ссылки обновляются без дубликатов.
            </p>
          </>
        ) : (
          <>
            <label className="file-upload">
              <FileCode2 size={25} />
              <b>{fileName || 'Выберите сохраненную HTML-страницу'}</b>
              <span>В браузере: «Сохранить страницу как…» · до 8 МБ</span>
              <input
                type="file"
                accept=".html,.htm,text/html"
                required
                onChange={async (e) => {
                  const f = e.target.files?.[0];
                  if (f) {
                    if (f.size > 8_000_000) {
                      setError('Файл должен быть меньше 8 МБ');
                      setHtml('');
                      e.target.value = '';
                      return;
                    }
                    setFileName(f.name);
                    setHtml(await f.text());
                    setError('');
                  }
                }}
              />
            </label>
            <p className="muted">
              Сохраните полностью загруженную страницу квартиры или каталога, а не страницу капчи.
              Ссылка нужна для определения источника.
            </p>
          </>
        )}
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <div className="form-actions">
          <button type="button" className="button secondary" onClick={onClose}>
            Отмена
          </button>
          <button className="button primary" disabled={busy || (mode === 'html' && !html)}>
            {busy ? <LoaderCircle size={17} className="spin" /> : <ArrowRight size={17} />}{' '}
            {mode === 'browser' ? 'Собрать в фоне' : 'Импортировать'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
function EditModal({
  listing,
  onClose,
  onSave,
}: {
  listing: Listing | null;
  onClose: () => void;
  onSave: (data: Partial<ListingInput>) => Promise<void>;
}) {
  const [data, setData] = useState<ListingInput>(
      listing ? { ...listing } : { ...initial, title: '' },
    ),
    [photos, setPhotos] = useState(listing?.photos.join('\n') || ''),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  const set = (k: keyof ListingInput, v: unknown) => setData((d) => ({ ...d, [k]: v }));
  const numericField = (
    label: string,
    k:
      | 'rent'
      | 'utilities'
      | 'deposit'
      | 'commission'
      | 'otherCosts'
      | 'area'
      | 'rooms'
      | 'floor'
      | 'metroMinutes',
    required = false,
  ) => (
    <label className="field" key={k}>
      <span className="field-caption">{label}</span>
      <input
        type="number"
        min={k === 'rent' || k === 'area' ? 0.01 : 0}
        step={['rooms', 'floor', 'metroMinutes'].includes(k) ? 1 : 'any'}
        required={required}
        value={data[k] ?? ''}
        placeholder={required ? '0' : 'Не указано'}
        onChange={(e) => set(k, e.target.value === '' ? null : Number(e.target.value))}
      />
    </label>
  );
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const parsed = listingSchema.safeParse({
        ...data,
        photos: photos
          .split('\n')
          .map((x) => x.trim())
          .filter(Boolean),
        url: data.url || null,
      });
      if (!parsed.success)
        throw new Error(
          parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '),
        );
      const payload: Partial<ListingInput> = { ...parsed.data };
      if (listing) delete payload.url;
      await onSave(payload);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      title={listing ? 'Условия и детали' : 'Добавить квартиру вручную'}
      wide
      onClose={onClose}
    >
      <form onSubmit={submit}>
        <div className="form-grid">
          <label className="field span-2">
            <span className="field-caption">Название</span>
            <input
              required
              maxLength={200}
              value={data.title}
              onChange={(e) => set('title', e.target.value)}
              placeholder="Например, светлая двушка у парка"
            />
          </label>
          <label className="field span-2">
            <span className="field-caption">Адрес</span>
            <input
              maxLength={500}
              value={data.address}
              onChange={(e) => set('address', e.target.value)}
              placeholder="Город, улица, дом"
            />
          </label>
          <label className="field">
            <span className="field-caption">Источник</span>
            <Select
              aria-label="Источник"
              value={data.source}
              onChange={(e) => set('source', e.target.value)}
              disabled={!!listing}
            >
              <option value="manual">Вручную</option>
              <option value="cian">Циан</option>
              <option value="yandex">Яндекс Недвижимость</option>
            </Select>
          </label>
          <label className="field">
            <span className="field-caption">Ссылка</span>
            <input
              type="url"
              value={data.url || ''}
              disabled={!!listing}
              onChange={(e) => set('url', e.target.value || null)}
              placeholder="https://…"
            />
          </label>
          {numericField('Комнат · 0 = студия', 'rooms')}
          {numericField('Площадь, м²', 'area')}
          {numericField('Этаж', 'floor')}
          <label className="field">
            <span className="field-caption">Метро</span>
            <input
              maxLength={100}
              value={data.metro}
              onChange={(e) => set('metro', e.target.value)}
            />
          </label>
          {numericField('До метро пешком, мин.', 'metroMinutes')}
          <div />
        </div>
        <h3 className="form-section">Сколько стоит это место</h3>
        <p className="muted">
          Пустое поле — сумма неизвестна. Укажите 0, только если платежа действительно нет.
        </p>
        <div className="form-grid">
          {numericField('Аренда / месяц, ₽', 'rent', true)}
          {numericField('Коммунальные / месяц, ₽', 'utilities')}
          {numericField('Возвратный залог, ₽', 'deposit')}
          {numericField('Комиссия', 'commission')}
          <label className="field">
            <span className="field-caption">Тип комиссии</span>
            <Select
              aria-label="Тип комиссии"
              value={data.commissionType}
              onChange={(e) => set('commissionType', e.target.value)}
            >
              <option value="percent">% от месячной аренды</option>
              <option value="fixed">Фиксированная сумма, ₽</option>
            </Select>
          </label>
          {numericField('Прочие разовые расходы, ₽', 'otherCosts', true)}
          <label className="field span-2">
            <span className="field-caption">Описание</span>
            <textarea
              rows={3}
              maxLength={20000}
              value={data.description}
              onChange={(e) => set('description', e.target.value)}
            />
          </label>
          <label className="field span-2">
            <span className="field-caption">Фотографии · по одной ссылке на строку</span>
            <textarea
              rows={3}
              value={photos}
              onChange={(e) => setPhotos(e.target.value)}
              placeholder="https://…/photo.jpg"
            />
          </label>
        </div>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <div className="form-actions">
          <button type="button" className="button secondary" onClick={onClose}>
            Отмена
          </button>
          <button className="button primary" disabled={busy}>
            {busy ? <LoaderCircle size={17} className="spin" /> : <Check size={17} />}Сохранить
            квартиру
          </button>
        </div>
      </form>
    </Modal>
  );
}
