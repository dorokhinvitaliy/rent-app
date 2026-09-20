import { Injectable, BadRequestException, OnModuleDestroy } from '@nestjs/common';
import { chromium, type BrowserContext, type Page } from 'playwright';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { matchingMetroStops, searchMismatch, type CianSearch } from '@rent/shared';
import { Store, dataDir, type ImportJob } from './store';
import { sourceUrl, isChallenge, extractLinks, parseHtml } from './parser';
@Injectable()
export class Importer implements OnModuleDestroy {
  private active?: {
    job: ImportJob;
    context?: BrowserContext;
    page?: Page;
    headless?: boolean;
    httpStatus?: number;
    showRequested?: boolean;
    cancelled: boolean;
  };
  constructor(private readonly store: Store) {}
  start(url: string, limit: number, pages: number, search?: CianSearch) {
    const checked = sourceUrl(url);
    if (this.active)
      throw new BadRequestException(
        'Другой сбор уже выполняется. Дождитесь завершения или отмените его.',
      );
    const job: ImportJob = {
      id: randomUUID(),
      url: checked.url,
      status: 'running',
      message: 'Запускаем фоновый сбор…',
      count: 0,
      added: 0,
      updated: 0,
      alreadySaved: 0,
      warnings: [],
      search,
      listingIds: [],
      scanned: 0,
      skipped: 0,
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
  openBrowser(id: string) {
    if (!this.active || this.active.job.id !== id || !this.active.job.canOpenBrowser)
      throw new BadRequestException('Окно проверки сейчас не требуется');
    this.active.showRequested = true;
    return { ok: true };
  }
  private async launchBrowser(state: NonNullable<Importer['active']>, headless: boolean) {
    state.context = await chromium.launchPersistentContext(resolve(dataDir, 'browser-profile'), {
      headless,
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
    state.httpStatus = undefined;
    page.on('response', (response) => {
      if (response.request().isNavigationRequest() && response.frame() === page.mainFrame())
        state.httpStatus = response.status();
    });
    state.page = page;
    state.headless = headless;
    return page;
  }
  private async waitForPage(page: Page, state: NonNullable<Importer['active']>) {
    let deadline = Date.now() + 180000;
    await page.waitForTimeout(1200);
    while (state.httpStatus === 403 || isChallenge(await page.content())) {
      const forbidden = state.httpStatus === 403;
      if (forbidden && !state.headless && !isChallenge(await page.content()))
        throw new Error(
          'Площадка закрыла доступ и в обычном браузере (HTTP 403). Сделайте паузу перед следующим запуском или импортируйте сохранённый HTML.',
        );
      if (state.cancelled) throw new Error('Сбор отменен');
      if (Date.now() > deadline)
        throw new Error(
          'Время ожидания проверки истекло. Сбор остановлен; сохранённые объявления не затронуты.',
        );
      state.job.status = 'waiting';
      state.job.canOpenBrowser = !!state.headless;
      state.job.message = state.headless
        ? forbidden
          ? 'Площадка ограничила фоновый доступ (HTTP 403). Откройте браузер для проверки и продолжения сбора.'
          : 'Площадка запросила проверку. Откройте окно браузера, чтобы пройти капчу.'
        : 'Пройдите проверку в открывшемся браузере. Ожидание до 3 минут.';
      this.store.saveJob(state.job);
      if (state.headless && state.showRequested) {
        state.showRequested = false;
        state.job.canOpenBrowser = false;
        this.store.saveJob(state.job);
        const url = page.url();
        await state.context?.close();
        page = await this.launchBrowser(state, false);
        const response = await page.goto(url, { waitUntil: 'domcontentloaded' });
        state.httpStatus = response?.status();
        deadline = Date.now() + 180000;
      }
      await page.waitForTimeout(1500);
    }
    state.job.canOpenBrowser = false;
    state.job.status = 'running';
    this.store.saveJob(state.job);
    await page
      .waitForFunction(
        () =>
          document.querySelector(
            '[data-name=PriceInfo], [data-mark=MainPrice], [data-name=CardComponent], .OfferPrice, .OffersSerpItem, script[type="application/ld+json"]',
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
    const visited = new Set<string>();
    const existing = new Set(this.store.all().map((l) => l.url));
    try {
      let page = await this.launchBrowser(state, true);
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
        state.httpStatus = response?.status();
        let html = await this.waitForPage(page, state);
        page = state.page!;
        if (
          !isDetail &&
          state.httpStatus &&
          state.httpStatus >= 400 &&
          !extractLinks(html, job.url).length
        )
          throw new Error(`Площадка вернула HTTP ${state.httpStatus}`);
        const catalogLinks = extractLinks(html, job.url);
        const links = isDetail ? [job.url] : catalogLinks.filter((x) => !visited.has(x));
        if (!links.length && catalogLinks.length) break;
        if (!links.length)
          throw new Error(
            'На странице нет ссылок на квартиры. Возможно, изменилась разметка или включена проверка.',
          );
        for (const link of links) {
          if (imported.size >= limit) break;
          if (state.cancelled) throw new Error('Сбор отменен');
          visited.add(link);
          job.scanned = visited.size;
          if (job.search?.onlyNew && existing.has(link)) {
            job.alreadySaved = (job.alreadySaved || 0) + 1;
            this.store.saveJob(job);
            continue;
          }
          job.message = `Собираем квартиру ${imported.size + 1} из ${limit}…`;
          this.store.saveJob(job);
          try {
            if (!isDetail) {
              await page.waitForTimeout(2000);
              const detailResponse = await page.goto(link, { waitUntil: 'domcontentloaded' });
              state.httpStatus = detailResponse?.status();
              html = await this.waitForPage(page, state);
              page = state.page!;
            }
            const parsed = parseHtml(html, link);
            parsed.listings.forEach((l) => {
              const mismatch = job.search ? searchMismatch(l, job.search) : null;
              if (mismatch) {
                job.skipped = (job.skipped || 0) + 1;
                job.warnings.push(`${l.url}: ${mismatch}`);
                return;
              }
              if (job.search?.metroStations.length) {
                const stop = matchingMetroStops(l, job.search)[0];
                if (stop) {
                  l.metro = stop.name;
                  l.metroMinutes = stop.minutes;
                }
              }
              const wasSaved = existing.has(l.url);
              const saved = this.store.save(l);
              if (!imported.has(l.url!)) {
                if (wasSaved) job.updated = (job.updated || 0) + 1;
                else job.added = (job.added || 0) + 1;
              }
              existing.add(l.url);
              job.listingIds!.push(saved.id);
              imported.add(l.url!);
            });
            job.count = imported.size;
            job.warnings = [...new Set([...job.warnings, ...parsed.warnings])];
            this.store.saveJob(job);
          } catch (e) {
            if (
              state.cancelled ||
              state.httpStatus === 403 ||
              isChallenge(await (state.page || page).content())
            )
              throw e;
            job.warnings.push(`${link}: ${e instanceof Error ? e.message : 'Ошибка чтения'}`);
          }
        }
      }
      job.status = job.count
        ? job.warnings.length
          ? 'partial'
          : 'done'
        : job.search && (job.skipped || job.alreadySaved)
          ? 'done'
          : 'failed';
      job.message = job.count
        ? `Добавлено новых: ${job.added}. Обновлено: ${job.updated}.`
        : job.search && (job.skipped || job.alreadySaved)
          ? job.alreadySaved
            ? 'Новых совпадений на просмотренных страницах нет. Сохраненные квартиры остаются в подборке.'
            : 'Подтвержденных совпадений нет. Попробуйте расширить параметры.'
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
      job.canOpenBrowser = false;
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
