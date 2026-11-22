import crypto from 'crypto';
import type { NextFunction, Request, Response } from 'express';
import {
  FULL_ADMIN_PERMISSIONS,
  getDb,
  OWNER_EMAIL,
  saveDb,
  type StoredOperator,
  type StoredUser,
} from './db.ts';
import type { AdminPermissions, OperatorAccess, PanelActorInfo, PublicUser } from '../src/types.ts';

const COOKIE_NAME = 'tb_session';
const MOD_COOKIE_NAME = 'tb_mod_session';
const ADMIN_COOKIE_NAME = 'tb_admin_session';
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 30; // 30 days
const MOD_SESSION_TTL_MS = 1000 * 60 * 60 * 12; // 12 hours
const ADMIN_SESSION_TTL_MS = 1000 * 60 * 60 * 12; // 12 hours

// Read SESSION_SECRET from environment or generate a strong ephemeral fallback in memory
const SESSION_SECRET = process.env.SESSION_SECRET && process.env.SESSION_SECRET.length >= 16
  ? process.env.SESSION_SECRET
  : crypto.randomBytes(32).toString('hex');

export interface TokenPayload {
  uid: string;
  sv: number;
  exp: number;
}

export interface ModTokenPayload {
  kind: 'mod_passcode';
  msv: number;
  opId?: string;
  osv?: number;
  exp: number;
}

export interface AdminTokenPayload {
  kind: 'admin_passcode';
  asv: number;
  opId?: string;
  osv?: number;
  exp: number;
}

export interface AuthenticatedRequest extends Request {
  authUser?: StoredUser;
  modActor?: PanelActorInfo;
  adminActor?: PanelActorInfo;
  accessActor?: PanelActorInfo;
}

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${derived}`;
}

export function verifyPassword(password: string, storedHash: string | null): boolean {
  if (!storedHash || !storedHash.includes(':')) {
    return false;
  }
  const [salt, keyHex] = storedHash.split(':');
  if (!salt || !keyHex) return false;
  const keyBuf = Buffer.from(keyHex, 'hex');
  const derivedBuf = crypto.scryptSync(password, salt, 64);
  if (keyBuf.length !== derivedBuf.length) return false;
  return crypto.timingSafeEqual(keyBuf, derivedBuf);
}

export function createSessionToken(user: StoredUser): string {
  const payload: TokenPayload = {
    uid: user.id,
    sv: user.sessionVersion,
    exp: Date.now() + SESSION_TTL_MS,
  };
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto
    .createHmac('sha256', SESSION_SECRET)
    .update(encodedPayload)
    .digest('base64url');
  return `${encodedPayload}.${sig}`;
}

export function verifySessionToken(token: string): TokenPayload | null {
  if (!token || !token.includes('.')) return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [encodedPayload, sig] = parts;
  const expectedSig = crypto
    .createHmac('sha256', SESSION_SECRET)
    .update(encodedPayload)
    .digest('base64url');
  const sigBuf = Buffer.from(sig);
  const expectedBuf = Buffer.from(expectedSig);
  if (sigBuf.length !== expectedBuf.length) return null;
  if (!crypto.timingSafeEqual(sigBuf, expectedBuf)) return null;

  try {
    const parsed = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8')) as TokenPayload;
    if (!parsed.uid || typeof parsed.sv !== 'number' || typeof parsed.exp !== 'number') {
      return null;
    }
    if (Date.now() > parsed.exp) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function parseCookie(req: Request, name: string): string | null {
  const cookieHeader = req.headers.cookie;
  if (!cookieHeader) return null;
  const pairs = cookieHeader.split(';');
  for (const pair of pairs) {
    const eqIdx = pair.indexOf('=');
    if (eqIdx === -1) continue;
    const key = pair.slice(0, eqIdx).trim();
    if (key === name) {
      return decodeURIComponent(pair.slice(eqIdx + 1).trim());
    }
  }
  return null;
}

export function setSessionCookie(res: Response, req: Request, token: string): void {
  const isHttps = req.secure || req.headers['x-forwarded-proto'] === 'https';
  const parts = [
    `${COOKIE_NAME}=${encodeURIComponent(token)}`,
    'Path=/',
    'HttpOnly',
    `Max-Age=${Math.floor(SESSION_TTL_MS / 1000)}`,
  ];
  if (isHttps) {
    parts.push('Secure', 'SameSite=None', 'Partitioned');
  } else {
    parts.push('SameSite=Lax');
  }
  res.append('Set-Cookie', parts.join('; '));
}

export function clearSessionCookie(res: Response, req: Request): void {
  const isHttps = req.secure || req.headers['x-forwarded-proto'] === 'https';
  const parts = [
    `${COOKIE_NAME}=`,
    'Path=/',
    'HttpOnly',
    'Max-Age=0',
  ];
  if (isHttps) {
    parts.push('Secure', 'SameSite=None', 'Partitioned');
  } else {
    parts.push('SameSite=Lax');
  }
  res.append('Set-Cookie', parts.join('; '));
}

export function createModSessionToken(
  modSessionVersion: number,
  operator?: { id: string; sessionVersion: number }
): string {
  const payload: ModTokenPayload = {
    kind: 'mod_passcode',
    msv: modSessionVersion,
    ...(operator ? { opId: operator.id, osv: operator.sessionVersion } : {}),
    exp: Date.now() + MOD_SESSION_TTL_MS,
  };
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto
    .createHmac('sha256', SESSION_SECRET)
    .update(encodedPayload)
    .digest('base64url');
  return `${encodedPayload}.${sig}`;
}

export function verifyModSessionToken(token: string): ModTokenPayload | null {
  if (!token || !token.includes('.')) return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [encodedPayload, sig] = parts;
  const expectedSig = crypto
    .createHmac('sha256', SESSION_SECRET)
    .update(encodedPayload)
    .digest('base64url');
  const sigBuf = Buffer.from(sig);
  const expectedBuf = Buffer.from(expectedSig);
  if (sigBuf.length !== expectedBuf.length) return null;
  if (!crypto.timingSafeEqual(sigBuf, expectedBuf)) return null;

  try {
    const parsed = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8')) as ModTokenPayload;
    if (parsed.kind !== 'mod_passcode' || typeof parsed.msv !== 'number' || typeof parsed.exp !== 'number') {
      return null;
    }
    if (Date.now() > parsed.exp) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function setModSessionCookie(res: Response, req: Request, token: string): void {
  const isHttps = req.secure || req.headers['x-forwarded-proto'] === 'https';
  const parts = [
    `${MOD_COOKIE_NAME}=${encodeURIComponent(token)}`,
    'Path=/',
    'HttpOnly',
    `Max-Age=${Math.floor(MOD_SESSION_TTL_MS / 1000)}`,
  ];
  if (isHttps) {
    parts.push('Secure', 'SameSite=None', 'Partitioned');
  } else {
    parts.push('SameSite=Lax');
  }
  res.append('Set-Cookie', parts.join('; '));
}

export function clearModSessionCookie(res: Response, req: Request): void {
  const isHttps = req.secure || req.headers['x-forwarded-proto'] === 'https';
  const parts = [
    `${MOD_COOKIE_NAME}=`,
    'Path=/',
    'HttpOnly',
    'Max-Age=0',
  ];
  if (isHttps) {
    parts.push('Secure', 'SameSite=None', 'Partitioned');
  } else {
    parts.push('SameSite=Lax');
  }
  res.append('Set-Cookie', parts.join('; '));
}

export function isModPasscodeEnvOverride(): boolean {
  return false;
}

export function verifyModeratorPasscode(input: string): boolean {
  if (typeof input !== 'string' || input.length === 0) return false;
  const db = getDb();
  return verifyPassword(input, db.moderatorPasscodeHash);
}

export function createAdminSessionToken(
  adminSessionVersion: number,
  operator?: { id: string; sessionVersion: number }
): string {
  const payload: AdminTokenPayload = {
    kind: 'admin_passcode',
    asv: adminSessionVersion,
    ...(operator ? { opId: operator.id, osv: operator.sessionVersion } : {}),
    exp: Date.now() + ADMIN_SESSION_TTL_MS,
  };
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto
    .createHmac('sha256', SESSION_SECRET)
    .update(encodedPayload)
    .digest('base64url');
  return `${encodedPayload}.${sig}`;
}

export function verifyAdminSessionToken(token: string): AdminTokenPayload | null {
  if (!token || !token.includes('.')) return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [encodedPayload, sig] = parts;
  const expectedSig = crypto
    .createHmac('sha256', SESSION_SECRET)
    .update(encodedPayload)
    .digest('base64url');
  const sigBuf = Buffer.from(sig);
  const expectedBuf = Buffer.from(expectedSig);
  if (sigBuf.length !== expectedBuf.length) return null;
  if (!crypto.timingSafeEqual(sigBuf, expectedBuf)) return null;

  try {
    const parsed = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8')) as AdminTokenPayload;
    if (parsed.kind !== 'admin_passcode' || typeof parsed.asv !== 'number' || typeof parsed.exp !== 'number') {
      return null;
    }
    if (Date.now() > parsed.exp) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function setAdminSessionCookie(res: Response, req: Request, token: string): void {
  const isHttps = req.secure || req.headers['x-forwarded-proto'] === 'https';
  const parts = [
    `${ADMIN_COOKIE_NAME}=${encodeURIComponent(token)}`,
    'Path=/',
    'HttpOnly',
    `Max-Age=${Math.floor(ADMIN_SESSION_TTL_MS / 1000)}`,
  ];
  if (isHttps) {
    parts.push('Secure', 'SameSite=None', 'Partitioned');
  } else {
    parts.push('SameSite=Lax');
  }
  res.append('Set-Cookie', parts.join('; '));
}

export function clearAdminSessionCookie(res: Response, req: Request): void {
  const isHttps = req.secure || req.headers['x-forwarded-proto'] === 'https';
  const parts = [
    `${ADMIN_COOKIE_NAME}=`,
    'Path=/',
    'HttpOnly',
    'Max-Age=0',
  ];
  if (isHttps) {
    parts.push('Secure', 'SameSite=None', 'Partitioned');
  } else {
    parts.push('SameSite=Lax');
  }
  res.append('Set-Cookie', parts.join('; '));
}

export function isAdminPasscodeEnvOverride(): boolean {
  return false;
}

export function verifyAdminPasscode(input: string): boolean {
  if (typeof input !== 'string' || input.length === 0) return false;
  const db = getDb();
  return verifyPassword(input, db.adminPasscodeHash);
}

export function matchAdminUnlockPasscode(
  input: string
): { matched: false } | { matched: true; master: true; operator: null } | { matched: true; master: false; operator: StoredOperator } {
  if (typeof input !== 'string' || input.length === 0) return { matched: false };
  if (verifyAdminPasscode(input)) {
    return { matched: true, master: true, operator: null };
  }
  const db = getDb();
  for (const op of db.operators) {
    if (!op.active || !op.passcodeHash) continue;
    if (op.email && db.blacklistedEmails.includes(op.email.toLowerCase())) continue;
    if (verifyPassword(input, op.passcodeHash)) {
      return { matched: true, master: false, operator: op };
    }
  }
  return { matched: false };
}

export function matchModeratorUnlockPasscode(
  input: string
): { matched: false } | { matched: true; master: true; operator: null } | { matched: true; master: false; operator: StoredOperator } {
  if (typeof input !== 'string' || input.length === 0) return { matched: false };
  if (verifyModeratorPasscode(input)) {
    return { matched: true, master: true, operator: null };
  }
  const db = getDb();
  for (const op of db.operators) {
    if (!op.active || !op.passcodeHash) continue;
    if (op.email && db.blacklistedEmails.includes(op.email.toLowerCase())) continue;
    if (verifyPassword(input, op.passcodeHash)) {
      return { matched: true, master: false, operator: op };
    }
  }
  return { matched: false };
}

export function toPublicOperator(op: StoredOperator): OperatorAccess {
  return {
    id: op.id,
    isReshid: op.isReshid,
    displayName: op.displayName,
    email: op.email,
    hasPasscode: Boolean(op.passcodeHash),
    allowAdminPanel: op.allowAdminPanel,
    allowModeratorPanel: op.allowModeratorPanel,
    permissions: op.permissions,
    active: op.active,
    assignedBy: op.assignedBy,
    createdAt: op.createdAt,
    updatedAt: op.updatedAt,
  };
}

export function toPublicUser(user: StoredUser, listingsCount?: number): PublicUser {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    avatarColor: user.avatarColor,
    role: user.role,
    permissions: user.permissions,
    verifiedSeller: user.verifiedSeller,
    canPostListings: user.canPostListings,
    isShadowbanned: user.isShadowbanned,
    warningsCount: user.warningsCount,
    lastWarning: user.lastWarning,
    status: user.status,
    kickReason: user.kickReason,
    kickedUntil: user.kickedUntil,
    banReason: user.banReason,
    bannedUntil: user.bannedUntil,
    createdAt: user.createdAt,
    lastActiveAt: user.lastActiveAt,
    listingsCount,
  };
}

export function normalizeGmail(email: string): string | null {
  if (typeof email !== 'string') return null;
  const trimmed = email.trim().toLowerCase();
  const gmailRegex = /^[a-z0-9._%+-]{2,64}@gmail\.com$/;
  if (!gmailRegex.test(trimmed)) return null;
  return trimmed;
}

export function isOwnerEmail(email: string): boolean {
  return email.trim().toLowerCase() === OWNER_EMAIL;
}

/**
 * Checks if a kicked, banned, or blacklisted user is blocked.
 */
export function evaluateUserModerationState(user: StoredUser): {
  blocked: boolean;
  code?: 'USER_BANNED' | 'USER_KICKED';
  reason?: string;
  until?: string | null;
} {
  const db = getDb();
  const nowMs = Date.now();

  if (db.blacklistedEmails.includes(user.email.toLowerCase()) && !isOwnerEmail(user.email)) {
    return {
      blocked: true,
      code: 'USER_BANNED',
      reason: 'Bu Gmail ünvanı moderator tərəfindən Qara Siyahıya (Blacklist) salınıb.',
      until: null,
    };
  }

  if (user.status === 'banned') {
    if (user.bannedUntil) {
      const untilMs = new Date(user.bannedUntil).getTime();
      if (!Number.isNaN(untilMs) && nowMs >= untilMs) {
        user.status = 'active';
        user.banReason = undefined;
        user.bannedUntil = null;
        saveDb(db);
        return { blocked: false };
      }
    }
    return {
      blocked: true,
      code: 'USER_BANNED',
      reason: user.banReason || 'Hesabınız qaydaları pozduğuna görə bloklanıb.',
      until: user.bannedUntil ?? null,
    };
  }

  if (user.status === 'kicked') {
    if (user.kickedUntil) {
      const untilMs = new Date(user.kickedUntil).getTime();
      if (!Number.isNaN(untilMs) && nowMs >= untilMs) {
        user.status = 'active';
        user.kickReason = undefined;
        user.kickedUntil = null;
        saveDb(db);
        return { blocked: false };
      }
    }
    return {
      blocked: true,
      code: 'USER_KICKED',
      reason: user.kickReason || 'Sessiyanız admin/moderator tərəfindən dayandırılıb.',
      until: user.kickedUntil ?? null,
    };
  }

  return { blocked: false };
}

export function resolveAuthUser(req: Request): {
  user: StoredUser | null;
  moderationError?: { code: 'USER_BANNED' | 'USER_KICKED'; reason: string; until: string | null };
} {
  const authHeader = req.headers.authorization;
  let token: string | null = null;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.slice(7).trim();
  } else {
    token = parseCookie(req, COOKIE_NAME);
  }

  if (!token) return { user: null };
  const payload = verifySessionToken(token);
  if (!payload) return { user: null };

  const db = getDb();
  const user = db.users.find((u) => u.id === payload.uid);
  if (!user) return { user: null };

  // Session version check guarantees instant kick / ban / global-purge enforcement
  if (user.sessionVersion !== payload.sv) {
    if (user.status === 'banned') {
      return {
        user: null,
        moderationError: {
          code: 'USER_BANNED',
          reason: user.banReason || 'Hesabınız bloklanıb.',
          until: user.bannedUntil ?? null,
        },
      };
    }
    if (user.status === 'kicked') {
      return {
        user: null,
        moderationError: {
          code: 'USER_KICKED',
          reason: user.kickReason || 'Sessiyanız dayandırılıb (Kick).',
          until: user.kickedUntil ?? null,
        },
      };
    }
    return { user: null };
  }

  const modCheck = evaluateUserModerationState(user);
  if (modCheck.blocked && modCheck.code) {
    return {
      user: null,
      moderationError: {
        code: modCheck.code,
        reason: modCheck.reason || '',
        until: modCheck.until ?? null,
      },
    };
  }

  return { user };
}

export function buildActorFromOperator(
  op: StoredOperator,
  authMethod: 'operator_passcode' | 'gmail'
): PanelActorInfo {
  return {
    id: op.id,
    name: op.displayName,
    email: op.email || `${op.displayName} (Şəxsi Parol)`,
    role: op.allowAdminPanel && op.allowModeratorPanel ? 'admin' : op.allowAdminPanel ? 'admin' : 'moderator',
    isReshid: op.isReshid,
    isMasterPasscode: false,
    isOwner: false,
    canManageAccess: false,
    allowAdminPanel: op.allowAdminPanel,
    allowModeratorPanel: op.allowModeratorPanel,
    permissions: { ...op.permissions },
    authMethod,
  };
}

function buildActorFromGmailUser(user: StoredUser, panel: 'admin' | 'moderator'): PanelActorInfo | null {
  const db = getDb();
  const isOwner = isOwnerEmail(user.email) || user.role === 'super_admin';
  if (isOwner) {
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      role: 'super_admin',
      isReshid: false,
      isMasterPasscode: false,
      isOwner: isOwnerEmail(user.email),
      canManageAccess: true,
      allowAdminPanel: true,
      allowModeratorPanel: true,
      permissions: { ...FULL_ADMIN_PERMISSIONS },
      authMethod: 'gmail',
    };
  }

  // Check operator assignment by Gmail
  const op = db.operators.find(
    (o) => o.email && o.email.toLowerCase() === user.email.toLowerCase()
  );
  if (op) {
    if (!op.active) {
      // If user has explicit user.role admin/mod outside operator table, check below? No: operator entry explicitly governs their panel access when present.
      return null;
    }
    if (panel === 'admin' && !op.allowAdminPanel) return null;
    if (panel === 'moderator' && !op.allowModeratorPanel) return null;
    return {
      id: user.id,
      name: op.isReshid ? op.displayName : user.name || op.displayName,
      email: user.email,
      role: op.allowAdminPanel ? 'admin' : 'moderator',
      isReshid: op.isReshid,
      isMasterPasscode: false,
      isOwner: false,
      canManageAccess: false,
      allowAdminPanel: op.allowAdminPanel,
      allowModeratorPanel: op.allowModeratorPanel,
      permissions: { ...op.permissions },
      authMethod: 'gmail',
    };
  }

  // Fallback to legacy Admin Hüquqları roles on StoredUser
  if (user.role === 'admin' || user.role === 'moderator') {
    const canMod = Boolean(user.permissions?.canUseDangerousMod);
    if (panel === 'moderator' && !canMod) {
      return null;
    }
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      isReshid: false,
      isMasterPasscode: false,
      isOwner: false,
      canManageAccess: false,
      allowAdminPanel: true,
      allowModeratorPanel: canMod,
      permissions: { ...user.permissions },
      authMethod: 'gmail',
    };
  }

  return null;
}

export function resolveAdminPanelActor(req: Request): {
  actor: PanelActorInfo | null;
  moderationError?: { code: 'USER_BANNED' | 'USER_KICKED'; reason: string; until: string | null };
} {
  const db = getDb();
  const headerToken = req.headers['x-admin-token'];
  let token: string | null = null;
  if (typeof headerToken === 'string' && headerToken.trim().length > 0) {
    token = headerToken.trim();
  } else {
    token = parseCookie(req, ADMIN_COOKIE_NAME);
  }

  if (token) {
    const payload = verifyAdminSessionToken(token);
    if (payload && payload.asv === db.adminSessionVersion) {
      if (!payload.opId) {
        return {
          actor: {
            id: 'admin_passcode',
            name: 'Baş Admin',
            email: 'Admin (Parol Sessiyası)',
            role: 'super_admin',
            isReshid: false,
            isMasterPasscode: true,
            isOwner: false,
            canManageAccess: true,
            allowAdminPanel: true,
            allowModeratorPanel: true,
            permissions: { ...FULL_ADMIN_PERMISSIONS },
            authMethod: 'master_passcode',
          },
        };
      }
      const op = db.operators.find((o) => o.id === payload.opId);
      if (
        op &&
        op.active &&
        op.allowAdminPanel &&
        op.sessionVersion === payload.osv &&
        (!op.email || !db.blacklistedEmails.includes(op.email.toLowerCase()))
      ) {
        return { actor: buildActorFromOperator(op, 'operator_passcode') };
      }
    }
  }

  const resolved = resolveAuthUser(req);
  if (resolved.moderationError) {
    return { actor: null, moderationError: resolved.moderationError };
  }
  if (resolved.user) {
    const gmailActor = buildActorFromGmailUser(resolved.user, 'admin');
    if (gmailActor) {
      return { actor: gmailActor };
    }
  }
  return { actor: null };
}

export function resolveModeratorPanelActor(req: Request): {
  actor: PanelActorInfo | null;
  moderationError?: { code: 'USER_BANNED' | 'USER_KICKED'; reason: string; until: string | null };
} {
  const db = getDb();
  const headerToken = req.headers['x-mod-token'];
  let token: string | null = null;
  if (typeof headerToken === 'string' && headerToken.trim().length > 0) {
    token = headerToken.trim();
  } else {
    token = parseCookie(req, MOD_COOKIE_NAME);
  }

  if (token) {
    const payload = verifyModSessionToken(token);
    if (payload && payload.msv === db.moderatorSessionVersion) {
      if (!payload.opId) {
        return {
          actor: {
            id: 'moderator_passcode',
            name: 'Baş Moderator',
            email: 'Moderator (Parol Sessiyası)',
            role: 'super_admin',
            isReshid: false,
            isMasterPasscode: true,
            isOwner: false,
            canManageAccess: true,
            allowAdminPanel: true,
            allowModeratorPanel: true,
            permissions: { ...FULL_ADMIN_PERMISSIONS },
            authMethod: 'master_passcode',
          },
        };
      }
      const op = db.operators.find((o) => o.id === payload.opId);
      if (
        op &&
        op.active &&
        op.allowModeratorPanel &&
        op.sessionVersion === payload.osv &&
        (!op.email || !db.blacklistedEmails.includes(op.email.toLowerCase()))
      ) {
        return { actor: buildActorFromOperator(op, 'operator_passcode') };
      }
    }
  }

  const resolved = resolveAuthUser(req);
  if (resolved.moderationError) {
    return { actor: null, moderationError: resolved.moderationError };
  }
  if (resolved.user) {
    const gmailActor = buildActorFromGmailUser(resolved.user, 'moderator');
    if (gmailActor) {
      return { actor: gmailActor };
    }
  }
  return { actor: null };
}

export function resolveAdminPasscodeSession(req: Request): boolean {
  return Boolean(resolveAdminPanelActor(req).actor);
}

export function resolveModeratorPasscodeSession(req: Request): boolean {
  return Boolean(resolveModeratorPanelActor(req).actor);
}

export function requireCsrfHeader(req: Request, res: Response, next: NextFunction): void {
  const method = req.method.toUpperCase();
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
    const requestedWith = req.headers['x-requested-with'];
    if (requestedWith !== 'XMLHttpRequest') {
      res.status(403).json({ error: 'Təhlükəsizlik başlığı çatışmır (CSRF qoruması).' });
      return;
    }
  }
  next();
}

export function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  const resolved = resolveAuthUser(req);
  if (resolved.moderationError) {
    clearSessionCookie(res, req);
    res.status(403).json({
      error: resolved.moderationError.reason,
      code: resolved.moderationError.code,
      until: resolved.moderationError.until,
    });
    return;
  }
  if (!resolved.user) {
    res.status(401).json({ error: 'Davam etmək üçün Gmail hesabınızla daxil olun.' });
    return;
  }
  req.authUser = resolved.user;
  next();
}

export function hasAdminPanelAccess(user: StoredUser): boolean {
  return Boolean(buildActorFromGmailUser(user, 'admin'));
}

export function requireAdminAccess(permission?: keyof AdminPermissions) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    const resolved = resolveAdminPanelActor(req);
    if (resolved.moderationError) {
      clearSessionCookie(res, req);
      res.status(403).json({
        error: resolved.moderationError.reason,
        code: resolved.moderationError.code,
        until: resolved.moderationError.until,
      });
      return;
    }
    if (!resolved.actor) {
      res.status(401).json({
        error: 'Admin Panelə daxil olmaq üçün parolu daxil edin və ya icazəli Gmail hesabınızdan istifadə edin.',
        code: 'ADMIN_LOCKED',
      });
      return;
    }
    if (
      !resolved.actor.isMasterPasscode &&
      !resolved.actor.isOwner &&
      resolved.actor.role !== 'super_admin' &&
      permission &&
      !resolved.actor.permissions[permission]
    ) {
      res.status(403).json({ error: 'Bu əməliyyatı icra etmək üçün səlahiyyətiniz yoxdur.' });
      return;
    }
    req.adminActor = resolved.actor;
    next();
  };
}

export function requireSuperAdmin(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  const resolved = resolveAdminPanelActor(req);
  if (resolved.moderationError) {
    clearSessionCookie(res, req);
    res.status(403).json({ error: resolved.moderationError.reason });
    return;
  }
  if (!resolved.actor) {
    res.status(401).json({ error: 'Baş Admin parol sessiyası və ya girişi tələb olunur.', code: 'ADMIN_LOCKED' });
    return;
  }
  if (!resolved.actor.canManageAccess && !resolved.actor.isMasterPasscode && !resolved.actor.isOwner) {
    res.status(403).json({
      error: `Yalnız Baş Admin (${OWNER_EMAIL}) və ya əsas Parol Sessiyası bu səlahiyyəti icra edə bilər.`,
    });
    return;
  }
  req.adminActor = resolved.actor;
  next();
}

export function requireModeratorAccess(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  const resolved = resolveModeratorPanelActor(req);
  if (resolved.moderationError) {
    clearSessionCookie(res, req);
    res.status(403).json({
      error: resolved.moderationError.reason,
      code: resolved.moderationError.code,
      until: resolved.moderationError.until,
    });
    return;
  }
  if (!resolved.actor) {
    res.status(401).json({
      error: 'Moderator Panelə daxil olmaq üçün moderator parolunu daxil edin və ya icazəli Gmail ilə giriş edin.',
      code: 'MODERATOR_LOCKED',
    });
    return;
  }
  req.modActor = resolved.actor;
  next();
}

export function requireAccessManager(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  const adminRes = resolveAdminPanelActor(req);
  if (adminRes.actor && (adminRes.actor.canManageAccess || adminRes.actor.isMasterPasscode || adminRes.actor.isOwner)) {
    req.accessActor = adminRes.actor;
    next();
    return;
  }
  const modRes = resolveModeratorPanelActor(req);
  if (modRes.actor && (modRes.actor.canManageAccess || modRes.actor.isMasterPasscode || modRes.actor.isOwner)) {
    req.accessActor = modRes.actor;
    next();
    return;
  }
  res.status(403).json({
    error: 'Rəşid və icazəli şəxsləri yalnız Baş Admin və ya əsas parol sessiyası idarə edə bilər.',
  });
}
