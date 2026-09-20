import { Injectable, NotFoundException, OnModuleDestroy } from '@nestjs/common';
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { randomUUID } from 'node:crypto';
import { type Listing, type ListingInput, type CianSearch } from '@rent/shared';
export const dataDir = process.env.DATA_DIR || resolve(__dirname, '../../../..', 'data');
@Injectable()
export class Store implements OnModuleDestroy {
  private db: DatabaseSync;
  constructor() {
    const path = process.env.DATABASE_PATH || resolve(dataDir, 'rent.sqlite');
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path);
    this.db.exec(`PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS listings(id TEXT PRIMARY KEY, url TEXT UNIQUE, data TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS imports(id TEXT PRIMARY KEY, data TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS collections(id TEXT PRIMARY KEY, name TEXT NOT NULL, createdAt TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS collection_listings(collectionId TEXT NOT NULL REFERENCES collections(id) ON DELETE CASCADE, listingId TEXT NOT NULL REFERENCES listings(id) ON DELETE CASCADE, PRIMARY KEY(collectionId, listingId));
      PRAGMA user_version=2;`);
    const jobs = this.jobs();
    for (const job of jobs)
      if (['running', 'waiting'].includes(job.status))
        this.saveJob({ ...job, status: 'failed', message: 'Сбор прерван перезапуском приложения' });
  }
  collections() {
    return this.db
      .prepare('SELECT * FROM collections ORDER BY createdAt DESC, rowid DESC')
      .all()
      .map((row) => ({
        id: String(row.id),
        name: String(row.name),
        createdAt: String(row.createdAt),
        listingIds: this.db
          .prepare('SELECT listingId FROM collection_listings WHERE collectionId=? ORDER BY rowid')
          .all(row.id as string)
          .map((member) => member.listingId as string),
      }));
  }
  private requireCollection(id: string) {
    if (!this.db.prepare('SELECT id FROM collections WHERE id=?').get(id))
      throw new NotFoundException('Подборка не найдена');
  }
  createCollection(name: string, ids: string[]) {
    const id = randomUUID();
    this.db.exec('BEGIN');
    try {
      ids.forEach((listingId) => this.get(listingId));
      this.db
        .prepare('INSERT INTO collections(id,name,createdAt) VALUES(?,?,?)')
        .run(id, name, new Date().toISOString());
      const insert = this.db.prepare('INSERT OR IGNORE INTO collection_listings VALUES(?,?)');
      ids.forEach((listingId) => insert.run(id, listingId));
      this.db.exec('COMMIT');
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
    return this.collections().find((c) => c.id === id)!;
  }
  addToCollection(id: string, ids: string[]) {
    this.requireCollection(id);
    ids.forEach((listingId) => this.get(listingId));
    this.db.exec('BEGIN');
    try {
      const insert = this.db.prepare('INSERT OR IGNORE INTO collection_listings VALUES(?,?)');
      ids.forEach((listingId) => insert.run(id, listingId));
      this.db.exec('COMMIT');
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
    return this.collections().find((c) => c.id === id)!;
  }
  removeFromCollection(id: string, ids: string[]) {
    this.requireCollection(id);
    const remove = this.db.prepare(
      'DELETE FROM collection_listings WHERE collectionId=? AND listingId=?',
    );
    this.db.exec('BEGIN');
    try {
      ids.forEach((listingId) => remove.run(id, listingId));
      this.db.exec('COMMIT');
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
    return this.collections().find((c) => c.id === id)!;
  }
  all(): Listing[] {
    return this.db
      .prepare('SELECT data FROM listings ORDER BY rowid DESC')
      .all()
      .map((r) => JSON.parse(r.data as string));
  }
  get(id: string): Listing {
    const row = this.db.prepare('SELECT data FROM listings WHERE id=?').get(id);
    if (!row) throw new NotFoundException('Квартира не найдена');
    return JSON.parse(row.data as string);
  }
  save(input: ListingInput, demo = false): Listing {
    const row = input.url
      ? this.db.prepare('SELECT data FROM listings WHERE url=?').get(input.url)
      : undefined;
    const old: Listing | undefined = row ? JSON.parse(row.data as string) : undefined;
    // An incomplete source refresh must not erase previously entered values.
    const merged = { ...input };
    if (old) {
      for (const key of [
        'deposit',
        'utilities',
        'commission',
        'area',
        'floor',
        'rooms',
        'metroMinutes',
      ] as const)
        if (merged[key] === null) merged[key] = old[key];
      if (input.commission === null) merged.commissionType = old.commissionType;
      merged.otherCosts = old.otherCosts;
      if (!merged.metro) merged.metro = old.metro;
      if (!merged.photos.length) merged.photos = old.photos;
    }
    const now = new Date().toISOString();
    const listing: Listing = {
      ...merged,
      id: old?.id || randomUUID(),
      favorite: old?.favorite || false,
      notes: old?.notes || '',
      rating: old?.rating ?? null,
      demo: old?.demo ?? demo,
      createdAt: old?.createdAt || now,
      updatedAt: now,
    };
    this.db
      .prepare(
        'INSERT INTO listings(id,url,data) VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET url=excluded.url,data=excluded.data',
      )
      .run(listing.id, listing.url, JSON.stringify(listing));
    return listing;
  }
  patch(id: string, patch: Partial<Listing>): Listing {
    const listing = { ...this.get(id), ...patch, id, updatedAt: new Date().toISOString() };
    this.db
      .prepare('UPDATE listings SET url=?,data=? WHERE id=?')
      .run(listing.url, JSON.stringify(listing), id);
    return listing;
  }
  remove(id: string) {
    this.get(id);
    this.db.prepare('DELETE FROM listings WHERE id=?').run(id);
  }
  removeDemo() {
    for (const l of this.all()) if (l.demo) this.remove(l.id);
  }
  saveJob(job: ImportJob) {
    this.db
      .prepare(
        'INSERT INTO imports(id,data) VALUES(?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data',
      )
      .run(job.id, JSON.stringify(job));
  }
  jobs(): ImportJob[] {
    return this.db
      .prepare('SELECT data FROM imports ORDER BY rowid DESC LIMIT 30')
      .all()
      .map((r) => JSON.parse(r.data as string));
  }
  onModuleDestroy() {
    this.db.close();
  }
}
export type ImportJob = {
  id: string;
  url: string;
  status: 'running' | 'waiting' | 'done' | 'partial' | 'failed' | 'cancelled';
  message: string;
  count: number;
  added?: number;
  updated?: number;
  alreadySaved?: number;
  canOpenBrowser?: boolean;
  warnings: string[];
  search?: CianSearch;
  listingIds?: string[];
  scanned?: number;
  skipped?: number;
  createdAt: string;
};
