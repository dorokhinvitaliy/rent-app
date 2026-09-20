import { z } from 'zod';
const money = z.number().finite().min(0).max(100_000_000);
const optionalMoney = money.nullable().default(null);
export const httpUrl = z.string().url().max(2000).refine(s => /^https?:\/\//i.test(s), 'Нужна ссылка http(s)');
export const listingSchema = z.object({
  source: z.enum(['cian', 'yandex', 'manual']).default('manual'),
  url: httpUrl.nullable().default(null),
  title: z.string().trim().min(3).max(200), address: z.string().trim().max(500).default(''),
  metro: z.string().max(100).default(''), metroMinutes: z.number().int().min(0).max(300).nullable().default(null),
  rooms: z.number().int().min(0).max(20).nullable().default(null),
  area: z.number().positive().max(10000).nullable().default(null), floor: z.number().int().min(0).max(200).nullable().default(null),
  rent: money.positive(), utilities: optionalMoney, deposit: optionalMoney, commission: optionalMoney,
  commissionType: z.enum(['percent', 'fixed']).default('percent'), otherCosts: money.default(0),
  description: z.string().max(20000).default(''), photos: z.array(httpUrl).max(40).default([]),
});
export const patchSchema = listingSchema.partial().extend({favorite: z.boolean().optional(), notes: z.string().max(5000).optional()}).strict();
export type ListingInput = z.infer<typeof listingSchema>;
export type Listing = ListingInput & {id: string; favorite: boolean; notes: string; demo: boolean; createdAt: string; updatedAt: string};
export function costs(l: Pick<ListingInput, 'rent'|'utilities'|'deposit'|'commission'|'commissionType'|'otherCosts'>, months = 12) {
  if (!Number.isInteger(months) || months < 1 || months > 120) throw new Error('Срок должен быть от 1 до 120 месяцев');
  const round = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
  const fee = round(l.commissionType === 'percent' ? l.rent * (l.commission ?? 0) / 100 : (l.commission ?? 0));
  const monthly = round(l.rent + (l.utilities ?? 0));
  const moveIn = round(monthly + (l.deposit ?? 0) + fee + l.otherCosts);
  const total = round(monthly * months + fee + l.otherCosts);
  return {fee, monthly, moveIn, total, cashTotal: round(total + (l.deposit ?? 0)), average: round(total / months), incomplete: [l.utilities,l.deposit,l.commission].some(x => x === null)};
}
export const sourceNames = {cian: 'Циан', yandex: 'Яндекс Недвижимость', manual: 'Вручную'};
