import 'dotenv/config';
import crypto from 'crypto';
import express, { type Request, type Response } from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  buildActorFromOperator,
  clearAdminSessionCookie,
  clearModSessionCookie,
  clearSessionCookie,
  createAdminSessionToken,
  createModSessionToken,
  createSessionToken,
  evaluateUserModerationState,
  hasAdminPanelAccess,
  hashPassword,
  isAdminPasscodeEnvOverride,
  isModPasscodeEnvOverride,
  isOwnerEmail,
  matchAdminUnlockPasscode,
  matchModeratorUnlockPasscode,
  normalizeGmail,
  requireAccessManager,
  requireAdminAccess,
  requireAuth,
  requireCsrfHeader,
  requireModeratorAccess,
  requireSuperAdmin,
  resolveAdminPanelActor,
  resolveAuthUser,
  resolveModeratorPanelActor,
  setAdminSessionCookie,
  setModSessionCookie,
  setSessionCookie,
  toPublicOperator,
  toPublicUser,
  verifyAdminPasscode,
  verifyModeratorPasscode,
  verifyPassword,
  type AuthenticatedRequest,
} from './server/auth.ts';
import {
  createDefaultReshidOperator,
  FULL_ADMIN_PERMISSIONS,
  getDb,
  getDbSizeBytes,
  MODERATOR_PERMISSIONS,
  NO_ADMIN_PERMISSIONS,
  OWNER_EMAIL,
  recordAuditLog,
  saveDb,
  type StoredOperator,
  type StoredUser,
} from './server/db.ts';
import type {
  AdminOverviewStats,
  AdminPermissions,
  PhoneCondition,
  PhoneListing,
  RiskFlaggedListing,
  UserRole,
} from './src/types.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = 3000;
const VALID_CONDITIONS: PhoneCondition[] = ['Yeni (Qutuda)', 'İdeal', 'Yaxşı', 'Orta'];
const AVATAR_COLORS = ['#2563EB', '#0D9488', '#4F46E5', '#D97706', '#DC2626', '#059669', '#0284C7'];

function isSafeImageUrl(url: unknown): url is string {
  if (typeof url !== 'string') return false;
  const trimmed = url.trim();
  if (trimmed.length === 0 || trimmed.length > 2_000_000) return false;
  if (trimmed.startsWith('/src/assets/')) return true;
  if (trimmed.startsWith('data:image/jpeg;base64,') || trimmed.startsWith('data:image/png;base64,') || trimmed.startsWith('data:image/webp;base64,')) {
    return true;
  }
  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:';
  } catch {
    return false;
  }
}

function sanitizePermissions(input: unknown, fallback: AdminPermissions): AdminPermissions {
  if (!input || typeof input !== 'object') return { ...fallback };
  const raw = input as Record<string, unknown>;
  return {
    canApproveListings: typeof raw.canApproveListings === 'boolean' ? raw.canApproveListings : fallback.canApproveListings,
    canEditDeleteListings: typeof raw.canEditDeleteListings === 'boolean' ? raw.canEditDeleteListings : fallback.canEditDeleteListings,
    canKickBanUsers: typeof raw.canKickBanUsers === 'boolean' ? raw.canKickBanUsers : fallback.canKickBanUsers,
    canManageReports: typeof raw.canManageReports === 'boolean' ? raw.canManageReports : fallback.canManageReports,
    canManageSettings: typeof raw.canManageSettings === 'boolean' ? raw.canManageSettings : fallback.canManageSettings,
    canManageCatalog: typeof raw.canManageCatalog === 'boolean' ? raw.canManageCatalog : fallback.canManageCatalog,
    canSendBroadcasts: typeof raw.canSendBroadcasts === 'boolean' ? raw.canSendBroadcasts : fallback.canSendBroadcasts,
    canUseDangerousMod: typeof raw.canUseDangerousMod === 'boolean' ? raw.canUseDangerousMod : fallback.canUseDangerousMod,
  };
}

async function startServer() {
  const app = express();
  app.set('trust proxy', 1);
  app.use(express.json({ limit: '4mb' }));

  // Ensure DB is initialized at boot
  getDb();

  // Enforce CSRF custom header on mutating API calls
  app.use('/api', requireCsrfHeader);

  // =========================================================================
  // AUTH ROUTES
  // =========================================================================

  app.get('/api/auth/bootstrap-status', (_req: Request, res: Response) => {
    const db = getDb();
    const hasSuperAdmin = db.users.some((u) => u.role === 'super_admin');
    res.json({
      ownerClaimRequired: !hasSuperAdmin,
      ownerEmail: OWNER_EMAIL,
      allowNewRegistrations: db.settings.allowNewRegistrations,
    });
  });

  app.post('/api/auth/register', (req: Request, res: Response) => {
    const { email: rawEmail, password, name } = req.body as {
      email?: string;
      password?: string;
      name?: string;
    };

    const email = normalizeGmail(rawEmail ?? '');
    if (!email) {
      res.status(400).json({ error: 'Yalnız etibarlı @gmail.com ünvanı ilə qeydiyyat mümkündür.' });
      return;
    }

    if (typeof password !== 'string' || password.length < 6 || password.length > 128) {
      res.status(400).json({ error: 'Şifrə ən azı 6 simvoldan ibarət olmalıdır.' });
      return;
    }

    const displayName = typeof name === 'string' && name.trim().length >= 2
      ? name.trim().slice(0, 60)
      : email.split('@')[0];

    const db = getDb();
    const isOwner = isOwnerEmail(email);

    if (!isOwner && db.blacklistedEmails.includes(email)) {
      res.status(403).json({ error: 'Bu Gmail ünvanı moderator tərəfindən Qara Siyahıya (Blacklist) salındığı üçün qeydiyyat qadağandır.' });
      return;
    }

    if (!db.settings.allowNewRegistrations && !isOwner) {
      res.status(403).json({ error: 'Hazırda yeni qeydiyyatlar admin tərəfindən müvəqqəti dayandırılıb.' });
      return;
    }

    const existing = db.users.find((u) => u.email === email);
    if (existing) {
      // Allow claiming a seeded showcase seller profile that has passwordHash === null
      if (existing.passwordHash === null) {
        existing.passwordHash = hashPassword(password);
        existing.name = displayName;
        existing.lastActiveAt = new Date().toISOString();
        if (isOwner && !db.users.some((u) => u.role === 'super_admin')) {
          existing.role = 'super_admin';
          existing.permissions = { ...FULL_ADMIN_PERMISSIONS };
          existing.verifiedSeller = true;
        }
        saveDb(db);
        const token = createSessionToken(existing);
        setSessionCookie(res, req, token);
        res.status(200).json({ user: toPublicUser(existing), token });
        return;
      }
      res.status(409).json({ error: 'Bu Gmail ünvanı ilə artıq hesab mövcuddur. Giriş edin.' });
      return;
    }

    // Determine role: Owner email gets super_admin if unclaimed; otherwise check preassignedRoles
    const hasSuperAdmin = db.users.some((u) => u.role === 'super_admin');
    let assignedRole: UserRole = 'user';
    let assignedPermissions: AdminPermissions = { ...NO_ADMIN_PERMISSIONS };
    let verifiedSeller = false;

    if (isOwner && !hasSuperAdmin) {
      assignedRole = 'super_admin';
      assignedPermissions = { ...FULL_ADMIN_PERMISSIONS };
      verifiedSeller = true;
    } else {
      const preIdx = db.preassignedRoles.findIndex((p) => p.email === email);
      if (preIdx !== -1) {
        const pre = db.preassignedRoles[preIdx];
        assignedRole = pre.role;
        assignedPermissions = { ...pre.permissions };
        verifiedSeller = true;
        db.preassignedRoles.splice(preIdx, 1);
      } else {
        const matchedOp = db.operators.find(
          (op) => op.active && op.email && op.email.toLowerCase() === email
        );
        if (matchedOp && (matchedOp.allowAdminPanel || matchedOp.allowModeratorPanel)) {
          assignedRole = matchedOp.allowAdminPanel ? 'admin' : 'moderator';
          assignedPermissions = { ...matchedOp.permissions };
          verifiedSeller = true;
        }
      }
    }

    const nowIso = new Date().toISOString();
    const newUser: StoredUser = {
      id: `usr_${crypto.randomBytes(6).toString('hex')}`,
      email,
      name: displayName,
      avatarColor: AVATAR_COLORS[db.users.length % AVATAR_COLORS.length],
      passwordHash: hashPassword(password),
      role: assignedRole,
      permissions: assignedPermissions,
      verifiedSeller,
      canPostListings: true,
      isShadowbanned: false,
      warningsCount: 0,
      status: 'active',
      sessionVersion: 1,
      createdAt: nowIso,
      lastActiveAt: nowIso,
    };

    db.users.unshift(newUser);
    recordAuditLog(db, {
      actorId: newUser.id,
      actorEmail: newUser.email,
      action: assignedRole === 'super_admin' ? 'OWNER_CLAIMED_SUPER_ADMIN' : 'USER_REGISTERED',
      targetType: 'user',
      targetId: newUser.id,
      targetLabel: `${newUser.name} (${newUser.email})`,
    });
    saveDb(db);

    const token = createSessionToken(newUser);
    setSessionCookie(res, req, token);
    res.status(201).json({ user: toPublicUser(newUser), token });
  });

  app.post('/api/auth/login', (req: Request, res: Response) => {
    const { email: rawEmail, password } = req.body as {
      email?: string;
      password?: string;
    };

    const email = normalizeGmail(rawEmail ?? '');
    if (!email || typeof password !== 'string') {
      res.status(400).json({ error: 'Gmail ünvanı və şifrə tələb olunur.' });
      return;
    }

    const db = getDb();
    const user = db.users.find((u) => u.email === email);
    if (!user || !user.passwordHash || !verifyPassword(password, user.passwordHash)) {
      res.status(401).json({ error: 'Gmail ünvanı və ya şifrə yanlışdır.' });
      return;
    }

    const modCheck = evaluateUserModerationState(user);
    if (modCheck.blocked) {
      res.status(403).json({
        error: modCheck.reason,
        code: modCheck.code,
        until: modCheck.until ?? null,
      });
      return;
    }

    user.lastActiveAt = new Date().toISOString();
    saveDb(db);

    const token = createSessionToken(user);
    setSessionCookie(res, req, token);
    res.json({ user: toPublicUser(user), token });
  });

  app.get('/api/auth/me', (req: Request, res: Response) => {
    const db = getDb();
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
      res.json({
        user: null,
        favorites: [],
        settingsPublic: {
          maintenanceMode: db.settings.maintenanceMode,
          announcementBanner: db.settings.announcementBanner,
          allowNewRegistrations: db.settings.allowNewRegistrations,
        },
      });
      return;
    }

    res.json({
      user: toPublicUser(resolved.user),
      favorites: db.favorites[resolved.user.id] ?? [],
      settingsPublic: {
        maintenanceMode: db.settings.maintenanceMode,
        announcementBanner: db.settings.announcementBanner,
        allowNewRegistrations: db.settings.allowNewRegistrations,
      },
    });
  });

  app.post('/api/auth/logout', (req: Request, res: Response) => {
    clearSessionCookie(res, req);
    res.json({ ok: true });
  });

  // =========================================================================
  // CATALOG & NOTIFICATIONS
  // =========================================================================

  app.get('/api/catalog', (_req: Request, res: Response) => {
    const db = getDb();
    res.json({ catalog: db.catalog });
  });

  app.get('/api/notifications', requireAuth, (req: AuthenticatedRequest, res: Response) => {
    const user = req.authUser!;
    const db = getDb();
    const list = db.notifications
      .filter((n) => n.targetUserId === 'all' || n.targetUserId === user.id)
      .slice(0, 40)
      .map((n) => ({
        ...n,
        isRead: n.readBy.includes(user.id),
      }));
    res.json({ notifications: list });
  });

  app.post('/api/notifications/read', requireAuth, (req: AuthenticatedRequest, res: Response) => {
    const user = req.authUser!;
    const db = getDb();
    for (const n of db.notifications) {
      if ((n.targetUserId === 'all' || n.targetUserId === user.id) && !n.readBy.includes(user.id)) {
        n.readBy.push(user.id);
      }
    }
    saveDb(db);
    res.json({ ok: true });
  });

  // =========================================================================
  // MARKETPLACE & USER LISTING ROUTES
  // =========================================================================

  app.get('/api/listings', (req: Request, res: Response) => {
    const db = getDb();
    const resolved = resolveAuthUser(req);
    const currentUser = resolved.user;

    const scope = typeof req.query.scope === 'string' ? req.query.scope : 'public';
    const search = typeof req.query.search === 'string' ? req.query.search.trim().toLowerCase() : '';
    const brand = typeof req.query.brand === 'string' ? req.query.brand.trim() : '';
    const city = typeof req.query.city === 'string' ? req.query.city.trim() : '';
    const condition = typeof req.query.condition === 'string' ? req.query.condition.trim() : '';
    const barterOnly = req.query.barter === 'true';
    const creditOnly = req.query.credit === 'true';
    const sort = typeof req.query.sort === 'string' ? req.query.sort : 'featured';
    const minPrice = req.query.minPrice ? Number(req.query.minPrice) : null;
    const maxPrice = req.query.maxPrice ? Number(req.query.maxPrice) : null;

    const shadowbannedIds = new Set(db.users.filter((u) => u.isShadowbanned).map((u) => u.id));

    let items: PhoneListing[] = [];
    if (scope === 'mine') {
      if (!currentUser) {
        res.status(401).json({ error: 'Şəxsi elanları görmək üçün daxil olun.' });
        return;
      }
      items = db.listings.filter((l) => l.sellerId === currentUser.id);
    } else if (scope === 'favorites') {
      if (!currentUser) {
        res.status(401).json({ error: 'Seçilmiş elanları görmək üçün daxil olun.' });
        return;
      }
      const favIds = new Set(db.favorites[currentUser.id] ?? []);
      items = db.listings.filter(
        (l) =>
          favIds.has(l.id) &&
          ((l.status === 'active' && !shadowbannedIds.has(l.sellerId)) || l.sellerId === currentUser.id)
      );
    } else {
      items = db.listings.filter((l) => l.status === 'active' && !shadowbannedIds.has(l.sellerId));
    }

    if (search) {
      items = items.filter((l) =>
        `${l.title} ${l.brand} ${l.model} ${l.storage} ${l.city} ${l.description}`.toLowerCase().includes(search)
      );
    }
    if (brand && brand !== 'Hamısı') {
      items = items.filter((l) => l.brand.toLowerCase() === brand.toLowerCase());
    }
    if (city && city !== 'Hamısı') {
      items = items.filter((l) => l.city.toLowerCase() === city.toLowerCase());
    }
    if (condition && condition !== 'Hamısı') {
      items = items.filter((l) => l.condition === condition);
    }
    if (barterOnly) {
      items = items.filter((l) => l.barter);
    }
    if (creditOnly) {
      items = items.filter((l) => l.credit);
    }
    if (minPrice !== null && !Number.isNaN(minPrice)) {
      items = items.filter((l) => l.price >= minPrice);
    }
    if (maxPrice !== null && !Number.isNaN(maxPrice)) {
      items = items.filter((l) => l.price <= maxPrice);
    }

    items = [...items].sort((a, b) => {
      if (sort === 'price_asc') return a.price - b.price;
      if (sort === 'price_desc') return b.price - a.price;
      if (sort === 'newest') return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      // Default 'featured': VIP/featured first, then newest
      if (a.isFeatured !== b.isFeatured) return a.isFeatured ? -1 : 1;
      return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
    });

    res.json({
      listings: items,
      settingsPublic: {
        maintenanceMode: db.settings.maintenanceMode,
        announcementBanner: db.settings.announcementBanner,
        allowNewRegistrations: db.settings.allowNewRegistrations,
      },
    });
  });

  app.post('/api/listings/:id/view', (req: Request, res: Response) => {
    const db = getDb();
    const listing = db.listings.find((l) => l.id === req.params.id);
    if (!listing) {
      res.status(404).json({ error: 'Elan tapılmadı.' });
      return;
    }
    listing.views += 1;
    saveDb(db);
    res.json({ views: listing.views });
  });

  app.post('/api/listings', (req: AuthenticatedRequest, res: Response) => {
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

    const adminActorRes = resolveAdminPanelActor(req);
    const adminActor = adminActorRes.actor;
    const user = resolved.user;
    if (!user && !adminActor) {
      res.status(401).json({ error: 'Davam etmək üçün Gmail hesabınızla daxil olun.' });
      return;
    }

    const db = getDb();
    const isAdminOrPasscode = Boolean(adminActor) || (user ? hasAdminPanelAccess(user) : false);

    if (db.settings.maintenanceMode && !isAdminOrPasscode) {
      res.status(503).json({ error: 'Saytda texniki baxış aparılır, müvəqqəti olaraq yeni elan qəbul edilmir.' });
      return;
    }

    if (user && !user.canPostListings && !isAdminOrPasscode) {
      res.status(403).json({ error: 'Elan yerləşdirmə hüququnuz admin tərəfindən müvəqqəti məhdudlaşdırılıb.' });
      return;
    }

    if (user && !isAdminOrPasscode) {
      const userListingsCount = db.listings.filter(
        (l) => l.sellerId === user.id && (l.status === 'active' || l.status === 'pending')
      ).length;

      if (userListingsCount >= db.settings.maxListingsPerUser) {
        res.status(400).json({
          error: `Maksimum ${db.settings.maxListingsPerUser} aktiv/gözləyən elan limitinə çatmısınız.`,
        });
        return;
      }
    }

    const body = req.body as Record<string, unknown>;
    const brand = typeof body.brand === 'string' ? body.brand.trim().slice(0, 40) : '';
    const model = typeof body.model === 'string' ? body.model.trim().slice(0, 80) : '';
    const storage = typeof body.storage === 'string' ? body.storage.trim().slice(0, 24) : '256 GB';
    const ram = typeof body.ram === 'string' ? body.ram.trim().slice(0, 24) : '8 GB';
    const city = typeof body.city === 'string' ? body.city.trim().slice(0, 40) : 'Bakı';
    const color = typeof body.color === 'string' ? body.color.trim().slice(0, 40) : 'Qara';
    const warranty = typeof body.warranty === 'string' ? body.warranty.trim().slice(0, 40) : 'Yoxdur';
    const phone = typeof body.phone === 'string' ? body.phone.trim().slice(0, 30) : '';
    const description = typeof body.description === 'string' ? body.description.trim().slice(0, 2000) : '';
    const condition = VALID_CONDITIONS.includes(body.condition as PhoneCondition)
      ? (body.condition as PhoneCondition)
      : 'İdeal';
    const price = Number(body.price);
    const batteryHealth = Math.min(100, Math.max(40, Math.round(Number(body.batteryHealth) || 95)));
    const imageUrl = isSafeImageUrl(body.imageUrl)
      ? body.imageUrl.trim()
      : '/src/assets/images/phone_iphone_pro_1795345109178.jpg';

    if (!brand || !model || Number.isNaN(price) || price <= 0 || price > 50000) {
      res.status(400).json({ error: 'Brend, model və düzgün qiymət (1–50000 AZN) daxil edilməlidir.' });
      return;
    }
    if (!phone || phone.length < 7) {
      res.status(400).json({ error: 'Əlaqə nömrəsini düzgün daxil edin.' });
      return;
    }
    if (!description || description.length < 10) {
      res.status(400).json({ error: 'Telefon haqqında ən azı 10 simvol təsvir yazın.' });
      return;
    }

    const customTitle = typeof body.title === 'string' && body.title.trim().length >= 4
      ? body.title.trim().slice(0, 110)
      : `${brand} ${model} ${storage} ${color}`;

    const fullText = `${customTitle} ${description}`.toLowerCase();
    const containsBlockedKeyword = db.settings.blockedKeywords.some(
      (kw) => kw.trim().length > 0 && fullText.includes(kw.trim().toLowerCase())
    );

    const initialStatus =
      isAdminOrPasscode || (db.settings.autoApproveListings && !containsBlockedKeyword)
        ? 'active'
        : 'pending';

    const nowIso = new Date().toISOString();
    const newListing: PhoneListing = {
      id: `lst_${crypto.randomBytes(6).toString('hex')}`,
      sellerId: user ? user.id : 'admin_passcode',
      sellerEmail: user ? user.email : OWNER_EMAIL,
      sellerName: user ? user.name : 'TelefonBazar Admin',
      sellerVerified: user ? user.verifiedSeller : true,
      title: customTitle,
      brand,
      model,
      price: Math.round(price),
      storage,
      ram,
      batteryHealth,
      condition,
      city,
      color,
      imeiVerified: Boolean(body.imeiVerified),
      warranty,
      barter: Boolean(body.barter),
      credit: Boolean(body.credit),
      phone,
      description,
      imageUrl,
      status: initialStatus,
      isFeatured: false,
      views: 0,
      favoritesCount: 0,
      createdAt: nowIso,
      updatedAt: nowIso,
    };

    db.listings.unshift(newListing);
    saveDb(db);

    res.status(201).json({
      listing: newListing,
      flaggedByKeyword: containsBlockedKeyword,
    });
  });

  app.patch('/api/listings/:id', (req: AuthenticatedRequest, res: Response) => {
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
    const adminActorRes = resolveAdminPanelActor(req);
    const adminActor = adminActorRes.actor;
    const user = resolved.user;
    if (!user && !adminActor) {
      res.status(401).json({ error: 'Davam etmək üçün Gmail hesabınızla daxil olun.' });
      return;
    }

    const db = getDb();
    const listing = db.listings.find((l) => l.id === req.params.id);

    if (!listing) {
      res.status(404).json({ error: 'Elan tapılmadı.' });
      return;
    }

    const isOwner = user ? listing.sellerId === user.id : false;
    const isEditorAdmin =
      (adminActor !== null &&
        (adminActor.isMasterPasscode ||
          adminActor.isOwner ||
          adminActor.role === 'super_admin' ||
          adminActor.permissions.canEditDeleteListings)) ||
      (user !== null &&
        (user.role === 'super_admin' || (hasAdminPanelAccess(user) && user.permissions.canEditDeleteListings)));

    if (!isOwner && !isEditorAdmin) {
      res.status(403).json({ error: 'Bu elanı redaktə etmək icazəniz yoxdur.' });
      return;
    }

    const body = req.body as Record<string, unknown>;
    const nowIso = new Date().toISOString();

    if (body.action === 'mark_sold') {
      listing.status = 'sold';
      listing.updatedAt = nowIso;
      saveDb(db);
      res.json({ listing });
      return;
    }

    if (body.action === 'bump') {
      listing.updatedAt = nowIso;
      saveDb(db);
      res.json({ listing });
      return;
    }

    if (body.action === 'reopen' && (isOwner || isEditorAdmin)) {
      listing.status = isEditorAdmin || db.settings.autoApproveListings ? 'active' : 'pending';
      listing.rejectionReason = undefined;
      listing.updatedAt = nowIso;
      saveDb(db);
      res.json({ listing });
      return;
    }

    if (typeof body.title === 'string' && body.title.trim().length >= 4) {
      listing.title = body.title.trim().slice(0, 110);
    }
    if (typeof body.brand === 'string' && body.brand.trim().length > 0) {
      listing.brand = body.brand.trim().slice(0, 40);
    }
    if (typeof body.model === 'string' && body.model.trim().length > 0) {
      listing.model = body.model.trim().slice(0, 80);
    }
    if (body.price !== undefined) {
      const p = Number(body.price);
      if (Number.isNaN(p) || p <= 0 || p > 50000) {
        res.status(400).json({ error: 'Qiymət 1–50000 AZN aralığında olmalıdır.' });
        return;
      }
      listing.price = Math.round(p);
    }
    if (typeof body.storage === 'string') listing.storage = body.storage.trim().slice(0, 24);
    if (typeof body.ram === 'string') listing.ram = body.ram.trim().slice(0, 24);
    if (body.batteryHealth !== undefined) {
      listing.batteryHealth = Math.min(100, Math.max(40, Math.round(Number(body.batteryHealth) || 90)));
    }
    if (VALID_CONDITIONS.includes(body.condition as PhoneCondition)) {
      listing.condition = body.condition as PhoneCondition;
    }
    if (typeof body.city === 'string') listing.city = body.city.trim().slice(0, 40);
    if (typeof body.color === 'string') listing.color = body.color.trim().slice(0, 40);
    if (typeof body.warranty === 'string') listing.warranty = body.warranty.trim().slice(0, 40);
    if (typeof body.phone === 'string' && body.phone.trim().length >= 7) {
      listing.phone = body.phone.trim().slice(0, 30);
    }
    if (typeof body.description === 'string' && body.description.trim().length >= 10) {
      listing.description = body.description.trim().slice(0, 2000);
    }
    if (body.barter !== undefined) listing.barter = Boolean(body.barter);
    if (body.credit !== undefined) listing.credit = Boolean(body.credit);
    if (body.imeiVerified !== undefined) listing.imeiVerified = Boolean(body.imeiVerified);
    if (body.imageUrl !== undefined && isSafeImageUrl(body.imageUrl)) {
      listing.imageUrl = body.imageUrl.trim();
    }

    // If an ordinary user edits a rejected listing, send it back to pending moderation
    if (isOwner && !isEditorAdmin && listing.status === 'rejected') {
      listing.status = db.settings.autoApproveListings ? 'active' : 'pending';
      listing.rejectionReason = undefined;
    }

    listing.updatedAt = nowIso;
    if (isEditorAdmin && !isOwner) {
      recordAuditLog(db, {
        actorId: adminActor ? adminActor.id : user!.id,
        actorEmail: adminActor ? adminActor.email : user!.email,
        action: 'ADMIN_EDITED_LISTING',
        targetType: 'listing',
        targetId: listing.id,
        targetLabel: listing.title,
      });
    }
    saveDb(db);
    res.json({ listing });
  });

  app.delete('/api/listings/:id', (req: AuthenticatedRequest, res: Response) => {
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
    const adminActorRes = resolveAdminPanelActor(req);
    const adminActor = adminActorRes.actor;
    const user = resolved.user;
    if (!user && !adminActor) {
      res.status(401).json({ error: 'Davam etmək üçün Gmail hesabınızla daxil olun.' });
      return;
    }

    const db = getDb();
    const idx = db.listings.findIndex((l) => l.id === req.params.id);
    if (idx === -1) {
      res.status(404).json({ error: 'Elan tapılmadı.' });
      return;
    }
    const listing = db.listings[idx];
    const isOwner = user ? listing.sellerId === user.id : false;
    const canDelete =
      (adminActor !== null &&
        (adminActor.isMasterPasscode ||
          adminActor.isOwner ||
          adminActor.role === 'super_admin' ||
          adminActor.permissions.canEditDeleteListings)) ||
      (user !== null &&
        (user.role === 'super_admin' || (hasAdminPanelAccess(user) && user.permissions.canEditDeleteListings)));

    if (!isOwner && !canDelete) {
      res.status(403).json({ error: 'Bu elanı silmək icazəniz yoxdur.' });
      return;
    }

    db.listings.splice(idx, 1);
    if (!isOwner) {
      recordAuditLog(db, {
        actorId: adminActor ? adminActor.id : user!.id,
        actorEmail: adminActor ? adminActor.email : user!.email,
        action: 'DELETE_LISTING',
        targetType: 'listing',
        targetId: listing.id,
        targetLabel: listing.title,
      });
    }
    saveDb(db);
    res.json({ ok: true });
  });

  app.post('/api/listings/:id/favorite', requireAuth, (req: AuthenticatedRequest, res: Response) => {
    const user = req.authUser!;
    const db = getDb();
    const listing = db.listings.find((l) => l.id === req.params.id);
    if (!listing) {
      res.status(404).json({ error: 'Elan tapılmadı.' });
      return;
    }

    const currentFavs = db.favorites[user.id] ?? [];
    const exists = currentFavs.includes(listing.id);
    if (exists) {
      db.favorites[user.id] = currentFavs.filter((id) => id !== listing.id);
      listing.favoritesCount = Math.max(0, listing.favoritesCount - 1);
    } else {
      db.favorites[user.id] = [...currentFavs, listing.id];
      listing.favoritesCount += 1;
    }
    saveDb(db);
    res.json({ favorites: db.favorites[user.id], favoritesCount: listing.favoritesCount });
  });

  app.post('/api/listings/:id/report', requireAuth, (req: AuthenticatedRequest, res: Response) => {
    const user = req.authUser!;
    const db = getDb();
    const listing = db.listings.find((l) => l.id === req.params.id);
    if (!listing) {
      res.status(404).json({ error: 'Elan tapılmadı.' });
      return;
    }

    const { reason, details } = req.body as { reason?: string; details?: string };
    if (typeof reason !== 'string' || reason.trim().length < 3) {
      res.status(400).json({ error: 'Şikayət səbəbini seçin və ya qeyd edin.' });
      return;
    }

    const report = {
      id: `rep_${crypto.randomBytes(6).toString('hex')}`,
      listingId: listing.id,
      listingTitle: listing.title,
      sellerId: listing.sellerId,
      sellerEmail: listing.sellerEmail,
      reporterId: user.id,
      reporterEmail: user.email,
      reason: reason.trim().slice(0, 120),
      details: typeof details === 'string' ? details.trim().slice(0, 600) : '',
      status: 'open' as const,
      createdAt: new Date().toISOString(),
    };

    db.reports.unshift(report);
    saveDb(db);
    res.status(201).json({ report });
  });

  // =========================================================================
  // ADMIN PANEL ROUTES (PASSCODE OR AUTHORIZED GMAIL / RƏŞİD)
  // =========================================================================

  app.get('/api/admin/auth/status', (req: Request, res: Response) => {
    const resolved = resolveAdminPanelActor(req);
    res.json({
      unlocked: Boolean(resolved.actor),
      actor: resolved.actor ?? null,
      usingEnvOverride: isAdminPasscodeEnvOverride(),
    });
  });

  app.post('/api/admin/auth/unlock', (req: Request, res: Response) => {
    const { passcode } = req.body as { passcode?: string };
    const match = typeof passcode === 'string' ? matchAdminUnlockPasscode(passcode) : { matched: false as const };
    if (!match.matched) {
      res.status(401).json({ error: 'Admin parolu yanlışdır.' });
      return;
    }

    const db = getDb();
    if (!match.master) {
      const op = match.operator;
      if (!op.allowAdminPanel) {
        res.status(403).json({
          error: `${op.displayName} üçün Admin Panel icazəsi bağlıdır. Yalnız Moderator Panel aktivdir.`,
        });
        return;
      }

      const adminToken = createAdminSessionToken(db.adminSessionVersion, op);
      setAdminSessionCookie(res, req, adminToken);

      let modToken: string | undefined;
      if (op.allowModeratorPanel) {
        modToken = createModSessionToken(db.moderatorSessionVersion, op);
        setModSessionCookie(res, req, modToken);
      }

      const actor = buildActorFromOperator(op, 'operator_passcode');

      recordAuditLog(db, {
        actorId: op.id,
        actorEmail: actor.email,
        action: op.isReshid ? 'RESHID_ADMIN_UNLOCKED' : 'OPERATOR_ADMIN_UNLOCKED',
        targetType: 'settings',
        targetId: 'admin_panel',
        targetLabel: `${op.displayName} şəxsi parol ilə Admin Paneli açdı`,
      });
      saveDb(db);

      res.json({
        ok: true,
        adminToken,
        ...(modToken ? { modToken } : {}),
        actor,
        usingEnvOverride: isAdminPasscodeEnvOverride(),
      });
      return;
    }

    const adminToken = createAdminSessionToken(db.adminSessionVersion);
    setAdminSessionCookie(res, req, adminToken);

    const masterActor = {
      id: 'admin_passcode',
      name: 'Baş Admin',
      email: 'Admin (Parol Sessiyası)',
      role: 'super_admin' as const,
      isReshid: false,
      isMasterPasscode: true,
      isOwner: false,
      canManageAccess: true,
      allowAdminPanel: true,
      allowModeratorPanel: true,
      permissions: { ...FULL_ADMIN_PERMISSIONS },
      authMethod: 'master_passcode' as const,
    };

    recordAuditLog(db, {
      actorId: 'admin_passcode',
      actorEmail: 'Admin (Parol Sessiyası)',
      action: 'ADMIN_PANEL_UNLOCKED',
      targetType: 'settings',
      targetId: 'admin_panel',
      targetLabel: 'Admin Panel parol ilə açıldı',
    });
    saveDb(db);

    res.json({
      ok: true,
      adminToken,
      actor: masterActor,
      usingEnvOverride: isAdminPasscodeEnvOverride(),
    });
  });

  app.post('/api/admin/auth/lock', (req: Request, res: Response) => {
    clearAdminSessionCookie(res, req);
    res.json({ ok: true });
  });

  app.post('/api/admin/auth/change-passcode', requireSuperAdmin, (req: AuthenticatedRequest, res: Response) => {
    if (isAdminPasscodeEnvOverride()) {
      res.status(400).json({ error: 'Admin parolu serverin ADMIN_PASSCODE mühit dəyişəni ilə idarə olunur.' });
      return;
    }
    const { currentPasscode, newPasscode } = req.body as {
      currentPasscode?: string;
      newPasscode?: string;
    };
    if (typeof currentPasscode !== 'string' || !verifyAdminPasscode(currentPasscode)) {
      res.status(401).json({ error: 'Hazırkı admin parolu yanlışdır.' });
      return;
    }
    if (typeof newPasscode !== 'string' || newPasscode.length < 2 || newPasscode.length > 100) {
      res.status(400).json({ error: 'Yeni parol ən azı 2 simvoldan ibarət olmalıdır.' });
      return;
    }

    const actor = req.adminActor!;
    const db = getDb();
    db.adminPasscodeHash = hashPassword(newPasscode);
    db.adminSessionVersion += 1;

    const adminToken = createAdminSessionToken(db.adminSessionVersion);
    setAdminSessionCookie(res, req, adminToken);

    recordAuditLog(db, {
      actorId: actor.id,
      actorEmail: actor.email,
      action: 'CHANGE_ADMIN_PASSCODE',
      targetType: 'settings',
      targetId: 'admin_panel',
      targetLabel: 'Admin Panel parolu yeniləndi',
    });
    saveDb(db);
    res.json({ ok: true, adminToken });
  });

  app.get('/api/admin/overview', requireAdminAccess(), (_req: AuthenticatedRequest, res: Response) => {
    const db = getDb();
    const brandMap = new Map<string, { count: number; valueAzn: number }>();
    const cityMap = new Map<string, number>();

    let activeListings = 0;
    let pendingListings = 0;
    let soldListings = 0;
    let rejectedListings = 0;
    let totalMarketValueAzn = 0;
    let totalViews = 0;

    for (const l of db.listings) {
      totalViews += l.views;
      if (l.status === 'active') {
        activeListings++;
        totalMarketValueAzn += l.price;
      } else if (l.status === 'pending') {
        pendingListings++;
      } else if (l.status === 'sold') {
        soldListings++;
      } else if (l.status === 'rejected') {
        rejectedListings++;
      }

      const prev = brandMap.get(l.brand) ?? { count: 0, valueAzn: 0 };
      prev.count += 1;
      prev.valueAzn += l.price;
      brandMap.set(l.brand, prev);

      cityMap.set(l.city, (cityMap.get(l.city) ?? 0) + 1);
    }

    const topViewedListings = [...db.listings]
      .sort((a, b) => b.views - a.views)
      .slice(0, 5)
      .map((l) => ({ id: l.id, title: l.title, views: l.views, price: l.price }));

    const stats: AdminOverviewStats = {
      totalListings: db.listings.length,
      activeListings,
      pendingListings,
      soldListings,
      rejectedListings,
      totalMarketValueAzn,
      totalViews,
      totalUsers: db.users.length,
      kickedUsers: db.users.filter((u) => u.status === 'kicked').length,
      bannedUsers: db.users.filter((u) => u.status === 'banned').length,
      mutedUsers: db.users.filter((u) => !u.canPostListings).length,
      shadowbannedUsers: db.users.filter((u) => u.isShadowbanned).length,
      adminCount: db.users.filter((u) => u.role === 'super_admin' || u.role === 'admin' || u.role === 'moderator').length,
      openReports: db.reports.filter((r) => r.status === 'open').length,
      blacklistedCount: db.blacklistedEmails.length,
      brandBreakdown: Array.from(brandMap.entries())
        .map(([brand, v]) => ({ brand, count: v.count, valueAzn: v.valueAzn }))
        .sort((a, b) => b.count - a.count),
      cityBreakdown: Array.from(cityMap.entries())
        .map(([city, count]) => ({ city, count }))
        .sort((a, b) => b.count - a.count),
      topViewedListings,
    };

    res.json({
      stats,
      recentLogs: db.auditLogs.slice(0, 12),
      dbSizeKb: Math.round((getDbSizeBytes() / 1024) * 10) / 10,
    });
  });

  app.get('/api/admin/listings', requireAdminAccess(), (req: AuthenticatedRequest, res: Response) => {
    const db = getDb();
    const status = typeof req.query.status === 'string' ? req.query.status : 'all';
    const search = typeof req.query.search === 'string' ? req.query.search.trim().toLowerCase() : '';

    let items = [...db.listings];
    if (status && status !== 'all') {
      items = items.filter((l) => l.status === status);
    }
    if (search) {
      items = items.filter((l) =>
        `${l.title} ${l.brand} ${l.model} ${l.sellerName} ${l.sellerEmail} ${l.city}`.toLowerCase().includes(search)
      );
    }

    items.sort((a, b) => {
      if (a.status === 'pending' && b.status !== 'pending') return -1;
      if (b.status === 'pending' && a.status !== 'pending') return 1;
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });

    res.json({ listings: items });
  });

  app.patch('/api/admin/listings/:id/moderate', requireAdminAccess(), (req: AuthenticatedRequest, res: Response) => {
    const actor = req.adminActor!;
    const db = getDb();
    const listing = db.listings.find((l) => l.id === req.params.id);
    if (!listing) {
      res.status(404).json({ error: 'Elan tapılmadı.' });
      return;
    }

    const { action, reason } = req.body as {
      action?: 'approve' | 'reject' | 'toggle_featured' | 'mark_sold' | 'reopen';
      reason?: string;
    };

    if ((action === 'approve' || action === 'reject') && actor.role !== 'super_admin' && !actor.permissions.canApproveListings) {
      res.status(403).json({ error: 'Elan təsdiqləmə/rədd etmə səlahiyyətiniz yoxdur.' });
      return;
    }
    if ((action === 'toggle_featured' || action === 'mark_sold' || action === 'reopen') && actor.role !== 'super_admin' && !actor.permissions.canEditDeleteListings) {
      res.status(403).json({ error: 'Elanları VIP etmə və ya status dəyişmə səlahiyyətiniz yoxdur.' });
      return;
    }

    const nowIso = new Date().toISOString();
    if (action === 'approve') {
      listing.status = 'active';
      listing.rejectionReason = undefined;
      listing.updatedAt = nowIso;
      recordAuditLog(db, {
        actorId: actor.id,
        actorEmail: actor.email,
        action: 'APPROVE_LISTING',
        targetType: 'listing',
        targetId: listing.id,
        targetLabel: listing.title,
      });
    } else if (action === 'reject') {
      listing.status = 'rejected';
      listing.rejectionReason = typeof reason === 'string' && reason.trim()
        ? reason.trim().slice(0, 300)
        : 'Platforma qaydalarına uyğun deyil.';
      listing.updatedAt = nowIso;
      recordAuditLog(db, {
        actorId: actor.id,
        actorEmail: actor.email,
        action: 'REJECT_LISTING',
        targetType: 'listing',
        targetId: listing.id,
        targetLabel: listing.title,
        reason: listing.rejectionReason,
      });
    } else if (action === 'toggle_featured') {
      listing.isFeatured = !listing.isFeatured;
      listing.updatedAt = nowIso;
      recordAuditLog(db, {
        actorId: actor.id,
        actorEmail: actor.email,
        action: listing.isFeatured ? 'PIN_VIP_LISTING' : 'UNPIN_VIP_LISTING',
        targetType: 'listing',
        targetId: listing.id,
        targetLabel: listing.title,
      });
    } else if (action === 'mark_sold') {
      listing.status = 'sold';
      listing.updatedAt = nowIso;
      recordAuditLog(db, {
        actorId: actor.id,
        actorEmail: actor.email,
        action: 'MARK_LISTING_SOLD',
        targetType: 'listing',
        targetId: listing.id,
        targetLabel: listing.title,
      });
    } else if (action === 'reopen') {
      listing.status = 'active';
      listing.rejectionReason = undefined;
      listing.updatedAt = nowIso;
      recordAuditLog(db, {
        actorId: actor.id,
        actorEmail: actor.email,
        action: 'REOPEN_LISTING',
        targetType: 'listing',
        targetId: listing.id,
        targetLabel: listing.title,
      });
    } else {
      res.status(400).json({ error: 'Naməlum əməliyyat.' });
      return;
    }

    saveDb(db);
    res.json({ listing });
  });

  app.post('/api/admin/listings/bulk', requireAdminAccess(), (req: AuthenticatedRequest, res: Response) => {
    const actor = req.adminActor!;
    const db = getDb();
    const { ids, action, reason } = req.body as {
      ids?: string[];
      action?: 'approve' | 'reject' | 'delete';
      reason?: string;
    };

    if (!Array.isArray(ids) || ids.length === 0) {
      res.status(400).json({ error: 'Ən azı bir elan seçin.' });
      return;
    }

    if ((action === 'approve' || action === 'reject') && actor.role !== 'super_admin' && !actor.permissions.canApproveListings) {
      res.status(403).json({ error: 'Toplu təsdiq/rədd səlahiyyətiniz yoxdur.' });
      return;
    }
    if (action === 'delete' && actor.role !== 'super_admin' && !actor.permissions.canEditDeleteListings) {
      res.status(403).json({ error: 'Toplu silmə səlahiyyətiniz yoxdur.' });
      return;
    }

    const idSet = new Set(ids);
    const nowIso = new Date().toISOString();
    let affected = 0;

    if (action === 'delete') {
      const before = db.listings.length;
      db.listings = db.listings.filter((l) => !idSet.has(l.id));
      affected = before - db.listings.length;
    } else {
      for (const l of db.listings) {
        if (!idSet.has(l.id)) continue;
        if (action === 'approve') {
          l.status = 'active';
          l.rejectionReason = undefined;
          l.updatedAt = nowIso;
          affected++;
        } else if (action === 'reject') {
          l.status = 'rejected';
          l.rejectionReason = typeof reason === 'string' && reason.trim() ? reason.trim().slice(0, 300) : 'Toplu moderasiya ilə rədd edildi.';
          l.updatedAt = nowIso;
          affected++;
        }
      }
    }

    recordAuditLog(db, {
      actorId: actor.id,
      actorEmail: actor.email,
      action: `BULK_${(action || 'UNKNOWN').toUpperCase()}`,
      targetType: 'listing',
      targetId: `${affected}_items`,
      targetLabel: `${affected} elan üzərində toplu əməliyyat`,
      reason: typeof reason === 'string' ? reason.trim().slice(0, 200) : undefined,
    });
    saveDb(db);
    res.json({ ok: true, affected });
  });

  app.get('/api/admin/users', requireAdminAccess(), (req: AuthenticatedRequest, res: Response) => {
    const db = getDb();
    const search = typeof req.query.search === 'string' ? req.query.search.trim().toLowerCase() : '';
    const status = typeof req.query.status === 'string' ? req.query.status : 'all';

    // Re-evaluate temporary bans/kicks cleanly
    for (const u of db.users) {
      evaluateUserModerationState(u);
    }

    const countMap = new Map<string, number>();
    for (const l of db.listings) {
      countMap.set(l.sellerId, (countMap.get(l.sellerId) ?? 0) + 1);
    }

    let users = db.users.map((u) => toPublicUser(u, countMap.get(u.id) ?? 0));
    if (status && status !== 'all') {
      users = users.filter((u) => u.status === status);
    }
    if (search) {
      users = users.filter((u) => `${u.name} ${u.email} ${u.role}`.toLowerCase().includes(search));
    }

    res.json({ users });
  });

  app.post('/api/admin/users/:id/kick', requireAdminAccess('canKickBanUsers'), (req: AuthenticatedRequest, res: Response) => {
    const actor = req.adminActor!;
    const db = getDb();
    const target = db.users.find((u) => u.id === req.params.id);

    if (!target) {
      res.status(404).json({ error: 'İstifadəçi tapılmadı.' });
      return;
    }
    if (target.id === actor.id) {
      res.status(400).json({ error: 'Öz hesabınızı kick edə bilməzsiniz.' });
      return;
    }
    if (target.role === 'super_admin') {
      res.status(403).json({ error: 'Baş Admin (Super Admin) hesabını kick etmək mümkün deyil.' });
      return;
    }
    if ((target.role === 'admin' || target.role === 'moderator') && actor.role !== 'super_admin') {
      res.status(403).json({ error: 'Admin və moderatorları yalnız Baş Admin kick edə bilər.' });
      return;
    }

    const { reason, minutes } = req.body as { reason?: string; minutes?: number };
    const cooldownMin = typeof minutes === 'number' && minutes > 0 ? Math.min(1440, Math.round(minutes)) : 15;
    const untilIso = new Date(Date.now() + cooldownMin * 60 * 1000).toISOString();

    target.status = 'kicked';
    target.kickReason = typeof reason === 'string' && reason.trim()
      ? reason.trim().slice(0, 300)
      : `Sessiyanız admin tərəfindən sonlandırıldı (${cooldownMin} dəq gözləmə).`;
    target.kickedUntil = untilIso;
    target.sessionVersion += 1; // Invalidates all live tokens immediately

    recordAuditLog(db, {
      actorId: actor.id,
      actorEmail: actor.email,
      action: 'KICK_USER',
      targetType: 'user',
      targetId: target.id,
      targetLabel: `${target.name} (${target.email})`,
      reason: `${target.kickReason} [${cooldownMin} dəq]`,
    });

    saveDb(db);
    res.json({ user: toPublicUser(target) });
  });

  app.post('/api/admin/users/:id/ban', requireAdminAccess('canKickBanUsers'), (req: AuthenticatedRequest, res: Response) => {
    const actor = req.adminActor!;
    const db = getDb();
    const target = db.users.find((u) => u.id === req.params.id);

    if (!target) {
      res.status(404).json({ error: 'İstifadəçi tapılmadı.' });
      return;
    }
    if (target.id === actor.id) {
      res.status(400).json({ error: 'Öz hesabınızı ban edə bilməzsiniz.' });
      return;
    }
    if (target.role === 'super_admin') {
      res.status(403).json({ error: 'Baş Admin (Super Admin) hesabını ban etmək mümkün deyil.' });
      return;
    }
    if ((target.role === 'admin' || target.role === 'moderator') && actor.role !== 'super_admin') {
      res.status(403).json({ error: 'Admin və moderatorları yalnız Baş Admin ban edə bilər.' });
      return;
    }

    const { reason, durationDays, hideListings } = req.body as {
      reason?: string;
      durationDays?: number | null;
      hideListings?: boolean;
    };

    const days = typeof durationDays === 'number' && durationDays > 0 ? Math.min(3650, durationDays) : null;
    const untilIso = days ? new Date(Date.now() + days * 24 * 3600 * 1000).toISOString() : null;
    const finalReason = typeof reason === 'string' && reason.trim()
      ? reason.trim().slice(0, 300)
      : 'Platforma qaydalarının pozulması.';

    target.status = 'banned';
    target.banReason = finalReason;
    target.bannedUntil = untilIso;
    target.kickReason = undefined;
    target.kickedUntil = null;
    target.sessionVersion += 1;

    let hiddenCount = 0;
    if (hideListings) {
      for (const l of db.listings) {
        if (l.sellerId === target.id && (l.status === 'active' || l.status === 'pending')) {
          l.status = 'rejected';
          l.rejectionReason = `Satıcı bloklandığı üçün elan dayandırıldı: ${finalReason}`;
          l.updatedAt = new Date().toISOString();
          hiddenCount++;
        }
      }
    }

    recordAuditLog(db, {
      actorId: actor.id,
      actorEmail: actor.email,
      action: 'BAN_USER',
      targetType: 'user',
      targetId: target.id,
      targetLabel: `${target.name} (${target.email})`,
      reason: `${finalReason} (${days ? `${days} gün` : 'Ömürlük'}${hiddenCount > 0 ? `, ${hiddenCount} elan gizlədildi` : ''})`,
    });

    saveDb(db);
    res.json({ user: toPublicUser(target), hiddenCount });
  });

  app.post('/api/admin/users/:id/unban', requireAdminAccess('canKickBanUsers'), (req: AuthenticatedRequest, res: Response) => {
    const actor = req.adminActor!;
    const db = getDb();
    const target = db.users.find((u) => u.id === req.params.id);

    if (!target) {
      res.status(404).json({ error: 'İstifadəçi tapılmadı.' });
      return;
    }

    target.status = 'active';
    target.banReason = undefined;
    target.bannedUntil = null;
    target.kickReason = undefined;
    target.kickedUntil = null;

    recordAuditLog(db, {
      actorId: actor.id,
      actorEmail: actor.email,
      action: 'UNBAN_RESTORE_USER',
      targetType: 'user',
      targetId: target.id,
      targetLabel: `${target.name} (${target.email})`,
    });

    saveDb(db);
    res.json({ user: toPublicUser(target) });
  });

  app.post('/api/admin/users/:id/verify', requireAdminAccess(), (req: AuthenticatedRequest, res: Response) => {
    const actor = req.adminActor!;
    const db = getDb();
    const target = db.users.find((u) => u.id === req.params.id);

    if (!target) {
      res.status(404).json({ error: 'İstifadəçi tapılmadı.' });
      return;
    }

    target.verifiedSeller = !target.verifiedSeller;
    for (const l of db.listings) {
      if (l.sellerId === target.id) {
        l.sellerVerified = target.verifiedSeller;
      }
    }

    recordAuditLog(db, {
      actorId: actor.id,
      actorEmail: actor.email,
      action: target.verifiedSeller ? 'VERIFY_SELLER' : 'UNVERIFY_SELLER',
      targetType: 'user',
      targetId: target.id,
      targetLabel: `${target.name} (${target.email})`,
    });

    saveDb(db);
    res.json({ user: toPublicUser(target) });
  });

  app.post('/api/admin/users/:id/warn', requireAdminAccess('canKickBanUsers'), (req: AuthenticatedRequest, res: Response) => {
    const actor = req.adminActor!;
    const db = getDb();
    const target = db.users.find((u) => u.id === req.params.id);
    if (!target) {
      res.status(404).json({ error: 'İstifadəçi tapılmadı.' });
      return;
    }

    const { message } = req.body as { message?: string };
    const warningText = typeof message === 'string' && message.trim().length >= 3
      ? message.trim().slice(0, 300)
      : 'Platforma qaydalarına əməl etməyiniz xahiş olunur.';

    target.warningsCount += 1;
    target.lastWarning = warningText;

    db.notifications.unshift({
      id: `ntf_${crypto.randomBytes(6).toString('hex')}`,
      targetUserId: target.id,
      title: 'Rəsmi Admin Xəbərdarlığı',
      message: warningText,
      kind: 'warning',
      sentBy: actor.email,
      readBy: [],
      createdAt: new Date().toISOString(),
    });

    recordAuditLog(db, {
      actorId: actor.id,
      actorEmail: actor.email,
      action: 'WARN_USER',
      targetType: 'user',
      targetId: target.id,
      targetLabel: `${target.name} (${target.email})`,
      reason: warningText,
    });

    saveDb(db);
    res.json({ user: toPublicUser(target) });
  });

  app.post('/api/admin/users/:id/toggle-posting', requireAdminAccess('canKickBanUsers'), (req: AuthenticatedRequest, res: Response) => {
    const actor = req.adminActor!;
    const db = getDb();
    const target = db.users.find((u) => u.id === req.params.id);
    if (!target) {
      res.status(404).json({ error: 'İstifadəçi tapılmadı.' });
      return;
    }
    if (target.role === 'super_admin') {
      res.status(403).json({ error: 'Baş Adminə məhdudiyyət qoyula bilməz.' });
      return;
    }

    target.canPostListings = !target.canPostListings;
    recordAuditLog(db, {
      actorId: actor.id,
      actorEmail: actor.email,
      action: target.canPostListings ? 'UNMUTE_POSTING' : 'MUTE_POSTING',
      targetType: 'user',
      targetId: target.id,
      targetLabel: `${target.name} (${target.email})`,
    });

    saveDb(db);
    res.json({ user: toPublicUser(target) });
  });

  app.post('/api/admin/users/:id/force-logout', requireAdminAccess('canKickBanUsers'), (req: AuthenticatedRequest, res: Response) => {
    const actor = req.adminActor!;
    const db = getDb();
    const target = db.users.find((u) => u.id === req.params.id);
    if (!target) {
      res.status(404).json({ error: 'İstifadəçi tapılmadı.' });
      return;
    }
    if (target.role === 'super_admin' && target.id !== actor.id) {
      res.status(403).json({ error: 'Baş Adminin sessiyasını sıfırlamaq olmaz.' });
      return;
    }

    target.sessionVersion += 1;
    recordAuditLog(db, {
      actorId: actor.id,
      actorEmail: actor.email,
      action: 'FORCE_LOGOUT_USER',
      targetType: 'user',
      targetId: target.id,
      targetLabel: `${target.name} (${target.email})`,
    });

    saveDb(db);
    res.json({ user: toPublicUser(target) });
  });

  // =========================================================================
  // SUPER ADMIN: GRANT / REVOKE ADMIN PANEL ACCESS TO ANYONE
  // =========================================================================

  app.get('/api/admin/roles', requireAdminAccess(), (_req: AuthenticatedRequest, res: Response) => {
    const db = getDb();
    const admins = db.users
      .filter((u) => u.role === 'super_admin' || u.role === 'admin' || u.role === 'moderator')
      .map((u) => toPublicUser(u));

    res.json({
      admins,
      preassignedRoles: db.preassignedRoles,
      ownerEmail: OWNER_EMAIL,
    });
  });

  app.post('/api/admin/roles/grant', requireSuperAdmin, (req: AuthenticatedRequest, res: Response) => {
    const actor = req.adminActor!;
    const db = getDb();
    const { email: rawEmail, role, permissions } = req.body as {
      email?: string;
      role?: 'admin' | 'moderator' | 'user';
      permissions?: AdminPermissions;
    };

    const email = normalizeGmail(rawEmail ?? '');
    if (!email) {
      res.status(400).json({ error: 'Zəhmət olmasa düzgün @gmail.com ünvanı daxil edin.' });
      return;
    }

    if (role !== 'admin' && role !== 'moderator' && role !== 'user') {
      res.status(400).json({ error: 'Rol admin, moderator və ya user olmalıdır.' });
      return;
    }

    const existingUser = db.users.find((u) => u.email === email);
    if (existingUser) {
      if (existingUser.role === 'super_admin') {
        res.status(400).json({ error: 'Baş Admin rolunu dəyişmək olmaz.' });
        return;
      }

      if (role === 'user') {
        existingUser.role = 'user';
        existingUser.permissions = { ...NO_ADMIN_PERMISSIONS };
        for (const op of db.operators) {
          if (op.email && op.email.toLowerCase() === email) {
            op.active = false;
            op.sessionVersion += 1;
          }
        }
      } else {
        existingUser.role = role;
        const basePerms = role === 'admin' ? FULL_ADMIN_PERMISSIONS : MODERATOR_PERMISSIONS;
        existingUser.permissions = sanitizePermissions(permissions, basePerms);
        existingUser.verifiedSeller = true;
      }

      recordAuditLog(db, {
        actorId: actor.id,
        actorEmail: actor.email,
        action: role === 'user' ? 'REVOKE_ADMIN_ROLE' : 'GRANT_ADMIN_ROLE',
        targetType: 'role',
        targetId: existingUser.id,
        targetLabel: `${existingUser.name} (${existingUser.email}) -> ${role}`,
      });

      saveDb(db);
      res.json({ user: toPublicUser(existingUser), preassigned: false });
      return;
    }

    // Email not registered yet: store in preassignedRoles (or remove if role === 'user')
    db.preassignedRoles = db.preassignedRoles.filter((p) => p.email !== email);
    if (role !== 'user') {
      const basePerms = role === 'admin' ? FULL_ADMIN_PERMISSIONS : MODERATOR_PERMISSIONS;
      const entry = {
        email,
        role,
        permissions: sanitizePermissions(permissions, basePerms),
        assignedBy: actor.email,
        assignedAt: new Date().toISOString(),
      };
      db.preassignedRoles.unshift(entry);

      recordAuditLog(db, {
        actorId: actor.id,
        actorEmail: actor.email,
        action: 'PREASSIGN_ADMIN_ROLE',
        targetType: 'role',
        targetId: email,
        targetLabel: `${email} -> ${role} (İlk girişdə aktivləşəcək)`,
      });

      saveDb(db);
      res.json({ preassignedRole: entry, preassigned: true });
      return;
    }

    saveDb(db);
    res.json({ ok: true });
  });

  app.delete('/api/admin/roles/preassigned/:email', requireSuperAdmin, (req: AuthenticatedRequest, res: Response) => {
    const actor = req.adminActor!;
    const db = getDb();
    const targetEmail = decodeURIComponent(req.params.email).trim().toLowerCase();
    const before = db.preassignedRoles.length;
    db.preassignedRoles = db.preassignedRoles.filter((p) => p.email !== targetEmail);

    if (db.preassignedRoles.length !== before) {
      recordAuditLog(db, {
        actorId: actor.id,
        actorEmail: actor.email,
        action: 'REMOVE_PREASSIGNED_ROLE',
        targetType: 'role',
        targetId: targetEmail,
        targetLabel: targetEmail,
      });
      saveDb(db);
    }

    res.json({ ok: true });
  });

  app.patch('/api/admin/roles/permissions', requireSuperAdmin, (req: AuthenticatedRequest, res: Response) => {
    const actor = req.adminActor!;
    const db = getDb();
    const { userId, role, permissions } = req.body as {
      userId?: string;
      role?: 'admin' | 'moderator';
      permissions?: AdminPermissions;
    };

    const target = db.users.find((u) => u.id === userId);
    if (!target) {
      res.status(404).json({ error: 'Admin istifadəçi tapılmadı.' });
      return;
    }
    if (target.role === 'super_admin') {
      res.status(400).json({ error: 'Baş Admin səlahiyyətləri dəyişdirilə bilməz.' });
      return;
    }

    if (role === 'admin' || role === 'moderator') {
      target.role = role;
    }
    target.permissions = sanitizePermissions(
      permissions,
      target.role === 'admin' ? FULL_ADMIN_PERMISSIONS : MODERATOR_PERMISSIONS
    );

    recordAuditLog(db, {
      actorId: actor.id,
      actorEmail: actor.email,
      action: 'UPDATE_ADMIN_PERMISSIONS',
      targetType: 'role',
      targetId: target.id,
      targetLabel: `${target.name} (${target.email})`,
    });

    saveDb(db);
    res.json({ user: toPublicUser(target) });
  });

  // =========================================================================
  // CATALOG, BROADCASTS & BACKUP
  // =========================================================================

  app.put('/api/admin/catalog', requireAdminAccess('canManageCatalog'), (req: AuthenticatedRequest, res: Response) => {
    const actor = req.adminActor!;
    const db = getDb();
    const { brands, cities } = req.body as { brands?: unknown; cities?: unknown };

    if (Array.isArray(brands)) {
      const cleaned = brands
        .filter((b): b is string => typeof b === 'string' && b.trim().length > 0)
        .map((b) => b.trim().slice(0, 40));
      if (cleaned.length > 0) {
        db.catalog.brands = Array.from(new Set(cleaned));
      }
    }
    if (Array.isArray(cities)) {
      const cleaned = cities
        .filter((c): c is string => typeof c === 'string' && c.trim().length > 0)
        .map((c) => c.trim().slice(0, 40));
      if (cleaned.length > 0) {
        db.catalog.cities = Array.from(new Set(cleaned));
      }
    }

    recordAuditLog(db, {
      actorId: actor.id,
      actorEmail: actor.email,
      action: 'UPDATE_CATALOG_TAXONOMY',
      targetType: 'catalog',
      targetId: 'brands_cities',
      targetLabel: `${db.catalog.brands.length} brend · ${db.catalog.cities.length} şəhər`,
    });

    saveDb(db);
    res.json({ catalog: db.catalog });
  });

  app.get('/api/admin/broadcasts', requireAdminAccess(), (_req: AuthenticatedRequest, res: Response) => {
    const db = getDb();
    res.json({ notifications: db.notifications.slice(0, 50) });
  });

  app.post('/api/admin/broadcasts', requireAdminAccess('canSendBroadcasts'), (req: AuthenticatedRequest, res: Response) => {
    const actor = req.adminActor!;
    const db = getDb();
    const { targetUserId, title, message, kind } = req.body as {
      targetUserId?: string;
      title?: string;
      message?: string;
      kind?: 'info' | 'warning' | 'system';
    };

    if (typeof title !== 'string' || title.trim().length < 2 || typeof message !== 'string' || message.trim().length < 5) {
      res.status(400).json({ error: 'Başlıq və bildiriş mətni daxil edilməlidir.' });
      return;
    }

    const target = typeof targetUserId === 'string' && targetUserId !== 'all' ? targetUserId : 'all';
    const note = {
      id: `ntf_${crypto.randomBytes(6).toString('hex')}`,
      targetUserId: target,
      title: title.trim().slice(0, 120),
      message: message.trim().slice(0, 600),
      kind: kind === 'warning' || kind === 'system' ? kind : ('info' as const),
      sentBy: actor.email,
      readBy: [],
      createdAt: new Date().toISOString(),
    };

    db.notifications.unshift(note);
    if (db.notifications.length > 200) {
      db.notifications = db.notifications.slice(0, 200);
    }

    recordAuditLog(db, {
      actorId: actor.id,
      actorEmail: actor.email,
      action: 'SEND_BROADCAST',
      targetType: 'broadcast',
      targetId: note.id,
      targetLabel: `${note.title} (${target === 'all' ? 'Hamıya' : target})`,
    });

    saveDb(db);
    res.status(201).json({ notification: note });
  });

  app.get('/api/admin/backup', requireAdminAccess(), (req: AuthenticatedRequest, res: Response) => {
    const actor = req.adminActor!;
    if (actor.role !== 'super_admin' && !actor.permissions.canManageSettings) {
      res.status(403).json({ error: 'Ehtiyat nüsxə yükləmə səlahiyyətiniz yoxdur.' });
      return;
    }
    const db = getDb();
    const safeSnapshot = {
      exportedAt: new Date().toISOString(),
      exportedBy: actor.email,
      users: db.users.map((u) => toPublicUser(u)),
      preassignedRoles: db.preassignedRoles,
      listings: db.listings,
      reports: db.reports,
      auditLogs: db.auditLogs,
      settings: db.settings,
      catalog: db.catalog,
      notifications: db.notifications,
    };
    res.json(safeSnapshot);
  });

  // =========================================================================
  // REPORTS, AUDIT LOGS & SETTINGS
  // =========================================================================

  app.get('/api/admin/reports', requireAdminAccess('canManageReports'), (_req: AuthenticatedRequest, res: Response) => {
    const db = getDb();
    res.json({ reports: db.reports });
  });

  app.patch('/api/admin/reports/:id', requireAdminAccess('canManageReports'), (req: AuthenticatedRequest, res: Response) => {
    const actor = req.adminActor!;
    const db = getDb();
    const report = db.reports.find((r) => r.id === req.params.id);
    if (!report) {
      res.status(404).json({ error: 'Şikayət tapılmadı.' });
      return;
    }

    const { status, resolutionNote, deleteListing, banSeller } = req.body as {
      status?: 'resolved' | 'dismissed';
      resolutionNote?: string;
      deleteListing?: boolean;
      banSeller?: boolean;
    };

    if (status !== 'resolved' && status !== 'dismissed') {
      res.status(400).json({ error: 'Status resolved və ya dismissed olmalıdır.' });
      return;
    }

    report.status = status;
    report.resolvedBy = actor.email;
    report.resolutionNote = typeof resolutionNote === 'string' ? resolutionNote.trim().slice(0, 300) : '';
    report.resolvedAt = new Date().toISOString();

    if (deleteListing) {
      db.listings = db.listings.filter((l) => l.id !== report.listingId);
    }
    if (banSeller) {
      const seller = db.users.find((u) => u.id === report.sellerId);
      if (seller && seller.role !== 'super_admin' && seller.id !== actor.id) {
        seller.status = 'banned';
        seller.banReason = `Şikayət əsasında bloklandı: ${report.reason}`;
        seller.bannedUntil = null;
        seller.sessionVersion += 1;
      }
    }

    recordAuditLog(db, {
      actorId: actor.id,
      actorEmail: actor.email,
      action: status === 'resolved' ? 'RESOLVE_REPORT' : 'DISMISS_REPORT',
      targetType: 'report',
      targetId: report.id,
      targetLabel: report.listingTitle,
      reason: report.resolutionNote || report.reason,
    });

    saveDb(db);
    res.json({ report });
  });

  app.get('/api/admin/audit-logs', requireAdminAccess(), (_req: AuthenticatedRequest, res: Response) => {
    const db = getDb();
    res.json({ logs: db.auditLogs });
  });

  app.get('/api/admin/settings', requireAdminAccess(), (_req: AuthenticatedRequest, res: Response) => {
    const db = getDb();
    res.json({
      settings: db.settings,
      usingEnvOverride: isAdminPasscodeEnvOverride(),
    });
  });

  app.patch('/api/admin/settings', requireAdminAccess('canManageSettings'), (req: AuthenticatedRequest, res: Response) => {
    const actor = req.adminActor!;
    const db = getDb();
    const body = req.body as Record<string, unknown>;

    if (typeof body.autoApproveListings === 'boolean') {
      db.settings.autoApproveListings = body.autoApproveListings;
    }
    if (typeof body.maintenanceMode === 'boolean') {
      db.settings.maintenanceMode = body.maintenanceMode;
    }
    if (typeof body.allowNewRegistrations === 'boolean') {
      db.settings.allowNewRegistrations = body.allowNewRegistrations;
    }
    if (typeof body.announcementBanner === 'string') {
      db.settings.announcementBanner = body.announcementBanner.trim().slice(0, 240);
    }
    if (body.maxListingsPerUser !== undefined) {
      const n = Number(body.maxListingsPerUser);
      if (!Number.isNaN(n) && n >= 1 && n <= 200) {
        db.settings.maxListingsPerUser = Math.round(n);
      }
    }
    if (Array.isArray(body.blockedKeywords)) {
      db.settings.blockedKeywords = body.blockedKeywords
        .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
        .map((s) => s.trim().toLowerCase().slice(0, 40))
        .slice(0, 50);
    }

    recordAuditLog(db, {
      actorId: actor.id,
      actorEmail: actor.email,
      action: 'UPDATE_PLATFORM_SETTINGS',
      targetType: 'settings',
      targetId: 'platform',
      targetLabel: 'Platforma Ayarları',
    });

    saveDb(db);
    res.json({ settings: db.settings });
  });

  // =========================================================================
  // DELEGATED ACCESS & RƏŞİD PERSONAL PANEL MANAGEMENT (ADMIN & MODERATOR)
  // =========================================================================

  app.get('/api/access/operators', requireAccessManager, (_req: AuthenticatedRequest, res: Response) => {
    const db = getDb();
    let reshid = db.operators.find((o) => o.isReshid || o.id === 'op_reshid');
    if (!reshid) {
      reshid = createDefaultReshidOperator();
      db.operators.unshift(reshid);
      saveDb(db);
    }
    const others = db.operators.filter((o) => o.id !== reshid!.id);
    const admins = db.users
      .filter((u) => u.role === 'super_admin' || u.role === 'admin' || u.role === 'moderator')
      .map((u) => toPublicUser(u));

    res.json({
      reshid: toPublicOperator(reshid),
      operators: others.map(toPublicOperator),
      admins,
      preassignedRoles: db.preassignedRoles,
      ownerEmail: OWNER_EMAIL,
    });
  });

  app.put('/api/access/reshid', requireAccessManager, (req: AuthenticatedRequest, res: Response) => {
    const actor = req.accessActor!;
    const db = getDb();
    let reshid = db.operators.find((o) => o.isReshid || o.id === 'op_reshid');
    if (!reshid) {
      reshid = createDefaultReshidOperator();
      db.operators.unshift(reshid);
    }

    const body = req.body as {
      displayName?: string;
      email?: string;
      passcode?: string;
      clearPasscode?: boolean;
      allowAdminPanel?: boolean;
      allowModeratorPanel?: boolean;
      active?: boolean;
      permissions?: AdminPermissions;
    };

    if (typeof body.displayName === 'string' && body.displayName.trim().length >= 2) {
      reshid.displayName = body.displayName.trim().slice(0, 50);
    }

    if (body.email !== undefined) {
      const trimmedEmail = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
      if (trimmedEmail === '') {
        reshid.email = '';
      } else {
        const normalized = normalizeGmail(trimmedEmail);
        if (!normalized) {
          res.status(400).json({ error: 'Zəhmət olmasa Rəşid üçün etibarlı @gmail.com ünvanı yazın.' });
          return;
        }
        if (isOwnerEmail(normalized)) {
          res.status(400).json({ error: 'Baş Admin Gmail ünvanı əlavə operator kimi təyin edilə bilməz.' });
          return;
        }
        if (db.operators.some((o) => o.id !== reshid!.id && o.email && o.email.toLowerCase() === normalized)) {
          res.status(409).json({ error: 'Bu Gmail ünvanı artıq başqa icazəli şəxsə bağlıdır.' });
          return;
        }
        reshid.email = normalized;
      }
    }

    if (body.clearPasscode) {
      reshid.passcodeHash = null;
      reshid.sessionVersion += 1;
    } else if (typeof body.passcode === 'string' && body.passcode.trim().length > 0) {
      const cleanCode = body.passcode.trim();
      if (cleanCode.length < 2 || cleanCode.length > 100) {
        res.status(400).json({ error: 'Rəşidin şəxsi parolu ən azı 2 simvoldan ibarət olmalıdır.' });
        return;
      }
      if (verifyAdminPasscode(cleanCode) || verifyModeratorPasscode(cleanCode)) {
        res.status(400).json({ error: 'Rəşidin şəxsi parolu əsas panel parolundan fərqli olmalıdır.' });
        return;
      }
      if (
        db.operators.some(
          (o) => o.id !== reshid!.id && o.passcodeHash && verifyPassword(cleanCode, o.passcodeHash)
        )
      ) {
        res.status(409).json({ error: 'Bu şəxsi parol artıq başqa operatora təyin edilib.' });
        return;
      }
      reshid.passcodeHash = hashPassword(cleanCode);
      reshid.sessionVersion += 1;
    }

    if (typeof body.allowAdminPanel === 'boolean') {
      reshid.allowAdminPanel = body.allowAdminPanel;
    }
    if (typeof body.allowModeratorPanel === 'boolean') {
      reshid.allowModeratorPanel = body.allowModeratorPanel;
    }
    if (typeof body.active === 'boolean') {
      if (!body.active && reshid.active) {
        reshid.sessionVersion += 1;
      }
      reshid.active = body.active;
    }
    if (body.permissions) {
      reshid.permissions = sanitizePermissions(body.permissions, reshid.permissions);
    }

    reshid.updatedAt = new Date().toISOString();
    reshid.assignedBy = actor.email;

    if (reshid.email) {
      const matchedUser = db.users.find((u) => u.email.toLowerCase() === reshid!.email);
      if (matchedUser && matchedUser.role !== 'super_admin') {
        if (reshid.active && (reshid.allowAdminPanel || reshid.allowModeratorPanel)) {
          matchedUser.role = reshid.allowAdminPanel ? 'admin' : 'moderator';
          matchedUser.permissions = { ...reshid.permissions };
          matchedUser.verifiedSeller = true;
        } else {
          matchedUser.role = 'user';
          matchedUser.permissions = { ...NO_ADMIN_PERMISSIONS };
        }
      }
    }

    recordAuditLog(db, {
      actorId: actor.id,
      actorEmail: actor.email,
      action: 'UPDATE_RESHID_ACCESS',
      targetType: 'role',
      targetId: reshid.id,
      targetLabel: `${reshid.displayName} (Admin: ${reshid.allowAdminPanel ? 'Açıq' : 'Bağlı'}, Mod: ${reshid.allowModeratorPanel ? 'Açıq' : 'Bağlı'})`,
    });
    saveDb(db);
    res.json({ reshid: toPublicOperator(reshid) });
  });

  app.post('/api/access/operators', requireAccessManager, (req: AuthenticatedRequest, res: Response) => {
    const actor = req.accessActor!;
    const db = getDb();
    const body = req.body as {
      displayName?: string;
      email?: string;
      passcode?: string;
      allowAdminPanel?: boolean;
      allowModeratorPanel?: boolean;
      permissions?: AdminPermissions;
    };

    const displayName = typeof body.displayName === 'string' && body.displayName.trim().length >= 2
      ? body.displayName.trim().slice(0, 60)
      : '';
    if (!displayName) {
      res.status(400).json({ error: 'Şəxsin adını daxil edin (ən azı 2 hərf).' });
      return;
    }

    const rawEmail = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    const rawCode = typeof body.passcode === 'string' ? body.passcode.trim() : '';

    if (!rawEmail && !rawCode) {
      res.status(400).json({ error: 'Ən azı bir giriş üsulu (Gmail və ya şəxsi parol) təyin edilməlidir.' });
      return;
    }

    let cleanEmail = '';
    if (rawEmail) {
      const normalized = normalizeGmail(rawEmail);
      if (!normalized) {
        res.status(400).json({ error: 'Etibarlı @gmail.com ünvanı daxil edin.' });
        return;
      }
      if (isOwnerEmail(normalized)) {
        res.status(400).json({ error: 'Baş Admin Gmail ünvanı əlavə operator kimi əlavə edilə bilməz.' });
        return;
      }
      if (db.operators.some((o) => o.email && o.email.toLowerCase() === normalized)) {
        res.status(409).json({ error: 'Bu Gmail ünvanı artıq icazə siyahısında mövcuddur.' });
        return;
      }
      cleanEmail = normalized;
    }

    let passcodeHash: string | null = null;
    if (rawCode) {
      if (rawCode.length < 2 || rawCode.length > 100) {
        res.status(400).json({ error: 'Şəxsi parol ən azı 2 simvoldan ibarət olmalıdır.' });
        return;
      }
      if (verifyAdminPasscode(rawCode) || verifyModeratorPasscode(rawCode)) {
        res.status(400).json({ error: 'Şəxsi parol əsas master paroldan fərqli olmalıdır.' });
        return;
      }
      if (db.operators.some((o) => o.passcodeHash && verifyPassword(rawCode, o.passcodeHash))) {
        res.status(409).json({ error: 'Bu şəxsi parol artıq başqa icazəli şəxsə təyin edilib.' });
        return;
      }
      passcodeHash = hashPassword(rawCode);
    }

    const allowAdminPanel = Boolean(body.allowAdminPanel);
    const allowModeratorPanel = Boolean(body.allowModeratorPanel);
    if (!allowAdminPanel && !allowModeratorPanel) {
      res.status(400).json({ error: 'Ən azı bir panel (Admin Panel və ya Moderator Panel) seçilməlidir.' });
      return;
    }

    const basePerms = allowAdminPanel ? FULL_ADMIN_PERMISSIONS : MODERATOR_PERMISSIONS;
    const nowIso = new Date().toISOString();
    const newOp: StoredOperator = {
      id: `op_${crypto.randomBytes(6).toString('hex')}`,
      isReshid: false,
      displayName,
      email: cleanEmail,
      passcodeHash,
      allowAdminPanel,
      allowModeratorPanel,
      permissions: sanitizePermissions(body.permissions, basePerms),
      active: true,
      sessionVersion: 1,
      assignedBy: actor.email,
      createdAt: nowIso,
      updatedAt: nowIso,
    };

    db.operators.unshift(newOp);

    if (cleanEmail) {
      const matchedUser = db.users.find((u) => u.email.toLowerCase() === cleanEmail);
      if (matchedUser && matchedUser.role !== 'super_admin') {
        matchedUser.role = allowAdminPanel ? 'admin' : 'moderator';
        matchedUser.permissions = { ...newOp.permissions };
        matchedUser.verifiedSeller = true;
      }
    }

    recordAuditLog(db, {
      actorId: actor.id,
      actorEmail: actor.email,
      action: 'ADD_DELEGATED_OPERATOR',
      targetType: 'role',
      targetId: newOp.id,
      targetLabel: `${newOp.displayName}${newOp.email ? ` (${newOp.email})` : ''} -> Admin:${allowAdminPanel ? '✓' : '✗'} Mod:${allowModeratorPanel ? '✓' : '✗'}`,
    });
    saveDb(db);
    res.status(201).json({ operator: toPublicOperator(newOp) });
  });

  app.patch('/api/access/operators/:id', requireAccessManager, (req: AuthenticatedRequest, res: Response) => {
    const actor = req.accessActor!;
    const db = getDb();
    const op = db.operators.find((o) => o.id === req.params.id);
    if (!op) {
      res.status(404).json({ error: 'İcazəli şəxs tapılmadı.' });
      return;
    }

    const body = req.body as {
      displayName?: string;
      email?: string;
      passcode?: string;
      clearPasscode?: boolean;
      allowAdminPanel?: boolean;
      allowModeratorPanel?: boolean;
      active?: boolean;
      permissions?: AdminPermissions;
    };

    if (typeof body.displayName === 'string' && body.displayName.trim().length >= 2) {
      op.displayName = body.displayName.trim().slice(0, 60);
    }

    if (body.email !== undefined) {
      const trimmedEmail = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
      if (trimmedEmail === '') {
        op.email = '';
      } else {
        const normalized = normalizeGmail(trimmedEmail);
        if (!normalized) {
          res.status(400).json({ error: 'Etibarlı @gmail.com ünvanı daxil edin.' });
          return;
        }
        if (isOwnerEmail(normalized)) {
          res.status(400).json({ error: 'Baş Admin Gmail ünvanı operator kimi təyin edilə bilməz.' });
          return;
        }
        if (db.operators.some((o) => o.id !== op.id && o.email && o.email.toLowerCase() === normalized)) {
          res.status(409).json({ error: 'Bu Gmail ünvanı artıq başqa operatora bağlıdır.' });
          return;
        }
        op.email = normalized;
      }
    }

    if (body.clearPasscode) {
      op.passcodeHash = null;
      op.sessionVersion += 1;
    } else if (typeof body.passcode === 'string' && body.passcode.trim().length > 0) {
      const cleanCode = body.passcode.trim();
      if (cleanCode.length < 2 || cleanCode.length > 100) {
        res.status(400).json({ error: 'Şəxsi parol ən azı 2 simvoldan ibarət olmalıdır.' });
        return;
      }
      if (verifyAdminPasscode(cleanCode) || verifyModeratorPasscode(cleanCode)) {
        res.status(400).json({ error: 'Şəxsi parol əsas master paroldan fərqli olmalıdır.' });
        return;
      }
      if (db.operators.some((o) => o.id !== op.id && o.passcodeHash && verifyPassword(cleanCode, o.passcodeHash))) {
        res.status(409).json({ error: 'Bu şəxsi parol artıq başqa operatora təyin edilib.' });
        return;
      }
      op.passcodeHash = hashPassword(cleanCode);
      op.sessionVersion += 1;
    }

    if (typeof body.allowAdminPanel === 'boolean') op.allowAdminPanel = body.allowAdminPanel;
    if (typeof body.allowModeratorPanel === 'boolean') op.allowModeratorPanel = body.allowModeratorPanel;
    if (typeof body.active === 'boolean') {
      if (!body.active && op.active) {
        op.sessionVersion += 1;
      }
      op.active = body.active;
    }
    if (body.permissions) {
      op.permissions = sanitizePermissions(body.permissions, op.permissions);
    }
    op.updatedAt = new Date().toISOString();

    if (op.email) {
      const matchedUser = db.users.find((u) => u.email.toLowerCase() === op.email);
      if (matchedUser && matchedUser.role !== 'super_admin') {
        if (op.active && (op.allowAdminPanel || op.allowModeratorPanel)) {
          matchedUser.role = op.allowAdminPanel ? 'admin' : 'moderator';
          matchedUser.permissions = { ...op.permissions };
          matchedUser.verifiedSeller = true;
        } else {
          matchedUser.role = 'user';
          matchedUser.permissions = { ...NO_ADMIN_PERMISSIONS };
        }
      }
    }

    recordAuditLog(db, {
      actorId: actor.id,
      actorEmail: actor.email,
      action: 'UPDATE_DELEGATED_OPERATOR',
      targetType: 'role',
      targetId: op.id,
      targetLabel: `${op.displayName} (Aktiv:${op.active ? 'Bəli' : 'Xeyr'}, Admin:${op.allowAdminPanel ? '✓' : '✗'}, Mod:${op.allowModeratorPanel ? '✓' : '✗'})`,
    });
    saveDb(db);
    res.json({ operator: toPublicOperator(op) });
  });

  app.delete('/api/access/operators/:id', requireAccessManager, (req: AuthenticatedRequest, res: Response) => {
    const actor = req.accessActor!;
    const db = getDb();
    const idx = db.operators.findIndex((o) => o.id === req.params.id);
    if (idx === -1) {
      res.status(404).json({ error: 'İcazəli şəxs tapılmadı.' });
      return;
    }
    const op = db.operators[idx];
    if (op.isReshid || op.id === 'op_reshid') {
      res.status(400).json({ error: 'Rəşid xüsusi operator kartını silmək olmaz, onu deaktiv edə bilərsiniz.' });
      return;
    }
    db.operators.splice(idx, 1);

    if (op.email) {
      const matchedUser = db.users.find((u) => u.email.toLowerCase() === op.email);
      if (matchedUser && matchedUser.role !== 'super_admin') {
        matchedUser.role = 'user';
        matchedUser.permissions = { ...NO_ADMIN_PERMISSIONS };
      }
    }

    recordAuditLog(db, {
      actorId: actor.id,
      actorEmail: actor.email,
      action: 'REMOVE_DELEGATED_OPERATOR',
      targetType: 'role',
      targetId: op.id,
      targetLabel: `${op.displayName}${op.email ? ` (${op.email})` : ''}`,
    });
    saveDb(db);
    res.json({ ok: true });
  });

  // =========================================================================
  // DANGEROUS MODERATOR PANEL ROUTES (PASSCODE OR AUTHORIZED GMAIL / RƏŞİD)
  // =========================================================================

  app.get('/api/moderator/auth/status', (req: Request, res: Response) => {
    const resolved = resolveModeratorPanelActor(req);
    res.json({
      unlocked: Boolean(resolved.actor),
      actor: resolved.actor ?? null,
      usingEnvOverride: isModPasscodeEnvOverride(),
    });
  });

  app.post('/api/moderator/auth/unlock', (req: Request, res: Response) => {
    const { passcode } = req.body as { passcode?: string };
    const match = typeof passcode === 'string' ? matchModeratorUnlockPasscode(passcode) : { matched: false as const };
    if (!match.matched) {
      res.status(401).json({ error: 'Moderator parolu yanlışdır.' });
      return;
    }

    const db = getDb();
    if (!match.master) {
      const op = match.operator;
      if (!op.allowModeratorPanel) {
        res.status(403).json({
          error: `${op.displayName} üçün Moderator Panel icazəsi bağlıdır. Yalnız Admin Panel aktivdir.`,
        });
        return;
      }

      const modToken = createModSessionToken(db.moderatorSessionVersion, op);
      setModSessionCookie(res, req, modToken);

      let adminToken: string | undefined;
      if (op.allowAdminPanel) {
        adminToken = createAdminSessionToken(db.adminSessionVersion, op);
        setAdminSessionCookie(res, req, adminToken);
      }

      const actor = {
        id: op.id,
        name: op.displayName,
        email: op.email || `${op.displayName} (Şəxsi Parol)`,
        role: 'moderator' as const,
        isReshid: op.isReshid,
        isMasterPasscode: false,
        isOwner: false,
        canManageAccess: false,
        allowAdminPanel: op.allowAdminPanel,
        allowModeratorPanel: op.allowModeratorPanel,
        permissions: { ...op.permissions },
        authMethod: 'operator_passcode' as const,
      };

      recordAuditLog(db, {
        actorId: op.id,
        actorEmail: actor.email,
        action: op.isReshid ? 'RESHID_MODERATOR_UNLOCKED' : 'OPERATOR_MODERATOR_UNLOCKED',
        targetType: 'moderator',
        targetId: 'moderator_panel',
        targetLabel: `${op.displayName} şəxsi parol ilə Moderator Paneli açdı`,
      });
      saveDb(db);

      res.json({
        ok: true,
        modToken,
        ...(adminToken ? { adminToken } : {}),
        actor,
        usingEnvOverride: isModPasscodeEnvOverride(),
      });
      return;
    }

    const modToken = createModSessionToken(db.moderatorSessionVersion);
    setModSessionCookie(res, req, modToken);

    const masterActor = {
      id: 'moderator_passcode',
      name: 'Baş Moderator',
      email: 'Moderator (Parol Sessiyası)',
      role: 'super_admin' as const,
      isReshid: false,
      isMasterPasscode: true,
      isOwner: false,
      canManageAccess: true,
      allowAdminPanel: true,
      allowModeratorPanel: true,
      permissions: { ...FULL_ADMIN_PERMISSIONS },
      authMethod: 'master_passcode' as const,
    };

    recordAuditLog(db, {
      actorId: 'moderator_passcode',
      actorEmail: 'Moderator (Parol Sessiyası)',
      action: 'MODERATOR_PANEL_UNLOCKED',
      targetType: 'moderator',
      targetId: 'moderator_panel',
      targetLabel: 'Moderator Panel parol ilə açıldı',
    });
    saveDb(db);

    res.json({
      ok: true,
      modToken,
      actor: masterActor,
      usingEnvOverride: isModPasscodeEnvOverride(),
    });
  });

  app.post('/api/moderator/auth/lock', (req: Request, res: Response) => {
    clearModSessionCookie(res, req);
    res.json({ ok: true });
  });

  app.post('/api/moderator/auth/change-passcode', requireModeratorAccess, (req: AuthenticatedRequest, res: Response) => {
    const actor = req.modActor!;
    if (!actor.isMasterPasscode && !actor.isOwner && !actor.canManageAccess) {
      res.status(403).json({ error: 'Əsas Moderator parolunu yalnız Baş Admin dəyişə bilər.' });
      return;
    }
    if (isModPasscodeEnvOverride()) {
      res.status(400).json({ error: 'Moderator parolu serverin MODERATOR_PASSCODE mühit dəyişəni ilə idarə olunur.' });
      return;
    }
    const { currentPasscode, newPasscode } = req.body as {
      currentPasscode?: string;
      newPasscode?: string;
    };
    if (typeof currentPasscode !== 'string' || !verifyModeratorPasscode(currentPasscode)) {
      res.status(401).json({ error: 'Hazırkı moderator parolu yanlışdır.' });
      return;
    }
    if (typeof newPasscode !== 'string' || newPasscode.length < 2 || newPasscode.length > 100) {
      res.status(400).json({ error: 'Yeni parol ən azı 2 simvoldan ibarət olmalıdır.' });
      return;
    }

    const db = getDb();
    db.moderatorPasscodeHash = hashPassword(newPasscode);
    db.moderatorSessionVersion += 1;

    const modToken = createModSessionToken(db.moderatorSessionVersion);
    setModSessionCookie(res, req, modToken);

    recordAuditLog(db, {
      actorId: actor.id,
      actorEmail: actor.email,
      action: 'CHANGE_MODERATOR_PASSCODE',
      targetType: 'moderator',
      targetId: 'moderator_panel',
      targetLabel: 'Moderator parolu yeniləndi',
    });
    saveDb(db);
    res.json({ ok: true, modToken });
  });

  app.get('/api/moderator/users', requireModeratorAccess, (_req: AuthenticatedRequest, res: Response) => {
    const db = getDb();
    for (const u of db.users) {
      evaluateUserModerationState(u);
    }
    const countMap = new Map<string, number>();
    for (const l of db.listings) {
      countMap.set(l.sellerId, (countMap.get(l.sellerId) ?? 0) + 1);
    }
    res.json({ users: db.users.map((u) => toPublicUser(u, countMap.get(u.id) ?? 0)) });
  });

  app.delete('/api/moderator/listings/:id', requireModeratorAccess, (req: AuthenticatedRequest, res: Response) => {
    const actor = req.modActor!;
    const db = getDb();
    const idx = db.listings.findIndex((l) => l.id === req.params.id);
    if (idx === -1) {
      res.status(404).json({ error: 'Elan tapılmadı.' });
      return;
    }
    const listing = db.listings[idx];
    db.listings.splice(idx, 1);
    recordAuditLog(db, {
      actorId: actor.id,
      actorEmail: actor.email,
      action: 'MOD_DELETE_LISTING',
      targetType: 'moderator',
      targetId: listing.id,
      targetLabel: listing.title,
    });
    saveDb(db);
    res.json({ ok: true });
  });

  app.post('/api/moderator/users/:id/kick', requireModeratorAccess, (req: AuthenticatedRequest, res: Response) => {
    const actor = req.modActor!;
    const db = getDb();
    const target = db.users.find((u) => u.id === req.params.id);
    if (!target) {
      res.status(404).json({ error: 'İstifadəçi tapılmadı.' });
      return;
    }
    if (target.role === 'super_admin' || isOwnerEmail(target.email)) {
      res.status(403).json({ error: 'Baş Admin hesabını kick etmək mümkün deyil.' });
      return;
    }
    if ((target.role === 'admin' || target.role === 'moderator') && !isOwnerEmail(actor.email)) {
      res.status(403).json({ error: 'Admin və moderatorları yalnız Baş Admin kick edə bilər.' });
      return;
    }

    const { reason, minutes } = req.body as { reason?: string; minutes?: number };
    const cooldownMin = typeof minutes === 'number' && minutes > 0 ? Math.min(1440, Math.round(minutes)) : 60;
    target.status = 'kicked';
    target.kickReason = typeof reason === 'string' && reason.trim()
      ? reason.trim().slice(0, 300)
      : `Sessiyanız moderator tərəfindən sonlandırıldı (${cooldownMin} dəq gözləmə).`;
    target.kickedUntil = new Date(Date.now() + cooldownMin * 60 * 1000).toISOString();
    target.sessionVersion += 1;

    recordAuditLog(db, {
      actorId: actor.id,
      actorEmail: actor.email,
      action: 'MOD_KICK_USER',
      targetType: 'moderator',
      targetId: target.id,
      targetLabel: `${target.name} (${target.email})`,
      reason: target.kickReason,
    });
    saveDb(db);
    res.json({ user: toPublicUser(target) });
  });

  app.post('/api/moderator/users/:id/ban', requireModeratorAccess, (req: AuthenticatedRequest, res: Response) => {
    const actor = req.modActor!;
    const db = getDb();
    const target = db.users.find((u) => u.id === req.params.id);
    if (!target) {
      res.status(404).json({ error: 'İstifadəçi tapılmadı.' });
      return;
    }
    if (target.role === 'super_admin' || isOwnerEmail(target.email)) {
      res.status(403).json({ error: 'Baş Admin hesabını ban etmək mümkün deyil.' });
      return;
    }
    if ((target.role === 'admin' || target.role === 'moderator') && !isOwnerEmail(actor.email)) {
      res.status(403).json({ error: 'Admin və moderatorları yalnız Baş Admin ban edə bilər.' });
      return;
    }

    const { reason, durationDays, hideListings } = req.body as {
      reason?: string;
      durationDays?: number | null;
      hideListings?: boolean;
    };
    const days = typeof durationDays === 'number' && durationDays > 0 ? Math.min(3650, durationDays) : null;
    const untilIso = days ? new Date(Date.now() + days * 24 * 3600 * 1000).toISOString() : null;
    const finalReason = typeof reason === 'string' && reason.trim()
      ? reason.trim().slice(0, 300)
      : 'Moderator tərəfindən bloklandı.';

    target.status = 'banned';
    target.banReason = finalReason;
    target.bannedUntil = untilIso;
    target.kickReason = undefined;
    target.kickedUntil = null;
    target.sessionVersion += 1;

    if (hideListings !== false) {
      for (const l of db.listings) {
        if (l.sellerId === target.id && (l.status === 'active' || l.status === 'pending')) {
          l.status = 'rejected';
          l.rejectionReason = `Satıcı bloklandığı üçün elan dayandırıldı: ${finalReason}`;
          l.updatedAt = new Date().toISOString();
        }
      }
    }

    recordAuditLog(db, {
      actorId: actor.id,
      actorEmail: actor.email,
      action: 'MOD_BAN_USER',
      targetType: 'moderator',
      targetId: target.id,
      targetLabel: `${target.name} (${target.email})`,
      reason: finalReason,
    });
    saveDb(db);
    res.json({ user: toPublicUser(target) });
  });

  app.post('/api/moderator/users/:id/unban', requireModeratorAccess, (req: AuthenticatedRequest, res: Response) => {
    const actor = req.modActor!;
    const db = getDb();
    const target = db.users.find((u) => u.id === req.params.id);
    if (!target) {
      res.status(404).json({ error: 'İstifadəçi tapılmadı.' });
      return;
    }
    target.status = 'active';
    target.banReason = undefined;
    target.bannedUntil = null;
    target.kickReason = undefined;
    target.kickedUntil = null;

    recordAuditLog(db, {
      actorId: actor.id,
      actorEmail: actor.email,
      action: 'MOD_UNBAN_USER',
      targetType: 'moderator',
      targetId: target.id,
      targetLabel: `${target.name} (${target.email})`,
    });
    saveDb(db);
    res.json({ user: toPublicUser(target) });
  });

  app.get('/api/moderator/radar', requireModeratorAccess, (_req: AuthenticatedRequest, res: Response) => {
    const db = getDb();
    const userById = new Map(db.users.map((u) => [u.id, u]));
    const openReportsByListing = new Map<string, number>();
    const listingsCountByUser = new Map<string, number>();

    for (const r of db.reports) {
      if (r.status === 'open') {
        openReportsByListing.set(r.listingId, (openReportsByListing.get(r.listingId) ?? 0) + 1);
      }
    }
    for (const l of db.listings) {
      listingsCountByUser.set(l.sellerId, (listingsCountByUser.get(l.sellerId) ?? 0) + 1);
    }

    const flaggedListings: RiskFlaggedListing[] = [];
    for (const listing of db.listings) {
      const reasons: string[] = [];
      let riskScore = 0;

      const text = `${listing.title} ${listing.description}`.toLowerCase();
      const matchedKeywords = db.settings.blockedKeywords.filter(
        (kw) => kw.trim().length > 0 && text.includes(kw.trim().toLowerCase())
      );
      if (matchedKeywords.length > 0) {
        riskScore += 45;
        reasons.push(`Qadağan edilmiş sözlər: ${matchedKeywords.join(', ')}`);
      }

      if (
        ['apple', 'samsung', 'google'].includes(listing.brand.toLowerCase()) &&
        listing.price < 300 &&
        listing.status !== 'sold'
      ) {
        riskScore += 35;
        reasons.push(`Şübhəli aşağı qiymət (${listing.price} AZN)`);
      }

      const openReports = openReportsByListing.get(listing.id) ?? 0;
      if (openReports > 0) {
        riskScore += 30 * openReports;
        reasons.push(`${openReports} açıq şikayət var`);
      }

      const seller = userById.get(listing.sellerId);
      if (seller) {
        if (seller.warningsCount > 0) {
          riskScore += 15 * seller.warningsCount;
          reasons.push(`Satıcıda ${seller.warningsCount} xəbərdarlıq var`);
        }
        if (seller.isShadowbanned) {
          riskScore += 25;
          reasons.push('Satıcı Shadowban altındadır');
        }
        if (!seller.verifiedSeller && (listingsCountByUser.get(seller.id) ?? 0) >= 3) {
          riskScore += 15;
          reasons.push('Təsdiqsiz satıcı (çoxsaylı elan)');
        }
      }

      if (!listing.imeiVerified) {
        riskScore += 10;
        reasons.push('IMEI təsdiqi yoxdur');
      }

      if (riskScore > 0) {
        flaggedListings.push({
          listing,
          reasons,
          riskScore: Math.min(100, riskScore),
        });
      }
    }

    flaggedListings.sort((a, b) => b.riskScore - a.riskScore);

    const moderatorLogs = db.auditLogs
      .filter((log) => log.targetType === 'moderator' || log.action.includes('BAN') || log.action.includes('KICK'))
      .slice(0, 40);

    res.json({
      flaggedListings,
      blacklistedEmails: db.blacklistedEmails,
      shadowbannedUsers: db.users.filter((u) => u.isShadowbanned).map((u) => toPublicUser(u)),
      moderatorLogs,
      usingEnvOverride: isModPasscodeEnvOverride(),
      stats: {
        pendingCount: db.listings.filter((l) => l.status === 'pending').length,
        openReportsCount: db.reports.filter((r) => r.status === 'open').length,
        shadowbannedCount: db.users.filter((u) => u.isShadowbanned).length,
        blacklistedCount: db.blacklistedEmails.length,
        mutedCount: db.users.filter((u) => !u.canPostListings).length,
        bannedCount: db.users.filter((u) => u.status === 'banned').length,
        maintenanceMode: db.settings.maintenanceMode,
        totalListings: db.listings.length,
        totalUsers: db.users.length,
      },
    });
  });

  app.post('/api/moderator/users/:id/shadowban', requireModeratorAccess, (req: AuthenticatedRequest, res: Response) => {
    const actor = req.modActor!;
    const db = getDb();
    const target = db.users.find((u) => u.id === req.params.id);

    if (!target) {
      res.status(404).json({ error: 'İstifadəçi tapılmadı.' });
      return;
    }
    if (target.role === 'super_admin' || isOwnerEmail(target.email)) {
      res.status(403).json({ error: 'Baş Admin hesabına Shadowban tətbiq edilə bilməz.' });
      return;
    }
    if (target.id === actor.id) {
      res.status(400).json({ error: 'Öz hesabınıza Shadowban tətbiq edə bilməzsiniz.' });
      return;
    }

    target.isShadowbanned = !target.isShadowbanned;
    recordAuditLog(db, {
      actorId: actor.id,
      actorEmail: actor.email,
      action: target.isShadowbanned ? 'SHADOWBAN_USER' : 'UNSHADOWBAN_USER',
      targetType: 'moderator',
      targetId: target.id,
      targetLabel: `${target.name} (${target.email})`,
      reason: target.isShadowbanned
        ? 'Bütün elanları alıcılardan gizlədildi (Kölgə Blok)'
        : 'Shadowban ləğv edildi',
    });
    saveDb(db);
    res.json({ user: toPublicUser(target) });
  });

  app.post('/api/moderator/users/:id/nuke', requireModeratorAccess, (req: AuthenticatedRequest, res: Response) => {
    const actor = req.modActor!;
    const db = getDb();
    const target = db.users.find((u) => u.id === req.params.id);

    if (!target) {
      res.status(404).json({ error: 'İstifadəçi tapılmadı.' });
      return;
    }
    if (target.role === 'super_admin' || isOwnerEmail(target.email)) {
      res.status(403).json({ error: 'Baş Admin hesabı silinə və ya məhv edilə bilməz.' });
      return;
    }
    if ((target.role === 'admin' || target.role === 'moderator') && !isOwnerEmail(actor.email)) {
      res.status(403).json({ error: 'Admin və moderatorları yalnız Baş Admin məhv edə bilər.' });
      return;
    }
    if (target.id === actor.id) {
      res.status(400).json({ error: 'Öz hesabınızı məhv edə bilməzsiniz.' });
      return;
    }

    const { deleteAccount, blacklistEmail, reason } = req.body as {
      deleteAccount?: boolean;
      blacklistEmail?: boolean;
      reason?: string;
    };
    const finalReason = typeof reason === 'string' && reason.trim()
      ? reason.trim().slice(0, 300)
      : 'Moderator tərəfindən ağır qayda pozuntusu səbəbindən tam məhv edildi.';

    const beforeListings = db.listings.length;
    db.listings = db.listings.filter((l) => l.sellerId !== target.id);
    const deletedListingsCount = beforeListings - db.listings.length;

    if (blacklistEmail && !db.blacklistedEmails.includes(target.email.toLowerCase())) {
      db.blacklistedEmails.unshift(target.email.toLowerCase());
    }

    if (deleteAccount) {
      db.users = db.users.filter((u) => u.id !== target.id);
      delete db.favorites[target.id];
    } else {
      target.status = 'banned';
      target.banReason = finalReason;
      target.bannedUntil = null;
      target.canPostListings = false;
      target.isShadowbanned = true;
      target.sessionVersion += 1;
    }

    recordAuditLog(db, {
      actorId: actor.id,
      actorEmail: actor.email,
      action: deleteAccount ? 'NUKE_AND_DELETE_USER' : 'NUKE_PERMABAN_USER',
      targetType: 'moderator',
      targetId: target.id,
      targetLabel: `${target.name} (${target.email})`,
      reason: `${finalReason} (${deletedListingsCount} elan tam silindi${blacklistEmail ? ', Gmail Qara Siyahıya salındı' : ''})`,
    });
    saveDb(db);
    res.json({ ok: true, deletedListingsCount });
  });

  app.post('/api/moderator/listings/keyword-sweep', requireModeratorAccess, (req: AuthenticatedRequest, res: Response) => {
    const actor = req.modActor!;
    const db = getDb();
    const { keyword, mode } = req.body as {
      keyword?: string;
      mode?: 'delete' | 'reject_and_mute';
    };

    const targetKeywords = typeof keyword === 'string' && keyword.trim().length > 0
      ? [keyword.trim().toLowerCase()]
      : db.settings.blockedKeywords.map((k) => k.trim().toLowerCase()).filter(Boolean);

    if (targetKeywords.length === 0) {
      res.status(400).json({ error: 'Axtarış üçün açar söz daxil edin.' });
      return;
    }

    const matchingIds = new Set<string>();
    const sellerIds = new Set<string>();
    for (const l of db.listings) {
      const haystack = `${l.title} ${l.description} ${l.model}`.toLowerCase();
      if (targetKeywords.some((kw) => haystack.includes(kw))) {
        matchingIds.add(l.id);
        sellerIds.add(l.sellerId);
      }
    }

    if (matchingIds.size === 0) {
      res.json({ affectedListings: 0, mutedSellers: 0 });
      return;
    }

    let mutedSellers = 0;
    if (mode === 'delete') {
      db.listings = db.listings.filter((l) => !matchingIds.has(l.id));
    } else {
      const nowIso = new Date().toISOString();
      for (const l of db.listings) {
        if (matchingIds.has(l.id)) {
          l.status = 'rejected';
          l.rejectionReason = 'Zərərli/qadağan edilmiş açar söz aşkarlandığı üçün moderator tərəfindən ləğv edildi.';
          l.updatedAt = nowIso;
        }
      }
      for (const u of db.users) {
        if (sellerIds.has(u.id) && u.role === 'user') {
          u.canPostListings = false;
          u.warningsCount += 1;
          u.lastWarning = 'Qadağan edilmiş açar sözlərə görə elan yerləşdirmə hüququ dayandırıldı.';
          mutedSellers++;
        }
      }
    }

    recordAuditLog(db, {
      actorId: actor.id,
      actorEmail: actor.email,
      action: mode === 'delete' ? 'KEYWORD_SWEEP_DELETE' : 'KEYWORD_SWEEP_MUTE',
      targetType: 'moderator',
      targetId: targetKeywords.join(','),
      targetLabel: `${matchingIds.size} elan təmizləndi (${targetKeywords.join(', ')})`,
    });
    saveDb(db);
    res.json({ affectedListings: matchingIds.size, mutedSellers });
  });

  app.post('/api/moderator/blacklist', requireModeratorAccess, (req: AuthenticatedRequest, res: Response) => {
    const actor = req.modActor!;
    const db = getDb();
    const { email: rawEmail, purgeListings, reason } = req.body as {
      email?: string;
      purgeListings?: boolean;
      reason?: string;
    };

    const email = normalizeGmail(rawEmail ?? '');
    if (!email) {
      res.status(400).json({ error: 'Yalnız düzgün @gmail.com ünvanı Qara Siyahıya əlavə edilə bilər.' });
      return;
    }
    if (isOwnerEmail(email)) {
      res.status(403).json({ error: 'Baş Admin Gmail ünvanı Qara Siyahıya salına bilməz!' });
      return;
    }

    if (!db.blacklistedEmails.includes(email)) {
      db.blacklistedEmails.unshift(email);
    }

    const existing = db.users.find((u) => u.email === email);
    let purgedCount = 0;
    if (existing) {
      if (existing.role !== 'super_admin') {
        existing.status = 'banned';
        existing.banReason = typeof reason === 'string' && reason.trim()
          ? reason.trim().slice(0, 300)
          : 'Qara Siyahıya salındı.';
        existing.bannedUntil = null;
        existing.sessionVersion += 1;
      }
      if (purgeListings) {
        const before = db.listings.length;
        db.listings = db.listings.filter((l) => l.sellerId !== existing.id);
        purgedCount = before - db.listings.length;
      }
    }

    recordAuditLog(db, {
      actorId: actor.id,
      actorEmail: actor.email,
      action: 'BLACKLIST_EMAIL',
      targetType: 'moderator',
      targetId: email,
      targetLabel: email,
      reason: `${reason || 'Qara siyahıya əlavə edildi'}${purgedCount > 0 ? ` (${purgedCount} elan silindi)` : ''}`,
    });
    saveDb(db);
    res.json({ blacklistedEmails: db.blacklistedEmails, purgedCount });
  });

  app.delete('/api/moderator/blacklist/:email', requireModeratorAccess, (req: AuthenticatedRequest, res: Response) => {
    const actor = req.modActor!;
    const db = getDb();
    const email = decodeURIComponent(req.params.email).trim().toLowerCase();
    db.blacklistedEmails = db.blacklistedEmails.filter((e) => e !== email);
    recordAuditLog(db, {
      actorId: actor.id,
      actorEmail: actor.email,
      action: 'UNBLACKLIST_EMAIL',
      targetType: 'moderator',
      targetId: email,
      targetLabel: email,
    });
    saveDb(db);
    res.json({ blacklistedEmails: db.blacklistedEmails });
  });

  app.post('/api/moderator/emergency/lockdown', requireModeratorAccess, (req: AuthenticatedRequest, res: Response) => {
    const actor = req.modActor!;
    const db = getDb();
    const { banner } = req.body as { banner?: string };

    db.settings.maintenanceMode = true;
    db.settings.allowNewRegistrations = false;
    db.settings.announcementBanner = typeof banner === 'string' && banner.trim().length > 0
      ? banner.trim().slice(0, 240)
      : 'FÖVQƏLADƏ KİLİDLƏNMƏ: Təhlükəsizlik tədbirlərinə görə yeni elanlar və qeydiyyatlar müvəqqəti dayandırılıb.';

    recordAuditLog(db, {
      actorId: actor.id,
      actorEmail: actor.email,
      action: 'EMERGENCY_LOCKDOWN',
      targetType: 'moderator',
      targetId: 'platform',
      targetLabel: 'Sayt Fövqəladə Kilidləmə rejiminə keçirildi',
    });
    saveDb(db);
    res.json({ settings: db.settings });
  });

  app.post('/api/moderator/emergency/unlock', requireModeratorAccess, (req: AuthenticatedRequest, res: Response) => {
    const actor = req.modActor!;
    const db = getDb();

    db.settings.maintenanceMode = false;
    db.settings.allowNewRegistrations = true;

    recordAuditLog(db, {
      actorId: actor.id,
      actorEmail: actor.email,
      action: 'EMERGENCY_UNLOCK',
      targetType: 'moderator',
      targetId: 'platform',
      targetLabel: 'Fövqəladə kilidləmə ləğv edildi',
    });
    saveDb(db);
    res.json({ settings: db.settings });
  });

  app.post('/api/moderator/emergency/global-session-kill', requireModeratorAccess, (req: AuthenticatedRequest, res: Response) => {
    const actor = req.modActor!;
    const db = getDb();

    let affected = 0;
    for (const u of db.users) {
      if (u.role === 'user') {
        u.sessionVersion += 1;
        affected++;
      }
    }

    recordAuditLog(db, {
      actorId: actor.id,
      actorEmail: actor.email,
      action: 'GLOBAL_SESSION_KILL',
      targetType: 'moderator',
      targetId: 'all_users',
      targetLabel: `${affected} adi istifadəçinin canlı sessiyası dərhal kəsildi`,
    });
    saveDb(db);
    res.json({ affected });
  });

  app.post('/api/moderator/emergency/flush-pending', requireModeratorAccess, (req: AuthenticatedRequest, res: Response) => {
    const actor = req.modActor!;
    const db = getDb();
    const { reason } = req.body as { reason?: string };
    const finalReason = typeof reason === 'string' && reason.trim()
      ? reason.trim().slice(0, 200)
      : 'Moderator təmizləmə əməliyyatı ilə rədd edildi.';

    let flushed = 0;
    const nowIso = new Date().toISOString();
    for (const l of db.listings) {
      if (l.status === 'pending') {
        l.status = 'rejected';
        l.rejectionReason = finalReason;
        l.updatedAt = nowIso;
        flushed++;
      }
    }

    recordAuditLog(db, {
      actorId: actor.id,
      actorEmail: actor.email,
      action: 'FLUSH_PENDING_QUEUE',
      targetType: 'moderator',
      targetId: 'pending_queue',
      targetLabel: `${flushed} gözləyən elan kütləvi rədd edildi`,
      reason: finalReason,
    });
    saveDb(db);
    res.json({ flushed });
  });

  // =========================================================================
  // VITE / STATIC SERVING
  // =========================================================================

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    if (fs.existsSync(distDir)) {
      app.use(express.static(distDir));
      app.get('*', (_req: Request, res: Response) => {
        res.sendFile(path.join(distDir, 'index.html'));
      });
    }
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`TelefonBazar server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
