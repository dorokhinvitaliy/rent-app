import { load } from 'cheerio';
import { readCianState } from './cian-state';
import { listingSchema, type ListingInput } from '@rent/shared';

export function sourceUrl(value: string): { url: string; source: 'cian' | 'yandex' } {
  const u = new URL(value);
  if (u.protocol !== 'https:' || u.username || u.password || (u.port && u.port !== '443'))
    throw new Error('Нужна HTTPS-ссылка на Циан или Яндекс Недвижимость');
  const source = /^(www\.|[a-z-]+\.)?cian\.ru$/.test(u.hostname)
    ? 'cian'
    : u.hostname === 'realty.yandex.ru'
      ? 'yandex'
      : null;
  if (!source) throw new Error('Поддерживаются только cian.ru и realty.yandex.ru');
  if (
    source === 'cian' &&
    !(
      u.pathname === '/cat.php' &&
      u.searchParams.get('deal_type') === 'rent' &&
      u.searchParams.get('type') === '4'
    ) &&
    !/^\/rent\/flat\/\d+\/?$/.test(u.pathname)
  )
    throw new Error(
      'Укажите квартиру в аренду или каталог долгосрочной аренды Циана (deal_type=rent&type=4)',
    );
  if (source === 'yandex' && !/^\/(offer\/\d+\/?|[^?]*snyat\/kvartira\/?)$/.test(u.pathname))
    throw new Error('Укажите объявление или каталог аренды Яндекс Недвижимости');
  u.hash = '';
  if (u.pathname !== '/cat.php' && /\d+\/?$/.test(u.pathname)) u.search = '';
  return { url: u.toString(), source };
}
export function isChallenge(html: string) {
  const $ = load(html);
  return (
    /вы не робот|подтвердите.*не робот|доступ ограничен|access denied|captcha|just a moment/i.test(
      $('title').text(),
    ) || $('form[action*="captcha"], #smartcaptcha, .g-recaptcha').length > 0
  );
}
const numeric = (s: string | undefined) =>
  s ? Number(s.replace(/[^\d,.]/g, '').replace(',', '.')) : null;
export function parseHtml(
  html: string,
  inputUrl: string,
): { listings: ListingInput[]; warnings: string[] } {
  const { url, source } = sourceUrl(inputUrl);
  if (isChallenge(html))
    throw new Error(
      'Площадка просит пройти проверку. Откройте браузерный импорт и пройдите капчу вручную.',
    );
  const $ = load(html);
  if (source === 'cian' && /\/rent\/flat\/\d+/.test(url)) {
    const fromState = readCianState($, url);
    if (fromState)
      return {
        listings: [fromState],
        warnings: [
          fromState.utilities === null
            ? 'Коммунальные платежи или счетчики не указаны полностью. Уточните сумму.'
            : '',
        ].filter(Boolean),
      };
  }
  const listings: ListingInput[] = [];
  const warnings: string[] = [];
  const isDetail = /\/(rent\/flat|offer)\/\d+/.test(url);
  const cards = isDetail
    ? $('__no_catalog_cards__')
    : $('[data-name="CardComponent"], .OffersSerpItem');
  const blocks = cards.length ? cards.toArray().map((el) => $.html(el)) : [html];
  for (const block of blocks) {
    const b = load(block);
    if (isDetail) b('[data-name="CardComponent"], .OffersSerpItem').remove();
    b('script:not([type="application/ld+json"]),style,nav,footer,header').remove();
    const text = b('body').text().replace(/\s+/g, ' ').trim();
    let link = cards.length
      ? b('a[href*="/rent/flat/"], a[href*="/offer/"]').first().attr('href')
      : url;
    if (!link) continue;
    try {
      link = sourceUrl(new URL(link, url).toString()).url;
    } catch {
      continue;
    }
    if (!/\/(rent\/flat|offer)\/\d+/.test(link)) continue;
    // JSON-LD is parsed as data only. No execution of embedded page JavaScript.
    const json: Record<string, any>[] = [];
    b('script[type="application/ld+json"]').each((_, e) => {
      try {
        const data = JSON.parse(b(e).text());
        const values = Array.isArray(data) ? data : data['@graph'] || [data];
        json.push(...values.filter((x: any) => x && typeof x === 'object'));
      } catch {
        /* DOM fallback handles malformed JSON-LD. */
      }
    });
    const structured =
      json.find((x) =>
        ['Apartment', 'Product', 'Residence', 'RealEstateListing'].includes(x['@type']),
      ) || {};
    const priceText = b(
      '[data-name="PriceInfo"], [data-mark="MainPrice"], [data-testid="price"], .OfferPrice',
    )
      .first()
      .text();
    if (/₽\s*\/\s*сут|руб\.?\s*\/\s*сут|в сутки|за сутки/i.test(priceText)) {
      warnings.push('Посуточное предложение пропущено: период указан в основной цене');
      continue;
    }
    const match =
      priceText.match(/([\d\s\u00a0]+)\s*(?:₽|руб)[^\d]{0,15}(?:мес|месяц)/i) ||
      priceText.match(/([\d\s\u00a0]+)\s*₽/);
    const offer = Array.isArray(structured.offers) ? structured.offers[0] : structured.offers;
    const domRent = numeric(match?.[1]);
    const linkedOffer =
      offer && (!offer.url || new URL(offer.url, link).pathname === new URL(link).pathname)
        ? offer
        : null;
    const jsonRent =
      linkedOffer?.priceCurrency === 'RUB' ? numeric(String(linkedOffer.price || '')) : null;
    if (domRent && jsonRent && domRent !== jsonRent)
      throw new Error('Основная цена и структурированные данные различаются. Импорт остановлен.');
    const rent = domRent || jsonRent;
    if (!rent) {
      warnings.push(`Не найдена месячная цена: ${link}`);
      continue;
    }
    const title =
      b('h1, [data-mark="OfferTitle"], [data-mark="OfferSubtitle"], .OffersSerpItem__title')
        .first()
        .text()
        .trim() ||
      structured.name ||
      b('meta[property="og:title"]').attr('content') ||
      'Квартира в аренду';
    const addressJson = structured.address;
    const address =
      b(
        '[data-name="Geo"], [data-name="AddressContainer"], .OfferAddress, .OffersSerpItem__address',
      )
        .first()
        .text()
        .replace(/\s+/g, ' ')
        .trim() ||
      (typeof addressJson === 'string'
        ? addressJson
        : [addressJson?.addressLocality, addressJson?.streetAddress].filter(Boolean).join(', '));
    const commissionMatch = text.match(/комисси[яи]\s*[:—–-]?\s*([\d\s,.]+)\s*(%|₽|руб)/i);
    const depositMatch = text.match(/залог\s*[:—–-]?\s*([\d\s,.]+)\s*(₽|руб)/i);
    const utilitiesMatch = text.match(
      /(?:коммунальн[а-я\s]*|ЖКУ|К\/У)\s*[:—–+-]?\s*([\d\s,.]+)\s*(?:₽|руб)/i,
    );
    const photos: string[] = [];
    const addPhoto = (v: unknown) => {
      if (typeof v !== 'string') return;
      try {
        const p = new URL(v, url);
        if (p.protocol === 'https:' && !photos.includes(p.href)) photos.push(p.href);
      } catch {}
    };
    const images = structured.image
      ? Array.isArray(structured.image)
        ? structured.image
        : [structured.image]
      : [];
    images.forEach((x: any) => addPhoto(typeof x === 'string' ? x : x.url));
    addPhoto(b('meta[property="og:image"]').attr('content'));
    (images.length
      ? b('__no_extra_images__')
      : b('[data-name="Gallery"] img, [data-name="Photos"] img, img[src*="cdn-cian"]')
    ).each((_, e) => {
      const src = b(e).attr('src') || b(e).attr('data-src');
      if (src && /cdn-cian|images\.cdn-cian|avatars\.mds\.yandex|realty.*yandex/i.test(src))
        addPhoto(src);
    });
    // Only explicit walking time is accepted; driving/public transit must not pass a walking filter.
    const metroItems = b(
      '[data-name="UndergroundItem"], [data-name="Underground"], .OfferMetro',
    ).toArray();
    const metroOptions = metroItems.map((el) => {
      const item = b(el);
      const value = item.text().replace(/\s+/g, ' ').trim();
      const walking =
        value.match(/(\d+)\s*мин\.?\s*(?:пешком|пеш)/i) ||
        value.match(/пешком\s*[:—-]?\s*(\d+)\s*мин/i);
      const iconWalk =
        item.find('[data-name="Walk"], [data-name="Walking"], [aria-label*="пешком"]').length > 0;
      const minutes = numeric(
        walking?.[1] || (iconWalk ? value.match(/(\d+)\s*мин/i)?.[1] : undefined),
      );
      const name =
        item.find('a').first().text().trim() || value.replace(/\d+\s*мин[\s\S]*$/, '').trim();
      return { name: name.slice(0, 100), minutes };
    });
    const nearest =
      metroOptions.filter((m) => m.minutes !== null).sort((a, b) => a.minutes! - b.minutes!)[0] ||
      metroOptions[0];
    const areaMatch = title.match(/([\d.,]+)\s*м[²2]/i);
    const roomsMatch = title.match(/(\d+)\s*[-–]?[кk]|(\d+)\s*комн/i);
    const parsed = listingSchema.safeParse({
      source,
      url: link,
      title: title.slice(0, 200),
      address: address || '',
      rent,
      metroStops: metroOptions
        .filter((m) => m.minutes !== null)
        .map((m) => ({ id: null, name: m.name, minutes: m.minutes! })),
      metro: nearest?.name || '',
      metroMinutes: nearest?.minutes ?? null,
      rooms: /студи/i.test(title) ? 0 : numeric(roomsMatch?.[1] || roomsMatch?.[2]),
      area: numeric(areaMatch?.[1]),
      floor: numeric(title.match(/(\d+)\s*\/\s*\d+\s*эт/i)?.[1]),
      deposit: /без залога/i.test(text) ? 0 : numeric(depositMatch?.[1]),
      commission: /без комиссии|комиссия\s*[:—–-]?\s*0(?:\s|%|₽|руб|$)/i.test(text)
        ? 0
        : numeric(commissionMatch?.[1]),
      commissionType: commissionMatch?.[2] === '%' || !commissionMatch ? 'percent' : 'fixed',
      utilities:
        /коммунальные\s+(?:платежи\s+)?включены/i.test(text) && !/сч[её]тчик/i.test(text)
          ? 0
          : numeric(utilitiesMatch?.[1]),
      description: (
        b('[data-name="Description"], [data-name="DescriptionText"], .OfferDescription')
          .text()
          .trim() ||
        structured.description ||
        ''
      ).slice(0, 20000),
      photos: photos.slice(0, 40),
    });
    if (parsed.success) listings.push(parsed.data);
    else warnings.push(`Неполные или неподдерживаемые данные: ${link}`);
  }
  const unique = [...new Map(listings.map((l) => [l.url, l])).values()];
  if (!unique.length)
    throw new Error(
      warnings[0] ||
        'Объявления не найдены. Сохраните полностью загруженную страницу аренды. Возможно, разметка площадки изменилась.',
    );
  if (unique.some((x) => x.deposit === null || x.commission === null || x.utilities === null))
    warnings.push(
      'Часть расходов не указана. Уточните их в карточке: неизвестные суммы не равны нулю.',
    );
  return { listings: unique, warnings };
}
export function extractLinks(html: string, url: string): string[] {
  const $ = load(html);
  const links = new Set<string>();
  $('a[href*="/rent/flat/"], a[href*="/offer/"]').each((_, e) => {
    try {
      links.add(sourceUrl(new URL($(e).attr('href')!, url).href).url);
    } catch {}
  });
  return [...links];
}
