import { PropertyDetails } from './PropertyDetails';
import { ViewingWidget } from './ViewingWidget';
import { Viewings } from './Viewings';
import { matchesDatabaseSearch } from './local-search';
import { AccountButton, useAuth } from './Auth';
import { MetroDots, listingMetroStation } from './MetroDots';
import { CardNote } from './CardNote';
import { Rating } from './Rating';
import { Select } from './Select';
import {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from 'react';
import {
  CalendarDays,
  PanelLeft,
  FolderPlus,
  FolderHeart,
  Trophy,
  Archive,
  ArchiveRestore,
  RefreshCw,
  ArrowDownToLine,
  ArrowRight,
  ArrowUpRight,
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
import {
  costs,
  sourceNames,
  listingSchema,
  type CianSearch,
  type Listing,
  type ListingInput,
} from '@rent/shared';
import { api, type Job } from './api';
import { SearchToasts } from './SearchToasts';
import { SearchPanel } from './SearchPanel';
const rub = (n: number) =>
  new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 }).format(n) + ' ₽';

const cx = (...v: (string | false | undefined)[]) => v.filter(Boolean).join(' ');
const statusNames: Record<string, string> = {
  queued: 'В очереди',
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
type ApartmentCollection = { id: string; name: string; listingIds: string[]; createdAt: string };
export default function App() {
  const { user, open: openLogin } = useAuth();
  const [databaseSearch, setDatabaseSearch] = useState<CianSearch | null>(null);
  const [collections, setCollections] = useState<ApartmentCollection[]>([]);
  const [collectionId, setCollectionId] = useState<string | null>(null);
  const [viewingEditor, setViewingEditor] = useState<string | null>(null);
  const [reviewIds, setReviewIds] = useState<string[] | null>(null);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [collectionPicker, setCollectionPicker] = useState<string[] | null>(null);
  const detailPhoto = useRef(0);
  const noteRequests = useRef(new Set<string>());
  const ratingRequests = useRef(new Set<string>());
  const ratingRevision = useRef(0);
  const [ratingPending, setRatingPending] = useState<string[]>([]);
  const [archiving, setArchiving] = useState<string[]>([]);
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
    [ratingFilter, setRatingFilter] = useState('all'),
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
  const refresh = useCallback(async () => {
    const revision = ratingRevision.current;
    try {
      const [ls, js, cs] = await Promise.all([
        api<Listing[]>('/listings'),
        api<Job[]>('/imports'),
        api<ApartmentCollection[]>('/collections'),
      ]);
      setCollections(cs);
      if (revision === ratingRevision.current)
        setListings((previous) => {
          const byId = new Map(previous.map((l) => [l.id, l]));
          return ls.map((l) => {
            const old = byId.get(l.id);
            return old &&
              (ratingRequests.current.has(l.id) ||
                noteRequests.current.has(l.id) ||
                JSON.stringify(old) === JSON.stringify(l))
              ? old
              : l;
          });
        });
      setJobs((previous) => {
        const byId = new Map(previous.map((j) => [j.id, j]));
        return js.map((j) => {
          const old = byId.get(j.id);
          return old && JSON.stringify(old) === JSON.stringify(j) ? old : j;
        });
      });
      setLoadError('');
    } catch (e) {
      setLoadError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);
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
  const action = useCallback(
    async (fn: () => Promise<unknown>, message?: string) => {
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
    },
    [refresh],
  );
  const active = listings.filter((l) => l.rating !== 1);
  const archived = listings.filter((l) => l.rating === 1);
  const rated = active.filter((l) => (l.rating ?? 0) >= 2);
  const rankFor = (rating: number) => rated.filter((l) => l.rating! > rating).length + 1;
  const currentCollection = collections.find((c) => c.id === collectionId) || collections[0];
  const collection =
    view === 'archive'
      ? archived
      : view === 'ranking'
        ? rated
        : view === 'collections'
          ? active.filter((l) => currentCollection?.listingIds.includes(l.id))
          : active;
  const rateListing = useCallback(async (l: Listing, rating: number | null) => {
    if (ratingRequests.current.has(l.id)) return;
    ratingRequests.current.add(l.id);
    ratingRevision.current++;
    setRatingPending((ids) => [...ids, l.id]);
    try {
      const updated = await api<Listing>('/listings/' + l.id, 'PATCH', { rating });
      if (rating === 1 && l.rating !== 1) {
        setArchiving((ids) => [...ids, l.id]);
        await new Promise((resolve) => setTimeout(resolve, 320));
        setSelected((ids) => ids.filter((id) => id !== l.id));
      }
      setListings((rows) =>
        rows.map((row) =>
          row.id === l.id ? { ...row, rating: updated.rating, updatedAt: updated.updatedAt } : row,
        ),
      );
      if (rating === 1) setNotice('Объявление в архиве');
      else if (l.rating === 1) setNotice('Объявление возвращено в подборку');
      return true;
    } catch (e) {
      setNotice((e as Error).message);
      return false;
    } finally {
      ratingRevision.current++;
      ratingRequests.current.delete(l.id);
      setRatingPending((ids) => ids.filter((id) => id !== l.id));
      setArchiving((ids) => ids.filter((id) => id !== l.id));
    }
  }, []);
  const saveNote = useCallback(async (id: string, notes: string) => {
    if (noteRequests.current.has(id)) throw new Error('Заметка уже сохраняется');
    noteRequests.current.add(id);
    ratingRevision.current++;
    try {
      const updated = await api<Listing>('/listings/' + id, 'PATCH', { notes });
      setListings((rows) =>
        rows.map((row) =>
          row.id === id ? { ...row, notes: updated.notes, updatedAt: updated.updatedAt } : row,
        ),
      );
    } finally {
      noteRequests.current.delete(id);
      ratingRevision.current++;
    }
  }, []);
  const openListing = useCallback((id: string, photo = 0) => {
    detailPhoto.current = photo;
    setDetail(id);
  }, []);
  const selectListing = useCallback((id: string) => {
    setSelected((ids) =>
      ids.includes(id)
        ? ids.filter((x) => x !== id)
        : ids.length < 1000
          ? [...ids, id]
          : (setNotice('Можно выбрать до 1000 квартир'), ids),
    );
  }, []);
  const refreshListing = useCallback(
    (l: Listing) => {
      void action(() => api('/listings/' + l.id + '/refresh', 'POST', {}));
    },
    [action],
  );
  const favorites = active.filter((l) => l.favorite),
    demo = listings.some((l) => l.demo);
  const searchJob = jobs.find((j) => j.id === searchJobId);
  const personalFilter = !!user && !['ranking', 'archive'].includes(view) ? ratingFilter : 'all';
  const visible = listings
    .filter(
      (l) =>
        (view === 'archive' ? l.rating === 1 : l.rating !== 1 || archiving.includes(l.id)) &&
        (view !== 'ranking' || (l.rating ?? 0) >= 2 || archiving.includes(l.id)) &&
        (view !== 'collections' || !!currentCollection?.listingIds.includes(l.id)) &&
        (view !== 'favorites' || l.favorite) &&
        (view !== 'all' ||
          !resultsOnly ||
          !searchJobId ||
          (searchJob?.listingIds || []).includes(l.id)) &&
        (!databaseSearch || view !== 'all' || matchesDatabaseSearch(l, databaseSearch)) &&
        (source === 'all' || l.source === source) &&
        (rooms === 'all' || (rooms === '3+' ? (l.rooms ?? -1) >= 3 : l.rooms === Number(rooms))) &&
        (!maxPrice || l.rent <= Number(maxPrice)) &&
        (!maxEntry || costs(l).moveIn <= Number(maxEntry)) &&
        (!noFee || l.commission === 0) &&
        (personalFilter === 'all' ||
          (personalFilter === 'unrated' ? l.rating == null : l.rating != null)) &&
        `${l.title} ${l.address} ${l.metro}`.toLowerCase().includes(query.toLowerCase()),
    )
    .sort((a, b) =>
      view === 'ranking'
        ? (b.rating ?? 0) - (a.rating ?? 0) || a.rent - b.rent || a.id.localeCompare(b.id)
        : sort === 'rating' || sort === 'rating-asc'
          ? (a.rating == null ? 1 : 0) - (b.rating == null ? 1 : 0) ||
            (sort === 'rating'
              ? (b.rating ?? 0) - (a.rating ?? 0)
              : (a.rating ?? 0) - (b.rating ?? 0)) ||
            b.createdAt.localeCompare(a.createdAt)
          : sort === 'unrated' || sort === 'rated'
            ? (sort === 'unrated'
                ? Number(a.rating != null) - Number(b.rating != null)
                : Number(b.rating != null) - Number(a.rating != null)) ||
              b.createdAt.localeCompare(a.createdAt)
            : sort === 'rent'
              ? a.rent - b.rent
              : sort === 'entry'
                ? costs(a).moveIn - costs(b).moveIn
                : b.createdAt.localeCompare(a.createdAt),
    );
  const current = listings.find((l) => l.id === detail);
  const toggle = useCallback(
    (l: Listing) => action(() => api('/listings/' + l.id, 'PATCH', { favorite: !l.favorite })),
    [action],
  );
  const reset = () => {
    setSource('all');
    setRooms('all');
    setMaxPrice('');
    setMaxEntry('');
    setNoFee(false);
    setRatingFilter('all');
    setQuery('');
  };
  const download = async (
    ids: string[],
    format: 'xlsx' | 'pdf' = 'xlsx',
    name = 'Подборка квартир',
    detailed = false,
  ) => {
    if (!ids.length) return;
    if (format === 'pdf') setPdfBusy(true);
    try {
      const res = await fetch(
        '/api/export.' +
          format +
          '?' +
          new URLSearchParams({
            ids: ids.join(','),
            months: String(months),
            name,
            detailed: detailed ? '1' : '0',
          }),
      );
      if (!res.ok) {
        const error = await res.json().catch(() => null);
        throw new Error(error?.message || 'Не удалось создать файл');
      }
      const url = URL.createObjectURL(await res.blob());
      const a = document.createElement('a');
      a.href = url;
      a.download = 'mesto-apartments.' + format;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setNotice(format === 'pdf' ? 'PDF скачан' : 'Таблица XLSX скачана');
    } catch (e) {
      setNotice((e as Error).message);
    } finally {
      if (format === 'pdf') setPdfBusy(false);
    }
  };
  const [navCollapsed, setNavCollapsed] = useState(
    () => localStorage.getItem('mesto-nav-collapsed') === 'true',
  );
  return (
    <div className={cx('app-shell', navCollapsed && 'nav-collapsed')}>
      <aside className="sidebar" id="main-navigation">
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
            ['all', 'Все квартиры', LayoutGrid, active.length],
            ['favorites', 'Избранное', Heart, favorites.length],
            ['ranking', 'Рейтинг', Trophy, rated.length],
            ['collections', 'Подборки', FolderHeart, collections.length],
            ['viewings', 'Просмотры', CalendarDays, null],
            ['archive', 'Архив', Archive, archived.length],
            ['imports', 'Источники и импорт', Layers3, null],
          ].map(([key, label, Icon, count]) => {
            const I = Icon as typeof House;
            return (
              <button
                key={String(key)}
                className={cx('nav-item', view === key && 'chosen')}
                onClick={() => {
                  setView(String(key));
                  reset();
                }}
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
          <button onClick={() => (user ? setImportOpen(true) : openLogin())}>
            Добавить квартиру <ArrowUpRight size={15} />
          </button>
        </div>
        <div className="local-status">
          <span className="status-dot" />
          <div>
            <b>Общая база квартир</b>
            <small>Личные отметки доступны только вам</small>
          </div>
          <Database size={16} />
        </div>
        <div className="profile">
          <span>В</span>
          <div>
            <b>{user?.name || 'Гостевой режим'}</b>
            <small>{user ? user.email : 'Смотрите квартиры без регистрации'}</small>
          </div>
        </div>
      </aside>
      <main>
        <header className="topbar">
          <button
            className="nav-toggle"
            aria-label={navCollapsed ? 'Показать навигацию' : 'Скрыть навигацию'}
            aria-expanded={!navCollapsed}
            aria-controls="main-navigation"
            onClick={() => {
              setNavCollapsed(!navCollapsed);
              localStorage.setItem('mesto-nav-collapsed', String(!navCollapsed));
            }}
          >
            <PanelLeft size={18} />
          </button>
          <div className="header-breadcrumb">
            Мой поиск <ChevronRight size={14} />{' '}
            <span>
              {view === 'imports'
                ? 'Источники и импорт'
                : view === 'viewings'
                  ? 'Просмотры'
                  : view === 'favorites'
                    ? 'Избранное'
                    : view === 'archive'
                      ? 'Архив'
                      : view === 'ranking'
                        ? 'Рейтинг'
                        : view === 'collections'
                          ? 'Подборки'
                          : 'Все квартиры'}
            </span>
          </div>
          <div id="compact-search-slot" />
          <AccountButton />
        </header>
        <div className="page">
          {view !== 'viewings' && (
            <div className="page-heading">
              <div className="heading-copy">
                <div className="eyebrow">ВАШ ЛИЧНЫЙ ПОИСК ЖИЛЬЯ</div>
                <h1>
                  {view === 'imports'
                    ? 'Все источники. Одно место.'
                    : view === 'favorites'
                      ? 'Ближе к своему дому.'
                      : view === 'archive'
                        ? 'Можно передумать.'
                        : view === 'ranking'
                          ? 'Лучшие — по вашим оценкам.'
                          : view === 'collections'
                            ? 'Ваши подборки квартир.'
                            : 'Найдите свое место.'}
                </h1>
                <p>
                  {view === 'imports'
                    ? 'Соберите квартиры с разных площадок в одну понятную подборку.'
                    : view === 'archive'
                      ? 'Варианты с оценкой 1. Верните объявление или измените оценку, если передумаете.'
                      : view === 'ranking'
                        ? 'Выше оценка — выше место. При равных оценках место общее, сначала показываем меньшую аренду.'
                        : view === 'collections'
                          ? 'Для просмотра, обсуждения или переезда. Соберите варианты, которые хочется держать вместе.'
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
                {view !== 'imports' && (
                  <button
                    className="button secondary"
                    disabled={!visible.length || pdfBusy}
                    onClick={() =>
                      void download(
                        visible.map((l) => l.id),
                        'pdf',
                        currentCollection?.name || 'Подборка квартир',
                      )
                    }
                  >
                    <ArrowDownToLine size={17} />
                    {pdfBusy ? 'Готовим PDF…' : 'Экспорт PDF'}
                  </button>
                )}
                <button
                  className="button primary"
                  onClick={() => (user ? setImportOpen(true) : openLogin())}
                >
                  <Plus size={18} />
                  Добавить квартиру
                </button>
              </div>
            </div>
          )}
          {loadError && (
            <div className="error-banner" role="alert">
              Сервер недоступен: {loadError}.{' '}
              <button onClick={() => void refresh()}>Повторить</button>
            </div>
          )}
          {view === 'all' && (
            <SearchPanel
              key={user?.id || 'guest'}
              searching={jobs.some((job) => ['queued', 'running', 'waiting'].includes(job.status))}
              onQuery={setQuery}
              onSearch={(criteria) => {
                setDatabaseSearch(criteria);
                setResultsOnly(false);
                reset();
              }}
              localCount={
                databaseSearch
                  ? listings.filter(
                      (l) => l.rating !== 1 && matchesDatabaseSearch(l, databaseSearch),
                    ).length
                  : null
              }
              onClearSearch={() => {
                setDatabaseSearch(null);
                reset();
              }}
              onStarted={(job) => {
                setJobs((js) => [job, ...js.filter((j) => j.id !== job.id)]);
                setSearchJobId(job.id);
                setResultsOnly(false);
                reset();
              }}
            />
          )}
          {view === 'viewings' ? (
            <Viewings
              listings={listings}
              onBrowse={() => setView('all')}
              onOpen={(id, viewingId) => {
                setViewingEditor(viewingId || null);
                setDetail(id);
              }}
            />
          ) : view === 'imports' ? (
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
                    <button
                      className="button secondary"
                      onClick={() => (user ? setImportOpen(true) : openLogin())}
                    >
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
                        {['queued', 'running', 'waiting'].includes(j.status) ? (
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
                      {['queued', 'running', 'waiting'].includes(j.status) && (
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
              {view === 'collections' && (
                <section className="collections-strip" aria-label="Подборки квартир">
                  {currentCollection && (
                    <button
                      className="button primary"
                      aria-label="Оценить объявления подборки"
                      disabled={
                        !listings.some(
                          (l) => currentCollection.listingIds.includes(l.id) && l.rating == null,
                        )
                      }
                      onClick={() => {
                        const ids = currentCollection.listingIds.filter((id) =>
                          listings.some((l) => l.id === id && l.rating == null),
                        );
                        if (!ids.length) return;
                        setReviewIds(ids);
                        detailPhoto.current = 0;
                        setDetail(ids[0]);
                      }}
                    >
                      <SlidersHorizontal size={16} />
                      Оценить ·{' '}
                      {
                        listings.filter(
                          (l) => currentCollection.listingIds.includes(l.id) && l.rating == null,
                        ).length
                      }
                    </button>
                  )}

                  {collections.map((group) => (
                    <button
                      key={group.id}
                      className={cx(
                        'collection-folder',
                        currentCollection?.id === group.id && 'active',
                      )}
                      onClick={() => {
                        setCollectionId(group.id);
                        reset();
                      }}
                    >
                      <FolderHeart size={22} />
                      <span>
                        <b>{group.name}</b>
                        <small>
                          {group.listingIds.filter((id) => active.some((l) => l.id === id)).length}{' '}
                          квартир
                        </small>
                      </span>
                    </button>
                  ))}
                  <button
                    className="collection-folder collection-create"
                    onClick={() => (user ? setCollectionPicker([]) : openLogin())}
                  >
                    <FolderPlus size={22} />
                    <span>Новая подборка</span>
                  </button>
                </section>
              )}
              <div className="collection-heading">
                <div>
                  <h2>
                    {view === 'favorites'
                      ? 'Избранные квартиры'
                      : view === 'all' && searchJobId && resultsOnly
                        ? 'Результаты поиска'
                        : view === 'archive'
                          ? 'Архив'
                          : view === 'ranking'
                            ? 'Ваш рейтинг квартир'
                            : view === 'collections'
                              ? currentCollection?.name || 'Подборки'
                              : 'Сохраненные квартиры'}
                  </h2>
                  <span className="count-badge">{visible.length}</span>
                </div>
                <span className="collection-sub">
                  {visible.length} показано · {listings.length} всего сохранено
                </span>
              </div>
              {view !== 'all' && (
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
              )}
              {view !== 'all' && filters && (
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
                <div className="source-tabs" hidden={view === 'all'}>
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
                {user && !['ranking', 'archive'].includes(view) && (
                  <div className="rating-filter" role="group" aria-label="Фильтр по моей оценке">
                    {[
                      ['all', 'Все'],
                      ['unrated', 'Без оценки'],
                      ['rated', 'С оценкой'],
                    ].map(([key, label]) => (
                      <button
                        key={key}
                        aria-pressed={ratingFilter === key}
                        onClick={() => setRatingFilter(key)}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                )}
                {view === 'ranking' ? (
                  <span className="ranking-order">
                    <Trophy size={15} /> От лучших к менее подходящим
                  </span>
                ) : (
                  <label className="sort">
                    Сортировка:{' '}
                    <Select
                      aria-label="Сортировка"
                      value={sort}
                      onChange={(e) => setSort(e.target.value)}
                    >
                      <option value="new">Сначала новые</option>
                      {user && [
                        <option key="unrated" value="unrated">
                          Сначала без оценки
                        </option>,
                        <option key="rated" value="rated">
                          Сначала оценённые
                        </option>,
                        <option key="rating" value="rating">
                          Оценка: по убыванию
                        </option>,
                        <option key="rating-asc" value="rating-asc">
                          Оценка: по возрастанию
                        </option>,
                      ]}
                      <option value="rent">Дешевле в месяц</option>
                      <option value="entry">Меньше на въезд</option>
                    </Select>
                  </label>
                )}
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
                    {view === 'collections' && !collection.length
                      ? 'В подборке пока нет квартир'
                      : view === 'ranking' && !rated.length
                        ? 'Пока нет оценённых квартир'
                        : view === 'archive' && !archived.length
                          ? 'Архив пуст'
                          : listings.length
                            ? 'Здесь пока нет подходящих квартир'
                            : 'У хорошего поиска есть свое место'}
                  </h2>
                  <p>
                    {view === 'collections' && !collection.length
                      ? 'Отметьте квартиры чекбоксами и нажмите «В подборку». Архивные варианты здесь скрыты.'
                      : view === 'ranking' && !rated.length
                        ? 'Оцените квартиры в подборке. Варианты с оценками от 2 до 5 появятся здесь, с оценкой 1 — в архиве.'
                        : view === 'archive' && !archived.length
                          ? 'Сюда попадут объявления, которым вы поставите 1.'
                          : listings.length
                            ? 'Измените фильтры или добавьте варианты в избранное.'
                            : 'Укажите параметры в форме выше и нажмите «Найти квартиры». Здесь появятся объявления с Циана.'}
                  </p>
                  <div>
                    <button
                      className="button primary"
                      onClick={() =>
                        (view === 'ranking' && !rated.length) ||
                        (view === 'collections' && !collection.length)
                          ? (setView('all'), reset())
                          : listings.length && !(searchJobId && resultsOnly)
                            ? reset()
                            : document
                                .getElementById('cian-search')
                                ?.scrollIntoView({ behavior: 'smooth' })
                      }
                    >
                      {view === 'collections' && !collection.length
                        ? 'Выбрать квартиры'
                        : view === 'ranking' && !rated.length
                          ? 'Оценить квартиры'
                          : listings.length && !(searchJobId && resultsOnly)
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
                      rank={view === 'ranking' ? rankFor(l.rating!) : undefined}
                      archiving={archiving.includes(l.id)}
                      saveNote={saveNote}
                      rate={rateListing}
                      ratingBusy={busy || ratingPending.includes(l.id)}
                      refreshDisabled={
                        busy ||
                        jobs.some(
                          (j) =>
                            j.url === l.url && ['queued', 'running', 'waiting'].includes(j.status),
                        ) ||
                        ratingPending.includes(l.id)
                      }
                      refreshJob={jobs.find((j) => j.url === l.url)}
                      refreshListing={refreshListing}
                      open={openListing}
                      favorite={toggle}
                      selected={selected.includes(l.id)}
                      select={selectListing}
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
        {view === 'all' && <div id="load-more-cian" className="load-more-cian" />}
      </main>
      {selected.filter((id) => listings.some((l) => l.id === id)).length > 0 && (
        <div className="compare-tray">
          <span>
            <Layers3 size={19} />
            Выбрано: {selected.filter((id) => listings.some((l) => l.id === id)).length}
          </span>
          <button
            className="collection-save-button"
            onClick={() =>
              user
                ? setCollectionPicker(selected.filter((id) => listings.some((l) => l.id === id)))
                : openLogin()
            }
          >
            <FolderPlus size={17} />В подборку
          </button>
          {view === 'collections' && currentCollection && (
            <button
              disabled={busy}
              onClick={() =>
                void action(async () => {
                  await api('/collections/' + currentCollection.id + '/listings', 'DELETE', {
                    listingIds: selected,
                  });
                  setSelected([]);
                }, 'Квартиры убраны из подборки')
              }
            >
              Убрать из подборки
            </button>
          )}
          <button
            disabled={selected.length > 4}
            title={
              selected.length > 4
                ? 'Для сравнения выберите не больше 4 квартир'
                : 'Сравнить расходы'
            }
            onClick={() => setCompare(true)}
          >
            Сравнить расходы <ArrowRight size={16} />
          </button>
          <IconButton label="Снять выбор" onClick={() => setSelected([])}>
            <X size={17} />
          </IconButton>
        </div>
      )}
      {collectionPicker !== null && (
        <CollectionPicker
          groups={collections}
          ids={collectionPicker}
          onClose={() => setCollectionPicker(null)}
          onSaved={async (group) => {
            setCollections((old) => [group, ...old.filter((c) => c.id !== group.id)]);
            setCollectionId(group.id);
            setSelected([]);
            setCollectionPicker(null);
            setNotice('Подборка сохранена');
          }}
        />
      )}
      <SearchToasts
        jobs={jobs}
        listings={listings}
        onCancel={(id) => void action(() => api('/imports/' + id + '/cancel', 'POST', {}))}
        onOpenBrowser={(id) =>
          void action(() => api('/imports/' + id + '/open-browser', 'POST', {}))
        }
      />
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
      {edit && user?.role === 'admin' && (
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
          onPdf={() => void download([current.id], 'pdf', current.title, true)}
          pdfBusy={pdfBusy}
          initialPhoto={detailPhoto.current}
          position={visible.findIndex((l) => l.id === current.id) + 1}
          total={visible.length}
          previous={
            !reviewIds && visible.findIndex((l) => l.id === current.id) > 0
              ? () => setDetail(visible[visible.findIndex((l) => l.id === current.id) - 1].id)
              : undefined
          }
          next={
            !reviewIds &&
            visible.findIndex((l) => l.id === current.id) >= 0 &&
            visible.findIndex((l) => l.id === current.id) < visible.length - 1
              ? () => setDetail(visible[visible.findIndex((l) => l.id === current.id) + 1].id)
              : undefined
          }
          onRate={async (value) => {
            if (!user) {
              openLogin();
              return;
            }
            const index = visible.findIndex((l) => l.id === current.id);
            const adjacent = visible[index + 1] ?? visible[index - 1];
            const saved = await rateListing(current, value);
            if (saved && reviewIds && value !== null) {
              const next = reviewIds.find(
                (id) => id !== current.id && listings.some((l) => l.id === id && l.rating == null),
              );
              if (next) setDetail(next);
              else {
                setNotice('Подборка оценена. Все оценки сохранены.');
                return true;
              }
            }
            if (
              saved &&
              !reviewIds &&
              ((value === 1 && view !== 'archive') ||
                (personalFilter === 'unrated' && value != null) ||
                (personalFilter === 'rated' && value == null))
            ) {
              if (adjacent) {
                setDetail((id) => (id === current.id ? adjacent.id : id));
              } else {
                return true;
              }
            }
          }}
          reviewLabel={
            reviewIds
              ? `Оценка подборки · ${Math.min(reviewIds.length, reviewIds.filter((id) => listings.some((l) => l.id === id && l.rating != null)).length + 1)} из ${reviewIds.length}`
              : undefined
          }
          viewingEditor={viewingEditor}
          ratingBusy={ratingPending.includes(current.id)}
          memberships={collections.filter((group) => group.listingIds.includes(current.id))}
          onCollections={() => (user ? setCollectionPicker([current.id]) : openLogin())}
          onRefresh={() => refreshListing(current)}
          refreshJob={jobs.find((j) => j.url === current.url)}
          refreshDisabled={
            busy ||
            jobs.some(
              (j) => j.url === current.url && ['queued', 'running', 'waiting'].includes(j.status),
            ) ||
            !current.url ||
            current.source === 'manual' ||
            current.demo
          }
          months={months}
          setMonths={setMonths}
          onClose={() => {
            setDetail(null);
            setReviewIds(null);
            setViewingEditor(null);
          }}
          onEdit={() => {
            setDetail(null);
            setEdit(current);
          }}
          onDelete={() => setConfirmDelete(current)}
          onSaveNotes={async (notes) => {
            await saveNote(current.id, notes);
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
            <button
              className="button secondary"
              disabled={pdfBusy || !selected.length}
              onClick={() => void download(selected, 'pdf', 'Сравнение квартир')}
            >
              <ArrowDownToLine size={17} />
              {pdfBusy ? 'Готовим PDF…' : 'Экспорт PDF'}
            </button>
            <button className="button primary" onClick={() => void download(selected)}>
              <ArrowDownToLine size={17} />
              Экспорт XLSX
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
const Card = memo(function Card({
  saveNote,
  rank,
  archiving,
  listing: l,
  rate,
  ratingBusy,
  refreshDisabled,
  refreshJob,
  refreshListing,
  open,
  favorite,
  select,
  selected,
}: {
  listing: Listing;
  rank?: number;
  saveNote: (id: string, notes: string) => Promise<void>;
  archiving: boolean;
  rate: (listing: Listing, rating: number | null) => void;
  ratingBusy: boolean;
  refreshDisabled: boolean;
  refreshJob?: Job;
  refreshListing: (listing: Listing) => void;
  open: (id: string, photo?: number) => void;
  favorite: (listing: Listing) => void;
  select: (id: string) => void;
  selected: boolean;
}) {
  const c = costs(l);
  const refreshing = refreshJob && ['queued', 'running', 'waiting'].includes(refreshJob.status);
  const refreshable = !!l.url && l.source !== 'manual' && !l.demo;
  const [photoIndex, setPhotoIndex] = useState(0);
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  const swiped = useRef(false);
  const photo = Math.min(photoIndex, Math.max(0, l.photos.length - 1));
  return (
    <article
      data-listing-id={l.id}
      className={cx('apartment-card', selected && 'card-selected', archiving && 'card-archiving')}
      onPointerOutCapture={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setPhotoIndex(0);
      }}
      onPointerLeave={() => {
        setPhotoIndex(0);
      }}
    >
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
            open(l.id, photo);
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
        {rank !== undefined && (
          <span className="ranking-badge" aria-label={`Место ${rank}, оценка ${l.rating} из 5`}>
            <Trophy size={13} />
            <b>#{rank}</b>
            <span>{l.rating}/5</span>
          </span>
        )}
        <span className={'source-tag ' + l.source}>
          <i />
          {sourceNames[l.source]}
          {l.demo && <small> · демо</small>}
        </span>
        <button
          className={cx('heart-button', l.favorite && 'hearted')}
          aria-label={l.favorite ? 'Убрать из избранного' : 'В избранное'}
          onClick={() => favorite(l)}
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
        <CardNote notes={l.notes.trim()} onSave={(notes) => saveNote(l.id, notes)} />
        {l.photos.length > 0 && (
          <span className="photo-count">
            {photo + 1} / {l.photos.length}
          </span>
        )}
      </div>
      <div className="card-content">
        <button className="card-title" onClick={() => open(l.id, photo)}>
          {l.rooms === 0 ? 'Студия' : l.rooms ? `${l.rooms}-комн. квартира` : l.title}
          {l.area ? ` · ${l.area} м²` : ''}
          {l.floor ? ` · ${l.floor} этаж` : ''}
        </button>
        <div className="card-price">
          <b>{rub(l.rent)}</b>
          <span>/ месяц</span>
          <label title="Выбрать для подборки или сравнения" className="compare-checkbox">
            <input
              type="checkbox"
              checked={selected}
              onChange={() => select(l.id)}
              aria-label={'Сравнить ' + l.title}
              aria-description="Выбрать квартиру для добавления в подборку или сравнения"
            />
          </label>
        </div>
        <p className="card-address">{l.address || 'Адрес не указан'}</p>
        <p className="metro">
          <MetroDots station={listingMetroStation(l)} />
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
        <div className="card-action-row">
          <Rating
            value={l.rating ?? null}
            onChange={(rating) => rate(l, rating)}
            disabled={ratingBusy}
            title={l.title}
          />
          {l.rating === 1 && (
            <button
              className="card-restore"
              title="Вернуть в подборку"
              aria-label="Вернуть в подборку"
              onClick={() => rate(l, null)}
              disabled={ratingBusy}
            >
              <ArchiveRestore size={16} />
            </button>
          )}
          <button
            className="card-detail"
            onClick={() => open(l.id, photo)}
            aria-label="Подробнее и расчет"
            title="Подробнее и расчет"
          >
            <ArrowUpRight size={18} />
          </button>
          <button
            className="card-refresh"
            disabled={!refreshable || refreshDisabled}
            title={
              refreshable
                ? 'Получить свежие условия по исходной ссылке'
                : 'Нужна ссылка на реальное объявление площадки'
            }
            onClick={() => refreshListing(l)}
            aria-label={'Актуализировать ' + l.title}
          >
            <RefreshCw size={14} className={refreshing ? 'spin' : ''} />
          </button>
        </div>
      </div>
    </article>
  );
});
function Term({ months, setMonths }: { months: number; setMonths: (v: number) => void }) {
  return (
    <label className="term">
      Планирую снимать{' '}
      <Select
        compact
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
function CollectionPicker({
  groups,
  ids,
  onClose,
  onSaved,
}: {
  groups: ApartmentCollection[];
  ids: string[];
  onClose: () => void;
  onSaved: (group: ApartmentCollection) => Promise<void>;
}) {
  const [target, setTarget] = useState(ids.length && groups.length ? groups[0].id : 'new');
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  return (
    <Modal
      title="Сохранить в подборку"
      onClose={() => {
        if (!saving) onClose();
      }}
    >
      <form
        className="collection-picker"
        onSubmit={async (e) => {
          e.preventDefault();
          if (saving) return;
          setSaving(true);
          setError('');
          try {
            const group = await api<ApartmentCollection>(
              target === 'new' ? '/collections' : '/collections/' + target + '/listings',
              'POST',
              target === 'new' ? { name: name.trim(), listingIds: ids } : { listingIds: ids },
            );
            await onSaved(group);
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setSaving(false);
          }
        }}
      >
        <p>
          {ids.length
            ? `Выбрано квартир: ${ids.length}. Уже добавленные не дублируются.`
            : 'Создайте подборку, а затем добавьте квартиры через чекбоксы.'}
        </p>
        {!!ids.length &&
          groups.map((group) => (
            <label
              key={group.id}
              className={cx('collection-choice', target === group.id && 'active')}
            >
              <input
                type="radio"
                name="collection"
                value={group.id}
                checked={target === group.id}
                onChange={() => setTarget(group.id)}
                disabled={saving}
              />
              <FolderHeart size={20} />
              <span>
                {group.name}
                <small>
                  {ids.length === 1 && group.listingIds.includes(ids[0])
                    ? 'Уже в этой подборке'
                    : `${group.listingIds.length} квартир`}
                </small>
              </span>
            </label>
          ))}
        <label className={cx('collection-choice', target === 'new' && 'active')}>
          <input
            type="radio"
            name="collection"
            checked={target === 'new'}
            onChange={() => setTarget('new')}
            disabled={saving}
          />
          <FolderPlus size={20} />
          <span>Новая подборка</span>
        </label>
        {target === 'new' && (
          <input
            className="collection-name"
            aria-label="Название подборки"
            placeholder="Например, посмотреть в выходные"
            maxLength={80}
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={saving}
            autoFocus
          />
        )}
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <div className="form-actions">
          <button type="button" className="button secondary" disabled={saving} onClick={onClose}>
            Отмена
          </button>
          <button
            className="button primary"
            disabled={saving || (target === 'new' && !name.trim())}
          >
            {saving ? 'Сохраняем…' : target === 'new' ? 'Создать подборку' : 'Добавить в подборку'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
function DescriptionPreview({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false);
  const [long, setLong] = useState(false);
  const paragraph = useRef<HTMLParagraphElement>(null);
  useLayoutEffect(() => {
    const el = paragraph.current!;
    const measure = () => {
      if (!expanded) setLong(el.scrollHeight > el.clientHeight + 1);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [text, expanded]);
  return (
    <section className="detail-description">
      <h3>О квартире</h3>
      <p ref={paragraph} className={expanded ? 'expanded' : ''}>
        {text}
      </p>
      {(long || expanded) && (
        <button type="button" aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>
          {expanded ? 'Свернуть' : 'Ещё…'}
        </button>
      )}
    </section>
  );
}
function animateDetailPhoto(
  host: HTMLElement,
  image: HTMLImageElement | null,
  from: DOMRect | undefined,
  to: DOMRect | undefined,
  opening: boolean,
) {
  if (
    !image?.naturalWidth ||
    !from ||
    !to ||
    from.width <= 0 ||
    to.width <= 0 ||
    matchMedia('(prefers-reduced-motion: reduce)').matches
  )
    return null;
  const ghost = document.createElement('div');
  ghost.className = 'detail-photo-morph';
  ghost.setAttribute('aria-hidden', 'true');
  const clone = image.cloneNode() as HTMLImageElement;
  clone.removeAttribute('class');
  clone.alt = '';
  ghost.append(clone);
  host.append(ghost);
  const fit = (r: DOMRect, cover: boolean) =>
    (cover ? Math.max : Math.min)(r.width / image.naturalWidth, r.height / image.naturalHeight);
  const startScale = fit(from, opening),
    endScale = fit(to, !opening);
  const galleryRadius = innerWidth <= 760 ? '22px 22px 0 0' : '28px 0 0 28px';
  const duration = opening ? 420 : 300;
  const options = { duration, easing: 'cubic-bezier(.22,1,.36,1)', fill: 'both' as const };
  const frame = (r: DOMRect, radius: string) => ({
    left: `${r.x}px`,
    top: `${r.y}px`,
    width: `${r.width}px`,
    height: `${r.height}px`,
    borderRadius: radius,
  });
  const geometry = ghost.animate(
    [frame(from, opening ? '22px' : galleryRadius), frame(to, opening ? galleryRadius : '22px')],
    options,
  );
  const picture = clone.animate(
    [
      {
        width: `${image.naturalWidth * startScale}px`,
        height: `${image.naturalHeight * startScale}px`,
      },
      {
        width: `${image.naturalWidth * endScale}px`,
        height: `${image.naturalHeight * endScale}px`,
      },
    ],
    options,
  );
  const fade = ghost.animate(
    [
      { opacity: 1, offset: 0 },
      { opacity: 1, offset: 0.85 },
      { opacity: 0, offset: 1 },
    ],
    { ...options, easing: 'linear' },
  );
  const cancel = () => {
    geometry.cancel();
    picture.cancel();
    fade.cancel();
    ghost.remove();
  };
  void geometry.finished.then(() => ghost.remove()).catch(() => {});
  return { cancel, finished: geometry.finished };
}
function DecisionIsland({ expanded, children }: { expanded: boolean; children: ReactNode }) {
  const content = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState<number>();
  useLayoutEffect(() => {
    const el = content.current!;
    const measure = () => setHeight(el.getBoundingClientRect().height + 2);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return (
    <div className="detail-decision decision-island" data-open={expanded} style={{ height }}>
      <div ref={content} className="decision-island-content">
        {children}
      </div>
    </div>
  );
}
function DetailComment({
  reveal = false,
  notes,
  initialDraft,
  onDraft,
  onSave,
}: {
  notes: string;
  initialDraft?: string;
  reveal?: boolean;
  onDraft: (v: string) => void;
  onSave: (v: string) => Promise<void>;
}) {
  const { user, open: login } = useAuth();
  const [draft, setDraft] = useState(initialDraft ?? notes);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const field = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    if (!field.current) return;
    const el = field.current;
    const previous = el.style.height || '22px';
    el.style.transition = 'none';
    el.style.height = '0px';
    const height = Math.min(180, el.scrollHeight) + 'px';
    el.style.height = previous;
    void el.offsetHeight;
    el.style.transition = '';
    el.style.height = height;
  }, [draft, user?.id, editing]);
  const dirty = draft.trim() !== notes.trim();
  if (!user)
    return (
      <button className="detail-comment-login" onClick={login}>
        <Plus size={16} />
        <span>Добавить комментарий</span>
        <ArrowUpRight size={15} />
      </button>
    );
  if (!draft && !notes && !editing && !reveal)
    return (
      <button type="button" className="detail-comment-add" onClick={() => setEditing(true)}>
        <Plus size={15} />
        <span>Добавить заметку</span>
      </button>
    );
  return (
    <form
      className="detail-comment"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!user) {
          login();
          return;
        }
        if (!dirty || busy) return;
        setBusy(true);
        setError('');
        try {
          await onSave(draft.trim());
        } catch (e) {
          setError((e as Error).message);
        } finally {
          setBusy(false);
        }
      }}
    >
      <label htmlFor="detail-comment-field">
        Мой комментарий <span>· только для вас</span>
      </label>
      <textarea
        ref={field}
        autoFocus={editing}
        onFocus={() => setEditing(true)}
        onBlur={(event) => {
          if (
            !draft.trim() &&
            !event.currentTarget.closest('.detail-decision')?.contains(event.relatedTarget)
          )
            setEditing(false);
        }}
        id="detail-comment-field"
        aria-label="Быстрый комментарий"
        rows={1}
        maxLength={5000}
        placeholder={user ? 'Добавить заметку…' : 'Войдите, чтобы оставить комментарий'}
        readOnly={!user}
        value={draft}
        disabled={busy}
        onChange={(e) => {
          setDraft(e.target.value);
          onDraft(e.target.value);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            e.currentTarget.form?.requestSubmit();
          }
        }}
      />
      {(dirty || error) && (
        <div className="detail-comment-footer">
          {error && <span role="alert">{error}</span>}
          <button
            disabled={busy || !dirty}
            aria-label="Сохранить комментарий"
            title="Сохранить комментарий · ⌘/Ctrl + Enter"
          >
            {busy ? <RefreshCw size={15} className="spin" /> : <Check size={16} />}
          </button>
        </div>
      )}
    </form>
  );
}
function Detail({
  listing: l,
  onPdf,
  pdfBusy,
  initialPhoto,
  position,
  total,
  previous,
  next,
  onRate,
  ratingBusy,
  memberships,
  onCollections,
  onRefresh,
  refreshJob,
  refreshDisabled,
  months,
  setMonths,
  onClose,
  reviewLabel,
  viewingEditor,
  onEdit,
  onDelete,
  onSaveNotes,
}: {
  onPdf: () => void;
  pdfBusy: boolean;
  listing: Listing;
  initialPhoto: number;
  position: number;
  total: number;
  previous?: () => void;
  next?: () => void;
  onRate: (value: number | null) => Promise<boolean | void>;
  ratingBusy: boolean;
  memberships: ApartmentCollection[];
  onCollections: () => void;
  onRefresh: () => void;
  refreshJob?: Job;
  refreshDisabled: boolean;
  months: number;
  setMonths: (v: number) => void;
  onClose: () => void;
  reviewLabel?: string;
  viewingEditor: string | null;
  onEdit: () => void;
  onDelete: () => void;
  onSaveNotes: (notes: string) => Promise<void>;
}) {
  const { user } = useAuth();
  const dialog = useRef<HTMLDialogElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const drafts = useRef(new Map<string, string>());
  const closing = useRef(false);
  const transitionCleanup = useRef<(() => void) | null>(null);
  const [photo, setPhoto] = useState(initialPhoto);
  const [saving, setSaving] = useState(false);
  const c = costs(l, months);
  const safePhoto = Math.min(photo, Math.max(0, l.photos.length - 1));
  const close = () => {
    if (closing.current || saving) return;
    closing.current = true;
    dialog.current!.dataset.closing = 'true';
    transitionCleanup.current?.();
    const el = panel.current!;
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const fade = el.animate(
      [
        { opacity: 1, transform: 'translateY(0) scale(1)' },
        { opacity: 0, transform: 'translateY(10px) scale(.985)' },
      ],
      { duration: reduced ? 0 : 180, easing: 'cubic-bezier(.4,0,1,1)', fill: 'forwards' },
    );
    transitionCleanup.current = () => fade.cancel();
    void fade.finished.then(onClose).catch(() => {});
  };
  useLayoutEffect(() => {
    const d = dialog.current!;
    const el = panel.current!;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    d.showModal();
    transitionCleanup.current?.();
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const source = document.querySelector<HTMLElement>(`[data-listing-id="${l.id}"]`);
    const sourcePhoto = source?.querySelector<HTMLElement>('.card-image');
    const image = sourcePhoto?.querySelector<HTMLImageElement>('.image-open img') || null;
    const media = el.querySelector<HTMLElement>('.detail-media')!;
    const morph = animateDetailPhoto(
      d,
      image,
      sourcePhoto?.getBoundingClientRect(),
      media.getBoundingClientRect(),
      true,
    );
    const fade = el.animate([{ opacity: 0 }, { opacity: 1 }], {
      duration: reduced ? 0 : 260,
      delay: reduced ? 0 : 70,
      fill: 'backwards',
      easing: 'ease-out',
    });
    const info = el.querySelector<HTMLElement>('.detail-info')!;
    const reveal = info.animate(
      [
        { opacity: 0, transform: 'translateY(10px)' },
        { opacity: 1, transform: 'none' },
      ],
      {
        duration: reduced ? 0 : 250,
        delay: reduced ? 0 : 130,
        fill: 'backwards',
        easing: 'ease-out',
      },
    );
    const cleanup = () => {
      morph?.cancel();
      fade.cancel();
      reveal.cancel();
    };
    transitionCleanup.current = cleanup;
    return () => {
      transitionCleanup.current?.();
      transitionCleanup.current = null;
      d.close();
      document.body.style.overflow = overflow;
    };
  }, []);
  const lastId = useRef(l.id);
  useLayoutEffect(() => {
    if (lastId.current !== l.id) {
      setPhoto(0);
      lastId.current = l.id;
      panel.current?.querySelector('.detail-info')?.scrollTo(0, 0);
    }
  }, [l.id, l.notes]);
  const changePhoto = (delta: number) => {
    if (l.photos.length) setPhoto((safePhoto + delta + l.photos.length) % l.photos.length);
  };
  return (
    <dialog
      ref={dialog}
      className="listing-dialog"
      aria-label={l.title}
      onCancel={(e) => {
        e.preventDefault();
        close();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) close();
      }}
      onKeyDown={(e) => {
        if ((e.target as HTMLElement).closest('input,textarea,[role="combobox"],[role="listbox"]'))
          return;
        if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
          e.preventDefault();
          if (e.altKey) {
            if (!saving) (e.key === 'ArrowLeft' ? previous : next)?.();
          } else changePhoto(e.key === 'ArrowLeft' ? -1 : 1);
        }
      }}
    >
      <button
        className="listing-nav listing-prev"
        aria-label="Предыдущее объявление"
        title="Предыдущее объявление · Alt + ←"
        disabled={!previous || saving}
        onClick={previous}
      >
        <ChevronLeft size={24} />
      </button>
      <div ref={panel} className="listing-panel">
        <section className="detail-media" aria-label="Фотографии квартиры">
          <Photo src={l.photos[safePhoto]} alt={l.title} />
          <span className="detail-source">
            {sourceNames[l.source]}
            {l.demo ? ' · демо' : ''}
          </span>
          {l.photos.length > 1 && (
            <>
              <button
                className="detail-photo-arrow photo-prev"
                aria-label="Предыдущее фото"
                onClick={() => changePhoto(-1)}
              >
                <ChevronLeft size={22} />
              </button>
              <button
                className="detail-photo-arrow photo-next"
                aria-label="Следующее фото"
                onClick={() => changePhoto(1)}
              >
                <ChevronRight size={22} />
              </button>
            </>
          )}
          <span className="detail-photo-count">
            {l.photos.length ? `${safePhoto + 1} / ${l.photos.length}` : 'Нет фотографий'}
          </span>
          <div className="detail-media-dock">
            <DecisionIsland expanded={!!l.rating || !!l.notes || !!drafts.current.get(l.id)}>
              <div className="decision-island-toolbar">
                <button
                  className="decision-island-action"
                  disabled={ratingBusy}
                  onClick={async () => {
                    if (await onRate(5)) close();
                  }}
                  aria-label="Поставить 5 — Отличный вариант"
                  title="5 из 5 · Отличный вариант"
                  aria-pressed={l.rating === 5}
                >
                  <Heart size={17} fill={l.rating === 5 ? 'currentColor' : 'none'} />
                </button>
                <Rating
                  key={l.id}
                  value={l.rating ?? null}
                  alwaysOpen
                  onChange={async (value) => {
                    if (await onRate(value)) close();
                  }}
                  disabled={ratingBusy}
                  title={l.title}
                />
                <button
                  className="decision-island-action"
                  disabled={ratingBusy}
                  aria-label="Поставить 1 — Не подходит"
                  title="1 из 5 · Не подходит"
                  aria-pressed={l.rating === 1}
                  onClick={async () => {
                    if (await onRate(1)) close();
                  }}
                >
                  <Trash2 size={16} />
                </button>
              </div>
              {(!!l.rating || !!l.notes || !!drafts.current.get(l.id)) && (
                <div className="decision-island-note">
                  <DetailComment
                    reveal
                    key={'comment-' + l.id}
                    notes={l.notes}
                    initialDraft={drafts.current.get(l.id)}
                    onDraft={(value) => drafts.current.set(l.id, value)}
                    onSave={async (value) => {
                      setSaving(true);
                      try {
                        await onSaveNotes(value);
                        drafts.current.delete(l.id);
                      } finally {
                        setSaving(false);
                      }
                    }}
                  />
                </div>
              )}
            </DecisionIsland>
            {l.photos.length > 1 && (
              <div className="detail-thumbs">
                {l.photos.map((src, i) => (
                  <button
                    key={i}
                    className={cx(i === safePhoto && 'selected')}
                    aria-label={`Фото ${i + 1}`}
                    aria-pressed={i === safePhoto}
                    onClick={() => setPhoto(i)}
                  >
                    <Photo src={src} alt="" />
                  </button>
                ))}
              </div>
            )}
          </div>
        </section>
        <section className="detail-info">
          <div className="detail-topline">
            <span>
              {reviewLabel || (position > 0 ? `${position} из ${total} вариантов` : 'Квартира')}
            </span>
            <IconButton label="Закрыть" onClick={close}>
              <X size={18} />
            </IconButton>
          </div>
          <h2>{l.title}</h2>
          <p className="detail-address">{l.address || 'Адрес не указан'}</p>
          <div className="detail-facts">
            <span>{l.area ? `${l.area} м²` : '— м²'}</span>
            <span>{l.rooms === 0 ? 'Студия' : l.rooms ? `${l.rooms} комн.` : '— комн.'}</span>
            <span>{l.floor ? `${l.floor} этаж` : '— этаж'}</span>
          </div>
          {l.metro && (
            <p className="detail-metro">
              <MetroDots station={listingMetroStation(l)} /> {l.metro}
              {l.metroMinutes !== null ? ` · ${l.metroMinutes} мин. пешком` : ''}
            </p>
          )}
          <div className="detail-rent">
            <strong>{rub(l.rent)}</strong>
            <span>/ месяц</span>
          </div>
          <div className="detail-personal-actions">
            <button
              className="detail-collection-button"
              onClick={onPdf}
              disabled={pdfBusy}
              aria-label="Скачать подробный PDF объявления"
            >
              <ArrowDownToLine size={16} />
              {pdfBusy ? 'Готовим…' : 'PDF'}
            </button>
            <button
              type="button"
              className={cx('detail-collection-button', memberships.length > 0 && 'saved')}
              onClick={onCollections}
            >
              {memberships.length ? <FolderHeart size={16} /> : <FolderPlus size={16} />}
              {memberships.length ? `В подборках · ${memberships.length}` : 'В подборку'}
              <Plus size={14} />
            </button>
          </div>
          {!!memberships.length && (
            <div className="detail-memberships" aria-label="Квартира сохранена в подборках">
              {memberships.map((group) => (
                <span key={group.id}>
                  <Check size={12} />
                  {group.name}
                </span>
              ))}
            </div>
          )}
          <ViewingWidget
            key={'viewing-' + l.id}
            listingId={l.id}
            initialViewingId={viewingEditor}
          />
          <div className="detail-finances">
            <div className="detail-entry">
              <span>На въезд{c.incomplete ? ' · от' : ''}</span>
              <b>{rub(c.moveIn)}</b>
            </div>
            <div className="detail-expenses">
              {[
                ['Залог', l.deposit],
                ['Комиссия', l.commission === null ? null : c.fee],
                ['ЖКУ / мес.', l.utilities],
                ['Прочие', l.otherCosts],
              ].map(([name, value]) => (
                <div key={String(name)}>
                  <span>{name}</span>
                  <b>{value === null ? 'Не указано' : rub(Number(value))}</b>
                </div>
              ))}
            </div>
            <Term months={months} setMonths={setMonths} />
            <div className="detail-total">
              <span>За {months} мес. без залога</span>
              <b>
                {c.incomplete ? 'от ' : ''}
                {rub(c.total)}
              </b>
            </div>
            <p className="detail-disclaimer">
              Залог возвратный.{' '}
              {c.incomplete
                ? 'Неизвестные платежи не включены.'
                : 'Учтены аренда, ЖКУ и разовые платежи.'}
            </p>
          </div>
          <PropertyDetails listing={l} />
          <DescriptionPreview key={l.id} text={l.description || 'Описание пока не добавлено.'} />
          {l.demo && (
            <p className="detail-disclaimer">Демонстрационный пример с вымышленными условиями.</p>
          )}
          {l.rating && <p className="detail-rating-label">Ваша оценка · {l.rating}/5</p>}
          <div className="detail-actions">
            {l.url && (
              <a className="button primary" href={l.url} target="_blank" rel="noreferrer">
                На {sourceNames[l.source]}
                <ArrowUpRight size={16} />
              </a>
            )}
            <button className="button secondary" onClick={onRefresh} disabled={refreshDisabled}>
              <RefreshCw
                size={15}
                className={
                  refreshJob && ['queued', 'running', 'waiting'].includes(refreshJob.status)
                    ? 'spin'
                    : ''
                }
              />
              Актуализировать
            </button>
            {user?.role === 'admin' && (
              <>
                <IconButton label="Редактировать" onClick={onEdit}>
                  <SlidersHorizontal size={17} />
                </IconButton>
                <IconButton label="Удалить" onClick={onDelete}>
                  <Trash2 size={17} />
                </IconButton>
              </>
            )}
          </div>
          <small className="detail-updated" title={new Date(l.updatedAt).toLocaleString('ru-RU')}>
            <RefreshCw size={11} />
            Данные обновлены{' '}
            {new Date(l.updatedAt).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })}
          </small>
        </section>
      </div>
      <button
        className="listing-nav listing-next"
        aria-label="Следующее объявление"
        title="Следующее объявление · Alt + →"
        disabled={!next || saving}
        onClick={next}
      >
        <ChevronRight size={24} />
      </button>
    </dialog>
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
  const { user } = useAuth();
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
        {user?.role === 'admin' && (
          <button className={cx(mode === 'html' && 'selected')} onClick={() => setMode('html')}>
            <FileCode2 size={17} />
            HTML-файл
          </button>
        )}
        {user?.role === 'admin' && (
          <button onClick={onManual}>
            <Plus size={17} />
            Вручную
          </button>
        )}
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
