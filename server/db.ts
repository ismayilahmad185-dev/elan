import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import type {
  AdminPermissions,
  AuditLog,
  CatalogConfig,
  ListingReport,
  PhoneListing,
  PlatformSettings,
  PreassignedRole,
  UserNotification,
  UserRole,
  UserStatus,
} from '../src/types.ts';

export interface StoredUser {
  id: string;
  email: string;
  name: string;
  avatarColor: string;
  passwordHash: string | null;
  role: UserRole;
  permissions: AdminPermissions;
  verifiedSeller: boolean;
  canPostListings: boolean;
  isShadowbanned: boolean;
  warningsCount: number;
  lastWarning?: string;
  status: UserStatus;
  kickReason?: string;
  kickedUntil?: string | null;
  banReason?: string;
  bannedUntil?: string | null;
  sessionVersion: number;
  createdAt: string;
  lastActiveAt: string;
}

export interface StoredOperator {
  id: string;
  isReshid: boolean;
  displayName: string;
  email: string;
  passcodeHash: string | null;
  allowAdminPanel: boolean;
  allowModeratorPanel: boolean;
  permissions: AdminPermissions;
  active: boolean;
  sessionVersion: number;
  assignedBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface DatabaseSchema {
  users: StoredUser[];
  preassignedRoles: PreassignedRole[];
  operators: StoredOperator[];
  blacklistedEmails: string[];
  listings: PhoneListing[];
  reports: ListingReport[];
  auditLogs: AuditLog[];
  settings: PlatformSettings;
  catalog: CatalogConfig;
  notifications: UserNotification[];
  favorites: Record<string, string[]>;
  moderatorPasscodeHash: string | null;
  moderatorSessionVersion: number;
  adminPasscodeHash: string | null;
  adminSessionVersion: number;
}

export const FULL_ADMIN_PERMISSIONS: AdminPermissions = {
  canApproveListings: true,
  canEditDeleteListings: true,
  canKickBanUsers: true,
  canManageReports: true,
  canManageSettings: true,
  canManageCatalog: true,
  canSendBroadcasts: true,
  canUseDangerousMod: true,
};

export const MODERATOR_PERMISSIONS: AdminPermissions = {
  canApproveListings: true,
  canEditDeleteListings: true,
  canKickBanUsers: true,
  canManageReports: true,
  canManageSettings: false,
  canManageCatalog: false,
  canSendBroadcasts: true,
  canUseDangerousMod: true,
};

export const NO_ADMIN_PERMISSIONS: AdminPermissions = {
  canApproveListings: false,
  canEditDeleteListings: false,
  canKickBanUsers: false,
  canManageReports: false,
  canManageSettings: false,
  canManageCatalog: false,
  canSendBroadcasts: false,
  canUseDangerousMod: false,
};

export const DEFAULT_CATALOG: CatalogConfig = {
  brands: ['Apple', 'Samsung', 'Xiaomi', 'Google', 'OnePlus', 'Honor', 'Nothing', 'Digər'],
  cities: ['Bakı', 'Sumqayıt', 'Gəncə', 'Mingəçevir', 'Lənkəran', 'Şəki', 'Naxçıvan', 'Digər'],
};

export const OWNER_EMAIL = 'ismayilahmad185@gmail.com';
const DEFAULT_MODERATOR_PASSCODE_HASH =
  '769379497edb7398d3c7959f99f52367:2b29497df5258da7edc35450d12a8f56fb197e5fbc21e08f744aa4ee238628ae9c12a4c9432b69a564d358b3fca9da88357ce6a79a6c98a053b8dfd6fc859391';
const DEFAULT_ADMIN_PASSCODE_HASH =
  'c25f04fe73ce09cd2d6e46d276477d3a:b00a910851e37bb7b344f1b16763f6c0b8c93ce009c979541f992405ae2e6e0e0498b482d47b0048252bf88bdfd5c61f3e0dc7a68b62467c7aa3203db3150a76';

const DATA_DIR = path.resolve(process.cwd(), 'data');
const DB_PATH = path.join(DATA_DIR, 'store.json');

export function createDefaultReshidOperator(): StoredOperator {
  const nowIso = new Date().toISOString();
  return {
    id: 'op_reshid',
    isReshid: true,
    displayName: 'Rəşid',
    email: '',
    passcodeHash: null,
    allowAdminPanel: true,
    allowModeratorPanel: true,
    permissions: { ...FULL_ADMIN_PERMISSIONS },
    active: true,
    sessionVersion: 1,
    assignedBy: OWNER_EMAIL,
    createdAt: nowIso,
    updatedAt: nowIso,
  };
}

function createInitialDb(): DatabaseSchema {
  const now = new Date();
  const hoursAgo = (h: number) => new Date(now.getTime() - h * 3600 * 1000).toISOString();

  const users: StoredUser[] = [
    {
      id: 'usr_elvin',
      email: 'elvin.mammadov@gmail.com',
      name: 'Elvin Məmmədov',
      avatarColor: '#2563EB',
      passwordHash: null,
      role: 'user',
      permissions: { ...NO_ADMIN_PERMISSIONS },
      verifiedSeller: true,
      canPostListings: true,
      isShadowbanned: false,
      warningsCount: 0,
      status: 'active',
      sessionVersion: 1,
      createdAt: hoursAgo(320),
      lastActiveAt: hoursAgo(2),
    },
    {
      id: 'usr_nigar',
      email: 'nigar.aliyeva@gmail.com',
      name: 'Nigar Əliyeva',
      avatarColor: '#0D9488',
      passwordHash: null,
      role: 'user',
      permissions: { ...NO_ADMIN_PERMISSIONS },
      verifiedSeller: true,
      canPostListings: true,
      isShadowbanned: false,
      warningsCount: 0,
      status: 'active',
      sessionVersion: 1,
      createdAt: hoursAgo(240),
      lastActiveAt: hoursAgo(5),
    },
    {
      id: 'usr_tural',
      email: 'tural.huseynov@gmail.com',
      name: 'Tural Hüseynov',
      avatarColor: '#4F46E5',
      passwordHash: null,
      role: 'user',
      permissions: { ...NO_ADMIN_PERMISSIONS },
      verifiedSeller: false,
      canPostListings: true,
      isShadowbanned: false,
      warningsCount: 1,
      lastWarning: 'Elan fotolarını real cihazdan çəkməyiniz tələb olunur.',
      status: 'active',
      sessionVersion: 1,
      createdAt: hoursAgo(140),
      lastActiveAt: hoursAgo(8),
    },
    {
      id: 'usr_kamran',
      email: 'kamran.rzayev@gmail.com',
      name: 'Kamran Rzayev',
      avatarColor: '#D97706',
      passwordHash: null,
      role: 'user',
      permissions: { ...NO_ADMIN_PERMISSIONS },
      verifiedSeller: false,
      canPostListings: true,
      isShadowbanned: false,
      warningsCount: 0,
      status: 'active',
      sessionVersion: 1,
      createdAt: hoursAgo(90),
      lastActiveAt: hoursAgo(12),
    },
  ];

  const listings: PhoneListing[] = [
    {
      id: 'lst_iphone16pro',
      sellerId: 'usr_elvin',
      sellerEmail: 'elvin.mammadov@gmail.com',
      sellerName: 'Elvin Məmmədov',
      sellerVerified: true,
      title: 'Apple iPhone 16 Pro 256 GB Natural Titanium',
      brand: 'Apple',
      model: 'iPhone 16 Pro',
      price: 2390,
      storage: '256 GB',
      ram: '8 GB',
      batteryHealth: 99,
      condition: 'İdeal',
      city: 'Bakı',
      color: 'Natural Titanium',
      imeiVerified: true,
      warranty: 'Rəsmi zəmanət',
      barter: true,
      credit: false,
      phone: '+994 50 412 88 90',
      description: 'Telefon tam ideal vəziyyətdədir, ilk gündən qoruyucu şüşə və orijinal kabro ilə istifadə olunub. Qutusu, USB-C kabeli və rəsmi zəmanət talonu mövcuddur. Bütün funksiyalar, Face ID və True Tone problemsiz işləyir.',
      imageUrl: '/src/assets/images/phone_iphone_pro_1795345109178.jpg',
      status: 'active',
      isFeatured: true,
      views: 428,
      favoritesCount: 34,
      createdAt: hoursAgo(18),
      updatedAt: hoursAgo(18),
    },
    {
      id: 'lst_s25ultra',
      sellerId: 'usr_nigar',
      sellerEmail: 'nigar.aliyeva@gmail.com',
      sellerName: 'Nigar Əliyeva',
      sellerVerified: true,
      title: 'Samsung Galaxy S24 Ultra 512 GB Titanium Black',
      brand: 'Samsung',
      model: 'Galaxy S24 Ultra',
      price: 2150,
      storage: '512 GB',
      ram: '12 GB',
      batteryHealth: 97,
      condition: 'İdeal',
      city: 'Bakı',
      color: 'Titanium Black',
      imeiVerified: true,
      warranty: 'Rəsmi zəmanət',
      barter: false,
      credit: true,
      phone: '+994 55 319 44 21',
      description: 'Rəsmi distribyutor cihazıdır, qeydiyyatlıdır. S-Pen, 200MP kamera və ekran tam cızıqsızdır. Yanında orijinal 45W adapter və iki kabro verilir.',
      imageUrl: '/src/assets/images/phone_samsung_ultra_1795345109304.jpg',
      status: 'active',
      isFeatured: true,
      views: 312,
      favoritesCount: 27,
      createdAt: hoursAgo(26),
      updatedAt: hoursAgo(26),
    },
    {
      id: 'lst_pixel9pro',
      sellerId: 'usr_tural',
      sellerEmail: 'tural.huseynov@gmail.com',
      sellerName: 'Tural Hüseynov',
      sellerVerified: false,
      title: 'Google Pixel 9 Pro 256 GB Porcelain',
      brand: 'Google',
      model: 'Pixel 9 Pro',
      price: 1680,
      storage: '256 GB',
      ram: '16 GB',
      batteryHealth: 100,
      condition: 'Yeni (Qutuda)',
      city: 'Sumqayıt',
      color: 'Porcelain',
      imeiVerified: true,
      warranty: 'Mağaza zəmanəti',
      barter: true,
      credit: false,
      phone: '+994 70 845 10 33',
      description: 'ABŞ-dan yeni gətirilib, qutusu yalnız gömrük yoxlanışı üçün açılıb. IMEI bəyan olunub və rəsmi qeydiyyatdan keçirilib.',
      imageUrl: '/src/assets/images/phone_pixel_pro_1795345108667.jpg',
      status: 'active',
      isFeatured: false,
      views: 194,
      favoritesCount: 19,
      createdAt: hoursAgo(34),
      updatedAt: hoursAgo(34),
    },
    {
      id: 'lst_xiaomi14ultra',
      sellerId: 'usr_kamran',
      sellerEmail: 'kamran.rzayev@gmail.com',
      sellerName: 'Kamran Rzayev',
      sellerVerified: false,
      title: 'Xiaomi 14 Ultra 512 GB Leica Edition',
      brand: 'Xiaomi',
      model: '14 Ultra',
      price: 1740,
      storage: '512 GB',
      ram: '16 GB',
      batteryHealth: 95,
      condition: 'İdeal',
      city: 'Gəncə',
      color: 'Obsidian Black',
      imeiVerified: true,
      warranty: 'Mağaza zəmanəti',
      barter: true,
      credit: false,
      phone: '+994 51 620 77 14',
      description: 'Leica optikalı flaqman kamera telefonu. 90W sürətli şarj adapteri və fotoqrafiya tutacağı dəstə daxildir. Təmirdə olmayıb.',
      imageUrl: '/src/assets/images/phone_xiaomi_fold_1795345108772.jpg',
      status: 'active',
      isFeatured: false,
      views: 156,
      favoritesCount: 12,
      createdAt: hoursAgo(42),
      updatedAt: hoursAgo(42),
    },
    {
      id: 'lst_iphone15promax',
      sellerId: 'usr_elvin',
      sellerEmail: 'elvin.mammadov@gmail.com',
      sellerName: 'Elvin Məmmədov',
      sellerVerified: true,
      title: 'Apple iPhone 15 Pro Max 256 GB Natural Titanium',
      brand: 'Apple',
      model: 'iPhone 15 Pro Max',
      price: 1980,
      storage: '256 GB',
      ram: '8 GB',
      batteryHealth: 92,
      condition: 'Yaxşı',
      city: 'Bakı',
      color: 'Natural Titanium',
      imeiVerified: true,
      warranty: 'Yoxdur',
      barter: true,
      credit: false,
      phone: '+994 50 412 88 90',
      description: 'Heç bir detalı dəyişilməyib, suya davamlılıq qorunub. Cüzi istifadə izi yoxdur, batareya sağlamlığı 92%. Real alıcıya yerində endirim ediləcək.',
      imageUrl: '/src/assets/images/phone_iphone_pro_1795345109178.jpg',
      status: 'pending',
      isFeatured: false,
      views: 24,
      favoritesCount: 3,
      createdAt: hoursAgo(3),
      updatedAt: hoursAgo(3),
    },
    {
      id: 'lst_s23ultra',
      sellerId: 'usr_tural',
      sellerEmail: 'tural.huseynov@gmail.com',
      sellerName: 'Tural Hüseynov',
      sellerVerified: false,
      title: 'Samsung Galaxy S23 Ultra 256 GB Graphite',
      brand: 'Samsung',
      model: 'Galaxy S23 Ultra',
      price: 1350,
      storage: '256 GB',
      ram: '12 GB',
      batteryHealth: 90,
      condition: 'Yaxşı',
      city: 'Bakı',
      color: 'Graphite',
      imeiVerified: true,
      warranty: 'Yoxdur',
      barter: false,
      credit: false,
      phone: '+994 70 845 10 33',
      description: 'Qutusu var, iki sim kartlı qlobal versiyadır. Ekranında yanma və ya ləkə yoxdur.',
      imageUrl: '/src/assets/images/phone_samsung_ultra_1795345109304.jpg',
      status: 'pending',
      isFeatured: false,
      views: 11,
      favoritesCount: 1,
      createdAt: hoursAgo(1),
      updatedAt: hoursAgo(1),
    },
  ];

  const reports: ListingReport[] = [
    {
      id: 'rep_sample1',
      listingId: 'lst_s23ultra',
      listingTitle: 'Samsung Galaxy S23 Ultra 256 GB Graphite',
      sellerId: 'usr_tural',
      sellerEmail: 'tural.huseynov@gmail.com',
      reporterId: 'usr_nigar',
      reporterEmail: 'nigar.aliyeva@gmail.com',
      reason: 'Şəkil və ya məlumat uyğunsuzluğu',
      details: 'Elan şəklindəki qələm modeli S24 Ultra kimi görünür, satıcıdan real fotolar tələb olunmalıdır.',
      status: 'open',
      createdAt: hoursAgo(1),
    },
  ];

  const auditLogs: AuditLog[] = [
    {
      id: 'log_init_1',
      actorId: 'system',
      actorEmail: OWNER_EMAIL,
      action: 'SYSTEM_INITIALIZED',
      targetType: 'settings',
      targetId: 'platform',
      targetLabel: 'TelefonBazar Platforması',
      reason: 'Platforma başlanğıc məlumatları ilə işə salındı',
      createdAt: hoursAgo(48),
    },
  ];

  const settings: PlatformSettings = {
    autoApproveListings: false,
    maintenanceMode: false,
    announcementBanner: 'Bütün telefon elanları IMEI və məlumat yoxlamasından sonra dərc olunur.',
    maxListingsPerUser: 15,
    blockedKeywords: ['saxta', 'kopya', 'a klass', 'dubay kopya'],
    allowNewRegistrations: true,
  };

  return {
    users,
    preassignedRoles: [],
    operators: [createDefaultReshidOperator()],
    blacklistedEmails: [],
    listings,
    reports,
    auditLogs,
    settings,
    catalog: {
      brands: [...DEFAULT_CATALOG.brands],
      cities: [...DEFAULT_CATALOG.cities],
    },
    notifications: [
      {
        id: 'ntf_welcome',
        targetUserId: 'all',
        title: 'TelefonBazar Platformasına Xoş Gəlmisiniz',
        message: 'Alqı-satqı zamanı cihazın IMEI kodunu və batareya göstəricisini yerində yoxlamağı unutmayın.',
        kind: 'info',
        sentBy: OWNER_EMAIL,
        readBy: [],
        createdAt: hoursAgo(24),
      },
    ],
    favorites: {},
    moderatorPasscodeHash: DEFAULT_MODERATOR_PASSCODE_HASH,
    moderatorSessionVersion: 1,
    adminPasscodeHash: DEFAULT_ADMIN_PASSCODE_HASH,
    adminSessionVersion: 1,
  };
}

function hydrateDbDefaults(raw: Partial<DatabaseSchema>): DatabaseSchema {
  const fresh = createInitialDb();
  const users = (raw.users || fresh.users).map((u) => {
    const isOwner = u.email?.trim().toLowerCase() === OWNER_EMAIL;
    const role: UserRole = isOwner ? 'super_admin' : u.role;
    return {
      ...u,
      role,
      canPostListings: typeof u.canPostListings === 'boolean' ? u.canPostListings : true,
      isShadowbanned: typeof u.isShadowbanned === 'boolean' ? u.isShadowbanned : false,
      warningsCount: typeof u.warningsCount === 'number' ? u.warningsCount : 0,
      permissions: {
        ...NO_ADMIN_PERMISSIONS,
        ...(role === 'super_admin' ? FULL_ADMIN_PERMISSIONS : {}),
        ...(u.permissions || {}),
        canManageCatalog:
          role === 'super_admin'
            ? true
            : typeof u.permissions?.canManageCatalog === 'boolean'
            ? u.permissions.canManageCatalog
            : role === 'admin',
        canSendBroadcasts:
          role === 'super_admin'
            ? true
            : typeof u.permissions?.canSendBroadcasts === 'boolean'
            ? u.permissions.canSendBroadcasts
            : role === 'admin' || role === 'moderator',
        canUseDangerousMod:
          role === 'super_admin'
            ? true
            : typeof u.permissions?.canUseDangerousMod === 'boolean'
            ? u.permissions.canUseDangerousMod
            : role === 'admin' || role === 'moderator',
      },
    };
  });

  const rawOperators = Array.isArray(raw.operators) ? raw.operators : [];
  const hydratedOperators: StoredOperator[] = rawOperators.map((op) => ({
    id: op.id || `op_${crypto.randomBytes(6).toString('hex')}`,
    isReshid: Boolean(op.isReshid) || op.id === 'op_reshid',
    displayName: typeof op.displayName === 'string' && op.displayName.trim() ? op.displayName.trim() : 'Operator',
    email: typeof op.email === 'string' ? op.email.trim().toLowerCase() : '',
    passcodeHash: typeof op.passcodeHash === 'string' && op.passcodeHash.includes(':') ? op.passcodeHash : null,
    allowAdminPanel: typeof op.allowAdminPanel === 'boolean' ? op.allowAdminPanel : true,
    allowModeratorPanel: typeof op.allowModeratorPanel === 'boolean' ? op.allowModeratorPanel : false,
    permissions: {
      ...FULL_ADMIN_PERMISSIONS,
      ...(op.permissions || {}),
    },
    active: typeof op.active === 'boolean' ? op.active : true,
    sessionVersion: typeof op.sessionVersion === 'number' && op.sessionVersion >= 1 ? op.sessionVersion : 1,
    assignedBy: typeof op.assignedBy === 'string' ? op.assignedBy : OWNER_EMAIL,
    createdAt: op.createdAt || new Date().toISOString(),
    updatedAt: op.updatedAt || new Date().toISOString(),
  }));

  if (!hydratedOperators.some((op) => op.isReshid || op.id === 'op_reshid')) {
    hydratedOperators.unshift(createDefaultReshidOperator());
  }

  return {
    users,
    preassignedRoles: (raw.preassignedRoles || []).map((p) => ({
      ...p,
      permissions: {
        ...MODERATOR_PERMISSIONS,
        ...(p.permissions || {}),
        canUseDangerousMod:
          typeof p.permissions?.canUseDangerousMod === 'boolean'
            ? p.permissions.canUseDangerousMod
            : true,
      },
    })),
    operators: hydratedOperators,
    blacklistedEmails: Array.isArray(raw.blacklistedEmails) ? raw.blacklistedEmails : [],
    listings: raw.listings || fresh.listings,
    reports: raw.reports || fresh.reports,
    auditLogs: raw.auditLogs || fresh.auditLogs,
    settings: { ...fresh.settings, ...(raw.settings || {}) },
    catalog: raw.catalog?.brands?.length && raw.catalog?.cities?.length ? raw.catalog : fresh.catalog,
    notifications: raw.notifications || fresh.notifications,
    favorites: raw.favorites || {},
    moderatorPasscodeHash:
      typeof raw.moderatorPasscodeHash === 'string' && raw.moderatorPasscodeHash.includes(':')
        ? raw.moderatorPasscodeHash
        : DEFAULT_MODERATOR_PASSCODE_HASH,
    moderatorSessionVersion:
      typeof raw.moderatorSessionVersion === 'number' && raw.moderatorSessionVersion >= 1
        ? raw.moderatorSessionVersion
        : 1,
    adminPasscodeHash:
      typeof raw.adminPasscodeHash === 'string' && raw.adminPasscodeHash.includes(':')
        ? raw.adminPasscodeHash
        : DEFAULT_ADMIN_PASSCODE_HASH,
    adminSessionVersion:
      typeof raw.adminSessionVersion === 'number' && raw.adminSessionVersion >= 1
        ? raw.adminSessionVersion
        : 1,
  };
}

let cachedDb: DatabaseSchema | null = null;

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

export function getDb(): DatabaseSchema {
  if (cachedDb) {
    return cachedDb;
  }
  ensureDataDir();
  if (fs.existsSync(DB_PATH)) {
    try {
      const raw = fs.readFileSync(DB_PATH, 'utf8');
      cachedDb = hydrateDbDefaults(JSON.parse(raw) as Partial<DatabaseSchema>);
      return cachedDb;
    } catch {
      cachedDb = createInitialDb();
      saveDb(cachedDb);
      return cachedDb;
    }
  }
  cachedDb = createInitialDb();
  saveDb(cachedDb);
  return cachedDb;
}

export function getDbSizeBytes(): number {
  try {
    if (fs.existsSync(DB_PATH)) {
      return fs.statSync(DB_PATH).size;
    }
  } catch {
    // ignore
  }
  return 0;
}

export function saveDb(db: DatabaseSchema): void {
  ensureDataDir();
  cachedDb = db;
  const tmpPath = `${DB_PATH}.${crypto.randomBytes(6).toString('hex')}.tmp`;
  fs.writeFileSync(tmpPath, JSON.stringify(db, null, 2), 'utf8');
  fs.renameSync(tmpPath, DB_PATH);
}

export function recordAuditLog(
  db: DatabaseSchema,
  entry: Omit<AuditLog, 'id' | 'createdAt'>
): void {
  const log: AuditLog = {
    id: `log_${crypto.randomBytes(6).toString('hex')}`,
    ...entry,
    createdAt: new Date().toISOString(),
  };
  db.auditLogs.unshift(log);
  if (db.auditLogs.length > 800) {
    db.auditLogs = db.auditLogs.slice(0, 800);
  }
}
