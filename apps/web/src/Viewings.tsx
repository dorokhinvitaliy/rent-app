import { ViewingWidget } from './ViewingWidget';
import { useEffect, useState } from 'react';
import { CalendarDays, ArrowUpRight, Phone, Pencil } from 'lucide-react';
import { type Listing, type Viewing } from '@rent/shared';
import { api } from './api';
import { useAuth } from './Auth';
const labels = { planned: 'Запланирован', visited: 'Состоялся', cancelled: 'Отменён' };
export function Viewings({
  listings,
  onOpen,
  onBrowse,
}: {
  listings: Listing[];
  onOpen: (id: string, viewingId?: string) => void;
  onBrowse: () => void;
}) {
  const { user, open: login } = useAuth();
  const [items, setItems] = useState<Viewing[]>([]),
    [error, setError] = useState(''),
    [editing, setEditing] = useState<string | null>(null);
  useEffect(() => {
    if (!user) return;
    let active = true;
    const reload = () =>
      api<Viewing[]>('/viewings')
        .then((v) => active && setItems(v))
        .catch((e) => active && setError(e.message));
    void reload();
    window.addEventListener('viewings-changed', reload);
    return () => {
      active = false;
      window.removeEventListener('viewings-changed', reload);
    };
  }, [user?.id]);
  if (!user)
    return (
      <section className="viewings-empty">
        <CalendarDays size={32} />
        <h2>Ваши просмотры квартир</h2>
        <p>Сохраняйте договорённости и впечатления после встречи.</p>
        <button className="button primary" onClick={login}>
          Войти
        </button>
      </section>
    );
  const groups = [
    { title: 'Ближайшие встречи', items: items.filter((v) => v.status === 'planned') },
    { title: 'История', items: items.filter((v) => v.status !== 'planned').reverse() },
  ];
  return (
    <section className="viewings-section">
      <div className="viewings-heading">
        <div>
          <h1>Просмотры</h1>
          <p>Ваши встречи с будущим домом.</p>
        </div>
        <button className="button secondary" onClick={onBrowse}>
          Выбрать квартиру
          <ArrowUpRight size={16} />
        </button>
      </div>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {!items.length && (
        <div className="viewings-empty">
          <CalendarDays size={30} />
          <h3>Начните с понравившейся квартиры</h3>
          <p>Запланируйте встречу прямо в её карточке — она появится здесь.</p>
        </div>
      )}
      {groups
        .filter((g) => g.items.length)
        .map((g) => (
          <div className="viewing-group" key={g.title}>
            <h3>
              {g.title}
              <span>{g.items.length}</span>
            </h3>
            <div className="viewings-list">
              {g.items.map((v) => {
                const l = listings.find((l) => l.id === v.listingId);
                if (!l) return null;
                const d = new Date(v.startsAt);
                return (
                  <article className="viewing-card" key={v.id}>
                    <div className="viewing-date">
                      <b>{d.getDate()}</b>
                      <span>{d.toLocaleDateString('ru-RU', { month: 'short' })}</span>
                      <small>
                        {d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}
                      </small>
                    </div>
                    <div className="viewing-copy">
                      <span className={'viewing-status ' + v.status}>{labels[v.status]}</span>
                      <button className="viewing-title" onClick={() => onOpen(l.id, v.id)}>
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
                      onClick={() => setEditing(editing === v.id ? null : v.id)}
                      aria-expanded={editing === v.id}
                    >
                      <Pencil size={16} />
                    </button>
                    {editing === v.id && (
                      <div className="viewing-inline-editor">
                        <ViewingWidget
                          key={v.id}
                          listingId={l.id}
                          initialViewingId={v.id}
                          onDone={() => setEditing(null)}
                        />
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
          </div>
        ))}
    </section>
  );
}
