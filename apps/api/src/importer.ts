import { Injectable, BadRequestException, OnModuleDestroy } from '@nestjs/common';
import { chromium, type BrowserContext, type Page } from 'playwright';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { Store, dataDir, type ImportJob } from './store';
import { sourceUrl, isChallenge, extractLinks, parseHtml } from './parser';
@Injectable()
export class Importer implements OnModuleDestroy {
  private active?: { job: ImportJob; context?: BrowserContext; cancelled: boolean };
  constructor(private readonly store: Store) {}
  start(url: string, limit: number, pages: number) {
    const checked = sourceUrl(url);
    if (this.active)
      throw new BadRequestException(
        'Другой сбор уже выполняется. Дождитесь завершения или отмените его.',
      );
    const job: ImportJob = {
      id: randomUUID(),
      url: checked.url,
      status: 'running',
      message: 'Открываем браузер…',
      count: 0,
      warnings: [],
      createdAt: new Date().toISOString(),
    };
    this.active = { job, cancelled: false };
    this.store.saveJob(job);
    void this.run(this.active, limit, pages);
    return job;
  }
  async cancel(id: string) {
    if (this.active?.job.id === id) {
      this.active.cancelled = true;
      await this.active.context?.close();
    }
    return { ok: true };
  }
  private async waitForPage(page: Page, state: NonNullable<Importer['active']>) {
    const deadline = Date.now() + 180000;
    await page.waitForTimeout(1200);
    while (isChallenge(await page.content())) {
      if (state.cancelled) throw new Error('Сбор отменен');
      if (Date.now() > deadline)
        throw new Error('Время ожидания капчи истекло. Запустите импорт повторно.');
      state.job.status = 'waiting';
      state.job.message = 'Пройдите проверку в открывшемся браузере. Ожидание до 3 минут.';
      this.store.saveJob(state.job);
      await page.waitForTimeout(1500);
    }
    state.job.status = 'running';
    this.store.saveJob(state.job);
    await page
      .waitForFunction(
        () =>
          document.querySelector(
            '[data-mark=MainPrice], [data-name=CardComponent], .OfferPrice, .OffersSerpItem, script[type="application/ld+json"]',
          ) !== null,
        undefined,
        { timeout: 15000 },
      )
      .catch(() => {});
    return page.content();
  }
  private async run(state: NonNullable<Importer['active']>, limit: number, pages: number) {
    const { job } = state;
    const imported = new Set<string>();
    try {
      state.context = await chromium.launchPersistentContext(resolve(dataDir, 'browser-profile'), {
        headless: false,
        viewport: { width: 1280, height: 900 },
        locale: 'ru-RU',
        acceptDownloads: false,
      });
      if (state.cancelled) throw new Error('Сбор отменен');
      // Disallow browser subresources targeting local services.
      await state.context.route('**/*', async (route) => {
        const u = new URL(route.request().url());
        if (
          /^(localhost|127\.|0\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|\[)/.test(
            u.hostname,
          )
        )
          return route.abort();
        return route.continue();
      });
      const page = state.context.pages()[0] || (await state.context.newPage());
      page.setDefaultNavigationTimeout(45000);
      const isDetail = /\/(rent\/flat|offer)\/\d+/.test(job.url);
      for (let p = 1; p <= (isDetail ? 1 : pages) && imported.size < limit; p++) {
        if (state.cancelled) throw new Error('Сбор отменен');
        const catalog = new URL(job.url);
        const pageKey = catalog.hostname === 'realty.yandex.ru' ? 'page' : 'p';
        if (p > 1)
          catalog.searchParams.set(
            pageKey,
            String((Number(catalog.searchParams.get(pageKey)) || 1) + p - 1),
          );
        job.message = `Загружаем страницу ${p}…`;
        this.store.saveJob(job);
        const response = await page.goto(catalog.href, { waitUntil: 'domcontentloaded' });
        let html = await this.waitForPage(page, state);
        if (response && response.status() >= 400 && !extractLinks(html, job.url).length)
          throw new Error(`Площадка вернула HTTP ${response.status()}`);
        const links = isDetail
          ? [job.url]
          : extractLinks(html, job.url).filter((x) => !imported.has(x));
        if (!links.length)
          throw new Error(
            'На странице нет ссылок на квартиры. Возможно, изменилась разметка или включена проверка.',
          );
        for (const link of links) {
          if (imported.size >= limit) break;
          if (state.cancelled) throw new Error('Сбор отменен');
          job.message = `Собираем квартиру ${imported.size + 1} из ${limit}…`;
          this.store.saveJob(job);
          try {
            if (!isDetail) {
              await page.waitForTimeout(2000);
              await page.goto(link, { waitUntil: 'domcontentloaded' });
              html = await this.waitForPage(page, state);
            }
            const parsed = parseHtml(html, link);
            parsed.listings.forEach((l) => {
              this.store.save(l);
              imported.add(l.url!);
            });
            job.count = imported.size;
            job.warnings = [...new Set([...job.warnings, ...parsed.warnings])];
            this.store.saveJob(job);
          } catch (e) {
            if (state.cancelled || isChallenge(await page.content())) throw e;
            job.warnings.push(`${link}: ${e instanceof Error ? e.message : 'Ошибка чтения'}`);
          }
        }
      }
      job.status = job.count ? (job.warnings.length ? 'partial' : 'done') : 'failed';
      job.message = job.count
        ? `Сохранено квартир: ${job.count}`
        : 'Не удалось получить ни одной квартиры';
    } catch (e) {
      job.status = state.cancelled ? 'cancelled' : job.count ? 'partial' : 'failed';
      job.message = state.cancelled
        ? 'Сбор отменен'
        : e instanceof Error
          ? e.message
          : 'Ошибка импорта';
      if (/Executable doesn't exist/.test(job.message))
        job.message =
          'Установите браузер: npx playwright install chromium, затем повторите импорт.';
    } finally {
      await state.context?.close().catch(() => {});
      this.store.saveJob(job);
      this.active = undefined;
    }
  }
  async onModuleDestroy() {
    if (this.active) {
      this.active.cancelled = true;
      await this.active.context?.close().catch(() => {});
    }
  }
}
