import { chromium } from 'playwright';
import { costs, type Listing } from '@rent/shared';
import { BadRequestException } from '@nestjs/common';
const escape = (s: unknown) =>
  String(s ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  );
const rub = (n: number) =>
  new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 }).format(n) + ' ₽';
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
        /^(images\.)?cdn-cian\.ru$|^images\.cdn-cian\.ru$|^avatars\.mds\.yandex\.net$|^images\.unsplash\.com$/.test(
          u.hostname,
        );
      return allowed && route.request().resourceType() === 'image'
        ? route.continue()
        : route.abort();
    });
    const date = new Date().toLocaleDateString('ru-RU');
    await page.setContent(
      `<!doctype html><html lang="ru"><meta charset="utf-8"><style>
      *{box-sizing:border-box}body{font-family:Arial,sans-serif;color:#22252b;margin:0;font-size:12px}header{display:flex;justify-content:space-between;align-items:center;margin-bottom:28px}.brand{font-size:26px;font-weight:700;display:flex;align-items:center;gap:9px}h1{font-size:24px;line-height:1.2;margin:0 0 8px;overflow-wrap:anywhere}.intro{color:#777;margin-bottom:24px}.card{display:flex;gap:22px;border-bottom:1px solid #e5e5e5;padding:0 0 20px;margin-bottom:20px;break-inside:avoid;height:230px}.photo{width:260px;height:208px;border-radius:18px;background:#f1f1f1;object-fit:cover;flex:none}.info{flex:1;min-width:0;display:flex;flex-direction:column;align-items:flex-start}h2{font-size:15px;line-height:1.4;margin:3px 0 9px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}.price{font-size:24px;font-weight:700;margin-bottom:8px}.price small{font-size:11px;color:#777;font-weight:400}.facts{color:#555;font-size:11px;margin:0 0 8px}.address{color:#6e7279;line-height:1.5;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}.metro{color:#666;font-size:11px;margin-top:6px}.cost{background:#f4f4f4;border-radius:10px;padding:8px 10px;margin-top:auto;width:100%;display:flex;justify-content:space-between;gap:10px}.source{display:flex;justify-content:space-between;width:100%;font-size:10px;color:#777;margin-top:8px}a{color:#333}footer{font-size:10px;color:#888;line-height:1.5;margin-top:10px}.placeholder{display:flex;align-items:center;justify-content:center;color:#aaa}
      </style><header><div class="brand"><svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#22252b" stroke-width="1.7"><path d="M3 10 12 3l9 7v10H3zM9 20v-7h6v7"/></svg>место.</div><span>${escape(date)} · place.athing.pro</span></header><h1>${escape(name)}</h1><div class="intro">${listings.length} квартир · Ваша подборка</div>${listings
        .map((l) => {
          const c = costs(l);
          return `<article class="card">${l.photos[0] ? `<img class="photo" src="${escape(l.photos[0])}" onerror="this.style.visibility='hidden'">` : '<div class="photo placeholder">Нет фотографии</div>'}<div class="info"><h2>${escape(l.title)}</h2><div class="price">${escape(rub(l.rent))} <small>/ месяц</small></div><div class="facts">${escape([l.area != null ? l.area + ' м²' : '', l.floor != null ? l.floor + ' этаж' : ''].filter(Boolean).join(' · '))}</div><div class="address">${escape(l.address)}</div>${l.metro ? `<div class="metro">● ${escape(l.metro)}${l.metroMinutes != null ? ' · ' + l.metroMinutes + ' мин. пешком' : ''}</div>` : ''}<div class="cost"><span>На въезд${c.incomplete ? ' · от' : ''}</span><b>${escape(rub(c.moveIn))}</b></div><div class="source"><span>${l.demo ? 'Демо · вымышленные цены' : 'Аренда, залог и комиссия'}</span>${l.url ? `<a href="${escape(l.url)}">Объявление ↗</a>` : ''}</div></div></article>`;
        })
        .join(
          '',
        )}<footer>Цены и доступность уточняйте у владельца объявления. Неизвестные расходы не включены в расчёт. Залог может возвращаться по условиям договора.</footer></html>`,
      { waitUntil: 'domcontentloaded' },
    );
    await page.evaluate(async () => {
      await Promise.race([
        Promise.all(
          [...document.images].map((img) =>
            img.complete
              ? Promise.resolve()
              : new Promise<void>((resolve) => {
                  img.onload = () => resolve();
                  img.onerror = () => resolve();
                }),
          ),
        ),
        new Promise((r) => setTimeout(r, 12000)),
      ]);
    });
    return await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '16mm', right: '15mm', bottom: '18mm', left: '15mm' },
      displayHeaderFooter: true,
      headerTemplate: '<span></span>',
      footerTemplate:
        '<div style="font:9px Arial;color:#999;width:100%;padding:0 15mm;display:flex;justify-content:space-between"><span>место. · Подборка квартир</span><span class="pageNumber"></span></div>',
    });
  } finally {
    try {
      await browser?.close();
    } finally {
      busy = false;
    }
  }
}
