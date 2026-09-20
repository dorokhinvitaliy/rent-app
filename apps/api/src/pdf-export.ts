import { chromium } from 'playwright';
import { amenityLabels, costs, type Listing } from '@rent/shared';
import { BadRequestException } from '@nestjs/common';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
const escape = (s: unknown) =>
  String(s ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  );
const rub = (n: number) =>
  new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 }).format(n) + ' ₽';
const fontCss = [400, 700]
  .map(
    (weight) =>
      `@font-face{font-family:Golos;font-weight:${weight};src:url(data:font/ttf;base64,${readFileSync(resolve(__dirname, `../assets/golos-${weight}.ttf`)).toString('base64')})}`,
  )
  .join('');
const house =
  '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M3 10 12 3l9 7v10H3zM9 20v-7h6v7"/></svg>';
let busy = false;
export async function collectionPdf(name: string, listings: Listing[]) {
  if (busy) throw new BadRequestException('PDF уже формируется. Повторите через минуту.');
  if (!listings.length) throw new BadRequestException('В подборке пока нет квартир');
  if (listings.length > 100)
    throw new BadRequestException('В один PDF можно включить до 100 квартир');
  busy = true;
  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    await page.route('**/*', async (route) => {
      const u = new URL(route.request().url());
      const allowed =
        u.protocol === 'https:' &&
        /^(images\.)?cdn-cian\.ru$|^avatars\.mds\.yandex\.net$|^images\.unsplash\.com$/.test(
          u.hostname,
        );
      return allowed && route.request().resourceType() === 'image'
        ? route.continue()
        : route.abort();
    });
    const date = new Date().toLocaleDateString('ru-RU', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
    const pages = Array.from({ length: Math.ceil(listings.length / 2) }, (_, i) =>
      listings.slice(i * 2, i * 2 + 2),
    );
    await page.setContent(
      `<!doctype html><html lang="ru"><meta charset="utf-8"><style>${fontCss}
 *{box-sizing:border-box}body{font-family:Golos,Arial,sans-serif;color:#23262b;margin:0;font-size:12px;-webkit-print-color-adjust:exact}.sheet{break-after:page}.sheet:last-child{break-after:auto}header{display:flex;align-items:center;justify-content:space-between;margin-bottom:28px}.brand{display:flex;gap:9px;align-items:center;font-size:27px;font-weight:700;letter-spacing:-1.4px}.brand-icon{display:grid;place-items:center;width:34px;height:34px;background:#f0f0ed;border-radius:11px}.edition{font-size:8px;color:#8b8e8b;letter-spacing:1.8px;text-transform:uppercase}h1{font-size:28px;line-height:1.17;letter-spacing:-.9px;margin:0;max-width:95%;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}.intro{display:flex;justify-content:space-between;gap:12px;color:#8b8e91;font-size:10px;margin:12px 0 26px}.card{height:350px;display:grid;grid-template-columns:47% 1fr;background:#f5f5f2;border-radius:21px;overflow:hidden;margin-bottom:20px;break-inside:avoid}.visual{position:relative;background:#eaeae6;height:350px;overflow:hidden}.photo{width:100%;height:100%;object-fit:cover;position:relative;z-index:1}.placeholder{position:absolute;inset:0;display:flex;gap:10px;align-items:center;justify-content:center;flex-direction:column;color:#a0a19a;font-size:11px}.badge{position:absolute;z-index:2;left:16px;top:16px;border-radius:15px;background:#fffffff0;padding:7px 11px;color:#343630;font-size:9px}.number{position:absolute;z-index:2;left:16px;bottom:15px;color:white;background:#2229;padding:5px 9px;border-radius:10px;font-size:10px}.info{padding:20px;display:flex;flex-direction:column;min-width:0}.overline{font-size:8px;color:#90918c;letter-spacing:1px;text-transform:uppercase;margin-bottom:5px}.price{font-size:29px;line-height:1.2;font-weight:700;letter-spacing:-1px;white-space:nowrap}.price small{font-size:10px;font-weight:400;color:#8b8d88;letter-spacing:0}h2{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;flex-shrink:0;font-size:15px;font-weight:700;line-height:1.4;margin:10px 0 5px;letter-spacing:-.2px}.facts{font-size:11px;color:#73766f;margin-bottom:8px}.address{font-size:11px;color:#72756f;line-height:1.55;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}.metro{font-size:10px;line-height:1.5;margin-top:7px;color:#50574e;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}.dot{display:inline-block;width:5px;height:5px;border-radius:50%;background:#777e72;margin-right:5px;vertical-align:middle}.bottom{margin-top:auto;border-top:1px solid #dedfd8;padding-top:13px;display:flex;align-items:flex-end;justify-content:space-between;gap:10px}.entry small{display:block;font-size:9px;color:#8c8f85;margin-bottom:3px}.entry b{font-size:19px;letter-spacing:-.6px;white-space:nowrap}.link{font-size:10px;color:#353b32;text-decoration:none;border-bottom:1px solid #aaa;white-space:nowrap;padding-bottom:2px}.note{font-size:9px;color:#969992;line-height:1.5;margin-top:15px}
.expenses{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin:11px 0 8px}.expense small{display:block;font-size:8px;color:#8b8e85;margin-bottom:3px}.expense b{font-size:10px;font-weight:400;white-space:nowrap}.features{font-size:9px;line-height:1.5;color:#656a60;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;margin-bottom:10px;flex-shrink:0}.bottom{flex-shrink:0} </style>${pages
        .map(
          (batch, pi) =>
            `<section class="sheet"><header><div class="brand"><span class="brand-icon">${house}</span>место.</div><span class="edition">Подборка квартир</span></header><h1>${escape(name)}</h1><div class="intro"><span>${listings.length} вариантов · ${escape(date)}</span><span>${pi * 2 + 1}–${Math.min(pi * 2 + 2, listings.length)} / ${listings.length}</span></div>${batch
              .map((l, i) => {
                const c = costs(l);
                const title =
                  l.rooms === 0
                    ? 'Студия'
                    : l.rooms != null
                      ? `${l.rooms}-комнатная квартира`
                      : l.title;
                const facts = [
                  l.area != null ? l.area + ' м²' : '',
                  l.floor != null ? l.floor + ' этаж' : '',
                  l.commission === 0 ? 'Без комиссии' : '',
                ]
                  .filter(Boolean)
                  .join(' · ');
                const expenses = [
                  [
                    'Залог',
                    l.deposit == null
                      ? 'Уточнить'
                      : l.deposit === 0
                        ? 'Без залога'
                        : rub(l.deposit),
                  ],
                  [
                    'Комиссия',
                    l.commission == null ? 'Уточнить' : l.commission === 0 ? 'Нет' : rub(c.fee),
                  ],
                  [
                    'ЖКУ / мес.',
                    l.utilities == null
                      ? 'Уточнить'
                      : l.utilities === 0
                        ? 'Включены'
                        : rub(l.utilities),
                  ],
                ];
                const year = l.details.building.buildYear ?? l.details.building.yearRelease;
                const repair = l.details.sections
                  .flatMap((s) => s.items)
                  .find((item) => item.label.toLowerCase() === 'ремонт')?.value;
                const features = [
                  repair,
                  typeof year === 'number' && year > 1800 ? `Дом ${year} г.` : '',
                  ...[
                    'petsAllowed',
                    'childrenAllowed',
                    'hasConditioner',
                    'hasDishwasher',
                    'hasWasher',
                    'hasFurniture',
                    'hasFridge',
                  ]
                    .filter((key) => l.details.amenities[key] === true)
                    .map((key) => amenityLabels[key]),
                ]
                  .filter(Boolean)
                  .slice(0, 4)
                  .join(' · ');
                return `<article class="card"><div class="visual"><div class="placeholder">${house}<span>Фотография недоступна</span></div>${l.photos[0] ? `<img class="photo" src="${escape(l.photos[0])}" onerror="this.remove()">` : ''}<span class="badge">${l.source === 'cian' ? 'Циан' : l.source === 'yandex' ? 'Яндекс' : 'Квартира'}</span><span class="number">${String(pi * 2 + i + 1).padStart(2, '0')}</span></div><div class="info"><div class="overline">Аренда в месяц</div><div class="price">${escape(rub(l.rent))}</div><h2>${escape(title)}</h2><div class="facts">${escape(facts)}</div><div class="address">${escape(l.address)}</div>${l.metro ? `<div class="metro"><i class="dot"></i>${escape(l.metro)}${l.metroMinutes != null ? ' · ' + l.metroMinutes + ' мин. пешком' : ''}</div>` : ''}<div class="expenses">${expenses.map(([label, value]) => `<div class="expense"><small>${escape(label)}</small><b>${escape(value)}</b></div>`).join('')}</div>${features ? `<div class="features">${escape(features)}</div>` : ''}<div class="bottom"><div class="entry"><small>На въезд${c.incomplete ? ' · от' : ''}</small><b>${escape(rub(c.moveIn))}</b></div>${l.url ? `<a class="link" href="${escape(l.url)}">Открыть ↗</a>` : ''}</div></div></article>`;
              })
              .join(
                '',
              )}<p class="note">${batch.some((l) => l.demo) ? 'Демонстрационные квартиры: цены вымышлены. ' : ''}Цены и условия уточняйте у владельца объявления. Неизвестные расходы не включены в сумму на въезд.</p></section>`,
        )
        .join('')}</html>`,
      { waitUntil: 'domcontentloaded' },
    );
    await page.evaluate(async () => {
      await document.fonts.ready;
      await Promise.race([
        Promise.all(
          [...document.images].map((img) =>
            img.complete
              ? Promise.resolve()
              : new Promise<void>((r) => {
                  img.addEventListener('load', () => r(), { once: true });
                  img.addEventListener(
                    'error',
                    () => {
                      img.remove();
                      r();
                    },
                    { once: true },
                  );
                }),
          ),
        ),
        new Promise((r) => setTimeout(r, 12000)),
      ]);
    });
    return await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '15mm', right: '15mm', bottom: '16mm', left: '15mm' },
      displayHeaderFooter: true,
      headerTemplate: '<span></span>',
      footerTemplate:
        '<div style="font:9px Arial;color:#999;width:100%;padding:0 15mm;display:flex;justify-content:space-between"><span>place.athing.pro</span><span><span class="pageNumber"></span> / <span class="totalPages"></span></span></div>',
    });
  } finally {
    try {
      await browser?.close();
    } finally {
      busy = false;
    }
  }
}
