import { searchMismatch, type CianSearch, type Listing } from '@rent/shared';
export function matchesDatabaseSearch(listing: Listing, search: CianSearch) {
  const city =
    search.region === '1'
      ? /москва|московск/i
      : search.region === '2'
        ? /санкт[ -]петербург|спб/i
        : /казань/i;
  return city.test(listing.address) && !searchMismatch(listing, search);
}
