import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export interface Config {
  /** Port the HTTP server listens on. */
  port: number;
  /** Interface to bind to. 127.0.0.1 keeps the app private to this machine. */
  host: string;
  /** Folder holding the story data (JSON), pictures and backups. */
  dataDir: string;
  /** Folder with the built web app (created by `npm run build`). */
  distDir: string;
  /** When set, editing requires logging in with this password. */
  adminPassword: string | null;
  /** When true nobody can edit, not even with the password. */
  readOnly: boolean;
  /** Set when running behind a reverse proxy that terminates HTTPS. */
  trustProxy: boolean;
  /** How many automatic backups to keep. */
  maxBackups: number;
}

function flag(value: string | undefined): boolean {
  return value !== undefined && ['1', 'true', 'yes', 'on'].includes(value.trim().toLowerCase());
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const password = env.ADMIN_PASSWORD?.trim();
  return {
    port: Number(env.PORT ?? env.API_PORT ?? 8787),
    host: env.HOST ?? '127.0.0.1',
    dataDir: path.resolve(projectRoot, env.DATA_DIR ?? 'data'),
    distDir: path.resolve(projectRoot, env.DIST_DIR ?? 'dist'),
    adminPassword: password ? password : null,
    readOnly: flag(env.READ_ONLY),
    trustProxy: flag(env.TRUST_PROXY),
    maxBackups: Number(env.MAX_BACKUPS ?? 40),
  };
}
