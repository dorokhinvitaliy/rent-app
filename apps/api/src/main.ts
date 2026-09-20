import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Module,
  Param,
  Patch,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import { json, static as serveStatic } from 'express';
import type { Response } from 'express';
import { resolve } from 'node:path';
import { existsSync } from 'node:fs';
import { z } from 'zod';
import { listingSchema, patchSchema, cianSearchSchema, buildCianSearchUrl } from '@rent/shared';
import { Store } from './store';
import { Importer } from './importer';
import { parseHtml, sourceUrl } from './parser';
import { demoListings } from './demo';
import { exportWorkbook } from './export';
function parse<S extends z.ZodTypeAny>(schema: S, input: unknown): z.output<S> {
  const r = schema.safeParse(input);
  if (!r.success)
    throw new BadRequestException(
      r.error.issues.map((x) => `${x.path.join('.')}: ${x.message}`).join('; '),
    );
  return r.data;
}
@Controller('api')
class AppController {
  constructor(
    private readonly store: Store,
    private readonly importer: Importer,
  ) {}
  @Get('health') health() {
    return { ok: true };
  }
  @Get('listings') all() {
    return this.store.all();
  }
  @Post('listings') add(@Body() body: unknown) {
    const l = parse(listingSchema, body);
    if (l.url && l.source !== 'manual') {
      try {
        const s = sourceUrl(l.url);
        if (s.source !== l.source) throw new Error('Источник не совпадает со ссылкой');
        l.url = s.url;
      } catch (e) {
        throw new BadRequestException((e as Error).message);
      }
    }
    return this.store.save(l);
  }
  @Patch('listings/:id') patch(@Param('id') id: string, @Body() body: unknown) {
    const patch = parse(patchSchema, body);
    if (patch.url !== undefined)
      throw new BadRequestException('Ссылка источника не меняется после добавления');
    return this.store.patch(id, patch);
  }
  @Delete('listings/:id') remove(@Param('id') id: string) {
    this.store.remove(id);
    return { ok: true };
  }
  @Post('demo') demo() {
    if (!this.store.all().some((l) => l.demo))
      demoListings.forEach((l) => this.store.save(l, true));
    return this.store.all();
  }
  @Delete('demo') clearDemo() {
    this.store.removeDemo();
    return { ok: true };
  }
  @Get('imports') imports() {
    return this.store.jobs();
  }
  @Post('search/cian') searchCian(@Body() body: unknown) {
    const criteria = parse(cianSearchSchema, body);
    return this.importer.start(
      buildCianSearchUrl(criteria),
      criteria.limit,
      criteria.pages,
      criteria,
    );
  }
  @Post('listings/:id/refresh') refreshListing(@Param('id') id: string) {
    const listing = this.store.get(id);
    if (!listing.url || listing.source === 'manual' || listing.demo)
      throw new BadRequestException(
        'Для актуализации нужна ссылка на реальное объявление Циана или Яндекс Недвижимости',
      );
    return this.importer.start(listing.url, 1, 1);
  }
  @Post('imports/browser') browser(@Body() body: unknown) {
    const p = parse(
      z.object({
        url: z.string().max(2000),
        limit: z.number().int().min(1).max(30).default(10),
        pages: z.number().int().min(1).max(3).default(1),
      }),
      body,
    );
    try {
      return this.importer.start(p.url, p.limit, p.pages);
    } catch (e) {
      throw new BadRequestException((e as Error).message);
    }
  }
  @Post('imports/:id/open-browser') openBrowser(@Param('id') id: string) {
    return this.importer.openBrowser(id);
  }
  @Post('imports/:id/cancel') cancel(@Param('id') id: string) {
    return this.importer.cancel(id);
  }
  @Post('imports/html') html(@Body() body: unknown) {
    const p = parse(
      z.object({ url: z.string().max(2000), html: z.string().min(10).max(8_000_000) }),
      body,
    );
    try {
      const result = parseHtml(p.html, p.url);
      const existing = new Set(this.store.all().map((l) => l.url));
      let added = 0,
        updated = 0;
      result.listings.forEach((l) => {
        if (existing.has(l.url)) updated++;
        else added++;
        this.store.save(l);
        existing.add(l.url);
      });
      return { count: result.listings.length, added, updated, warnings: result.warnings };
    } catch (e) {
      throw new BadRequestException((e as Error).message);
    }
  }
  @Get('export.xlsx') async export(
    @Query('ids') ids: string | undefined,
    @Query('months') months: string | undefined,
    @Res() res: Response,
  ) {
    const term = parse(z.coerce.number().int().min(1).max(120).default(12), months);
    const selected = ids ? new Set(parse(z.string().max(100000), ids).split(',')) : null;
    const listings = this.store.all().filter((l) => !selected || selected.has(l.id));
    const buffer = await exportWorkbook(listings, term);
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader('Content-Disposition', 'attachment; filename="mesto-apartments.xlsx"');
    res.send(Buffer.from(buffer));
  }
}
@Module({ controllers: [AppController], providers: [Store, Importer] })
class AppModule {}
async function bootstrap() {
  const port = Number(process.env.PORT) || 3001;
  const app = await NestFactory.create(AppModule, { bodyParser: false });
  // Local application: bind loopback, reject mutations from foreign websites.
  app.use((req: any, res: any, next: any) => {
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
      const origin = req.headers.origin;
      if (
        origin &&
        ![
          'http://localhost:5173',
          'http://127.0.0.1:5173',
          `http://localhost:${port}`,
          `http://127.0.0.1:${port}`,
        ].includes(origin)
      )
        return res.status(403).json({ message: 'Недопустимый источник запроса' });
      if (!req.is('application/json'))
        return res.status(415).json({ message: 'Ожидается application/json' });
    }
    next();
  });
  app.use(json({ limit: '9mb' }));
  const frontend = resolve(__dirname, '../../web/dist');
  if (existsSync(frontend)) app.use(serveStatic(frontend));
  app.enableShutdownHooks();
  await app.listen(port, '127.0.0.1');
}
void bootstrap();
