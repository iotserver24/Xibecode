import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { nanoid } from 'nanoid';

export type User = {
  id: string;
  email: string;
  passwordHash: string;
  createdAt: string;
};

export type InstanceStatus = 'creating' | 'running' | 'paused' | 'error' | 'destroyed';

export type Instance = {
  id: string;
  userId: string;
  name: string;
  /** Gateway session id (maps 1:1 to an E2B sandbox). */
  sessionId: string;
  sandboxId?: string;
  status: InstanceStatus;
  /** AI + Telegram setup state. */
  aiConfigured: boolean;
  telegramConfigured: boolean;
  plan: 'hosting-4c8g';
  createdAt: string;
  updatedAt: string;
  lastError?: string;
};

type Db = {
  users: User[];
  instances: Instance[];
};

function dataDir(): string {
  const dir =
    process.env.XIBECODE_HOSTING_DATA_DIR?.trim() ||
    join(homedir(), '.xibecode', 'hosting');
  mkdirSync(dir, { recursive: true });
  return dir;
}

function dbPath(): string {
  return join(dataDir(), 'db.json');
}

function load(): Db {
  const p = dbPath();
  if (!existsSync(p)) return { users: [], instances: [] };
  try {
    const raw = JSON.parse(readFileSync(p, 'utf8')) as Db;
    return {
      users: Array.isArray(raw.users) ? raw.users : [],
      instances: Array.isArray(raw.instances) ? raw.instances : [],
    };
  } catch {
    return { users: [], instances: [] };
  }
}

function save(db: Db): void {
  writeFileSync(dbPath(), JSON.stringify(db, null, 2), { mode: 0o600 });
}

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(':');
  if (!salt || !hash) return false;
  const next = scryptSync(password, salt, 64);
  const prev = Buffer.from(hash, 'hex');
  if (next.length !== prev.length) return false;
  return timingSafeEqual(next, prev);
}

export function createUser(email: string, password: string): User {
  const db = load();
  const normalized = email.trim().toLowerCase();
  if (db.users.some((u) => u.email === normalized)) {
    throw new Error('Email already registered');
  }
  if (password.length < 8) throw new Error('Password must be at least 8 characters');
  const user: User = {
    id: nanoid(12),
    email: normalized,
    passwordHash: hashPassword(password),
    createdAt: new Date().toISOString(),
  };
  db.users.push(user);
  save(db);
  return user;
}

export function findUserByEmail(email: string): User | undefined {
  return load().users.find((u) => u.email === email.trim().toLowerCase());
}

export function findUserById(id: string): User | undefined {
  return load().users.find((u) => u.id === id);
}

export function listInstances(userId: string): Instance[] {
  return load()
    .instances.filter((i) => i.userId === userId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function getInstance(userId: string, id: string): Instance | undefined {
  return load().instances.find((i) => i.id === id && i.userId === userId);
}

export function createInstanceRecord(input: {
  userId: string;
  name: string;
  sessionId: string;
  sandboxId?: string;
}): Instance {
  const db = load();
  const now = new Date().toISOString();
  const inst: Instance = {
    id: nanoid(10),
    userId: input.userId,
    name: input.name.trim() || 'workspace',
    sessionId: input.sessionId,
    sandboxId: input.sandboxId,
    status: 'running',
    aiConfigured: false,
    telegramConfigured: false,
    plan: 'hosting-4c8g',
    createdAt: now,
    updatedAt: now,
  };
  db.instances.push(inst);
  save(db);
  return inst;
}

export function updateInstance(
  userId: string,
  id: string,
  patch: Partial<Pick<Instance, 'status' | 'sandboxId' | 'aiConfigured' | 'telegramConfigured' | 'lastError' | 'name'>>,
): Instance | undefined {
  const db = load();
  const idx = db.instances.findIndex((i) => i.id === id && i.userId === userId);
  if (idx < 0) return undefined;
  const next = {
    ...db.instances[idx],
    ...patch,
    updatedAt: new Date().toISOString(),
  };
  db.instances[idx] = next;
  save(db);
  return next;
}

export function deleteInstance(userId: string, id: string): boolean {
  const db = load();
  const before = db.instances.length;
  db.instances = db.instances.filter((i) => !(i.id === id && i.userId === userId));
  if (db.instances.length === before) return false;
  save(db);
  return true;
}

/** Stable id for cookie/session hashing (not crypto-secret). */
export function fingerprint(value: string): string {
  return createHash('sha256').update(value).digest('hex').slice(0, 16);
}
