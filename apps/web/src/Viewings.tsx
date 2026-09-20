import { useEffect, useState } from 'react';
import { CalendarDays, Plus, Pencil, X, Phone } from 'lucide-react';
import { type Listing, type Viewing } from '@rent/shared';
import { api } from './api';
import { Select } from './Select';
import { useAuth } from './Auth';
const labels = { planned: 'Запланирован', visited: 'Состоялся', cancelled: 'Отменён' };
const localDate = (value: string) => {
  const d = new Date(value);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
};
export function Viewings({
  listings,
  initialListing,
  onOpen,
  onInitialConsumed,
}: {
  listings: Listing[];
  initialListing: string | null;
  onOpen: (id: string) => void;
  onInitialConsumed: () => void;
}) {
  const { user, open: openLogin } = useAuth();
  const [items, setItems] = useState<Viewing[]>([]),
    [editing, setEditing] = useState<Partial<Viewing> | null>(
      initialListing ? { listingId: initialListing } : null,
    ),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  const reload = () =>
    api<Viewing[]>('/viewings')
      .then(setItems)
      .catch((e) => setError(e.message));
  useEffect(() => {
    if (user) void reload();
  }, [user?.id]);
  const start = (v: Partial<Viewing>) => {
    setError('');
    setEditing({
      startsAt: new Date(Date.now() + 86400000).toISOString(),
      status: 'planned',
      feedback: '',
      ...v,
    });
  };
  useEffect(() => {
    if (initialListing && user) {
      start({ listingId: initialListing });
      onInitialConsumed();
    }
  }, [initialListing]);
  if (!user)
    return (
      <section className="viewings-empty">
        <CalendarDays size={32} />
        <h2>Ваши просмотры квартир</h2>
        <p>Сохраняйте договорённости и впечатления после встречи.</p>
        <button className="button primary" onClick={openLogin}>
          Войти
        </button>
      </section>
    );
  return (
    <section className="viewings-section">
      <div className="viewings-heading">
        <div>
          <h2>Просмотры</h2>
          <p>От первой встречи до решения о переезде.</p>
        </div>
        <button
          className="button primary"
          disabled={!listings.length}
          onClick={() => start({ listingId: listings[0]?.id })}
        >
          <Plus size={17} />
          Запланировать
        </button>
      </div>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {editing && (
        <form
          className="viewing-editor"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError('');
            try {
              await api(
                '/viewings' + (editing.id ? '/' + editing.id : ''),
                editing.id ? 'PATCH' : 'POST',
                {
                  listingId: editing.listingId,
                  startsAt: new Date(editing.startsAt!).toISOString(),
                  status: editing.status,
                  feedback: editing.feedback || '',
                },
              );
              await reload();
              setEditing(null);
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <div className="viewing-editor-heading">
            <h3>{editing.id ? 'Изменить просмотр' : 'Новый просмотр'}</h3>
            <button
              type="button"
              aria-label="Закрыть планирование"
              onClick={() => setEditing(null)}
            >
              <X size={18} />
            </button>
          </div>
          <label className="field">
            Квартира
            <Select
              aria-label="Квартира для просмотра"
              value={editing.listingId || ''}
              onChange={(e) => setEditing({ ...editing, listingId: e.target.value })}
            >
              {listings.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.title} · {l.address}
                </option>
              ))}
            </Select>
          </label>
          <div className="viewing-fields">
            <label className="field">
              Дата и время
              <input
                aria-label="Дата и время просмотра"
                type="datetime-local"
                required
                value={editing.startsAt ? localDate(editing.startsAt) : ''}
                onChange={(e) =>
                  setEditing({
                    ...editing,
                    startsAt: e.target.value ? new Date(e.target.value).toISOString() : '',
                  })
                }
              />
            </label>
            <label className="field">
              Статус
              <Select
                aria-label="Статус просмотра"
                value={editing.status || 'planned'}
                onChange={(e) =>
                  setEditing({ ...editing, status: e.target.value as Viewing['status'] })
                }
              >
                {Object.entries(labels).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </Select>
            </label>
          </div>
          <label className="field">
            Впечатления и заметки
            <textarea
              aria-label="Фидбэк о просмотре"
              rows={3}
              maxLength={5000}
              placeholder="Что понравилось, что уточнить, о чём договорились…"
              value={editing.feedback || ''}
              onChange={(e) => setEditing({ ...editing, feedback: e.target.value })}
            />
          </label>
          <div className="viewing-editor-actions">
            {editing.id && (
              <button
                type="button"
                className="text-button"
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  try {
                    await api('/viewings/' + editing.id, 'DELETE', {});
                    await reload();
                    setEditing(null);
                  } catch (e) {
                    setError((e as Error).message);
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                Удалить просмотр
              </button>
            )}
            <button className="button primary" disabled={busy}>
              Сохранить просмотр
            </button>
          </div>
        </form>
      )}
      {!items.length && !editing && (
        <div className="viewings-empty">
          <CalendarDays size={32} />
          <h3>Первая встреча с будущим домом</h3>
          <p>Выберите квартиру, назначьте дату и сохраните впечатления после просмотра.</p>
        </div>
      )}
      <div className="viewings-list">
        {items.map((v) => {
          const l = listings.find((l) => l.id === v.listingId);
          if (!l) return null;
          const d = new Date(v.startsAt);
          return (
            <article key={v.id} className="viewing-card">
              <div className="viewing-date">
                <b>{d.getDate()}</b>
                <span>{d.toLocaleDateString('ru-RU', { month: 'short' })}</span>
                <small>
                  {d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}
                </small>
              </div>
              <div className="viewing-copy">
                <span className={'viewing-status ' + v.status}>{labels[v.status]}</span>
                <button className="viewing-title" onClick={() => onOpen(l.id)}>
                  {l.title}
                </button>
                <p>{l.address}</p>
                {v.feedback && <blockquote>{v.feedback}</blockquote>}
                {l.details?.contact?.phones[0] && (
                  <a className="viewing-phone" href={'tel:' + l.details.contact.phones[0]}>
                    <Phone size={13} />
                    {l.details.contact.phones[0]}
                  </a>
                )}
              </div>
              <button
                className="viewing-edit"
                aria-label={'Редактировать просмотр ' + l.title}
                onClick={() => start(v)}
              >
                <Pencil size={17} />
              </button>
            </article>
          );
        })}
      </div>
    </section>
  );
}
