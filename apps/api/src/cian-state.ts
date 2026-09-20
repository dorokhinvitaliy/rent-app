import { type CheerioAPI } from 'cheerio';
import { z } from 'zod';
import { listingSchema, detailsSchema, amenityLabels, type ListingInput } from '@rent/shared';
const amount = z.number().finite().nonnegative();
const offerSchema = z.object({
  id: z.number().int(),
  cianId: z.number().int().optional(),
  dealType: z.string(),
  description: z.string().optional(),
  totalArea: z.union([z.string(), z.number()]).optional(),
  roomsCount: z.number().nullable().optional(),
  floorNumber: z.number().nullable().optional(),
  flatType: z.string().optional(),
  photos: z.array(z.object({ fullUrl: z.string(), isDefault: z.boolean().optional() })).default([]),
  bargainTerms: z.object({
    price: amount.positive(),
    currency: z.string(),
    paymentPeriod: z.string(),
    leaseTermType: z.string().optional(),
    deposit: amount.optional(),
    clientFee: amount.optional(),
    utilitiesTerms: z
      .object({
        includedInPrice: z.boolean().optional(),
        price: amount.optional(),
        flowMetersNotIncludedInPrice: z.boolean().optional(),
      })
      .optional(),
  }),
  geo: z.object({
    address: z
      .array(z.object({ shortName: z.string().optional(), name: z.string().optional() }))
      .default([]),
    undergrounds: z
      .array(
        z.object({
          id: z.number().int().positive().optional(),
          name: z.string(),
          travelType: z.string(),
          travelTime: amount,
        }),
      )
      .default([]),
  }),
});
/** Read only the literal JSON argument of the known config assignment. Never evaluate JavaScript. */
export function readCianState($: CheerioAPI, url: string): ListingInput | null {
  const id = Number(new URL(url).pathname.match(/\/flat\/(\d+)/)?.[1]);
  for (const script of $('script').toArray()) {
    const text = $(script).text();
    const assignment =
      /window\._cianConfig\[['"]frontend-offer-card['"]\]\s*=\s*\(window\._cianConfig\[['"]frontend-offer-card['"]\]\s*\|\|\s*\[\]\)\.concat\(/.exec(
        text,
      );
    if (!assignment) continue;
    let entries: unknown;
    try {
      const argument = text.slice(assignment.index + assignment[0].length).replace(/\);?\s*$/, '');
      entries = JSON.parse(argument);
    } catch {
      throw new Error('Не удалось безопасно прочитать данные объявления Циана');
    }
    if (!Array.isArray(entries)) throw new Error('Неизвестный формат данных Циана');
    const data = entries.find((e) => e?.key === 'defaultState')?.value?.offerData;
    const raw = data?.offer;
    if (!raw) continue;
    const result = offerSchema.safeParse(raw);
    if (!result.success)
      throw new Error('Основные данные Циана изменили формат; цена не сохранена');
    const o = result.data,
      t = o.bargainTerms;
    if (o.id !== id || (o.cianId !== undefined && o.cianId !== id))
      throw new Error('ID объявления на странице не совпадает со ссылкой');
    if (o.dealType !== 'rent') throw new Error('Страница не является объявлением об аренде');
    if (t.paymentPeriod === 'daily' || t.leaseTermType === 'daily')
      throw new Error('Посуточное предложение пропущено: это указано в условиях самого объявления');
    if (t.paymentPeriod !== 'monthly' || !['rur', 'rub'].includes(t.currency.toLowerCase()))
      throw new Error('Не подтверждена месячная цена в рублях');
    const priceText = $('[data-name="PriceInfo"]').first().text().replace(/\s+/g, ' ');
    const displayed = priceText.match(/([\d\s]+)\s*₽\s*\/\s*мес/i);
    if (displayed && Number(displayed[1].replace(/\s/g, '')) !== t.price)
      throw new Error(
        'Цена в данных и основном блоке Циана различается. Обновите страницу и повторите импорт.',
      );
    const nearest = o.geo.undergrounds
      .filter((m) => m.travelType === 'walk')
      .sort((a, b) => a.travelTime - b.travelTime)[0];
    const utilities = t.utilitiesTerms;
    const extra = utilities?.flowMetersNotIncludedInPrice
      ? null
      : utilities?.includedInPrice === true
        ? 0
        : (utilities?.price ?? null);
    const title =
      $('h1').first().text().trim() ||
      `${o.roomsCount || ''}-комн. квартира, ${o.totalArea || ''} м²`;
    return listingSchema.parse({
      details: extractDetails(raw, data),
      source: 'cian',
      url,
      title: title.slice(0, 200),
      rent: t.price,
      deposit: t.deposit ?? null,
      commission: t.clientFee ?? null,
      commissionType: 'percent',
      utilities: extra,
      address: o.geo.address
        .map((a) => a.shortName || a.name)
        .filter(Boolean)
        .join(', '),
      metroStops: o.geo.undergrounds
        .filter((m) => m.travelType === 'walk')
        .map((m) => ({ id: m.id ?? null, name: m.name, minutes: m.travelTime })),
      metro: nearest?.name || '',
      metroMinutes: nearest?.travelTime ?? null,
      rooms: o.flatType === 'studio' ? 0 : (o.roomsCount ?? null),
      area: o.totalArea === undefined ? null : Number(o.totalArea),
      floor: o.floorNumber ?? null,
      description: o.description || '',
      photos: [...o.photos]
        .sort((a, b) => Number(!!b.isDefault) - Number(!!a.isDefault))
        .map((p) => p.fullUrl)
        .slice(0, 40),
    });
  }
  return null;
}

function extractDetails(raw: Record<string, any>, data: Record<string, any>) {
  const pick = (source: any, keys: string[]) =>
    Object.fromEntries(
      keys
        .filter((k) => ['string', 'number', 'boolean'].includes(typeof source?.[k]))
        .map((k) => [k, source[k]]),
    );
  const phones = (Array.isArray(raw.phones) ? raw.phones : [])
    .map((p: any) => {
      const n = String(p.countryCode || '') + String(p.number || '');
      return '+' + n.replace(/\D/g, '');
    })
    .filter((n: string) => /^\+\d{10,15}$/.test(n));
  const sections = (Array.isArray(data.features) ? data.features : [])
    .filter((g: any) => ['aboutFlat', 'aboutBuilding'].includes(g.id))
    .map((g: any) => ({
      title: g.title,
      items: (g.features || [])
        .filter((f: any) => typeof f.label === 'string' && typeof f.value === 'string')
        .map((f: any) => ({
          label: f.label.replace(/\s+/g, ' '),
          value: f.value.replace(/\s+/g, ' '),
        })),
    }));
  const result = detailsSchema.safeParse({
    apartment: pick(raw, [
      'livingArea',
      'kitchenArea',
      'ceilingHeight',
      'repairType',
      'windowsViewType',
      'flatType',
      'loggiasCount',
      'balconiesCount',
      'separateWcsCount',
      'combinedWcsCount',
      'isApartments',
      'passengerLiftsCount',
      'cargoLiftsCount',
    ]),
    building: {
      ...pick(data.bti?.houseData, [
        'yearRelease',
        'houseMaterialType',
        'floorMax',
        'entrances',
        'flatCount',
        'isEmergency',
        'houseHeatSupplyType',
        'houseGasSupplyType',
        'houseOverlapType',
        'lifts',
        'seriesName',
      ]),
      ...pick(raw.building, [
        'floorsCount',
        'buildYear',
        'materialType',
        'houseMaterialType',
        'ceilingHeight',
        'hasGarbageChute',
        'passengerLiftsCount',
        'cargoLiftsCount',
      ]),
      ...pick(raw.building?.parking, ['type']),
    },
    amenities: Object.fromEntries(
      Object.keys(amenityLabels)
        .filter((k) => typeof raw[k] === 'boolean')
        .map((k) => [k, raw[k]]),
    ),
    sections,
    contact: {
      name: String(data.agent?.name || data.agent?.fullName || data.company?.name || '').slice(
        0,
        200,
      ),
      role:
        raw.isByHomeowner === true ? 'owner' : raw.isByHomeowner === false ? 'agent' : 'unknown',
      phones: [...new Set(phones)].slice(0, 5),
      relay: raw.isEnabledCallTracking === true,
    },
    checkedAt: new Date().toISOString(),
  });
  return result.success ? result.data : detailsSchema.parse({});
}
