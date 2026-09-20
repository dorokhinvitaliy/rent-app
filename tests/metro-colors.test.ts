import { test } from 'node:test';
import assert from 'node:assert/strict';
import { metroStations } from '../packages/shared/src/metro-stations';
import { listingMetroStation } from '../apps/web/src/MetroDots';
import { listingSchema, type Listing } from '@rent/shared';

test('Metro colors distinguish cities and retain all same-name metro lines', () => {
  const moscow = metroStations.find((s) => s.region === '1' && s.name === 'Беговая')!;
  const petersburg = metroStations.find((s) => s.region === '2' && s.name === 'Беговая')!;
  assert.deepEqual(moscow.colors, ['#943e90']);
  assert.deepEqual(moscow.lines, ['Таганско-Краснопресненская']);
  assert.deepEqual(petersburg.colors, ['#009a49']);
  assert.equal(
    metroStations.find((s) => s.region === '1' && s.name === 'Киевская')!.colors.length,
    3,
  );
});

test('Listing colors use city or matching Cian ID and do not guess ambiguous stations', () => {
  const listing = (address: string, source = 'manual', id: number | null = null) =>
    ({
      ...listingSchema.parse({
        title: 'Квартира',
        rent: 50000,
        address,
        source,
        metro: 'Беговая',
        metroStops: [{ name: 'Беговая', id, minutes: 5 }],
      }),
    }) as Listing;
  assert.equal(listingMetroStation(listing('Москва'))?.region, '1');
  assert.equal(
    listingMetroStation({ ...listing('Москва'), metroStops: undefined } as unknown as Listing)
      ?.region,
    '1',
  );
  assert.equal(listingMetroStation(listing('Санкт-Петербург'))?.region, '2');
  assert.equal(listingMetroStation(listing('')), undefined);
  assert.equal(listingMetroStation(listing('', 'cian', 14))?.region, '1');
  assert.equal(listingMetroStation(listing('', 'yandex', 14)), undefined);
});
