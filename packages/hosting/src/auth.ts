import jwt from 'jsonwebtoken';
import type { ServerResponse } from 'node:http';

const COOKIE = 'xibe_hosting_session';

function jwtSecret(): string {
  const s = process.env.XIBECODE_HOSTING_JWT_SECRET?.trim();
  if (s) return s;
  return 'dev-only-change-me-xibecode-hosting';
}

export type AuthUser = { id: string; email: string };

export function signSession(user: AuthUser): string {
  return jwt.sign({ sub: user.id, email: user.email }, jwtSecret(), {
    expiresIn: '14d',
  });
}

export function parseCookies(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx < 0) continue;
    const k = part.slice(0, idx).trim();
    const v = part.slice(idx + 1).trim();
    if (k) out[k] = decodeURIComponent(v);
  }
  return out;
}

export function setSessionCookie(res: ServerResponse, token: string): void {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  const maxAge = 14 * 24 * 60 * 60;
  res.setHeader(
    'Set-Cookie',
    `${COOKIE}=${encodeURIComponent(token)}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${maxAge}${secure}`,
  );
}

export function clearSessionCookie(res: ServerResponse): void {
  res.setHeader(
    'Set-Cookie',
    `${COOKIE}=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0`,
  );
}

export function readSession(cookies: Record<string, string>): AuthUser | null {
  const token = cookies[COOKIE];
  if (!token) return null;
  try {
    const payload = jwt.verify(token, jwtSecret()) as { sub: string; email: string };
    if (!payload.sub || !payload.email) return null;
    return { id: payload.sub, email: payload.email };
  } catch {
    return null;
  }
}

export { COOKIE };
