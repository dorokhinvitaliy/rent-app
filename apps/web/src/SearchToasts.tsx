import { useEffect, useState } from 'react';
import { Check, Search, X } from 'lucide-react';
import type { Job } from './api';
const active = (job: Job) => ['queued', 'running', 'waiting'].includes(job.status);
type Props = { jobs: Job[]; onCancel: (id: string) => void; onOpenBrowser: (id: string) => void };
function SearchToast({ job, onCancel, onOpenBrowser }: Omit<Props, 'jobs'> & { job: Job }) {
  const [hidden, setHidden] = useState(false);
  const working = active(job);
  useEffect(() => {
    if (working || job.status === 'failed') return;
    const timer = setTimeout(() => setHidden(true), 8000);
    return () => clearTimeout(timer);
  }, [working, job.status]);
  if (hidden) return null;
  const title =
    job.status === 'queued'
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
          {working ? <Search size={18} /> : <Check size={18} />}
        </span>
        <div className="search-toast-copy">
          <strong className={working && job.status !== 'waiting' ? 'search-shimmer' : ''}>
            {title}
          </strong>
          {working && job.status !== 'queued' && (
            <small>
              {job.status === 'waiting'
                ? 'Пройдите проверку, чтобы продолжить'
                : job.scanned
                  ? `Обработано ${job.scanned} объявлений · Подошло ${job.count}`
                  : 'Результаты появятся в списке'}
            </small>
          )}
          {job.status === 'failed' && <small>{job.message}</small>}
        </div>
        <button
          aria-label={working ? 'Остановить поиск' : 'Закрыть поиск'}
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
          aria-label="Поиск квартир"
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
