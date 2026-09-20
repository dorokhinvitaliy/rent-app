import { metroStations, normalizeMetro, type Listing } from '@rent/shared';

type Station = (typeof metroStations)[number];
export function MetroDots({ station }: { station?: Station }) {
  return (
    <span
      className="metro-dots"
      title={station?.lines?.join(' · ') || 'Линия не определена'}
      aria-label={station?.lines?.join(', ') || 'Линия не определена'}
    >
      {(station?.colors || ['#a0a0a0']).map((color) => (
        <i key={color} style={{ backgroundColor: color }} />
      ))}
    </span>
  );
}
export function listingMetroStation(listing: Listing): Station | undefined {
  const name = normalizeMetro(listing.metro);
  // IDs from other sources are not Cian IDs. Match those by city and name only.
  const stop = listing.metroStops?.find((s) => normalizeMetro(s.name) === name);
  if (listing.source === 'cian' && stop?.id) {
    const match = metroStations.find(
      (s) => s.ids.includes(stop.id!) && normalizeMetro(s.name) === name,
    );
    if (match) return match;
  }
  const region = /санкт[ -]петербург|\bспб\b/i.test(listing.address)
    ? '2'
    : /казань/i.test(listing.address)
      ? '4777'
      : /москва|московск/i.test(listing.address)
        ? '1'
        : null;
  const matches = metroStations.filter(
    (s) => normalizeMetro(s.name) === name && (!region || s.region === region),
  );
  return matches.length === 1 ? matches[0] : undefined;
}
