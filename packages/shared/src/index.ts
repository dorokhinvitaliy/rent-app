import { metroStations } from './metro-stations';
export { metroStations } from './metro-stations';
export const normalizeMetro = (name: string) =>
  name
    .toLocaleLowerCase('ru')
    .replace(/ё/g, 'е')
    .replace(/[\s-]+/g, ' ')
    .trim();
import { z } from 'zod';
const money = z.number().finite().min(0).max(100_000_000);
const optionalMoney = money.nullable().default(null);
export const httpUrl = z
  .string()
  .url()
  .max(2000)
  .refine((s) => /^https?:\/\//i.test(s), 'Нужна ссылка http(s)');
export const detailsSchema = z
  .object({
    apartment: z
      .record(z.string(), z.union([z.string().max(500), z.number().finite(), z.boolean()]))
      .default({}),
    building: z
      .record(z.string(), z.union([z.string().max(500), z.number().finite(), z.boolean()]))
      .default({}),
    amenities: z.record(z.string(), z.boolean()).default({}),
    sections: z
      .array(
        z.object({
          title: z.string().max(100),
          items: z
            .array(z.object({ label: z.string().max(100), value: z.string().max(500) }))
            .max(50),
        }),
      )
      .max(6)
      .default([]),
    contact: z
      .object({
        name: z.string().max(200).default(''),
        role: z.enum(['owner', 'agent', 'unknown']).default('unknown'),
        phones: z
          .array(z.string().regex(/^\+[0-9]{10,15}$/))
          .max(5)
          .default([]),
        relay: z.boolean().default(false),
      })
      .nullable()
      .default(null),
    checkedAt: z.string().datetime().nullable().default(null),
  })
  .default({});
export const viewingSchema = z.object({
  listingId: z.string().uuid(),
  startsAt: z.string().datetime({ offset: true }),
  status: z.enum(['planned', 'visited', 'cancelled']).default('planned'),
  feedback: z.string().trim().max(5000).default(''),
});
export type Viewing = z.infer<typeof viewingSchema> & { id: string; createdAt: string };
export const amenityLabels: Record<string, string> = {
  hasFridge: 'Холодильник',
  hasDishwasher: 'Посудомоечная машина',
  hasWasher: 'Стиральная машина',
  hasFurniture: 'Мебель в комнатах',
  hasKitchenFurniture: 'Мебель на кухне',
  hasConditioner: 'Кондиционер',
  hasTv: 'Телевизор',
  hasInternet: 'Интернет',
  hasBathtub: 'Ванна',
  hasShower: 'Душ',
  hasLift: 'Лифт',
  childrenAllowed: 'Можно с детьми',
  petsAllowed: 'Можно с животными',
};
export const listingSchema = z.object({
  details: detailsSchema,
  source: z.enum(['cian', 'yandex', 'manual']).default('manual'),
  url: httpUrl.nullable().default(null),
  title: z.string().trim().min(3).max(200),
  address: z.string().trim().max(500).default(''),
  metro: z.string().max(100).default(''),
  metroMinutes: z.number().int().min(0).max(300).nullable().default(null),
  metroStops: z
    .array(
      z.object({
        id: z.number().int().positive().nullable(),
        name: z.string().max(100),
        minutes: z.number().nonnegative().max(300),
      }),
    )
    .max(50)
    .default([]),
  rooms: z.number().int().min(0).max(20).nullable().default(null),
  area: z.number().positive().max(10000).nullable().default(null),
  floor: z.number().int().min(0).max(200).nullable().default(null),
  rent: money.positive(),
  utilities: optionalMoney,
  deposit: optionalMoney,
  commission: optionalMoney,
  commissionType: z.enum(['percent', 'fixed']).default('percent'),
  otherCosts: money.default(0),
  description: z.string().max(20000).default(''),
  photos: z.array(httpUrl).max(40).default([]),
});
export const patchSchema = listingSchema
  .partial()
  .extend({
    rating: z.number().int().min(1).max(5).nullable().optional(),
    favorite: z.boolean().optional(),
    notes: z.string().max(5000).optional(),
  })
  .strict();
export type ListingInput = z.infer<typeof listingSchema>;
export type Listing = ListingInput & {
  publicationStatus?: 'active' | 'removed';
  publicationCheckedAt?: string;
  id: string;
  favorite: boolean;
  rating?: number | null;
  notes: string;
  demo: boolean;
  createdAt: string;
  updatedAt: string;
};
export function costs(
  l: Pick<
    ListingInput,
    'rent' | 'utilities' | 'deposit' | 'commission' | 'commissionType' | 'otherCosts'
  >,
  months = 12,
) {
  if (!Number.isInteger(months) || months < 1 || months > 120)
    throw new Error('Срок должен быть от 1 до 120 месяцев');
  const round = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
  const fee = round(
    l.commissionType === 'percent' ? (l.rent * (l.commission ?? 0)) / 100 : (l.commission ?? 0),
  );
  const monthly = round(l.rent + (l.utilities ?? 0));
  const moveIn = round(monthly + (l.deposit ?? 0) + fee + l.otherCosts);
  const total = round(monthly * months + fee + l.otherCosts);
  return {
    fee,
    monthly,
    moveIn,
    total,
    cashTotal: round(total + (l.deposit ?? 0)),
    average: round(total / months),
    incomplete: [l.utilities, l.deposit, l.commission].some((x) => x === null),
  };
}
export const sourceNames = { cian: 'Циан', yandex: 'Яндекс Недвижимость', manual: 'Вручную' };

export const searchCities = { '1': 'Москва', '2': 'Санкт-Петербург', '4777': 'Казань' } as const;
const searchNumber = z.number().finite().nonnegative().nullable().default(null);
export const cianSearchSchema = z
  .object({
    query: z.string().trim().max(120).default(''),
    source: z.enum(['all', 'cian', 'yandex', 'manual']).default('all'),
    maxMoveIn: searchNumber,
    region: z.enum(['1', '2', '4777']).default('1'),
    metroStations: z
      .array(z.number().int().positive())
      .max(100)
      .default([])
      .transform((ids) => [...new Set(ids)]),
    rooms: z.array(z.number().int().min(0).max(5)).max(6).default([]),
    minRent: searchNumber.refine((n) => n === null || n <= 10000000),
    maxRent: searchNumber.refine((n) => n === null || n <= 10000000),
    minArea: searchNumber.refine((n) => n === null || n <= 1000),
    maxArea: searchNumber.refine((n) => n === null || n <= 1000),
    metroMinutes: z.number().int().min(1).max(120).nullable().default(null),
    minFloor: z.number().int().min(1).max(200).nullable().default(null),
    noCommission: z.boolean().default(false),
    onlyNew: z.boolean().default(true),
    limit: z.number().int().min(1).max(30).default(10),
    pages: z.number().int().min(1).max(3).default(3),
  })
  .strict()
  .superRefine((v, ctx) => {
    const available = new Set(
      metroStations.filter((s) => s.region === v.region).flatMap((s) => s.ids),
    );
    if (v.metroStations.some((id) => !available.has(id)))
      ctx.addIssue({
        code: 'custom',
        path: ['metroStations'],
        message: 'Выберите станции из справочника выбранного города',
      });
    for (const [min, max] of [
      ['minRent', 'maxRent'],
      ['minArea', 'maxArea'],
    ] as const) {
      if (v[min] !== null && v[max] !== null && v[min]! > v[max]!)
        ctx.addIssue({
          code: 'custom',
          path: [max],
          message: 'Верхняя граница должна быть не меньше нижней',
        });
    }
  });
export type CianSearch = z.infer<typeof cianSearchSchema>;
export function buildCianSearchUrl(input: CianSearch): string {
  const s = cianSearchSchema.parse(input);
  const url = new URL('https://www.cian.ru/cat.php');
  const p = url.searchParams;
  Object.entries({
    deal_type: 'rent',
    engine_version: '2',
    offer_type: 'flat',
    type: '4',
    region: s.region,
    currency: '2',
    with_neighbors: '0',
  }).forEach(([k, v]) => p.set(k, v));
  s.metroStations.forEach((id, i) => p.set(`metro[${i}]`, String(id)));
  for (const room of new Set(s.rooms)) p.set(`room${room === 0 ? 9 : room}`, '1');
  for (const [field, key] of [
    ['minRent', 'minprice'],
    ['maxRent', 'maxprice'],
    ['minArea', 'mintarea'],
    ['maxArea', 'maxtarea'],
    ['minFloor', 'minfloor'],
  ] as const)
    if (s[field] !== null) p.set(key, String(s[field]));
  if (s.metroMinutes !== null) {
    p.set('only_foot', '2');
    p.set('foot_min', String(s.metroMinutes));
  }
  return url.href;
}
// Source search parameters can change. Recheck every parsed offer before saving a search result.
export function matchesDatabaseSearch(
  l: ListingInput & { publicationStatus?: string },
  s: CianSearch,
) {
  if (l.publicationStatus === 'removed') return false;
  const city =
    s.region === '1'
      ? /москва|московск/i
      : s.region === '2'
        ? /санкт[ -]петербург|спб/i
        : /казань/i;
  return city.test(l.address) && !searchMismatch(l, s);
}
export function searchMismatch(l: ListingInput, s: CianSearch): string | null {
  if (s.source !== 'all' && l.source !== s.source) return 'Другой источник';
  if (
    s.query &&
    !`${l.title} ${l.address} ${l.metro}`.toLowerCase().includes(s.query.toLowerCase())
  )
    return 'Не совпадает адрес или название';
  if (s.maxMoveIn !== null && costs(l).moveIn > s.maxMoveIn) return 'Сумма на въезд вне бюджета';
  if ((s.minRent !== null && l.rent < s.minRent) || (s.maxRent !== null && l.rent > s.maxRent))
    return 'Аренда вне бюджета';
  if (s.rooms.length && (l.rooms === null || !s.rooms.includes(l.rooms)))
    return 'Не подходит или не указано количество комнат';
  if ((s.minArea !== null || s.maxArea !== null) && l.area === null) return 'Не указана площадь';
  if ((s.minArea !== null && l.area! < s.minArea) || (s.maxArea !== null && l.area! > s.maxArea))
    return 'Площадь вне диапазона';
  if (s.metroStations.length && !matchingMetroStops(l, s).length)
    return 'Не подтвержден путь пешком до выбранных станций метро за указанное время';
  if (
    !s.metroStations.length &&
    s.metroMinutes !== null &&
    (l.metroMinutes === null || l.metroMinutes > s.metroMinutes)
  )
    return 'Не подтверждено нужное время пешком до метро';
  if (s.minFloor !== null && (l.floor === null || l.floor < s.minFloor))
    return 'Не подходит или не указан этаж';
  if (s.noCommission && l.commission !== 0) return 'Не подтверждено отсутствие комиссии';
  return null;
}

export function matchingMetroStops(l: ListingInput, s: CianSearch) {
  const names = new Set(
    metroStations
      .filter(
        (station) =>
          station.region === s.region && station.ids.some((id) => s.metroStations.includes(id)),
      )
      .map((station) => normalizeMetro(station.name)),
  );
  const stops = l.metroStops?.length
    ? l.metroStops
    : l.metro && l.metroMinutes !== null
      ? [{ id: null, name: l.metro, minutes: l.metroMinutes }]
      : [];
  return stops
    .filter(
      (stop) =>
        (stop.id !== null
          ? s.metroStations.includes(stop.id)
          : names.has(normalizeMetro(stop.name))) &&
        (s.metroMinutes === null || stop.minutes <= s.metroMinutes),
    )
    .sort((a, b) => a.minutes - b.minutes);
}
