/**
 * Who may edit?
 *
 *   READ_ONLY=true        nobody
 *   ADMIN_PASSWORD set    whoever logged in with that password
 *   neither               everybody who can reach the server (meant for use on your own PC)
 *
 * A login is remembered in a signed cookie for 30 days. Changing the password
 * logs everybody out.
 */
import crypto from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import type { SessionInfo } from '../shared/schema.ts';
import type { Config } from './config.ts';
import { HttpError } from './errors.ts';

const COOKIE = 'chronicle_session';
const SESSION_MS = 30 * 24 * 3600 * 1000;
const MAX_FAILURES = 8;
const LOCK_MS = 10 * 60 * 1000;

/**
 * Every request that changes something must carry this header. Browsers do not
 * let other websites add custom headers to requests aimed at this server, which
 * stops a malicious page from editing your data behind your back.
 */
export const EDIT_HEADER = 'x-chronicle';

function digest(text: string): Buffer {
  return crypto.createHash('sha256').update(text).digest();
}

export class Auth {
  private readonly config: Config;
  private readonly key: Buffer | null;
  private readonly failures = new Map<string, { count: number; until: number }>();

  constructor(config: Config) {
    this.config = config;
    this.key = config.adminPassword ? digest(`chronicle-session|${config.adminPassword}`) : null;
  }

  private sign(expires: number): string {
    const signature = crypto.createHmac('sha256', this.key!).update(String(expires)).digest('base64url');
    return `${expires}.${signature}`;
  }

  private valid(token: string | undefined): boolean {
    if (!this.key || !token) return false;
    const [expires, signature] = token.split('.');
    if (!expires || !signature || !/^\d+$/.test(expires) || Number(expires) < Date.now()) return false;
    const expected = Buffer.from(this.sign(Number(expires)));
    const given = Buffer.from(token);
    return expected.length === given.length && crypto.timingSafeEqual(expected, given);
  }

  private cookie(req: Request): string | undefined {
    for (const part of (req.headers.cookie ?? '').split(';')) {
      const [name, ...rest] = part.trim().split('=');
      if (name === COOKIE) return rest.join('=');
    }
    return undefined;
  }

  session(req: Request): SessionInfo {
    const authRequired = this.key !== null;
    const authenticated = authRequired && this.valid(this.cookie(req));
    return {
      readOnly: this.config.readOnly,
      authRequired,
      authenticated,
      canEdit: !this.config.readOnly && (!authRequired || authenticated),
    };
  }

  login(req: Request, res: Response, password: unknown): void {
    if (!this.config.adminPassword) throw new HttpError(400, 'No password is configured on this server.');
    const who = req.ip ?? 'unknown';
    const now = Date.now();
    const record = this.failures.get(who);
    if (record && record.count >= MAX_FAILURES && record.until > now) {
      const minutes = Math.ceil((record.until - now) / 60000);
      throw new HttpError(429, `Too many wrong passwords. Try again in ${minutes} minute${minutes === 1 ? '' : 's'}.`);
    }

    const correct = typeof password === 'string' && crypto.timingSafeEqual(digest(password), digest(this.config.adminPassword));
    if (!correct) {
      const count = record && record.until > now ? record.count + 1 : 1;
      this.failures.set(who, { count, until: now + LOCK_MS });
      throw new HttpError(401, 'Wrong password.');
    }

    this.failures.delete(who);
    const flags = ['HttpOnly', 'Path=/', 'SameSite=Strict', `Max-Age=${Math.floor(SESSION_MS / 1000)}`];
    if (req.secure) flags.push('Secure');
    res.setHeader('Set-Cookie', `${COOKIE}=${this.sign(now + SESSION_MS)}; ${flags.join('; ')}`);
  }

  logout(res: Response): void {
    res.setHeader('Set-Cookie', `${COOKIE}=; HttpOnly; Path=/; SameSite=Strict; Max-Age=0`);
  }

  /** Express middleware guarding every route that changes data. */
  requireEdit = (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.get(EDIT_HEADER)) throw new HttpError(400, `Requests that change data must send the "${EDIT_HEADER}" header.`);
    const session = this.session(req);
    if (session.readOnly) throw new HttpError(403, 'Editing is switched off on this server.');
    if (!session.canEdit) throw new HttpError(401, 'Log in to edit.');
    next();
  };
}
