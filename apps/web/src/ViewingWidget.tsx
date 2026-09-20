import { useEffect, useState } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight, Check, X, Pencil, Clock3 } from 'lucide-react';
import { type Viewing } from '@rent/shared';
import { api } from './api';
import { useAuth } from './Auth';
import { Select } from './Select';
const dateKey = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const labels = { planned: 'Запланирован', visited: 'Состоялся', cancelled: 'Отменён' };
export function ViewingWidget({
  listingId,
  initialViewingId,
}: {
  listingId: string;
  initialViewingId: string | null;
}) {
  const { user, open: login } = useAuth();
  const [saved, setSaved] = useState<Viewing | null>(null),
    [expanded, setExpanded] = useState(!!initialViewingId),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [loaded, setLoaded] = useState(false);
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const [day, setDay] = useState(dateKey(tomorrow)),
    [time, setTime] = useState('18:00'),
    [month, setMonth] = useState(new Date(tomorrow.getFullYear(), tomorrow.getMonth(), 1));
  const [status, setStatus] = useState<Viewing['status']>('planned'),
    [feedback, setFeedback] = useState(''),
    [noteOpen, setNoteOpen] = useState(false),
    [calendar, setCalendar] = useState(false);
  const load = (v: Viewing) => {
    setSaved(v);
    const d = new Date(v.startsAt);
    setDay(dateKey(d));
    setTime(`${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`);
    setMonth(new Date(d.getFullYear(), d.getMonth(), 1));
    setStatus(v.status);
    setFeedback(v.feedback);
    setNoteOpen(!!v.feedback);
  };
  useEffect(() => {
    if (!user) return;
    let active = true;
    api<Viewing[]>('/viewings')
      .then((items) => {
        if (!active) return;
        const own = items.filter((v) => v.listingId === listingId);
        const v =
          own.find((v) => v.id === initialViewingId) ||
          own.find((v) => v.status === 'planned') ||
          own.at(-1);
        if (v) load(v);
      })
      .catch((e) => active && setError(e.message))
      .finally(() => active && setLoaded(true));
    return () => {
      active = false;
    };
  }, [listingId, user?.id, initialViewingId]);
  const title = saved
    ? new Date(saved.startsAt).toLocaleDateString('ru-RU', {
        day: 'numeric',
        month: 'long',
        hour: '2-digit',
        minute: '2-digit',
      })
    : 'Запланировать просмотр';
  const displayDay = new Date(day + 'T12:00:00').toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'long',
  });
  const first = (month.getDay() + 6) % 7,
    count = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  return (
    <section
      className={'viewing-widget' + (expanded ? ' expanded' : '')}
      aria-label="Просмотр квартиры"
    >
      <button
        type="button"
        className="viewing-widget-trigger"
        aria-label={saved ? 'Изменить просмотр' : 'Запланировать просмотр'}
        disabled={!!user && !loaded}
        aria-expanded={expanded}
        onClick={() => {
          if (!user) {
            login();
            return;
          }
          setExpanded(!expanded);
        }}
      >
        <span className="viewing-widget-icon">
          <CalendarDays size={18} />
        </span>
        <span>
          <strong>{title}</strong>
          <small>{saved ? labels[saved.status] : 'Выберите удобный день и время'}</small>
        </span>
        {saved ? <Pencil size={15} /> : <ChevronRight size={16} />}
      </button>
      {expanded && loaded && (
        <form
          className="viewing-widget-form"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError('');
            try {
              const result = await api<Viewing>(
                '/viewings' + (saved ? '/' + saved.id : ''),
                saved ? 'PATCH' : 'POST',
                { listingId, startsAt: new Date(day + 'T' + time).toISOString(), status, feedback },
              );
              load(result);
              setExpanded(false);
              setCalendar(false);
              window.dispatchEvent(new Event('viewings-changed'));
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <div className="viewing-widget-inputs">
            <button
              type="button"
              className="viewing-date-trigger"
              aria-label="Выбрать дату просмотра"
              aria-expanded={calendar}
              onClick={() => setCalendar(!calendar)}
            >
              <CalendarDays size={15} />
              {displayDay}
              <ChevronRight size={13} />
            </button>
            <div className="viewing-time" role="group" aria-label="Время просмотра">
              <Clock3 size={15} />
              <Select
                compact
                aria-label="Часы просмотра"
                value={time.split(':')[0]}
                onChange={(e) => setTime(e.target.value + ':' + time.split(':')[1])}
              >
                {Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0')).map((v) => (
                  <option key={v} value={v}>
                    {v}
                  </option>
                ))}
              </Select>
              <span>:</span>
              <Select
                compact
                aria-label="Минуты просмотра"
                value={time.split(':')[1]}
                onChange={(e) => setTime(time.split(':')[0] + ':' + e.target.value)}
              >
                {Array.from({ length: 60 }, (_, i) => String(i).padStart(2, '0')).map((v) => (
                  <option key={v} value={v}>
                    {v}
                  </option>
                ))}
              </Select>
            </div>
          </div>
          {calendar && (
            <div
              className="viewing-calendar"
              aria-label="Календарь просмотра"
              onKeyDown={(e) => {
                if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) {
                  e.preventDefault();
                  e.stopPropagation();
                  const cells = Array.from(
                    e.currentTarget.querySelectorAll<HTMLButtonElement>('.calendar-days button'),
                  );
                  const index = cells.indexOf(e.target as HTMLButtonElement);
                  if (index >= 0)
                    cells[
                      Math.max(
                        0,
                        Math.min(
                          cells.length - 1,
                          index +
                            ({ ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[e.key] ||
                              0),
                        ),
                      )
                    ]?.focus();
                }
                if (e.key === 'Escape') {
                  e.preventDefault();
                  e.stopPropagation();
                  setCalendar(false);
                }
              }}
            >
              <div className="calendar-heading">
                <button
                  type="button"
                  aria-label="Предыдущий месяц"
                  onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}
                >
                  <ChevronLeft size={16} />
                </button>
                <strong>
                  {month.toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' })}
                </strong>
                <button
                  type="button"
                  aria-label="Следующий месяц"
                  onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}
                >
                  <ChevronRight size={16} />
                </button>
              </div>
              <div className="calendar-grid">
                <div className="calendar-weekdays">
                  {['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'].map((d) => (
                    <span key={d}>{d}</span>
                  ))}
                </div>
                <div className="calendar-days">
                  {Array.from({ length: first }, (_, i) => (
                    <span key={'empty' + i} />
                  ))}
                  {Array.from({ length: count }, (_, i) => {
                    const d = new Date(month.getFullYear(), month.getMonth(), i + 1),
                      key = dateKey(d);
                    return (
                      <button
                        type="button"
                        key={key}
                        aria-label={d.toLocaleDateString('ru-RU', {
                          day: 'numeric',
                          month: 'long',
                          year: 'numeric',
                        })}
                        aria-pressed={day === key}
                        className={key === dateKey(new Date()) ? 'today' : ''}
                        onClick={() => {
                          setDay(key);
                          setCalendar(false);
                        }}
                      >
                        {i + 1}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div className="calendar-shortcuts">
                {[0, 1, 2].map((n) => {
                  const d = new Date();
                  d.setDate(d.getDate() + n);
                  return (
                    <button
                      type="button"
                      key={n}
                      onClick={() => {
                        setDay(dateKey(d));
                        setMonth(new Date(d.getFullYear(), d.getMonth(), 1));
                        setCalendar(false);
                      }}
                    >
                      {['Сегодня', 'Завтра', 'Послезавтра'][n]}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
          <div className="viewing-widget-options">
            {saved && (
              <Select
                compact
                aria-label="Статус просмотра"
                value={status}
                onChange={(e) => setStatus(e.target.value as Viewing['status'])}
              >
                {Object.entries(labels).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </Select>
            )}
            <button
              type="button"
              className="viewing-note-toggle"
              onClick={() => setNoteOpen(!noteOpen)}
            >
              <Pencil size={13} />
              {feedback ? 'Впечатления' : 'Добавить заметку'}
            </button>
          </div>
          {noteOpen && (
            <textarea
              rows={2}
              maxLength={5000}
              aria-label="Фидбэк о просмотре"
              placeholder="Что уточнить или как прошла встреча…"
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
            />
          )}
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <div className="viewing-widget-footer">
            {saved && (
              <button
                className="viewing-delete"
                type="button"
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  try {
                    await api('/viewings/' + saved.id, 'DELETE', {});
                    setSaved(null);
                    setStatus('planned');
                    setFeedback('');
                    setExpanded(false);
                    window.dispatchEvent(new Event('viewings-changed'));
                  } catch (e) {
                    setError((e as Error).message);
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                Удалить
              </button>
            )}
            <button
              type="button"
              className="viewing-widget-cancel"
              aria-label="Отменить редактирование просмотра"
              onClick={() => {
                if (saved) load(saved);
                setExpanded(false);
              }}
              disabled={busy}
            >
              <X size={16} />
            </button>
            <button className="viewing-widget-save" disabled={busy} aria-label="Сохранить просмотр">
              <Check size={16} />
              {busy ? 'Сохраняем…' : saved ? 'Сохранить' : 'Запланировать'}
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
