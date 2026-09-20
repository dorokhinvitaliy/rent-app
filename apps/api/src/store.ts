import { currentUser } from './user-context';
import { Injectable, NotFoundException, OnModuleDestroy } from '@nestjs/common';
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { randomUUID } from 'node:crypto';
import { type Listing, type ListingInput, type CianSearch } from '@rent/shared';
export const dataDir = process.env.DATA_DIR || resolve(__dirname, '../../../..', 'data');
@Injectable()
export class Store implements OnModuleDestroy {
  readonly db: DatabaseSync;
  constructor() {
    const path = process.env.DATABASE_PATH || resolve(dataDir, 'rent.sqlite');
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path);
    this.db.exec(`PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS listings(id TEXT PRIMARY KEY, url TEXT UNIQUE, data TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS imports(id TEXT PRIMARY KEY, data TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS collections(id TEXT PRIMARY KEY, name TEXT NOT NULL, createdAt TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS collection_listings(collectionId TEXT NOT NULL REFERENCES collections(id) ON DELETE CASCADE, listingId TEXT NOT NULL REFERENCES listings(id) ON DELETE CASCADE, PRIMARY KEY(collectionId, listingId));
      CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY,email TEXT NOT NULL UNIQUE,name TEXT NOT NULL,password TEXT NOT NULL,role TEXT NOT NULL,createdAt TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS sessions(tokenHash TEXT PRIMARY KEY,userId TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,expiresAt INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS user_listings(userId TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,listingId TEXT NOT NULL REFERENCES listings(id) ON DELETE CASCADE,favorite INTEGER NOT NULL DEFAULT 0,notes TEXT NOT NULL DEFAULT '',rating INTEGER,PRIMARY KEY(userId,listingId));`);
    if (
      !this.db
        .prepare('PRAGMA table_info(collections)')
        .all()
        .some((c) => c.name === 'ownerId')
    )
      this.db.exec('ALTER TABLE collections ADD COLUMN ownerId TEXT REFERENCES users(id)');
    this.db.exec('PRAGMA user_version=3;');
    const jobs = this.jobs();
    for (const job of jobs)
      if (['running', 'waiting'].includes(job.status))
        this.saveJob({ ...job, status: 'failed', message: 'Сбор прерван перезапуском приложения' });
  }
  collections() {
    return this.db
      .prepare(
        'SELECT * FROM collections WHERE (? IS NULL OR ownerId=?) ORDER BY createdAt DESC, rowid DESC',
      )
      .all(currentUser()?.id ?? null, currentUser()?.id ?? null)
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
    if (
      !this.db
        .prepare('SELECT id FROM collections WHERE id=? AND (? IS NULL OR ownerId=?)')
        .get(id, currentUser()?.id ?? null, currentUser()?.id ?? null)
    )
      throw new NotFoundException('Подборка не найдена');
  }
  createCollection(name: string, ids: string[]) {
    const id = randomUUID();
    this.db.exec('BEGIN');
    try {
      ids.forEach((listingId) => this.get(listingId));
      this.db
        .prepare('INSERT INTO collections(id,name,createdAt,ownerId) VALUES(?,?,?,?)')
        .run(id, name, new Date().toISOString(), currentUser()?.id ?? null);
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
      .map((r) => this.personalize(JSON.parse(r.data as string)));
  }
  get(id: string): Listing {
    const row = this.db.prepare('SELECT data FROM listings WHERE id=?').get(id);
    if (!row) throw new NotFoundException('Квартира не найдена');
    return this.personalize(JSON.parse(row.data as string));
  }
  private personalize(listing: Listing): Listing {
    const user = currentUser();
    if (!user) return listing;
    const state = this.db
      .prepare('SELECT favorite,notes,rating FROM user_listings WHERE userId=? AND listingId=?')
      .get(user.id, listing.id);
    return {
      ...listing,
      favorite: !!state?.favorite,
      notes: String(state?.notes ?? ''),
      rating: state?.rating == null ? null : Number(state.rating),
    };
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
    return this.personalize(listing);
  }
  patch(id: string, patch: Partial<Listing>): Listing {
    const user = currentUser();
    const old = this.get(id);
    if (user) {
      const { favorite, notes, rating, ...shared } = patch;
      if (favorite !== undefined || notes !== undefined || rating !== undefined)
        this.db
          .prepare(
            'INSERT INTO user_listings(userId,listingId,favorite,notes,rating) VALUES(?,?,?,?,?) ON CONFLICT(userId,listingId) DO UPDATE SET favorite=excluded.favorite,notes=excluded.notes,rating=excluded.rating',
          )
          .run(
            user.id,
            id,
            Number(favorite ?? old.favorite),
            notes ?? old.notes,
            rating === undefined ? (old.rating ?? null) : rating,
          );
      if (!Object.keys(shared).length) return this.get(id);
      patch = shared;
    }
    const raw = JSON.parse(
      this.db.prepare('SELECT data FROM listings WHERE id=?').get(id)!.data as string,
    );
    const listing = { ...raw, ...patch, id, updatedAt: new Date().toISOString() };
    this.db
      .prepare('UPDATE listings SET url=?,data=? WHERE id=?')
      .run(listing.url, JSON.stringify(listing), id);
    return this.personalize(listing);
  }
  remove(id: string) {
    this.get(id);
    this.db.prepare('DELETE FROM listings WHERE id=?').run(id);
  }
  removeDemo() {
    for (const l of this.all()) if (l.demo) this.remove(l.id);
  }
  saveJob(job: ImportJob) {
    if (currentUser() && !job.userId) job.userId = currentUser()!.id;
    this.db
      .prepare(
        'INSERT INTO imports(id,data) VALUES(?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data',
      )
      .run(job.id, JSON.stringify(job));
  }
  jobs(): ImportJob[] {
    return this.db
      .prepare(
        "SELECT data FROM imports WHERE (? IS NULL OR json_extract(data,'$.userId')=?) ORDER BY rowid DESC LIMIT 30",
      )
      .all(currentUser()?.id ?? null, currentUser()?.id ?? null)
      .map((r) => JSON.parse(r.data as string));
  }
  onModuleDestroy() {
    this.db.close();
  }
}
export type ImportJob = {
  userId?: string;
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
