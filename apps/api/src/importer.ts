import { Injectable, BadRequestException, OnModuleDestroy } from '@nestjs/common';
import { chromium, type BrowserContext, type Page } from 'playwright';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { currentUser, userContext, type User } from './user-context';
import {
  matchingMetroStops,
  searchMismatch,
  matchesDatabaseSearch,
  buildCianSearchUrl,
  type CianSearch,
} from '@rent/shared';
import { Store, dataDir, type ImportJob } from './store';
import { sourceUrl, isChallenge, extractLinks, parseHtml } from './parser';
type Task = {
  job: ImportJob;
  user?: User;
  key: string;
  limit: number;
  pages: number;
  slot?: number;
  context?: BrowserContext;
  page?: Page;
  headless?: boolean;
  httpStatus?: number;
  showRequested?: boolean;
  cancelled: boolean;
};
@Injectable()
export class Importer implements OnModuleDestroy {
  private active = new Map<string, Task>();
  private queue: Task[] = [];
  private stopping = false;
  private concurrency = Math.max(
    1,
    Math.min(3, Math.floor(Number(process.env.PARSER_CONCURRENCY) || 2)),
  );
  constructor(private readonly store: Store) {}
  search(criteria: CianSearch) {
    const count = this.store
      .all()
      .filter((l) => l.rating !== 1 && matchesDatabaseSearch(l, criteria)).length;
    if (!['all', 'cian'].includes(criteria.source)) return { count, reason: 'source', job: null };
    if (count >= 10) return { count, reason: 'enough', job: null };
    const recent = this.store
      .jobs()
      .find(
        (j) =>
          j.search &&
          JSON.stringify(j.search) === JSON.stringify(criteria) &&
          (['queued', 'running', 'waiting'].includes(j.status) ||
            Date.now() - Date.parse(j.createdAt) < 60000),
      );
    if (recent) return { count, reason: 'recent', job: recent };
    return {
      count,
      reason: 'fetching',
      job: this.start(buildCianSearchUrl(criteria), criteria.limit, criteria.pages, criteria),
    };
  }
  refreshAll(onlyMissing = false) {
    const existing = this.store
      .jobs()
      .filter((j) => j.urls?.length && ['queued', 'running', 'waiting'].includes(j.status));
    if (existing.length) return existing;
    const urls = this.store
      .all()
      .filter(
        (l) => l.source === 'cian' && !l.demo && l.url && (!onlyMissing || !l.details?.checkedAt),
      )
      .map((l) => l.url!);
    const halves = [urls.filter((_, i) => i % 2 === 0), urls.filter((_, i) => i % 2 === 1)];
    return halves
      .filter((urls) => urls.length)
      .map((urls) => this.start(urls[0], urls.length, 1, undefined, urls));
  }
  more(criteria: CianSearch) {
    const previous = this.store
      .jobs()
      .find((j) => JSON.stringify(j.search) === JSON.stringify(criteria));
    if (previous && ['queued', 'running', 'waiting'].includes(previous.status)) return previous;
    const url = new URL(buildCianSearchUrl(criteria));
    if (criteria.onlyNew && previous?.nextPage)
      url.searchParams.set('p', String(previous.nextPage));
    return this.start(url.href, criteria.limit, criteria.pages, criteria);
  }
  start(url: string, limit: number, pages: number, search?: CianSearch, urls?: string[]) {
    const checked = sourceUrl(url);
    if (this.stopping) throw new BadRequestException('Сервер перезапускается');
    const user = currentUser();
    const key = JSON.stringify([checked.url, search, limit, pages]);
    const tasks = [...this.active.values(), ...this.queue];
    const duplicate = tasks.find((t) => t.user?.id === user?.id && t.key === key);
    if (duplicate) return duplicate.job;
    if (tasks.filter((t) => t.user?.id === user?.id).length >= 3)
      throw new BadRequestException(
        'У вас уже три задачи. Дождитесь завершения или отмените одну.',
      );
    if (tasks.length >= 20)
      throw new BadRequestException('Очередь заполнена. Попробуйте чуть позже.');
    const job: ImportJob = {
      id: randomUUID(),
      url: checked.url,
      status: 'queued',
      message: 'В очереди на поиск…',
      count: 0,
      added: 0,
      updated: 0,
      alreadySaved: 0,
      warnings: [],
      search,
      urls,
      listingIds: [],
      scanned: 0,
      skipped: 0,
      createdAt: new Date().toISOString(),
    };
    this.store.saveJob(job);
    this.queue.push({ job, user, key, limit, pages, cancelled: false });
    this.pump();
    return job;
  }
  private pump() {
    while (!this.stopping && this.active.size < this.concurrency && this.queue.length) {
      const task = this.queue.shift()!;
      task.slot = Array.from({ length: this.concurrency }, (_, i) => i).find(
        (i) => ![...this.active.values()].some((t) => t.slot === i),
      )!;
      this.active.set(task.job.id, task);
      const launch = () => {
        task.job.status = 'running';
        task.job.message = 'Открываем браузер для сбора…';
        this.store.saveJob(task.job);
        void this.run(task, task.limit, task.pages);
      };
      if (task.user) userContext.run(task.user, launch);
      else userContext.exit(launch);
    }
  }
  async cancel(id: string) {
    const index = this.queue.findIndex((t) => t.job.id === id);
    if (index >= 0) {
      const [task] = this.queue.splice(index, 1);
      task.cancelled = true;
      task.job.status = 'cancelled';
      task.job.message = 'Поиск отменён до запуска';
      this.store.saveJob(task.job);
    }
    const task = this.active.get(id);
    if (task) {
      task.cancelled = true;
      await task.context?.close();
    }
    return { ok: true };
  }
  openBrowser(id: string) {
    const task = this.active.get(id);
    if (!task || !task.job.canOpenBrowser)
      throw new BadRequestException('Окно проверки сейчас не требуется');
    task.showRequested = true;
    return { ok: true };
  }
  private async launchBrowser(state: Task, headless: boolean) {
    state.context = await chromium.launchPersistentContext(
      resolve(dataDir, state.slot ? `browser-profile-${state.slot}` : 'browser-profile'),
      {
        headless,
        viewport: { width: 1280, height: 900 },
        locale: 'ru-RU',
        acceptDownloads: false,
      },
    );
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
  private async waitForPage(page: Page, state: Task) {
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
        : process.env.NODE_ENV === 'production'
          ? 'Циан запросил проверку. Администратор может открыть экран браузера на сервере через SSH. Ожидание до 3 минут.'
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
  private async readDetail(page: Page, state: Task, url: string, initialHtml: string) {
    let html = initialHtml;
    for (let attempt = 0; ; attempt++) {
      if (state.cancelled) throw new Error('Сбор отменен');
      if (state.httpStatus && state.httpStatus >= 400)
        throw new Error(`Объявление недоступно: HTTP ${state.httpStatus}`);
      try {
        const parsed = parseHtml(html, url);
        if (
          !parsed.listings.length &&
          parsed.warnings.some((w) => /Не найдена месячная цена/.test(w))
        )
          throw new Error(parsed.warnings.join(' '));
        return parsed;
      } catch (error) {
        // Some detail pages hydrate the price after their initial JSON-LD appears.
        if (
          attempt >= 15 ||
          !(error instanceof Error) ||
          !/Не найдена месячная цена/.test(error.message)
        )
          throw error;
        await page.waitForTimeout(1000);
        html = await page.content();
        if (isChallenge(html)) {
          html = await this.waitForPage(page, state);
          page = state.page!;
        }
      }
    }
  }
  private async run(state: Task, limit: number, pages: number) {
    const { job } = state;
    const imported = new Set<string>();
    const visited = new Set<string>();
    try {
      let page = await this.launchBrowser(state, false);
      for (const targetUrl of job.urls || [job.url]) {
        if (job.urls && visited.size) await page.waitForTimeout(1500);
        const isDetail = /\/(rent\/flat|offer)\/\d+/.test(targetUrl);
        for (let p = 1; p <= (isDetail ? 1 : pages) && imported.size < limit; p++) {
          if (state.cancelled) throw new Error('Сбор отменен');
          const catalog = new URL(targetUrl);
          const pageKey = catalog.hostname === 'realty.yandex.ru' ? 'page' : 'p';
          if (p > 1)
            catalog.searchParams.set(
              pageKey,
              String((Number(catalog.searchParams.get(pageKey)) || 1) + p - 1),
            );
          job.nextPage = Number(catalog.searchParams.get(pageKey)) || 1;
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
            !extractLinks(html, targetUrl).length
          )
            throw new Error(`Площадка вернула HTTP ${state.httpStatus}`);
          const catalogLinks = extractLinks(html, targetUrl);
          const links = isDetail ? [targetUrl] : catalogLinks.filter((x) => !visited.has(x));
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
            if (job.search?.onlyNew && this.store.hasUrl(link)) {
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
              const parsed = await this.readDetail(page, state, link, html);
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
                const wasSaved = this.store.hasUrl(l.url!);
                if (job.search?.onlyNew && wasSaved) {
                  job.alreadySaved = (job.alreadySaved || 0) + 1;
                  return;
                }
                const saved = this.store.save(l);
                if (!imported.has(l.url!)) {
                  if (wasSaved) job.updated = (job.updated || 0) + 1;
                  else job.added = (job.added || 0) + 1;
                }
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
          if (links.every((link) => visited.has(link))) job.nextPage! += 1;
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
          : job.warnings[0] || 'Не удалось получить ни одной квартиры';
    } catch (e) {
      job.status = state.cancelled ? 'cancelled' : job.count ? 'partial' : 'failed';
      job.message = state.cancelled
        ? 'Сбор отменен'
        : e instanceof Error
          ? e.message
          : 'Ошибка импорта';
      if (
        !state.cancelled &&
        /browserType\.|browserContext\.|Target page, context|SingletonLock|process_singleton/.test(
          job.message,
        )
      ) {
        console.error(`[import:${job.id}] Browser failure`, job.message);
        job.message = 'Не удалось запустить браузер поиска. Попробуйте ещё раз чуть позже.';
      }
      if (/Executable doesn't exist/.test(job.message))
        job.message =
          'Установите браузер: npx playwright install chromium, затем повторите импорт.';
    } finally {
      job.canOpenBrowser = false;
      await state.context?.close().catch(() => {});
      this.store.saveJob(job);
      this.active.delete(job.id);
      this.pump();
    }
  }
  async onModuleDestroy() {
    this.stopping = true;
    for (const task of this.queue.splice(0)) {
      task.job.status = 'cancelled';
      task.job.message = 'Сервер перезапускается. Повторите поиск.';
      this.store.saveJob(task.job);
    }
    await Promise.all(
      [...this.active.values()].map(async (task) => {
        task.cancelled = true;
        await task.context?.close().catch(() => {});
      }),
    );
  }
}
