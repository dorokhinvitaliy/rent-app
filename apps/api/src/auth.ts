import {
  Injectable,
  Controller,
  Get,
  Post,
  Body,
  Res,
  Req,
  UnauthorizedException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import {
  randomBytes,
  randomUUID,
  createHash,
  createHmac,
  timingSafeEqual,
  scrypt,
} from 'node:crypto';
import { promisify } from 'node:util';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { Store, dataDir } from './store';
import { currentUser, type User } from './user-context';
const derive = promisify(scrypt);
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
const equal = (a: string, b: string) => timingSafeEqual(Buffer.from(hash(a)), Buffer.from(hash(b)));
const cookieName = 'mesto_session';
const credentials = z.object({
  email: z
    .string()
    .trim()
    .email()
    .max(254)
    .transform((s) => s.toLowerCase()),
  password: z.string().min(10).max(200),
  name: z.string().trim().min(1).max(60).optional(),
  invite: z.string().max(200).optional(),
});
export function requireLogin() {
  if (!currentUser() || currentUser()?.role === 'guest')
    throw new UnauthorizedException('Войдите, чтобы сохранить изменения');
}
@Injectable()
export class Auth {
  readonly invite: string;
  private readonly secret: string;
  private attempts = new Map<string, { count: number; until: number }>();
  constructor(private readonly store: Store) {
    const authDir =
      process.env.DATABASE_PATH && process.env.DATABASE_PATH !== ':memory:'
        ? dirname(resolve(process.env.DATABASE_PATH))
        : dataDir;
    mkdirSync(authDir, { recursive: true });
    const loadSecret = (name: string) => {
      const path = resolve(authDir, name);
      if (!existsSync(path))
        writeFileSync(path, randomBytes(32).toString('hex'), { mode: 0o600, flag: 'wx' });
      return readFileSync(path, 'utf8').trim();
    };
    if (
      process.env.NODE_ENV === 'production' &&
      (!process.env.AUTH_INVITE_CODE || process.env.AUTH_INVITE_CODE.length < 24)
    )
      throw new Error('Set AUTH_INVITE_CODE (at least 24 characters)');
    this.invite = process.env.AUTH_INVITE_CODE || loadSecret('invite-code');
    this.secret = loadSecret('cookie-secret');
    this.store.db.prepare('DELETE FROM sessions WHERE expiresAt<?').run(Date.now());
  }
  throttle(key: string, limit = 10, duration = 15 * 60_000) {
    const now = Date.now();
    for (const [k, v] of this.attempts) if (v.until < now) this.attempts.delete(k);
    if (this.attempts.size > 10000) throw new ForbiddenException('Слишком много запросов');
    const state = this.attempts.get(key) || { count: 0, until: now + duration };
    if (++state.count > limit)
      throw new ForbiddenException('Слишком много попыток. Попробуйте позже');
    this.attempts.set(key, state);
  }
  private cookies(req: Request) {
    return Object.fromEntries(
      (req.headers.cookie || '').split(';').map((s) => s.trim().split('=')),
    );
  }
  private options() {
    return {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax' as const,
      path: '/',
    };
  }
  resolve(req: Request, res: Response): User {
    const cookies = this.cookies(req);
    const token = cookies[cookieName];
    if (token && token.length < 200) {
      const row = this.store.db
        .prepare(
          'SELECT u.id,u.email,u.name,u.role FROM users u JOIN sessions s ON u.id=s.userId WHERE s.tokenHash=? AND s.expiresAt>?',
        )
        .get(hash(token), Date.now());
      if (row) return row as User;
    }
    let guest = cookies.mesto_guest || '';
    const [nonce, signature] = guest.split('.');
    const sign = (s: string) => createHmac('sha256', this.secret).update(s).digest('hex');
    if (!nonce || nonce.length !== 48 || !signature || !equal(signature, sign(nonce))) {
      const random = randomBytes(24).toString('hex');
      guest = random + '.' + sign(random);
      res.cookie('mesto_guest', guest, { ...this.options(), maxAge: 30 * 86400_000 });
    }
    return { id: 'guest:' + hash(guest), role: 'guest', email: '', name: 'Гость' };
  }
  private session(user: User, res: Response) {
    const token = randomBytes(32).toString('hex');
    this.store.db
      .prepare('INSERT INTO sessions VALUES(?,?,?)')
      .run(hash(token), user.id, Date.now() + 30 * 86400_000);
    res.cookie(cookieName, token, { ...this.options(), maxAge: 30 * 86400_000 });
    return user;
  }
  async login(body: unknown, res: Response, register = false) {
    const result = credentials.safeParse(body);
    if (!result.success)
      throw new BadRequestException('Проверьте email и пароль (от 10 до 200 символов)');
    const { email, password, name, invite } = result.data;
    if (register) {
      if (!invite || !equal(invite, this.invite))
        throw new ForbiddenException('Неверный код приглашения');
      const salt = randomBytes(16).toString('hex');
      const key = (await derive(password, salt, 64)) as Buffer;
      const db = this.store.db;
      db.exec('BEGIN IMMEDIATE');
      try {
        if (db.prepare('SELECT id FROM users WHERE email=?').get(email))
          throw new BadRequestException('Аккаунт с этим email уже существует');
        const first = !db.prepare('SELECT id FROM users LIMIT 1').get();
        const user: User = {
          id: randomUUID(),
          email,
          name: name || email.split('@')[0],
          role: first ? 'admin' : 'member',
        };
        db.prepare('INSERT INTO users VALUES(?,?,?,?,?,?)').run(
          user.id,
          email,
          user.name,
          salt + ':' + key.toString('hex'),
          user.role,
          new Date().toISOString(),
        );
        if (first) {
          for (const row of db.prepare('SELECT id,data FROM listings').all()) {
            const l = JSON.parse(row.data as string);
            db.prepare('INSERT INTO user_listings VALUES(?,?,?,?,?)').run(
              user.id,
              String(row.id),
              Number(!!l.favorite),
              l.notes || '',
              l.rating ?? null,
            );
            l.favorite = false;
            l.notes = '';
            l.rating = null;
            db.prepare('UPDATE listings SET data=? WHERE id=?').run(
              JSON.stringify(l),
              String(row.id),
            );
          }
          db.prepare('UPDATE collections SET ownerId=? WHERE ownerId IS NULL').run(user.id);
        }
        db.exec('COMMIT');
        return this.session(user, res);
      } catch (error) {
        if (db.isTransaction) db.exec('ROLLBACK');
        throw error;
      }
    }
    const row = this.store.db.prepare('SELECT * FROM users WHERE email=?').get(email);
    const [salt, stored] = String(row?.password || 'invalid:' + '0'.repeat(128)).split(':');
    const key = (await derive(password, salt, 64)) as Buffer;
    if (!row || !equal(key.toString('hex'), stored))
      throw new UnauthorizedException('Неверный email или пароль');
    const { id, role, name: userName } = row;
    return this.session(
      { id: String(id), email, role: role as User['role'], name: String(userName) },
      res,
    );
  }
  logout(req: Request, res: Response) {
    const token = this.cookies(req)[cookieName];
    if (token) this.store.db.prepare('DELETE FROM sessions WHERE tokenHash=?').run(hash(token));
    res.clearCookie(cookieName, this.options());
    return { ok: true };
  }
}
@Controller('api/auth')
export class AuthController {
  constructor(private readonly auth: Auth) {}
  @Get('me') me() {
    const user = currentUser();
    return { user: user?.role === 'guest' ? null : user };
  }
  @Post('login') login(
    @Body() body: unknown,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    this.auth.throttle('auth:' + req.ip);
    return this.auth.login(body, res);
  }
  @Post('register') register(
    @Body() body: unknown,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    this.auth.throttle('auth:' + req.ip);
    return this.auth.login(body, res, true);
  }
  @Post('logout') logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    return this.auth.logout(req, res);
  }
}
