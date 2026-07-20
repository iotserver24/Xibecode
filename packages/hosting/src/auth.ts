import jwt from 'jsonwebtoken';
import type { Request, Response, NextFunction } from 'express';

const COOKIE = 'xibe_hosting_session';

function jwtSecret(): string {
  const s = process.env.XIBECODE_HOSTING_JWT_SECRET?.trim();
  if (s) return s;
  // Dev fallback — set XIBECODE_HOSTING_JWT_SECRET in production.
  return 'dev-only-change-me-xibecode-hosting';
}

export type AuthUser = { id: string; email: string };

export function signSession(user: AuthUser): string {
  return jwt.sign({ sub: user.id, email: user.email }, jwtSecret(), {
    expiresIn: '14d',
  });
}

export function setSessionCookie(res: Response, token: string): void {
  res.cookie(COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 14 * 24 * 60 * 60 * 1000,
    path: '/',
  });
}

export function clearSessionCookie(res: Response): void {
  res.clearCookie(COOKIE, { path: '/' });
}

export function readSession(req: Request): AuthUser | null {
  const token = (req as Request & { cookies?: Record<string, string> }).cookies?.[COOKIE];
  if (!token) return null;
  try {
    const payload = jwt.verify(token, jwtSecret()) as { sub: string; email: string };
    if (!payload.sub || !payload.email) return null;
    return { id: payload.sub, email: payload.email };
  } catch {
    return null;
  }
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const user = readSession(req);
  if (!user) {
    res.status(401).json({ error: 'Login required' });
    return;
  }
  (req as Request & { user: AuthUser }).user = user;
  next();
}

export { COOKIE };
