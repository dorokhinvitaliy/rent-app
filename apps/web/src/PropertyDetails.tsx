import { amenityLabels, type Listing } from '@rent/shared';
import { Phone, Building2, Check, Home } from 'lucide-react';
export function PropertyDetails({ listing }: { listing: Listing }) {
  const d = listing.details;
  if (!d) return null;
  const contact = d.contact;
  const sections = d.sections.length
    ? d.sections
    : [
        {
          title: 'О квартире',
          items: Object.entries(d.apartment)
            .filter(([k]) =>
              [
                'livingArea',
                'kitchenArea',
                'balconiesCount',
                'loggiasCount',
                'combinedWcsCount',
                'separateWcsCount',
              ].includes(k),
            )
            .map(([k, v]) => ({
              label: (
                {
                  livingArea: 'Жилая площадь',
                  kitchenArea: 'Кухня',
                  balconiesCount: 'Балконы',
                  loggiasCount: 'Лоджии',
                  combinedWcsCount: 'Совмещённые санузлы',
                  separateWcsCount: 'Раздельные санузлы',
                } as Record<string, string>
              )[k],
              value: String(v) + (/Area/.test(k) ? ' м²' : ''),
            })),
        },
        {
          title: 'О доме',
          items: Object.entries(d.building)
            .filter(([k]) =>
              ['buildYear', 'floorsCount', 'ceilingHeight', 'entrances', 'seriesName'].includes(k),
            )
            .map(([k, v]) => ({
              label: (
                {
                  buildYear: 'Год постройки',
                  floorsCount: 'Этажей',
                  ceilingHeight: 'Высота потолков',
                  entrances: 'Подъезды',
                  seriesName: 'Серия',
                } as Record<string, string>
              )[k],
              value: String(v),
            })),
        },
      ];
  return (
    <section className="property-details">
      {contact && (contact.phones.length > 0 || contact.name) && (
        <div className="property-contact">
          <div>
            <small>
              {contact.role === 'owner'
                ? 'Собственник'
                : contact.role === 'agent'
                  ? 'Агент'
                  : 'Контакт объявления'}
            </small>
            <strong>{contact.name || 'Связаться по объявлению'}</strong>
            {contact.relay && <small>Подменный номер Циана</small>}
          </div>
          <div>
            {contact.phones.map((phone) => (
              <a key={phone} href={'tel:' + phone}>
                <Phone size={15} />
                {phone.replace(/^(\+7)(\d{3})(\d{3})(\d{2})(\d{2})$/, '$1 $2 $3-$4-$5')}
              </a>
            ))}
          </div>
        </div>
      )}
      {sections
        .filter((s) => s.items.length)
        .map((s, i) => (
          <details key={s.title} className="property-section">
            <summary>
              {i ? <Building2 size={17} /> : <Home size={17} />}
              <span>{s.title}</span>
              <small>{s.items.length}</small>
            </summary>
            <dl>
              {s.items.map((f) => (
                <div key={f.label}>
                  <dt>{f.label}</dt>
                  <dd>{f.value}</dd>
                </div>
              ))}
            </dl>
          </details>
        ))}
      {Object.values(d.amenities).some(Boolean) && (
        <div className="property-amenities">
          <h3>Удобства и условия</h3>
          <div>
            {Object.entries(d.amenities)
              .filter(([, yes]) => yes)
              .map(([key]) => (
                <span key={key}>
                  <Check size={13} />
                  {amenityLabels[key] || key}
                </span>
              ))}
          </div>
        </div>
      )}
      {d.checkedAt && (
        <p className="property-updated">
          Данные Циана · {new Date(d.checkedAt).toLocaleDateString('ru-RU')}
        </p>
      )}
    </section>
  );
}
