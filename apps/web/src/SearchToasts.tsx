import { useEffect, useState } from 'react';
import { Check, Search, X, AlertCircle, RefreshCw } from 'lucide-react';
import type { Job } from './api';
const active = (job: Job) => ['queued', 'running', 'waiting'].includes(job.status);
type Props = {
  jobs: Job[];
  listings: { url: string | null; title: string; address: string }[];
  onCancel: (id: string) => void;
  onOpenBrowser: (id: string) => void;
};
function SearchToast({
  job,
  listings,
  onCancel,
  onOpenBrowser,
}: Omit<Props, 'jobs'> & { job: Job }) {
  const listing =
    !job.search && !job.urls?.length ? listings.find((item) => item.url === job.url) : undefined;
  const updating = !!listing;
  const [hidden, setHidden] = useState(false);
  const working = active(job);
  useEffect(() => {
    if (working) return;
    const timer = setTimeout(() => setHidden(true), job.status === 'failed' ? 12000 : 8000);
    return () => clearTimeout(timer);
  }, [working, job.status]);
  if (hidden) return null;
  const title =
    updating && job.removedIds?.length
      ? 'Объявление снято с публикации'
      : updating
        ? job.status === 'queued'
          ? 'Скоро обновлю объявление…'
          : job.status === 'waiting'
            ? 'Нужна проверка на Циане'
            : working
              ? 'Обновляю объявление…'
              : job.status === 'failed'
                ? 'Не удалось обновить объявление'
                : job.status === 'cancelled'
                  ? 'Обновление остановлено'
                  : job.status === 'partial' && !job.count
                    ? 'Не удалось обновить объявление'
                    : 'Объявление обновлено'
        : job.status === 'queued'
          ? 'Скоро начну поиск…'
          : job.status === 'waiting'
            ? 'Нужна проверка на Циане'
            : working
              ? job.scanned
                ? 'Проверяю новые предложения…'
                : 'Ищу подходящие квартиры…'
              : job.status === 'failed'
                ? 'Не удалось продолжить поиск'
                : job.status === 'cancelled'
                  ? 'Поиск остановлен'
                  : `Найдено квартир: ${job.count}`;
  return (
    <div className="search-toast" role="status">
      <div className="search-toast-row">
        <span className="search-toast-icon">
          {working ? (
            updating ? (
              <RefreshCw size={18} className="spin" />
            ) : (
              <Search size={18} />
            )
          ) : job.status === 'failed' ? (
            <AlertCircle size={18} />
          ) : (
            <Check size={18} />
          )}
        </span>
        <div className="search-toast-copy">
          <strong className={working && job.status !== 'waiting' ? 'search-shimmer' : ''}>
            {title}
          </strong>
          {listing && (
            <small
              className="search-toast-listing"
              title={listing.title + (listing.address ? ' · ' + listing.address : '')}
            >
              {listing.title}
              {listing.address ? ' · ' + listing.address : ''}
            </small>
          )}
          {working && job.status !== 'queued' && (!updating || job.status === 'waiting') && (
            <small>
              {job.status === 'waiting'
                ? 'Пройдите проверку, чтобы продолжить'
                : job.scanned
                  ? `Обработано ${job.scanned} объявлений · Подошло ${job.count}`
                  : 'Результаты появятся в списке'}
            </small>
          )}
          {job.status === 'failed' && (
            <small>
              {/browserType\.|browserContext\.|Target page|Call log:|[\r\n]|--disable-/.test(
                job.message,
              ) || job.message.length > 240
                ? updating
                  ? 'Не получилось проверить данные. Попробуйте чуть позже.'
                  : 'Поиск временно недоступен. Попробуйте ещё раз чуть позже.'
                : job.message}
            </small>
          )}
        </div>
        <button
          aria-label={
            updating
              ? working
                ? 'Остановить обновление'
                : 'Закрыть уведомление об обновлении'
              : working
                ? 'Остановить поиск'
                : 'Закрыть поиск'
          }
          onClick={() => (working ? onCancel(job.id) : setHidden(true))}
        >
          <X size={16} />
        </button>
      </div>
      {job.canOpenBrowser && (
        <button className="text-button" onClick={() => onOpenBrowser(job.id)}>
          Открыть окно проверки
        </button>
      )}
      {working && (
        <div
          className={'search-toast-progress ' + (job.status === 'running' ? 'moving' : '')}
          role="progressbar"
          aria-label={updating ? 'Обновление объявления' : 'Поиск квартир'}
          aria-valuetext={title}
        >
          <span />
        </div>
      )}
    </div>
  );
}
export function SearchToasts({ jobs, ...actions }: Props) {
  const [tracked] = useState(() => new Set<string>());
  jobs.forEach((job) => {
    if (active(job) || Date.now() - Date.parse(job.createdAt) < 15000) tracked.add(job.id);
  });
  return (
    <aside className="search-toasts" aria-label="Поиск предложений">
      {jobs
        .filter((job) => tracked.has(job.id))
        .slice(0, 3)
        .map((job) => (
          <SearchToast key={job.id} job={job} {...actions} />
        ))}
    </aside>
  );
}
