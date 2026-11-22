import {
  AlertTriangle,
  Ban,
  CheckCircle2,
  ClipboardList,
  Database,
  Download,
  Edit3,
  EyeOff,
  Flag,
  Flame,
  KeyRound,
  LayoutDashboard,
  Lock,
  LogOut,
  Megaphone,
  Pin,
  Plus,
  Search,
  Settings,
  Shield,
  ShieldAlert,
  Smartphone,
  Tags,
  Trash2,
  Unlock,
  UserCheck,
  UserPlus,
  Users,
  UserX,
  X,
  XCircle,
} from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { apiFetch, ApiError, formatPriceAzn, formatRelativeAz, setAdminToken } from '../lib/api.ts';
import { DelegatedAccessManager } from './DelegatedAccessManager.tsx';
import type {
  AdminOverviewStats,
  AdminPermissions,
  AuditLog,
  CatalogConfig,
  ListingReport,
  ListingStatus,
  PanelActorInfo,
  PhoneListing,
  PlatformSettings,
  PreassignedRole,
  PublicUser,
  UserNotification,
} from '../types.ts';

const OWNER_EMAIL = 'ismayilahmad185@gmail.com';

type AdminTab =
  | 'overview'
  | 'listings'
  | 'users'
  | 'roles'
  | 'catalog'
  | 'broadcasts'
  | 'reports'
  | 'audit'
  | 'backup'
  | 'settings';

interface AdminPanelViewProps {
  currentUser?: PublicUser | null;
  adminActor?: PanelActorInfo | null;
  refreshTrigger?: number;
  onEditListing: (listing: PhoneListing) => void;
  onCreateListing: () => void;
  onViewListing: (listing: PhoneListing) => void;
  onOpenModeratorPanel?: () => void;
  onBackToMarket?: () => void;
  onLockAdmin?: () => void;
  onMarketplaceChanged: () => Promise<void>;
  onNotify: (msg: string, type?: 'success' | 'error') => void;
}

const DEFAULT_ADMIN_PERMS: AdminPermissions = {
  canApproveListings: true,
  canEditDeleteListings: true,
  canKickBanUsers: true,
  canManageReports: true,
  canManageSettings: true,
  canManageCatalog: true,
  canSendBroadcasts: true,
  canUseDangerousMod: true,
};

const DEFAULT_MOD_PERMS: AdminPermissions = {
  canApproveListings: true,
  canEditDeleteListings: false,
  canKickBanUsers: true,
  canManageReports: true,
  canManageSettings: false,
  canManageCatalog: false,
  canSendBroadcasts: false,
  canUseDangerousMod: true,
};

const PERM_LABELS: { key: keyof AdminPermissions; label: string; short: string }[] = [
  { key: 'canApproveListings', label: 'Elanları təsdiqləmək və rədd etmək', short: 'Təsdiq' },
  { key: 'canEditDeleteListings', label: 'Elanları redaktə, VIP və silmək', short: 'Redaktə/VIP' },
  { key: 'canKickBanUsers', label: 'İstifadəçiləri Kick, Ban, Xəbərdarlıq və Məhdudiyyət', short: 'Kick/Ban' },
  { key: 'canUseDangerousMod', label: 'Təhlükəli Moderator Paneli (Shadowban, Nuke, Qara Siyahı)', short: 'Təhlükəli Mod' },
  { key: 'canManageReports', label: 'Şikayətlərə baxmaq və həll etmək', short: 'Şikayətlər' },
  { key: 'canManageCatalog', label: 'Brend və Şəhər kataloqunu idarə etmək', short: 'Kataloq' },
  { key: 'canSendBroadcasts', label: 'Bildiriş və Elan göndərmək', short: 'Bildirişlər' },
  { key: 'canManageSettings', label: 'Platforma ayarları və Ehtiyat nüsxə', short: 'Ayarlar' },
];

function downloadTextFile(filename: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function escapeCsvCell(v: unknown): string {
  const str = String(v ?? '');
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function AdminPanelView({
  currentUser = null,
  adminActor = null,
  refreshTrigger = 0,
  onEditListing,
  onCreateListing,
  onViewListing,
  onOpenModeratorPanel,
  onBackToMarket,
  onLockAdmin,
  onMarketplaceChanged,
  onNotify,
}: AdminPanelViewProps) {
  const [tab, setTab] = useState<AdminTab>('overview');
  const [loading, setLoading] = useState(true);

  const [stats, setStats] = useState<AdminOverviewStats | null>(null);
  const [dbSizeKb, setDbSizeKb] = useState<number>(0);
  const [recentLogs, setRecentLogs] = useState<AuditLog[]>([]);
  const [listings, setListings] = useState<PhoneListing[]>([]);
  const [users, setUsers] = useState<PublicUser[]>([]);
  const [admins, setAdmins] = useState<PublicUser[]>([]);
  const [preassignedRoles, setPreassignedRoles] = useState<PreassignedRole[]>([]);
  const [reports, setReports] = useState<ListingReport[]>([]);
  const [allLogs, setAllLogs] = useState<AuditLog[]>([]);
  const [settings, setSettings] = useState<PlatformSettings | null>(null);
  const [catalog, setCatalog] = useState<CatalogConfig>({ brands: [], cities: [] });
  const [broadcasts, setBroadcasts] = useState<UserNotification[]>([]);

  // Filters & selection
  const [listingStatusFilter, setListingStatusFilter] = useState<'all' | ListingStatus>('all');
  const [listingSearch, setListingSearch] = useState('');
  const [selectedListingIds, setSelectedListingIds] = useState<string[]>([]);

  const [userStatusFilter, setUserStatusFilter] = useState<'all' | 'active' | 'kicked' | 'banned' | 'muted'>('all');
  const [userSearch, setUserSearch] = useState('');

  const [auditSearch, setAuditSearch] = useState('');
  const [auditTypeFilter, setAuditTypeFilter] = useState<string>('all');

  // Modals: Kick / Ban / Warn / Reject
  const [kickTarget, setKickTarget] = useState<PublicUser | null>(null);
  const [kickMinutes, setKickMinutes] = useState(15);
  const [kickReason, setKickReason] = useState('');

  const [banTarget, setBanTarget] = useState<PublicUser | null>(null);
  const [banDays, setBanDays] = useState<string>('permanent');
  const [banReason, setBanReason] = useState('');
  const [banHideListings, setBanHideListings] = useState(true);

  const [warnTarget, setWarnTarget] = useState<PublicUser | null>(null);
  const [warnMessage, setWarnMessage] = useState('');

  const [rejectTarget, setRejectTarget] = useState<PhoneListing | null>(null);
  const [rejectReason, setRejectReason] = useState('');

  // Super Admin Role Delegation
  const [grantEmail, setGrantEmail] = useState('');
  const [grantRole, setGrantRole] = useState<'admin' | 'moderator'>('admin');
  const [grantPerms, setGrantPerms] = useState<AdminPermissions>({ ...DEFAULT_ADMIN_PERMS });

  // Catalog Manager drafts
  const [newBrandName, setNewBrandName] = useState('');
  const [newCityName, setNewCityName] = useState('');

  // Broadcast form
  const [broadcastTargetId, setBroadcastTargetId] = useState('all');
  const [broadcastKind, setBroadcastKind] = useState<'info' | 'warning' | 'system'>('info');
  const [broadcastTitle, setBroadcastTitle] = useState('');
  const [broadcastMessage, setBroadcastMessage] = useState('');

  // Settings & Passcode draft
  const [keywordsDraft, setKeywordsDraft] = useState('');
  const [savingSettings, setSavingSettings] = useState(false);
  const [usingEnvOverride, setUsingEnvOverride] = useState(false);
  const [currentAdminPass, setCurrentAdminPass] = useState('');
  const [newAdminPass, setNewAdminPass] = useState('');
  const [changingAdminPass, setChangingAdminPass] = useState(false);

  const isMasterOrOwner = Boolean(
    !adminActor || adminActor.isMasterPasscode || adminActor.isOwner || adminActor.canManageAccess
  );
  const isOwner = isMasterOrOwner;
  const isSuperAdmin = isMasterOrOwner;
  const canManageAccess = isMasterOrOwner;
  const perms = adminActor?.permissions ?? DEFAULT_ADMIN_PERMS;

  const canApprove = isMasterOrOwner || perms.canApproveListings;
  const canEditDelete = isMasterOrOwner || perms.canEditDeleteListings;
  const canKickBan = isMasterOrOwner || perms.canKickBanUsers;
  const canManageReports = isMasterOrOwner || perms.canManageReports;
  const canManageSettings = isMasterOrOwner || perms.canManageSettings;
  const canManageCatalog = isMasterOrOwner || perms.canManageCatalog;
  const canSendBroadcasts = isMasterOrOwner || perms.canSendBroadcasts;
  const canUseDangerousMod = Boolean(
    (adminActor?.allowModeratorPanel ?? true) && (isMasterOrOwner || perms.canUseDangerousMod)
  );

  const loadAllAdminData = async () => {
    setLoading(true);
    try {
      const [
        overviewRes,
        listingsRes,
        usersRes,
        rolesRes,
        logsRes,
        settingsRes,
        catalogRes,
        broadcastRes,
      ] = await Promise.all([
        apiFetch<{ stats: AdminOverviewStats; recentLogs: AuditLog[]; dbSizeKb?: number }>('/api/admin/overview'),
        apiFetch<{ listings: PhoneListing[] }>('/api/admin/listings'),
        apiFetch<{ users: PublicUser[] }>('/api/admin/users'),
        apiFetch<{ admins: PublicUser[]; preassignedRoles: PreassignedRole[] }>('/api/admin/roles'),
        apiFetch<{ logs: AuditLog[] }>('/api/admin/audit-logs'),
        apiFetch<{ settings: PlatformSettings; usingEnvOverride?: boolean }>('/api/admin/settings'),
        apiFetch<{ catalog: CatalogConfig }>('/api/catalog'),
        apiFetch<{ notifications: UserNotification[] }>('/api/admin/broadcasts'),
      ]);

      setStats(overviewRes.stats);
      setDbSizeKb(overviewRes.dbSizeKb ?? 0);
      setRecentLogs(overviewRes.recentLogs);
      setListings(listingsRes.listings);
      setUsers(usersRes.users);
      setAdmins(rolesRes.admins);
      setPreassignedRoles(rolesRes.preassignedRoles);
      setAllLogs(logsRes.logs);
      setSettings(settingsRes.settings);
      setUsingEnvOverride(Boolean(settingsRes.usingEnvOverride));
      setKeywordsDraft(settingsRes.settings.blockedKeywords.join(', '));
      setCatalog(catalogRes.catalog);
      setBroadcasts(broadcastRes.notifications);

      if (canManageReports) {
        const repRes = await apiFetch<{ reports: ListingReport[] }>('/api/admin/reports');
        setReports(repRes.reports);
      }
    } catch (err) {
      onNotify(err instanceof ApiError ? err.message : 'Admin məlumatları yüklənmədi.', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAllAdminData();
  }, [refreshTrigger]);

  const handleChangeAdminPasscode = async (e: FormEvent) => {
    e.preventDefault();
    if (!currentAdminPass || !newAdminPass) return;
    setChangingAdminPass(true);
    try {
      const res = await apiFetch<{ ok: boolean; adminToken?: string }>('/api/admin/auth/change-passcode', {
        method: 'POST',
        body: JSON.stringify({
          currentPasscode: currentAdminPass,
          newPasscode: newAdminPass,
        }),
      });
      if (res.adminToken) {
        setAdminToken(res.adminToken);
      }
      setCurrentAdminPass('');
      setNewAdminPass('');
      onNotify('Admin Panel parolu uğurla yeniləndi.', 'success');
    } catch (err) {
      onNotify(err instanceof ApiError ? err.message : 'Parol yenilənmədi.', 'error');
    } finally {
      setChangingAdminPass(false);
    }
  };

  const syncAfterChange = async () => {
    await Promise.all([loadAllAdminData(), onMarketplaceChanged()]);
  };

  // Listing moderation
  const handleModerateListing = async (
    id: string,
    action: 'approve' | 'reject' | 'toggle_featured' | 'mark_sold' | 'reopen',
    reason?: string
  ) => {
    try {
      await apiFetch(`/api/admin/listings/${id}/moderate`, {
        method: 'PATCH',
        body: JSON.stringify({ action, reason }),
      });
      await syncAfterChange();
      onNotify('Elan statusu yeniləndi.', 'success');
    } catch (err) {
      onNotify(err instanceof ApiError ? err.message : 'Əməliyyat uğursuz oldu.', 'error');
    }
  };

  const handleDeleteListing = async (id: string) => {
    try {
      await apiFetch(`/api/listings/${id}`, { method: 'DELETE' });
      setSelectedListingIds((prev) => prev.filter((x) => x !== id));
      await syncAfterChange();
      onNotify('Elan silindi.', 'success');
    } catch (err) {
      onNotify(err instanceof ApiError ? err.message : 'Silinmə zamanı xəta.', 'error');
    }
  };

  const handleBulkAction = async (action: 'approve' | 'reject' | 'delete') => {
    if (selectedListingIds.length === 0) return;
    try {
      const res = await apiFetch<{ affected: number }>('/api/admin/listings/bulk', {
        method: 'POST',
        body: JSON.stringify({
          ids: selectedListingIds,
          action,
          reason: action === 'reject' ? 'Toplu yoxlamada qaydalara uyğun hesab edilmədi.' : undefined,
        }),
      });
      setSelectedListingIds([]);
      await syncAfterChange();
      onNotify(`${res.affected} elan üzərində toplu əməliyyat tamamlandı.`, 'success');
    } catch (err) {
      onNotify(err instanceof ApiError ? err.message : 'Toplu əməliyyat alınmadı.', 'error');
    }
  };

  // User actions
  const submitKick = async (e: FormEvent) => {
    e.preventDefault();
    if (!kickTarget) return;
    try {
      await apiFetch(`/api/admin/users/${kickTarget.id}/kick`, {
        method: 'POST',
        body: JSON.stringify({ minutes: kickMinutes, reason: kickReason.trim() || undefined }),
      });
      setKickTarget(null);
      setKickReason('');
      await syncAfterChange();
      onNotify(`${kickTarget.name} sessiyadan çıxarıldı (Kick).`, 'success');
    } catch (err) {
      onNotify(err instanceof ApiError ? err.message : 'Kick əməliyyatı alınmadı.', 'error');
    }
  };

  const submitBan = async (e: FormEvent) => {
    e.preventDefault();
    if (!banTarget) return;
    try {
      const durationDays = banDays === 'permanent' ? null : Number(banDays);
      await apiFetch(`/api/admin/users/${banTarget.id}/ban`, {
        method: 'POST',
        body: JSON.stringify({
          durationDays,
          reason: banReason.trim() || undefined,
          hideListings: banHideListings,
        }),
      });
      setBanTarget(null);
      setBanReason('');
      await syncAfterChange();
      onNotify(`${banTarget.name} bloklandı (Ban).`, 'success');
    } catch (err) {
      onNotify(err instanceof ApiError ? err.message : 'Ban əməliyyatı alınmadı.', 'error');
    }
  };

  const submitWarn = async (e: FormEvent) => {
    e.preventDefault();
    if (!warnTarget) return;
    try {
      await apiFetch(`/api/admin/users/${warnTarget.id}/warn`, {
        method: 'POST',
        body: JSON.stringify({ message: warnMessage.trim() }),
      });
      setWarnTarget(null);
      setWarnMessage('');
      await syncAfterChange();
      onNotify(`${warnTarget.name} istifadəçisinə rəsmi xəbərdarlıq göndərildi.`, 'success');
    } catch (err) {
      onNotify(err instanceof ApiError ? err.message : 'Xəbərdarlıq göndərilmədi.', 'error');
    }
  };

  const handleTogglePosting = async (u: PublicUser) => {
    try {
      await apiFetch(`/api/admin/users/${u.id}/toggle-posting`, { method: 'POST' });
      await syncAfterChange();
      onNotify(
        u.canPostListings ? `${u.name} üçün elan yerləşdirmə dayandırıldı.` : `${u.name} üçün elan yerləşdirmə açıldı.`,
        'success'
      );
    } catch (err) {
      onNotify(err instanceof ApiError ? err.message : 'Əməliyyat alınmadı.', 'error');
    }
  };

  const handleForceLogout = async (u: PublicUser) => {
    try {
      await apiFetch(`/api/admin/users/${u.id}/force-logout`, { method: 'POST' });
      await syncAfterChange();
      onNotify(`${u.name} bütün cihazlardan çıxış etdirildi.`, 'success');
    } catch (err) {
      onNotify(err instanceof ApiError ? err.message : 'Əməliyyat alınmadı.', 'error');
    }
  };

  const handleUnban = async (user: PublicUser) => {
    try {
      await apiFetch(`/api/admin/users/${user.id}/unban`, { method: 'POST' });
      await syncAfterChange();
      onNotify(`${user.name} üçün blok qaldırıldı.`, 'success');
    } catch (err) {
      onNotify(err instanceof ApiError ? err.message : 'Blok açılmadı.', 'error');
    }
  };

  const handleToggleVerify = async (user: PublicUser) => {
    try {
      await apiFetch(`/api/admin/users/${user.id}/verify`, { method: 'POST' });
      await syncAfterChange();
      onNotify('Satıcı təsdiq statusu yeniləndi.', 'success');
    } catch (err) {
      onNotify(err instanceof ApiError ? err.message : 'Yeniləmə alınmadı.', 'error');
    }
  };

  // Roles
  const handleGrantRole = async (e: FormEvent) => {
    e.preventDefault();
    try {
      const res = await apiFetch<{ preassigned?: boolean }>('/api/admin/roles/grant', {
        method: 'POST',
        body: JSON.stringify({
          email: grantEmail.trim(),
          role: grantRole,
          permissions: grantPerms,
        }),
      });
      setGrantEmail('');
      await loadAllAdminData();
      onNotify(
        res.preassigned
          ? 'Səlahiyyət Gmail ünvanına təyin edildi — istifadəçi daxil olduqda Admin Paneli avtomatik açılacaq.'
          : 'Admin Panel hüququ uğurla verildi.',
        'success'
      );
    } catch (err) {
      onNotify(err instanceof ApiError ? err.message : 'Hüquq verilmədi.', 'error');
    }
  };

  const handleToggleExistingAdminPerm = async (
    adminUser: PublicUser,
    key: keyof AdminPermissions,
    value: boolean
  ) => {
    try {
      const updatedPerms: AdminPermissions = {
        ...adminUser.permissions,
        [key]: value,
      };
      await apiFetch('/api/admin/roles/permissions', {
        method: 'PATCH',
        body: JSON.stringify({
          userId: adminUser.id,
          role: adminUser.role === 'moderator' ? 'moderator' : 'admin',
          permissions: updatedPerms,
        }),
      });
      await loadAllAdminData();
      onNotify(`${adminUser.name} üçün icazələr yeniləndi.`, 'success');
    } catch (err) {
      onNotify(err instanceof ApiError ? err.message : 'İcazə yenilənmədi.', 'error');
    }
  };

  const handleRevokeAdmin = async (email: string) => {
    try {
      await apiFetch('/api/admin/roles/grant', {
        method: 'POST',
        body: JSON.stringify({ email, role: 'user' }),
      });
      await loadAllAdminData();
      onNotify(`${email} istifadəçisindən admin hüququ geri alındı.`, 'success');
    } catch (err) {
      onNotify(err instanceof ApiError ? err.message : 'Geri alma uğursuz oldu.', 'error');
    }
  };

  const handleRemovePreassigned = async (email: string) => {
    try {
      await apiFetch(`/api/admin/roles/preassigned/${encodeURIComponent(email)}`, {
        method: 'DELETE',
      });
      await loadAllAdminData();
      onNotify('Öncədən təyin edilmiş icazə silindi.', 'success');
    } catch (err) {
      onNotify(err instanceof ApiError ? err.message : 'Silinmədi.', 'error');
    }
  };

  const handleToggleShadowban = async (u: PublicUser) => {
    try {
      const res = await apiFetch<{ user: PublicUser }>(`/api/moderator/users/${u.id}/shadowban`, {
        method: 'POST',
      });
      await syncAfterChange();
      onNotify(
        res.user.isShadowbanned
          ? `${u.name} Shadowban altına alındı (elanları gizlədildi).`
          : `${u.name} üzərindən Shadowban ləğv edildi.`,
        'success'
      );
    } catch (err) {
      onNotify(err instanceof ApiError ? err.message : 'Shadowban tətbiq edilmədi.', 'error');
    }
  };

  // Catalog
  const handleSaveCatalog = async (nextCatalog: CatalogConfig) => {
    try {
      const res = await apiFetch<{ catalog: CatalogConfig }>('/api/admin/catalog', {
        method: 'PUT',
        body: JSON.stringify(nextCatalog),
      });
      setCatalog(res.catalog);
      await onMarketplaceChanged();
      onNotify('Brend və şəhər kataloqu yeniləndi.', 'success');
    } catch (err) {
      onNotify(err instanceof ApiError ? err.message : 'Kataloq yenilənmədi.', 'error');
    }
  };

  // Broadcasts
  const handleSendBroadcast = async (e: FormEvent) => {
    e.preventDefault();
    try {
      await apiFetch('/api/admin/broadcasts', {
        method: 'POST',
        body: JSON.stringify({
          targetUserId: broadcastTargetId,
          kind: broadcastKind,
          title: broadcastTitle.trim(),
          message: broadcastMessage.trim(),
        }),
      });
      setBroadcastTitle('');
      setBroadcastMessage('');
      await loadAllAdminData();
      onNotify('Bildiriş uğurla göndərildi.', 'success');
    } catch (err) {
      onNotify(err instanceof ApiError ? err.message : 'Bildiriş göndərilmədi.', 'error');
    }
  };

  // Reports
  const handleResolveReport = async (
    reportId: string,
    status: 'resolved' | 'dismissed',
    options?: { deleteListing?: boolean; banSeller?: boolean }
  ) => {
    try {
      await apiFetch(`/api/admin/reports/${reportId}`, {
        method: 'PATCH',
        body: JSON.stringify({
          status,
          deleteListing: options?.deleteListing,
          banSeller: options?.banSeller,
          resolutionNote:
            options?.banSeller
              ? 'Satıcı bloklandı və elan silindi.'
              : options?.deleteListing
              ? 'Elan şikayət əsasında silindi.'
              : status === 'dismissed'
              ? 'Şikayət əsassız hesab edildi.'
              : 'Yoxlanıldı və həll edildi.',
        }),
      });
      await syncAfterChange();
      onNotify('Şikayət statusu yeniləndi.', 'success');
    } catch (err) {
      onNotify(err instanceof ApiError ? err.message : 'Şikayət yenilənmədi.', 'error');
    }
  };

  // Settings
  const handleSaveSettings = async (e: FormEvent) => {
    e.preventDefault();
    if (!settings) return;
    setSavingSettings(true);
    try {
      const blockedKeywords = keywordsDraft
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      await apiFetch('/api/admin/settings', {
        method: 'PATCH',
        body: JSON.stringify({
          ...settings,
          blockedKeywords,
        }),
      });
      await syncAfterChange();
      onNotify('Platforma ayarları yadda saxlanıldı.', 'success');
    } catch (err) {
      onNotify(err instanceof ApiError ? err.message : 'Ayarlar saxlanılmadı.', 'error');
    } finally {
      setSavingSettings(false);
    }
  };

  // Exports
  const exportListingsCsv = () => {
    const header = ['ID', 'Başlıq', 'Brend', 'Model', 'Qiymət AZN', 'Şəhər', 'Vəziyyət', 'Status', 'Satıcı Email', 'Baxış'];
    const rows = filteredListings.map((l) => [
      l.id,
      l.title,
      l.brand,
      l.model,
      l.price,
      l.city,
      l.condition,
      l.status,
      l.sellerEmail,
      l.views,
    ]);
    const csv = [header, ...rows].map((r) => r.map(escapeCsvCell).join(',')).join('\n');
    downloadTextFile(`telefonbazar-elanlar-${new Date().toISOString().slice(0, 10)}.csv`, `\uFEFF${csv}`, 'text/csv;charset=utf-8');
  };

  const exportUsersCsv = () => {
    const header = ['ID', 'Ad', 'Gmail', 'Rol', 'Status', 'Elan Sayı', 'Xəbərdarlıq', 'Elan İcazəsi'];
    const rows = filteredUsers.map((u) => [
      u.id,
      u.name,
      u.email,
      u.role,
      u.status,
      u.listingsCount ?? 0,
      u.warningsCount,
      u.canPostListings ? 'Açıq' : 'Bağlı',
    ]);
    const csv = [header, ...rows].map((r) => r.map(escapeCsvCell).join(',')).join('\n');
    downloadTextFile(`telefonbazar-istifadeciler-${new Date().toISOString().slice(0, 10)}.csv`, `\uFEFF${csv}`, 'text/csv;charset=utf-8');
  };

  const exportAuditCsv = () => {
    const header = ['Tarix', 'İcraçı', 'Əməliyyat', 'Kateqoriya', 'Hədəf', 'Səbəb/Qeyd'];
    const rows = filteredAuditLogs.map((log) => [
      log.createdAt,
      log.actorEmail,
      log.action,
      log.targetType,
      log.targetLabel,
      log.reason || '',
    ]);
    const csv = [header, ...rows].map((r) => r.map(escapeCsvCell).join(',')).join('\n');
    downloadTextFile(`telefonbazar-audit-${new Date().toISOString().slice(0, 10)}.csv`, `\uFEFF${csv}`, 'text/csv;charset=utf-8');
  };

  const handleDownloadBackup = async () => {
    try {
      const snapshot = await apiFetch<Record<string, unknown>>('/api/admin/backup');
      downloadTextFile(
        `telefonbazar-backup-${new Date().toISOString().slice(0, 10)}.json`,
        JSON.stringify(snapshot, null, 2),
        'application/json'
      );
      onNotify('Tam sistem ehtiyat nüsxəsi endirildi.', 'success');
    } catch (err) {
      onNotify(err instanceof ApiError ? err.message : 'Ehtiyat nüsxə endirilmədi.', 'error');
    }
  };

  // Filtered Lists
  const filteredListings = listings.filter((l) => {
    if (listingStatusFilter !== 'all' && l.status !== listingStatusFilter) return false;
    if (listingSearch.trim()) {
      const q = listingSearch.toLowerCase();
      return `${l.title} ${l.brand} ${l.model} ${l.sellerName} ${l.sellerEmail} ${l.city}`
        .toLowerCase()
        .includes(q);
    }
    return true;
  });

  const filteredUsers = users.filter((u) => {
    if (userStatusFilter === 'muted') {
      if (u.canPostListings) return false;
    } else if (userStatusFilter !== 'all' && u.status !== userStatusFilter) {
      return false;
    }
    if (userSearch.trim()) {
      const q = userSearch.toLowerCase();
      return `${u.name} ${u.email} ${u.role}`.toLowerCase().includes(q);
    }
    return true;
  });

  const filteredAuditLogs = allLogs.filter((log) => {
    if (auditTypeFilter !== 'all' && log.targetType !== auditTypeFilter) return false;
    if (auditSearch.trim()) {
      const q = auditSearch.toLowerCase();
      return `${log.actorEmail} ${log.action} ${log.targetLabel} ${log.reason || ''}`
        .toLowerCase()
        .includes(q);
    }
    return true;
  });

  const navItems: { key: AdminTab; label: string; icon: typeof LayoutDashboard; badge?: number }[] = [
    { key: 'overview', label: 'Ümumi Baxış', icon: LayoutDashboard },
    { key: 'listings', label: 'Elan İdarəetməsi', icon: Smartphone, badge: stats?.pendingListings || undefined },
    { key: 'users', label: 'İstifadəçilər & Kick/Ban', icon: Users },
    { key: 'roles', label: 'Rəşid & İcazələr', icon: Shield },
    { key: 'catalog', label: 'Brend & Şəhərlər', icon: Tags },
    { key: 'broadcasts', label: 'Bildiriş Göndərişi', icon: Megaphone },
    { key: 'reports', label: 'Şikayətlər', icon: Flag, badge: stats?.openReports || undefined },
    { key: 'audit', label: 'Audit Jurnalı', icon: ClipboardList },
    { key: 'backup', label: 'Baza & Ehtiyat Nüsxə', icon: Database },
    { key: 'settings', label: 'Platforma Ayarları', icon: Settings },
  ];

  const maxBrandCount = Math.max(1, ...(stats?.brandBreakdown.map((b) => b.count) ?? [1]));

  return (
    <div className="min-h-[calc(100vh-4rem)] flex flex-col lg:flex-row bg-[#F8FAFC]">
      {/* Dark Slate Admin Sidebar */}
      <aside className="w-full lg:w-[272px] shrink-0 bg-[#0B1120] text-[#E2E8F0] p-4 flex flex-col justify-between border-b lg:border-b-0 lg:border-r border-[#1E293B]">
        <div>
          <div className="px-3.5 py-3 mb-4 rounded-xl bg-[#111A2E] border border-[#1E293B]">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-[#94A3B8]">
              {adminActor?.isReshid ? 'Rəşid · Şəxsi İş Masası' : 'Admin İdarəetmə Paneli'}
            </p>
            <p className="text-sm font-bold text-white mt-1 truncate">
              {adminActor?.name || currentUser?.name || 'Baş Admin'}
            </p>
            <p className="text-[11px] text-[#60A5FA] mt-0.5 truncate">
              {adminActor?.isReshid
                ? 'Rəşid Admin & Moderator Səlahiyyəti'
                : adminActor?.authMethod === 'gmail'
                ? `${adminActor.email} · Gmail girişi`
                : adminActor?.authMethod === 'operator_passcode'
                ? 'İcazəli Operator (Şəxsi Parol)'
                : 'Baş Admin (Tam Səlahiyyət)'}
            </p>
          </div>

          <nav className="flex lg:flex-col gap-1 overflow-x-auto pb-1 lg:pb-0">
            {navItems.map((item) => {
              const Icon = item.icon;
              const active = tab === item.key;
              return (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => setTab(item.key)}
                  className={`flex items-center justify-between gap-2.5 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    active
                      ? 'bg-[#2563EB] text-white shadow-xs'
                      : 'text-[#CBD5E1] hover:bg-[#1E293B] hover:text-white'
                  }`}
                >
                  <span className="inline-flex items-center gap-2.5">
                    <Icon className="w-4 h-4 shrink-0" />
                    <span>{item.label}</span>
                  </span>
                  {item.badge !== undefined && item.badge > 0 && (
                    <span className="font-mono-tabular text-xs px-1.5 py-0.5 rounded bg-white/15 text-white">
                      {item.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>
        </div>

        <div className="hidden lg:block pt-4 mt-6 border-t border-[#1E293B] px-1 text-[11px] text-[#94A3B8] space-y-2.5">
          {canUseDangerousMod && onOpenModeratorPanel && (
            <button
              type="button"
              onClick={onOpenModeratorPanel}
              className="w-full px-3 py-2 rounded-lg bg-[#450A0A] hover:bg-[#7F1D1D] border border-[#991B1B] text-xs font-semibold text-[#FECACA] flex items-center justify-center gap-2 cursor-pointer"
            >
              <Flame className="w-3.5 h-3.5 text-[#F87171]" />
              {adminActor?.isReshid ? 'Rəşid Moderator Paneli' : 'Təhlükəli Moderator Paneli'}
            </button>
          )}
          {onLockAdmin && (
            <button
              type="button"
              onClick={onLockAdmin}
              className="w-full px-3 py-2 rounded-lg bg-[#1E293B] hover:bg-[#334155] border border-[#334155] text-xs font-semibold text-[#E2E8F0] flex items-center justify-center gap-2 cursor-pointer"
            >
              <Lock className="w-3.5 h-3.5" />
              Paneli Kilidlə
            </button>
          )}
          <div className="px-2">
            <p>Aktiv rejim:</p>
            <p className="text-[#CBD5E1] leading-relaxed mt-0.5">
              {adminActor?.authMethod === 'gmail'
                ? 'İcazəli Gmail hesabı ilə avtomatik giriş'
                : adminActor?.authMethod === 'operator_passcode'
                ? 'Şəxsi operator parolu ilə giriş'
                : 'Tam səlahiyyətli əsas parol sessiyası'}
            </p>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 min-w-0 p-4 sm:p-6 lg:p-8 space-y-6">
        {adminActor?.isReshid && (
          <div className="bg-[#0F172A] text-white rounded-xl border border-[#1E293B] px-5 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold text-[#60A5FA] uppercase tracking-wider">
                Rəşid — Şəxsi Admin & Moderator İş Masası
              </p>
              <p className="text-sm font-bold mt-0.5">
                Xoş gəldiniz, {adminActor.name}. Sizin üçün aktiv panellər:{' '}
                {[
                  adminActor.allowAdminPanel ? 'Admin Panel' : null,
                  adminActor.allowModeratorPanel ? 'Moderator Panel' : null,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </p>
            </div>
            {adminActor.allowModeratorPanel && onOpenModeratorPanel && (
              <button
                type="button"
                onClick={onOpenModeratorPanel}
                className="px-4 py-2 bg-[#DC2626] hover:bg-[#B91C1C] text-white text-xs font-bold rounded-lg inline-flex items-center gap-1.5 shrink-0 cursor-pointer"
              >
                <Flame className="w-3.5 h-3.5" />
                Rəşid Moderator Panelinə Keç
              </button>
            )}
          </div>
        )}

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-[#E2E8F0]">
          <div>
            <p className="text-xs text-[#64748B]">
              Admin Panel / {navItems.find((n) => n.key === tab)?.label}
            </p>
            <h1 className="text-xl font-bold text-[#0F172A] mt-0.5">
              {navItems.find((n) => n.key === tab)?.label}
            </h1>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={onCreateListing}
              className="px-3.5 py-2 text-xs font-semibold text-white bg-[#2563EB] hover:bg-[#1D4ED8] rounded-lg cursor-pointer inline-flex items-center gap-1.5 whitespace-nowrap"
            >
              <Plus className="w-3.5 h-3.5" />
              Yeni Elan Əlavə Et
            </button>
            <button
              type="button"
              onClick={() => loadAllAdminData()}
              className="px-3.5 py-2 text-xs font-medium text-[#374151] bg-white border border-[#D1D5DB] hover:bg-[#F9FAFB] rounded-lg cursor-pointer whitespace-nowrap"
            >
              Yenilə
            </button>
            {canUseDangerousMod && onOpenModeratorPanel && (
              <button
                type="button"
                onClick={onOpenModeratorPanel}
                className="px-3.5 py-2 text-xs font-semibold text-white bg-[#DC2626] hover:bg-[#B91C1C] rounded-lg cursor-pointer inline-flex items-center gap-1.5 whitespace-nowrap"
              >
                <Flame className="w-3.5 h-3.5" />
                Moderator Panel
              </button>
            )}
            {onLockAdmin && (
              <button
                type="button"
                onClick={onLockAdmin}
                className="px-3.5 py-2 text-xs font-medium text-[#374151] bg-white border border-[#D1D5DB] hover:bg-[#F9FAFB] rounded-lg cursor-pointer inline-flex items-center gap-1.5 whitespace-nowrap"
              >
                <Lock className="w-3.5 h-3.5" />
                Kilidlə
              </button>
            )}
            {onBackToMarket && (
              <button
                type="button"
                onClick={onBackToMarket}
                className="px-3.5 py-2 text-xs font-medium text-[#374151] bg-white border border-[#D1D5DB] hover:bg-[#F9FAFB] rounded-lg cursor-pointer whitespace-nowrap"
              >
                Elanlara Qayıt
              </button>
            )}
          </div>
        </div>

        {loading && !stats ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-24 bg-white rounded-xl border border-[#E4E7EC] animate-pulse" />
            ))}
          </div>
        ) : null}

        {/* ==================== 1. OVERVIEW ==================== */}
        {tab === 'overview' && stats && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
              <div className="bg-white rounded-xl border border-[#E4E7EC] p-5">
                <p className="text-xs font-medium text-[#6B7280]">Aktiv Elanlar / Baxışlar</p>
                <p className="mt-2 text-2xl font-bold text-[#111827] tabular-nums">
                  {stats.activeListings} <span className="text-sm font-normal text-[#6B7280]">/ {stats.totalViews} baxış</span>
                </p>
                <p className="mt-1 text-xs text-[#16A34A] tabular-nums">
                  Cəmi {stats.totalListings} elan · {stats.soldListings} satılıb
                </p>
              </div>
              <div className="bg-white rounded-xl border border-[#E4E7EC] p-5">
                <p className="text-xs font-medium text-[#6B7280]">Təsdiq Gözləyən Elanlar</p>
                <p className="mt-2 text-2xl font-bold text-[#D97706] tabular-nums">
                  {stats.pendingListings}
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setListingStatusFilter('pending');
                    setTab('listings');
                  }}
                  className="mt-1 text-xs font-medium text-[#2563EB] hover:underline cursor-pointer"
                >
                  Növbəni yoxla
                </button>
              </div>
              <div className="bg-white rounded-xl border border-[#E4E7EC] p-5">
                <p className="text-xs font-medium text-[#6B7280]">İstifadəçilər & Cəzalar</p>
                <p className="mt-2 text-2xl font-bold text-[#111827] tabular-nums">
                  {stats.totalUsers}
                </p>
                <p className="mt-1 text-xs text-[#6B7280] tabular-nums">
                  {stats.adminCount} admin · {stats.bannedUsers} ban · {stats.shadowbannedUsers} shadowban · {stats.blacklistedCount} qara siyahı
                </p>
              </div>
              <div className="bg-white rounded-xl border border-[#E4E7EC] p-5">
                <p className="text-xs font-medium text-[#6B7280]">Aktiv Bazar Dəyəri</p>
                <p className="mt-2 text-2xl font-bold text-[#111827] tabular-nums">
                  {formatPriceAzn(stats.totalMarketValueAzn)}
                </p>
                <p className="mt-1 text-xs text-[#DC2626] tabular-nums">
                  {stats.openReports} açıq şikayət · Baza: {dbSizeKb} KB
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
              <div className="xl:col-span-4 bg-white rounded-xl border border-[#E4E7EC] p-6">
                <h2 className="text-base font-bold text-[#111827] mb-4">Brend Paylanması</h2>
                <div className="space-y-3.5">
                  {stats.brandBreakdown.map((b) => (
                    <div key={b.brand} className="space-y-1.5">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-semibold text-[#111827]">{b.brand}</span>
                        <span className="text-[#4B5563] tabular-nums">
                          {b.count} · {formatPriceAzn(b.valueAzn)}
                        </span>
                      </div>
                      <div className="h-2 bg-[#F3F4F6] rounded-full overflow-hidden">
                        <div
                          className="h-full bg-[#2563EB] rounded-full"
                          style={{ width: `${Math.max(8, Math.round((b.count / maxBrandCount) * 100))}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="xl:col-span-4 bg-white rounded-xl border border-[#E4E7EC] p-6">
                <h2 className="text-base font-bold text-[#111827] mb-4">Ən Çox Baxılan Elanlar</h2>
                <div className="divide-y divide-[#F3F4F6]">
                  {stats.topViewedListings.map((item, idx) => (
                    <div key={item.id} className="py-2.5 flex items-center justify-between gap-3 text-xs">
                      <div className="min-w-0">
                        <p className="font-semibold text-[#111827] truncate">
                          {idx + 1}. {item.title}
                        </p>
                        <p className="text-[#6B7280] tabular-nums mt-0.5">{formatPriceAzn(item.price)}</p>
                      </div>
                      <span className="font-mono-tabular font-semibold text-[#2563EB] shrink-0">
                        {item.views} baxış
                      </span>
                    </div>
                  ))}
                </div>

                <h3 className="text-sm font-bold text-[#111827] mt-5 mb-2">Şəhərlər üzrə</h3>
                <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-[#4B5563]">
                  {stats.cityBreakdown.map((c) => (
                    <span key={c.city} className="tabular-nums">
                      <strong className="text-[#111827]">{c.city}:</strong> {c.count}
                    </span>
                  ))}
                </div>
              </div>

              <div className="xl:col-span-4 bg-white rounded-xl border border-[#E4E7EC] p-6">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-base font-bold text-[#111827]">Son Fəaliyyətlər</h2>
                  <button
                    type="button"
                    onClick={() => setTab('audit')}
                    className="text-xs font-medium text-[#2563EB] hover:underline cursor-pointer"
                  >
                    Hamısı
                  </button>
                </div>
                <div className="divide-y divide-[#F3F4F6]">
                  {recentLogs.slice(0, 6).map((log) => (
                    <div key={log.id} className="py-2.5 flex items-start justify-between gap-3 text-xs">
                      <div className="min-w-0">
                        <p className="font-semibold text-[#111827] truncate">{log.action}</p>
                        <p className="text-[#4B5563] truncate">{log.targetLabel}</p>
                      </div>
                      <span className="text-[#9CA3AF] shrink-0 tabular-nums">
                        {formatRelativeAz(log.createdAt)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ==================== 2. LISTINGS MODERATION ==================== */}
        {tab === 'listings' && (
          <div className="space-y-4">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
              <div className="inline-flex flex-wrap items-center gap-1 p-1 bg-[#E5E7EB]/60 rounded-lg">
                {(
                  [
                    { key: 'all', label: 'Hamısı' },
                    { key: 'pending', label: 'Gözləmədə' },
                    { key: 'active', label: 'Aktiv' },
                    { key: 'sold', label: 'Satıldı' },
                    { key: 'rejected', label: 'Rədd edildi' },
                  ] as const
                ).map((item) => (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => setListingStatusFilter(item.key)}
                    className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap ${
                      listingStatusFilter === item.key
                        ? 'bg-white text-[#111827] shadow-xs'
                        : 'text-[#4B5563] hover:text-[#111827]'
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-2">
                <div className="relative flex-1 md:w-72">
                  <Search className="w-4 h-4 text-[#9CA3AF] absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={listingSearch}
                    onChange={(e) => setListingSearch(e.target.value)}
                    placeholder="Model, satıcı və ya Gmail axtar..."
                    className="w-full pl-9 pr-3 py-2 text-xs bg-white border border-[#D1D5DB] rounded-lg"
                  />
                </div>
                <button
                  type="button"
                  onClick={exportListingsCsv}
                  className="px-3 py-2 text-xs font-medium text-[#374151] bg-white border border-[#D1D5DB] hover:bg-[#F9FAFB] rounded-lg inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
                >
                  <Download className="w-3.5 h-3.5" />
                  CSV İxrac
                </button>
              </div>
            </div>

            {selectedListingIds.length > 0 && (
              <div className="p-3 bg-[#EFF6FF] border border-[#BFDBFE] rounded-xl flex flex-wrap items-center justify-between gap-3">
                <span className="text-xs font-semibold text-[#1E3A8A] tabular-nums">
                  {selectedListingIds.length} elan seçilib
                </span>
                <div className="flex flex-wrap items-center gap-2">
                  {canApprove && (
                    <>
                      <button
                        type="button"
                        onClick={() => handleBulkAction('approve')}
                        className="px-3 py-1.5 text-xs font-semibold text-white bg-[#16A34A] hover:bg-[#15803D] rounded-lg cursor-pointer"
                      >
                        Toplu Təsdiqlə
                      </button>
                      <button
                        type="button"
                        onClick={() => handleBulkAction('reject')}
                        className="px-3 py-1.5 text-xs font-semibold text-white bg-[#D97706] hover:bg-[#B45309] rounded-lg cursor-pointer"
                      >
                        Toplu Rədd Et
                      </button>
                    </>
                  )}
                  {canEditDelete && (
                    <button
                      type="button"
                      onClick={() => handleBulkAction('delete')}
                      className="px-3 py-1.5 text-xs font-semibold text-white bg-[#DC2626] hover:bg-[#B91C1C] rounded-lg cursor-pointer"
                    >
                      Toplu Sil
                    </button>
                  )}
                </div>
              </div>
            )}

            <div className="bg-white rounded-xl border border-[#E4E7EC] overflow-x-auto">
              <table className="w-full text-left border-collapse min-w-[840px]">
                <thead>
                  <tr className="border-b border-[#E4E7EC] bg-[#F9FAFB] text-[11px] font-semibold text-[#6B7280]">
                    <th className="py-3 px-4 w-10">
                      <input
                        type="checkbox"
                        checked={
                          filteredListings.length > 0 &&
                          filteredListings.every((l) => selectedListingIds.includes(l.id))
                        }
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedListingIds(filteredListings.map((l) => l.id));
                          } else {
                            setSelectedListingIds([]);
                          }
                        }}
                      />
                    </th>
                    <th className="py-3 px-3">Telefon Elanı</th>
                    <th className="py-3 px-3">Satıcı</th>
                    <th className="py-3 px-3 text-right">Qiymət</th>
                    <th className="py-3 px-3 text-right">Baxış</th>
                    <th className="py-3 px-3">Status</th>
                    <th className="py-3 px-4 text-right">Əməliyyatlar</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#F3F4F6] text-xs">
                  {filteredListings.map((l) => (
                    <tr key={l.id} className="hover:bg-[#F9FAFB]/70 transition-colors">
                      <td className="py-3 px-4">
                        <input
                          type="checkbox"
                          checked={selectedListingIds.includes(l.id)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedListingIds((prev) => [...prev, l.id]);
                            } else {
                              setSelectedListingIds((prev) => prev.filter((x) => x !== l.id));
                            }
                          }}
                        />
                      </td>
                      <td className="py-3 px-3">
                        <div className="flex items-center gap-3">
                          <img
                            src={l.imageUrl}
                            alt={l.title}
                            referrerPolicy="no-referrer"
                            className="w-11 h-9 rounded-md object-cover bg-[#F3F4F6] border border-[#E4E7EC] shrink-0"
                          />
                          <div className="min-w-0">
                            <button
                              type="button"
                              onClick={() => onViewListing(l)}
                              className="font-semibold text-[#111827] hover:text-[#2563EB] text-left truncate max-w-[250px] block cursor-pointer"
                            >
                              {l.title}
                            </button>
                            <p className="text-[#6B7280] mt-0.5">
                              {l.city} · {l.storage} · {l.isFeatured ? 'VIP Elan' : 'Standart'}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="py-3 px-3">
                        <p className="font-medium text-[#111827]">{l.sellerName}</p>
                        <p className="text-[#6B7280]">{l.sellerEmail}</p>
                      </td>
                      <td className="py-3 px-3 text-right font-bold text-[#111827] tabular-nums whitespace-nowrap">
                        {formatPriceAzn(l.price)}
                      </td>
                      <td className="py-3 px-3 text-right tabular-nums text-[#4B5563]">
                        {l.views}
                      </td>
                      <td className="py-3 px-3 whitespace-nowrap">
                        <span
                          className={`font-semibold ${
                            l.status === 'active'
                              ? 'text-[#16A34A]'
                              : l.status === 'pending'
                              ? 'text-[#D97706]'
                              : l.status === 'rejected'
                              ? 'text-[#DC2626]'
                              : 'text-[#6B7280]'
                          }`}
                        >
                          {l.status === 'active'
                            ? 'Aktiv'
                            : l.status === 'pending'
                            ? 'Gözləmədə'
                            : l.status === 'rejected'
                            ? 'Rədd edilib'
                            : 'Satıldı'}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-1.5">
                          {canApprove && l.status !== 'active' && (
                            <button
                              type="button"
                              title="Təsdiqlə"
                              onClick={() => handleModerateListing(l.id, 'approve')}
                              className="p-1.5 rounded-md text-[#16A34A] hover:bg-[#F0FDF4] cursor-pointer"
                            >
                              <CheckCircle2 className="w-4 h-4" />
                            </button>
                          )}
                          {canApprove && l.status !== 'rejected' && (
                            <button
                              type="button"
                              title="Rədd et"
                              onClick={() => {
                                setRejectTarget(l);
                                setRejectReason('');
                              }}
                              className="p-1.5 rounded-md text-[#D97706] hover:bg-[#FFFBEB] cursor-pointer"
                            >
                              <XCircle className="w-4 h-4" />
                            </button>
                          )}
                          {canEditDelete && (
                            <>
                              <button
                                type="button"
                                title={l.isFeatured ? 'VIP-dən çıxar' : 'VIP Elan et'}
                                onClick={() => handleModerateListing(l.id, 'toggle_featured')}
                                className={`p-1.5 rounded-md cursor-pointer ${
                                  l.isFeatured
                                    ? 'text-[#2563EB] bg-[#EFF6FF]'
                                    : 'text-[#6B7280] hover:bg-[#F3F4F6]'
                                }`}
                              >
                                <Pin className="w-4 h-4" />
                              </button>
                              <button
                                type="button"
                                title="Redaktə et"
                                onClick={() => onEditListing(l)}
                                className="p-1.5 rounded-md text-[#374151] hover:bg-[#F3F4F6] cursor-pointer"
                              >
                                <Edit3 className="w-4 h-4" />
                              </button>
                              <button
                                type="button"
                                title="Sil"
                                onClick={() => handleDeleteListing(l.id)}
                                className="p-1.5 rounded-md text-[#DC2626] hover:bg-[#FEF2F2] cursor-pointer"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                  {filteredListings.length === 0 && (
                    <tr>
                      <td colSpan={7} className="py-10 text-center text-sm text-[#6B7280]">
                        Axtarışa uyğun elan tapılmadı.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ==================== 3. USERS, KICK, BAN, WARN & MUTE ==================== */}
        {tab === 'users' && (
          <div className="space-y-4">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
              <div className="inline-flex flex-wrap items-center gap-1 p-1 bg-[#E5E7EB]/60 rounded-lg">
                {(
                  [
                    { key: 'all', label: 'Hamısı' },
                    { key: 'active', label: 'Aktiv' },
                    { key: 'kicked', label: 'Kick Edilmiş' },
                    { key: 'banned', label: 'Ban Edilmiş' },
                    { key: 'muted', label: 'Elan Məhdudiyyətli' },
                  ] as const
                ).map((item) => (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => setUserStatusFilter(item.key)}
                    className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap ${
                      userStatusFilter === item.key
                        ? 'bg-white text-[#111827] shadow-xs'
                        : 'text-[#4B5563] hover:text-[#111827]'
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-2">
                <div className="relative flex-1 md:w-72">
                  <Search className="w-4 h-4 text-[#9CA3AF] absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={userSearch}
                    onChange={(e) => setUserSearch(e.target.value)}
                    placeholder="Ad və ya Gmail axtar..."
                    className="w-full pl-9 pr-3 py-2 text-xs bg-white border border-[#D1D5DB] rounded-lg"
                  />
                </div>
                <button
                  type="button"
                  onClick={exportUsersCsv}
                  className="px-3 py-2 text-xs font-medium text-[#374151] bg-white border border-[#D1D5DB] hover:bg-[#F9FAFB] rounded-lg inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
                >
                  <Download className="w-3.5 h-3.5" />
                  CSV İxrac
                </button>
              </div>
            </div>

            <div className="bg-white rounded-xl border border-[#E4E7EC] overflow-x-auto">
              <table className="w-full text-left border-collapse min-w-[960px]">
                <thead>
                  <tr className="border-b border-[#E4E7EC] bg-[#F9FAFB] text-[11px] font-semibold text-[#6B7280]">
                    <th className="py-3 px-4">İstifadəçi / Gmail</th>
                    <th className="py-3 px-3">Rol</th>
                    <th className="py-3 px-3 text-right">Elan / Xəbərdarlıq</th>
                    <th className="py-3 px-3">Status</th>
                    <th className="py-3 px-4 text-right">Moderasiya Əməliyyatları</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#F3F4F6] text-xs">
                  {filteredUsers.map((u) => {
                    const isSelf = currentUser ? u.id === currentUser.id : false;
                    const isTargetSuper = u.role === 'super_admin';
                    return (
                      <tr key={u.id} className="hover:bg-[#F9FAFB]/70">
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-3">
                            <span
                              className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0"
                              style={{ backgroundColor: u.avatarColor }}
                            >
                              {u.name.slice(0, 1).toUpperCase()}
                            </span>
                            <div>
                              <p className="font-semibold text-[#111827] flex items-center gap-1.5">
                                {u.name}
                                {u.verifiedSeller && (
                                  <CheckCircle2 className="w-3.5 h-3.5 text-[#2563EB]" />
                                )}
                              </p>
                              <p className="text-[#6B7280]">{u.email}</p>
                            </div>
                          </div>
                        </td>
                        <td className="py-3 px-3 whitespace-nowrap font-medium">
                          {u.role === 'super_admin'
                            ? 'Baş Admin'
                            : u.role === 'admin'
                            ? 'Admin'
                            : u.role === 'moderator'
                            ? 'Moderator'
                            : 'İstifadəçi'}
                        </td>
                        <td className="py-3 px-3 text-right tabular-nums">
                          <span className="font-semibold text-[#111827]">{u.listingsCount ?? 0} elan</span>
                          <span className="text-[#9CA3AF]"> · </span>
                          <span className={u.warningsCount > 0 ? 'text-[#D97706] font-semibold' : 'text-[#6B7280]'}>
                            {u.warningsCount} xəbərdarlıq
                          </span>
                        </td>
                        <td className="py-3 px-3">
                          <div className="space-y-0.5">
                            <span
                              className={`font-semibold ${
                                u.status === 'active'
                                  ? 'text-[#16A34A]'
                                  : u.status === 'kicked'
                                  ? 'text-[#D97706]'
                                  : 'text-[#DC2626]'
                              }`}
                            >
                              {u.status === 'active'
                                ? 'Aktiv'
                                : u.status === 'kicked'
                                ? 'Kick edilib'
                                : 'Ban edilib'}
                            </span>
                            {!u.canPostListings && (
                              <p className="text-[11px] font-medium text-[#B45309]">Elan qadağası aktivdir</p>
                            )}
                            {u.isShadowbanned && (
                              <p className="text-[11px] font-semibold text-[#DC2626]">Shadowban (Kölgə Blok)</p>
                            )}
                            {(u.banReason || u.kickReason) && (
                              <p className="text-[11px] text-[#6B7280] max-w-[180px] truncate">
                                {u.banReason || u.kickReason}
                              </p>
                            )}
                          </div>
                        </td>
                        <td className="py-3 px-4 text-right whitespace-nowrap">
                          <div className="inline-flex flex-wrap items-center justify-end gap-1.5">
                            <button
                              type="button"
                              onClick={() => handleToggleVerify(u)}
                              className="px-2 py-1 text-[11px] font-medium border border-[#D1D5DB] text-[#374151] hover:bg-[#F3F4F6] rounded-md cursor-pointer inline-flex items-center gap-1"
                            >
                              <UserCheck className="w-3 h-3" />
                              {u.verifiedSeller ? 'Təsdiqi al' : 'Təsdiqlə'}
                            </button>

                            {isSuperAdmin && !isTargetSuper && u.role === 'user' && (
                              <button
                                type="button"
                                onClick={() => {
                                  setGrantEmail(u.email);
                                  setGrantRole('admin');
                                  setGrantPerms({ ...DEFAULT_ADMIN_PERMS });
                                  setTab('roles');
                                }}
                                className="px-2 py-1 text-[11px] font-medium border border-[#BFDBFE] text-[#2563EB] hover:bg-[#EFF6FF] rounded-md cursor-pointer inline-flex items-center gap-1"
                              >
                                <Shield className="w-3 h-3" />
                                Admin Ver
                              </button>
                            )}

                            {canKickBan && !isSelf && !isTargetSuper && (
                              <>
                                <button
                                  type="button"
                                  title="Xəbərdarlıq göndər"
                                  onClick={() => {
                                    setWarnTarget(u);
                                    setWarnMessage('');
                                  }}
                                  className="px-2 py-1 text-[11px] font-medium border border-[#D1D5DB] text-[#374151] hover:bg-[#F3F4F6] rounded-md cursor-pointer inline-flex items-center gap-1"
                                >
                                  <AlertTriangle className="w-3 h-3 text-[#D97706]" />
                                  Xəbərdarlıq
                                </button>

                                <button
                                  type="button"
                                  title="Elan yerləşdirmə məhdudiyyəti"
                                  onClick={() => handleTogglePosting(u)}
                                  className={`px-2 py-1 text-[11px] font-medium border rounded-md cursor-pointer inline-flex items-center gap-1 ${
                                    u.canPostListings
                                      ? 'border-[#D1D5DB] text-[#374151] hover:bg-[#F3F4F6]'
                                      : 'border-[#FDE68A] bg-[#FFFBEB] text-[#B45309]'
                                  }`}
                                >
                                  <Lock className="w-3 h-3" />
                                  {u.canPostListings ? 'Elanı Bağla' : 'Elanı Aç'}
                                </button>

                                <button
                                  type="button"
                                  title="Bütün cihazlardan çıxar"
                                  onClick={() => handleForceLogout(u)}
                                  className="px-2 py-1 text-[11px] font-medium border border-[#D1D5DB] text-[#374151] hover:bg-[#F3F4F6] rounded-md cursor-pointer inline-flex items-center gap-1"
                                >
                                  <LogOut className="w-3 h-3" />
                                  Sessiya Kəs
                                </button>

                                {canUseDangerousMod && (
                                  <button
                                    type="button"
                                    title="Shadowban — alıcılardan elanları gizlət"
                                    onClick={() => handleToggleShadowban(u)}
                                    className={`px-2 py-1 text-[11px] font-medium border rounded-md cursor-pointer inline-flex items-center gap-1 ${
                                      u.isShadowbanned
                                        ? 'border-[#DC2626] bg-[#FEF2F2] text-[#DC2626]'
                                        : 'border-[#D1D5DB] text-[#374151] hover:bg-[#F3F4F6]'
                                    }`}
                                  >
                                    <EyeOff className="w-3 h-3" />
                                    {u.isShadowbanned ? 'Shadowban Aç' : 'Shadowban'}
                                  </button>
                                )}

                                {u.status === 'active' ? (
                                  <>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setKickTarget(u);
                                        setKickMinutes(15);
                                        setKickReason('');
                                      }}
                                      className="px-2 py-1 text-[11px] font-medium border border-[#FDE68A] text-[#B45309] bg-[#FFFBEB] hover:bg-[#FEF3C7] rounded-md cursor-pointer inline-flex items-center gap-1"
                                    >
                                      <UserX className="w-3 h-3" />
                                      Kick
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setBanTarget(u);
                                        setBanDays('permanent');
                                        setBanReason('');
                                        setBanHideListings(true);
                                      }}
                                      className="px-2 py-1 text-[11px] font-medium border border-[#FECACA] text-[#DC2626] bg-[#FEF2F2] hover:bg-[#FEE2E2] rounded-md cursor-pointer inline-flex items-center gap-1"
                                    >
                                      <Ban className="w-3 h-3" />
                                      Ban
                                    </button>
                                  </>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() => handleUnban(u)}
                                    className="px-2 py-1 text-[11px] font-medium border border-[#BBF7D0] text-[#15803D] bg-[#F0FDF4] hover:bg-[#DCFCE7] rounded-md cursor-pointer inline-flex items-center gap-1"
                                  >
                                    <Unlock className="w-3 h-3" />
                                    Bloku Aç
                                  </button>
                                )}
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ==================== 4. RƏŞİD & ROLE DELEGATION ==================== */}
        {tab === 'roles' && (
          <div className="space-y-8">
            <DelegatedAccessManager
              theme="light"
              canManageAccess={canManageAccess}
              onNotify={onNotify}
              onChanged={loadAllAdminData}
            />

            <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
            <div className="xl:col-span-5 bg-white rounded-xl border border-[#E4E7EC] p-6 space-y-5 h-fit">
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-lg bg-[#EFF6FF] text-[#2563EB] flex items-center justify-center shrink-0">
                  <UserPlus className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-[#111827]">
                    İstədiyiniz Şəxsə Admin Panel Verin
                  </h2>
                  <p className="text-xs text-[#6B7280] mt-1 leading-relaxed">
                    İstənilən Gmail ünvanını yazaraq ona Admin və ya Moderator səlahiyyəti verin — bütün bölmə icazələrini ayrı-ayrılıqda seçə bilərsiniz.
                  </p>
                </div>
              </div>

              {!isOwner ? (
                <div className="p-4 rounded-xl bg-[#FEF2F2] border border-[#FECACA] text-xs text-[#991B1B] leading-relaxed">
                  Admin Panel və Moderator Panel səlahiyyətlərini yalnız Baş Admin (
                  <strong>{OWNER_EMAIL}</strong>) verə və ya geri ala bilər.
                </div>
              ) : (
                <form onSubmit={handleGrantRole} className="space-y-4">
                  <div>
                    <label className="block text-xs font-medium text-[#374151] mb-1">
                      Gmail Ünvanı
                    </label>
                    <input
                      type="email"
                      required
                      value={grantEmail}
                      onChange={(e) => setGrantEmail(e.target.value)}
                      placeholder="numune@gmail.com"
                      className="w-full px-3.5 py-2 text-sm rounded-lg border border-[#D1D5DB]"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-[#374151] mb-1">
                      Səlahiyyət Dərəcəsi
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setGrantRole('admin');
                          setGrantPerms({ ...DEFAULT_ADMIN_PERMS });
                        }}
                        className={`py-2 px-3 rounded-lg border text-xs font-semibold cursor-pointer ${
                          grantRole === 'admin'
                            ? 'border-[#2563EB] bg-[#EFF6FF] text-[#1D4ED8]'
                            : 'border-[#D1D5DB] text-[#374151]'
                        }`}
                      >
                        Tam Admin
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setGrantRole('moderator');
                          setGrantPerms({ ...DEFAULT_MOD_PERMS });
                        }}
                        className={`py-2 px-3 rounded-lg border text-xs font-semibold cursor-pointer ${
                          grantRole === 'moderator'
                            ? 'border-[#2563EB] bg-[#EFF6FF] text-[#1D4ED8]'
                            : 'border-[#D1D5DB] text-[#374151]'
                        }`}
                      >
                        Moderator
                      </button>
                    </div>
                  </div>

                  <div className="space-y-1.5 pt-1">
                    <p className="text-xs font-semibold text-[#374151]">
                      Admin Paneli daxilindəki icazələr:
                    </p>
                    {PERM_LABELS.map((perm) => (
                      <label
                        key={perm.key}
                        className="flex items-center gap-2.5 text-xs text-[#374151] cursor-pointer py-1"
                      >
                        <input
                          type="checkbox"
                          checked={grantPerms[perm.key]}
                          onChange={(e) =>
                            setGrantPerms((prev) => ({ ...prev, [perm.key]: e.target.checked }))
                          }
                          className="rounded border-[#D1D5DB] text-[#2563EB]"
                        />
                        <span>{perm.label}</span>
                      </label>
                    ))}
                  </div>

                  <button
                    type="submit"
                    className="w-full py-2.5 px-4 bg-[#2563EB] hover:bg-[#1D4ED8] text-white text-sm font-semibold rounded-lg cursor-pointer"
                  >
                    Admin Panel Hüququ Ver
                  </button>
                </form>
              )}
            </div>

            <div className="xl:col-span-7 space-y-6">
              <div className="bg-white rounded-xl border border-[#E4E7EC] p-6">
                <h3 className="text-base font-bold text-[#111827] mb-4">
                  Hazırkı Admin Heyəti ({admins.length})
                </h3>
                <div className="divide-y divide-[#F3F4F6]">
                  {admins.map((admin) => (
                    <div key={admin.id} className="py-4 space-y-3">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-[#111827] flex items-center gap-2">
                            <span>{admin.name}</span>
                            <span className="text-xs font-medium text-[#2563EB]">
                              {admin.role === 'super_admin'
                                ? 'Baş Admin'
                                : admin.role === 'admin'
                                ? 'Admin'
                                : 'Moderator'}
                            </span>
                          </p>
                          <p className="text-xs text-[#6B7280]">{admin.email}</p>
                        </div>

                        {isSuperAdmin && admin.role !== 'super_admin' && (
                          <button
                            type="button"
                            onClick={() => handleRevokeAdmin(admin.email)}
                            className="self-start sm:self-center px-3 py-1.5 text-xs font-medium text-[#DC2626] border border-[#FECACA] hover:bg-[#FEF2F2] rounded-lg cursor-pointer whitespace-nowrap"
                          >
                            Adminlikdən Çıxar
                          </button>
                        )}
                      </div>

                      {admin.role === 'super_admin' ? (
                        <p className="text-[11px] text-[#4B5563]">
                          Bütün sistem səlahiyyətləri aktivdir (Baş Admin dəyişdirilə bilməz).
                        </p>
                      ) : isSuperAdmin ? (
                        <div className="flex flex-wrap gap-x-4 gap-y-1.5 pt-1">
                          {PERM_LABELS.map((perm) => (
                            <label
                              key={perm.key}
                              className="inline-flex items-center gap-1.5 text-[11px] text-[#374151] cursor-pointer"
                            >
                              <input
                                type="checkbox"
                                checked={admin.permissions[perm.key]}
                                onChange={(e) =>
                                  handleToggleExistingAdminPerm(admin, perm.key, e.target.checked)
                                }
                                className="rounded border-[#D1D5DB] text-[#2563EB]"
                              />
                              <span>{perm.short}</span>
                            </label>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  ))}
                </div>
              </div>

              {preassignedRoles.length > 0 && (
                <div className="bg-white rounded-xl border border-[#E4E7EC] p-6">
                  <h3 className="text-sm font-bold text-[#111827] mb-3">
                    Giriş Gözləyən Təyinatlar ({preassignedRoles.length})
                  </h3>
                  <div className="divide-y divide-[#F3F4F6]">
                    {preassignedRoles.map((pre) => (
                      <div key={pre.email} className="py-2.5 flex items-center justify-between gap-3 text-xs">
                        <div>
                          <p className="font-semibold text-[#111827]">{pre.email}</p>
                          <p className="text-[#6B7280]">
                            Rol: {pre.role === 'admin' ? 'Admin' : 'Moderator'} · Təyin edən: {pre.assignedBy}
                          </p>
                        </div>
                        {isOwner && (
                          <button
                            type="button"
                            onClick={() => handleRemovePreassigned(pre.email)}
                            className="text-[#DC2626] hover:underline cursor-pointer"
                          >
                            Ləğv et
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
            </div>
          </div>
        )}

        {/* ==================== 5. CATALOG MANAGER (BRANDS & CITIES) ==================== */}
        {tab === 'catalog' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white rounded-xl border border-[#E4E7EC] p-6 space-y-4">
              <h2 className="text-base font-bold text-[#111827]">Telefon Brendləri ({catalog.brands.length})</h2>
              <p className="text-xs text-[#6B7280]">
                Buraya əlavə etdiyiniz brendlər həm elan yerləşdirmə formunda, həm də sayt filtrlərində görünür.
              </p>

              {canManageCatalog && (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    const trimmed = newBrandName.trim();
                    if (!trimmed || catalog.brands.includes(trimmed)) return;
                    setNewBrandName('');
                    handleSaveCatalog({ ...catalog, brands: [...catalog.brands, trimmed] });
                  }}
                  className="flex gap-2"
                >
                  <input
                    type="text"
                    value={newBrandName}
                    onChange={(e) => setNewBrandName(e.target.value)}
                    placeholder="Yeni brend adı (məs: Nothing, Sony)"
                    className="flex-1 px-3 py-2 text-sm rounded-lg border border-[#D1D5DB]"
                  />
                  <button
                    type="submit"
                    className="px-4 py-2 bg-[#2563EB] hover:bg-[#1D4ED8] text-white text-xs font-semibold rounded-lg cursor-pointer"
                  >
                    Əlavə et
                  </button>
                </form>
              )}

              <div className="divide-y divide-[#F3F4F6]">
                {catalog.brands.map((b) => (
                  <div key={b} className="py-2.5 flex items-center justify-between text-sm">
                    <span className="font-medium text-[#111827]">{b}</span>
                    {canManageCatalog && catalog.brands.length > 1 && (
                      <button
                        type="button"
                        onClick={() =>
                          handleSaveCatalog({
                            ...catalog,
                            brands: catalog.brands.filter((item) => item !== b),
                          })
                        }
                        className="text-xs text-[#DC2626] hover:underline cursor-pointer"
                      >
                        Sil
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-white rounded-xl border border-[#E4E7EC] p-6 space-y-4">
              <h2 className="text-base font-bold text-[#111827]">Şəhər və Regionlar ({catalog.cities.length})</h2>
              <p className="text-xs text-[#6B7280]">
                İstifadəçilərin elan seçimi zamanı istifadə edə biləcəyi şəhərlər siyahısı.
              </p>

              {canManageCatalog && (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    const trimmed = newCityName.trim();
                    if (!trimmed || catalog.cities.includes(trimmed)) return;
                    setNewCityName('');
                    handleSaveCatalog({ ...catalog, cities: [...catalog.cities, trimmed] });
                  }}
                  className="flex gap-2"
                >
                  <input
                    type="text"
                    value={newCityName}
                    onChange={(e) => setNewCityName(e.target.value)}
                    placeholder="Yeni şəhər adı (məs: Qəbələ, Xırdalan)"
                    className="flex-1 px-3 py-2 text-sm rounded-lg border border-[#D1D5DB]"
                  />
                  <button
                    type="submit"
                    className="px-4 py-2 bg-[#2563EB] hover:bg-[#1D4ED8] text-white text-xs font-semibold rounded-lg cursor-pointer"
                  >
                    Əlavə et
                  </button>
                </form>
              )}

              <div className="divide-y divide-[#F3F4F6]">
                {catalog.cities.map((c) => (
                  <div key={c} className="py-2.5 flex items-center justify-between text-sm">
                    <span className="font-medium text-[#111827]">{c}</span>
                    {canManageCatalog && catalog.cities.length > 1 && (
                      <button
                        type="button"
                        onClick={() =>
                          handleSaveCatalog({
                            ...catalog,
                            cities: catalog.cities.filter((item) => item !== c),
                          })
                        }
                        className="text-xs text-[#DC2626] hover:underline cursor-pointer"
                      >
                        Sil
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ==================== 6. BROADCASTS & NOTIFICATIONS ==================== */}
        {tab === 'broadcasts' && (
          <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
            <div className="xl:col-span-5 bg-white rounded-xl border border-[#E4E7EC] p-6 space-y-4 h-fit">
              <h2 className="text-base font-bold text-[#111827]">Bildiriş & Elan Göndər</h2>
              {!canSendBroadcasts ? (
                <p className="text-xs text-[#6B7280]">Bildiriş göndərmək üçün səlahiyyətiniz yoxdur.</p>
              ) : (
                <form onSubmit={handleSendBroadcast} className="space-y-4">
                  <div>
                    <label className="block text-xs font-medium text-[#374151] mb-1">Alıcı</label>
                    <select
                      value={broadcastTargetId}
                      onChange={(e) => setBroadcastTargetId(e.target.value)}
                      className="w-full px-3 py-2 text-sm rounded-lg border border-[#D1D5DB] bg-white"
                    >
                      <option value="all">Bütün İstifadəçilərə (Ümumi Elan)</option>
                      {users.map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.name} ({u.email})
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-[#374151] mb-1">Növ</label>
                    <select
                      value={broadcastKind}
                      onChange={(e) => setBroadcastKind(e.target.value as 'info' | 'warning' | 'system')}
                      className="w-full px-3 py-2 text-sm rounded-lg border border-[#D1D5DB] bg-white"
                    >
                      <option value="info">Məlumat</option>
                      <option value="warning">Xəbərdarlıq</option>
                      <option value="system">Sistem Bildirişi</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-[#374151] mb-1">Başlıq *</label>
                    <input
                      type="text"
                      required
                      value={broadcastTitle}
                      onChange={(e) => setBroadcastTitle(e.target.value)}
                      placeholder="Məs: Yeni təhlükəsizlik qaydaları"
                      className="w-full px-3 py-2 text-sm rounded-lg border border-[#D1D5DB]"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-[#374151] mb-1">Mesaj *</label>
                    <textarea
                      rows={3}
                      required
                      value={broadcastMessage}
                      onChange={(e) => setBroadcastMessage(e.target.value)}
                      placeholder="İstifadəçilərin bildiriş qutusunda görünəcək mətn..."
                      className="w-full px-3 py-2 text-sm rounded-lg border border-[#D1D5DB]"
                    />
                  </div>
                  <button
                    type="submit"
                    className="w-full py-2.5 px-4 bg-[#2563EB] hover:bg-[#1D4ED8] text-white text-sm font-semibold rounded-lg cursor-pointer"
                  >
                    Bildirişi Göndər
                  </button>
                </form>
              )}
            </div>

            <div className="xl:col-span-7 bg-white rounded-xl border border-[#E4E7EC] p-6">
              <h3 className="text-base font-bold text-[#111827] mb-4">
                Göndərilmiş Bildirişlər ({broadcasts.length})
              </h3>
              <div className="divide-y divide-[#F3F4F6]">
                {broadcasts.map((n) => (
                  <div key={n.id} className="py-3 space-y-1 text-xs">
                    <div className="flex items-center justify-between gap-2">
                      <span
                        className={`font-semibold ${
                          n.kind === 'warning'
                            ? 'text-[#DC2626]'
                            : n.kind === 'system'
                            ? 'text-[#2563EB]'
                            : 'text-[#111827]'
                        }`}
                      >
                        {n.title}
                      </span>
                      <span className="text-[#9CA3AF] tabular-nums">{formatRelativeAz(n.createdAt)}</span>
                    </div>
                    <p className="text-[#4B5563]">{n.message}</p>
                    <p className="text-[11px] text-[#6B7280]">
                      Hədəf: {n.targetUserId === 'all' ? 'Bütün istifadəçilər' : n.targetUserId} · Göndərən: {n.sentBy}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ==================== 7. REPORTS ==================== */}
        {tab === 'reports' && (
          <div className="space-y-4">
            {!canManageReports ? (
              <div className="bg-white rounded-xl border border-[#E4E7EC] p-8 text-center text-sm text-[#6B7280]">
                Şikayətləri idarə etmək üçün icazəniz yoxdur.
              </div>
            ) : reports.length === 0 ? (
              <div className="bg-white rounded-xl border border-[#E4E7EC] p-12 text-center text-sm text-[#6B7280]">
                Hazırda heç bir şikayət qeydə alınmayıb.
              </div>
            ) : (
              <div className="space-y-3">
                {reports.map((r) => (
                  <div
                    key={r.id}
                    className="bg-white rounded-xl border border-[#E4E7EC] p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4"
                  >
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2 text-xs">
                        <span
                          className={`font-semibold ${
                            r.status === 'open'
                              ? 'text-[#DC2626]'
                              : r.status === 'resolved'
                              ? 'text-[#16A34A]'
                              : 'text-[#6B7280]'
                          }`}
                        >
                          {r.status === 'open' ? 'Açıq Şikayət' : r.status === 'resolved' ? 'Həll edildi' : 'Rədd edildi'}
                        </span>
                        <span className="text-[#9CA3AF]">·</span>
                        <span className="text-[#6B7280]">{formatRelativeAz(r.createdAt)}</span>
                      </div>
                      <h3 className="text-sm font-bold text-[#111827]">{r.listingTitle}</h3>
                      <p className="text-xs font-medium text-[#B91C1C]">Səbəb: {r.reason}</p>
                      {r.details && <p className="text-xs text-[#4B5563]">{r.details}</p>}
                      <p className="text-[11px] text-[#6B7280] pt-1">
                        Satıcı: {r.sellerEmail} · Şikayətçi: {r.reporterEmail}
                      </p>
                      {r.resolutionNote && (
                        <p className="text-[11px] text-[#16A34A]">Nəticə: {r.resolutionNote}</p>
                      )}
                    </div>

                    {r.status === 'open' && (
                      <div className="flex flex-wrap items-center gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={() => handleResolveReport(r.id, 'dismissed')}
                          className="px-3 py-1.5 text-xs font-medium border border-[#D1D5DB] text-[#374151] hover:bg-[#F9FAFB] rounded-lg cursor-pointer"
                        >
                          Əsassızdır
                        </button>
                        <button
                          type="button"
                          onClick={() => handleResolveReport(r.id, 'resolved', { deleteListing: true })}
                          className="px-3 py-1.5 text-xs font-semibold text-white bg-[#D97706] hover:bg-[#B45309] rounded-lg cursor-pointer"
                        >
                          Elanı Sil & Bağla
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            handleResolveReport(r.id, 'resolved', { deleteListing: true, banSeller: true })
                          }
                          className="px-3 py-1.5 text-xs font-semibold text-white bg-[#DC2626] hover:bg-[#B91C1C] rounded-lg cursor-pointer"
                        >
                          Satıcını Ban Et + Sil
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ==================== 8. AUDIT LOG ==================== */}
        {tab === 'audit' && (
          <div className="space-y-4">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
              <div className="inline-flex flex-wrap items-center gap-1 p-1 bg-[#E5E7EB]/60 rounded-lg">
                {[
                  { key: 'all', label: 'Hamısı' },
                  { key: 'user', label: 'İstifadəçi / Kick / Ban' },
                  { key: 'listing', label: 'Elanlar' },
                  { key: 'role', label: 'Admin Hüquqları' },
                  { key: 'settings', label: 'Sistem' },
                ].map((f) => (
                  <button
                    key={f.key}
                    type="button"
                    onClick={() => setAuditTypeFilter(f.key)}
                    className={`px-3 py-1.5 text-xs font-medium rounded-md cursor-pointer whitespace-nowrap ${
                      auditTypeFilter === f.key
                        ? 'bg-white text-[#111827] shadow-xs'
                        : 'text-[#4B5563] hover:text-[#111827]'
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-2">
                <div className="relative flex-1 md:w-64">
                  <Search className="w-4 h-4 text-[#9CA3AF] absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={auditSearch}
                    onChange={(e) => setAuditSearch(e.target.value)}
                    placeholder="İcraçı və ya əməliyyat axtar..."
                    className="w-full pl-9 pr-3 py-2 text-xs bg-white border border-[#D1D5DB] rounded-lg"
                  />
                </div>
                <button
                  type="button"
                  onClick={exportAuditCsv}
                  className="px-3 py-2 text-xs font-medium text-[#374151] bg-white border border-[#D1D5DB] hover:bg-[#F9FAFB] rounded-lg inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
                >
                  <Download className="w-3.5 h-3.5" />
                  CSV İxrac
                </button>
              </div>
            </div>

            <div className="bg-white rounded-xl border border-[#E4E7EC] p-6 divide-y divide-[#F3F4F6]">
              {filteredAuditLogs.map((log) => (
                <div key={log.id} className="py-3 flex items-start justify-between gap-4 text-xs">
                  <div className="min-w-0">
                    <p className="font-semibold text-[#111827]">
                      {log.action} · <span className="font-normal text-[#374151]">{log.targetLabel}</span>
                    </p>
                    <p className="text-[#6B7280] mt-0.5">
                      İcraçı: {log.actorEmail} {log.reason ? `· Qeyd: ${log.reason}` : ''}
                    </p>
                  </div>
                  <span className="text-[#9CA3AF] shrink-0 tabular-nums">
                    {new Date(log.createdAt).toLocaleString('az-AZ')}
                  </span>
                </div>
              ))}
              {filteredAuditLogs.length === 0 && (
                <p className="py-8 text-center text-sm text-[#6B7280]">Qeyd tapılmadı.</p>
              )}
            </div>
          </div>
        )}

        {/* ==================== 9. DATABASE & BACKUP ==================== */}
        {tab === 'backup' && stats && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white rounded-xl border border-[#E4E7EC] p-6 space-y-4">
              <h2 className="text-base font-bold text-[#111827]">Verilənlər Bazası Göstəriciləri</h2>
              <div className="divide-y divide-[#F3F4F6] text-sm">
                <div className="py-2.5 flex justify-between">
                  <span className="text-[#6B7280]">Ümumi Elan Qeydləri</span>
                  <span className="font-semibold tabular-nums">{stats.totalListings}</span>
                </div>
                <div className="py-2.5 flex justify-between">
                  <span className="text-[#6B7280]">Qeydiyyatlı İstifadəçilər</span>
                  <span className="font-semibold tabular-nums">{stats.totalUsers}</span>
                </div>
                <div className="py-2.5 flex justify-between">
                  <span className="text-[#6B7280]">Audit Jurnalı Sətirləri</span>
                  <span className="font-semibold tabular-nums">{allLogs.length}</span>
                </div>
                <div className="py-2.5 flex justify-between">
                  <span className="text-[#6B7280]">Kataloq (Brend / Şəhər)</span>
                  <span className="font-semibold tabular-nums">
                    {catalog.brands.length} / {catalog.cities.length}
                  </span>
                </div>
                <div className="py-2.5 flex justify-between">
                  <span className="text-[#6B7280]">Göndərilmiş Bildirişlər</span>
                  <span className="font-semibold tabular-nums">{broadcasts.length}</span>
                </div>
                <div className="py-2.5 flex justify-between">
                  <span className="text-[#6B7280]">Baza Fayl Həcmi</span>
                  <span className="font-semibold tabular-nums">{dbSizeKb} KB</span>
                </div>
                <div className="py-2.5 flex justify-between">
                  <span className="text-[#6B7280]">Qara Siyahı / Shadowban</span>
                  <span className="font-semibold tabular-nums">
                    {stats.blacklistedCount} / {stats.shadowbannedUsers}
                  </span>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-xl border border-[#E4E7EC] p-6 space-y-4">
              <h2 className="text-base font-bold text-[#111827]">Tam Ehtiyat Nüsxə (Backup)</h2>
              <p className="text-xs text-[#6B7280] leading-relaxed">
                Platformadakı bütün telefon elanları, istifadəçi profilləri (şifrələr xaric), şikayətlər, audit jurnalı, kataloq və sistem ayarlarının tam JSON nüsxəsini kompüterinizə endirin.
              </p>
              <button
                type="button"
                disabled={!canManageSettings}
                onClick={handleDownloadBackup}
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#0F172A] hover:bg-[#1E293B] disabled:opacity-50 text-white text-sm font-semibold rounded-lg cursor-pointer"
              >
                <Download className="w-4 h-4" />
                JSON Ehtiyat Nüsxəni Endir
              </button>
            </div>
          </div>
        )}

        {/* ==================== 10. PLATFORM SETTINGS ==================== */}
        {tab === 'settings' && settings && (
          <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
            <div className="xl:col-span-7 bg-white rounded-xl border border-[#E4E7EC] p-6 space-y-5">
              <h2 className="text-base font-bold text-[#111827]">Platforma Ayarları</h2>
              <form onSubmit={handleSaveSettings} className="space-y-4">
                <label className="flex items-center justify-between gap-3 py-2 border-b border-[#F3F4F6] cursor-pointer">
                  <div>
                    <p className="text-sm font-medium text-[#111827]">Avtomatik Elan Təsdiqi</p>
                    <p className="text-xs text-[#6B7280]">
                      Aktiv olduqda yeni elanlar admin gözləmədən dərhal yayımlanır
                    </p>
                  </div>
                  <input
                    type="checkbox"
                    disabled={!canManageSettings}
                    checked={settings.autoApproveListings}
                    onChange={(e) =>
                      setSettings({ ...settings, autoApproveListings: e.target.checked })
                    }
                    className="w-4 h-4 text-[#2563EB]"
                  />
                </label>

                <label className="flex items-center justify-between gap-3 py-2 border-b border-[#F3F4F6] cursor-pointer">
                  <div>
                    <p className="text-sm font-medium text-[#111827]">Texniki Baxış Rejimi</p>
                    <p className="text-xs text-[#6B7280]">
                      Yalnız adminlər yeni elan əlavə edə bilər
                    </p>
                  </div>
                  <input
                    type="checkbox"
                    disabled={!canManageSettings}
                    checked={settings.maintenanceMode}
                    onChange={(e) =>
                      setSettings({ ...settings, maintenanceMode: e.target.checked })
                    }
                    className="w-4 h-4 text-[#2563EB]"
                  />
                </label>

                <label className="flex items-center justify-between gap-3 py-2 border-b border-[#F3F4F6] cursor-pointer">
                  <div>
                    <p className="text-sm font-medium text-[#111827]">Yeni Qeydiyyatlara İcazə</p>
                    <p className="text-xs text-[#6B7280]">
                      Yeni Gmail hesablarının qeydiyyatını açıq saxla
                    </p>
                  </div>
                  <input
                    type="checkbox"
                    disabled={!canManageSettings}
                    checked={settings.allowNewRegistrations}
                    onChange={(e) =>
                      setSettings({ ...settings, allowNewRegistrations: e.target.checked })
                    }
                    className="w-4 h-4 text-[#2563EB]"
                  />
                </label>

                <div>
                  <label className="block text-xs font-medium text-[#374151] mb-1">
                    İstifadəçi başına maksimum aktiv elan
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={200}
                    disabled={!canManageSettings}
                    value={settings.maxListingsPerUser}
                    onChange={(e) =>
                      setSettings({ ...settings, maxListingsPerUser: Number(e.target.value) || 10 })
                    }
                    className="w-full px-3 py-2 text-sm rounded-lg border border-[#D1D5DB] tabular-nums"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-[#374151] mb-1">
                    Sayt Üst Bildiriş Zolağı (Announcement Banner)
                  </label>
                  <input
                    type="text"
                    disabled={!canManageSettings}
                    value={settings.announcementBanner}
                    onChange={(e) =>
                      setSettings({ ...settings, announcementBanner: e.target.value })
                    }
                    placeholder="Boş qoysanız zolaq gizlənəcək"
                    className="w-full px-3 py-2 text-sm rounded-lg border border-[#D1D5DB]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-[#374151] mb-1">
                    Qadağan Olunmuş Açar Sözlər (vergüllə ayırın)
                  </label>
                  <textarea
                    rows={2}
                    disabled={!canManageSettings}
                    value={keywordsDraft}
                    onChange={(e) => setKeywordsDraft(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-lg border border-[#D1D5DB]"
                  />
                </div>

                {canManageSettings && (
                  <button
                    type="submit"
                    disabled={savingSettings}
                    className="py-2.5 px-5 bg-[#2563EB] hover:bg-[#1D4ED8] text-white text-sm font-semibold rounded-lg cursor-pointer"
                  >
                    {savingSettings ? 'Saxlanılır...' : 'Ayarları Yadda Saxla'}
                  </button>
                )}
              </form>
            </div>

            <div className="xl:col-span-5 bg-white rounded-xl border border-[#E4E7EC] p-6 space-y-4 h-fit">
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-lg bg-[#EFF6FF] text-[#2563EB] flex items-center justify-center shrink-0">
                  <KeyRound className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-[#111827]">Admin Panel Parolunu Dəyiş</h3>
                  <p className="text-xs text-[#6B7280] mt-1 leading-relaxed">
                    Əsas Admin Panel parolunu yalnız Baş Admin və ya əsas parol sessiyası yeniləyə bilər.
                  </p>
                </div>
              </div>

              {!canManageAccess ? (
                <p className="text-xs text-[#6B7280] bg-[#F8FAFC] border border-[#E2E8F0] rounded-lg p-3.5">
                  Əsas Admin parolunu dəyişmək səlahiyyətiniz yoxdur.
                </p>
              ) : usingEnvOverride ? (
                <p className="text-xs text-[#475569] bg-[#F8FAFC] border border-[#E2E8F0] rounded-lg p-3.5">
                  Admin parolu serverin <code className="text-[#0F172A] font-semibold">ADMIN_PASSCODE</code> mühit dəyişəni ilə idarə olunur.
                </p>
              ) : (
                <form onSubmit={handleChangeAdminPasscode} className="space-y-3">
                  <div>
                    <label className="block text-xs font-medium text-[#374151] mb-1">
                      Hazırkı Admin Parolu
                    </label>
                    <input
                      type="password"
                      required
                      value={currentAdminPass}
                      onChange={(e) => setCurrentAdminPass(e.target.value)}
                      placeholder="Hazırkı parol..."
                      className="w-full px-3 py-2 text-sm rounded-lg border border-[#D1D5DB]"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-[#374151] mb-1">
                      Yeni Admin Parolu (min. 2 simvol)
                    </label>
                    <input
                      type="password"
                      required
                      minLength={2}
                      value={newAdminPass}
                      onChange={(e) => setNewAdminPass(e.target.value)}
                      placeholder="Yeni parol..."
                      className="w-full px-3 py-2 text-sm rounded-lg border border-[#D1D5DB]"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={changingAdminPass}
                    className="w-full py-2.5 px-4 bg-[#0F172A] hover:bg-[#1E293B] disabled:opacity-50 text-white text-xs font-semibold rounded-lg cursor-pointer"
                  >
                    {changingAdminPass ? 'Yenilənir...' : 'Admin Parolunu Yenilə'}
                  </button>
                </form>
              )}

              <div className="p-3.5 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0] text-xs text-[#334155] space-y-1">
                <p>
                  Baş Admin Gmail: <strong className="text-[#0F172A]">{OWNER_EMAIL}</strong>
                </p>
                <p className="text-[#64748B]">
                  İşinizi bitirdikdən sonra yuxarıdakı “Kilidlə” düyməsi ilə Admin Panel sessiyasını bağlaya bilərsiniz.
                </p>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* ==================== MODAL: KICK USER ==================== */}
      {kickTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <form
            onSubmit={submitKick}
            className="w-full max-w-md bg-white rounded-2xl border border-[#E4E7EC] shadow-2xl p-6 space-y-4"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-[#111827] flex items-center gap-2">
                <UserX className="w-5 h-5 text-[#D97706]" />
                İstifadəçini Kick Et
              </h3>
              <button
                type="button"
                onClick={() => setKickTarget(null)}
                className="p-1 text-[#6B7280] hover:text-[#111827] cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <p className="text-xs text-[#4B5563]">
              <strong>{kickTarget.name}</strong> ({kickTarget.email}) hazırkı sessiyasından dərhal çıxarılacaq və seçilən müddət ərzində giriş edə bilməyəcək.
            </p>
            <div>
              <label className="block text-xs font-medium text-[#374151] mb-1">Gözləmə müddəti</label>
              <select
                value={kickMinutes}
                onChange={(e) => setKickMinutes(Number(e.target.value))}
                className="w-full px-3 py-2 text-sm rounded-lg border border-[#D1D5DB] bg-white"
              >
                <option value={5}>5 dəqiqə</option>
                <option value={15}>15 dəqiqə</option>
                <option value={60}>1 saat</option>
                <option value={360}>6 saat</option>
                <option value={1440}>24 saat</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-[#374151] mb-1">Səbəb</label>
              <input
                type="text"
                value={kickReason}
                onChange={(e) => setKickReason(e.target.value)}
                placeholder="Məs: Spam elan yerləşdirmə cəhdi"
                className="w-full px-3 py-2 text-sm rounded-lg border border-[#D1D5DB]"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setKickTarget(null)}
                className="px-4 py-2 text-xs font-medium text-[#374151] hover:bg-[#F3F4F6] rounded-lg cursor-pointer"
              >
                Ləğv et
              </button>
              <button
                type="submit"
                className="px-4 py-2 text-xs font-semibold text-white bg-[#D97706] hover:bg-[#B45309] rounded-lg cursor-pointer"
              >
                Sessiyadan Çıxar (Kick)
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ==================== MODAL: BAN USER ==================== */}
      {banTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <form
            onSubmit={submitBan}
            className="w-full max-w-md bg-white rounded-2xl border border-[#E4E7EC] shadow-2xl p-6 space-y-4"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-[#111827] flex items-center gap-2">
                <ShieldAlert className="w-5 h-5 text-[#DC2626]" />
                İstifadəçini Ban Et
              </h3>
              <button
                type="button"
                onClick={() => setBanTarget(null)}
                className="p-1 text-[#6B7280] hover:text-[#111827] cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <p className="text-xs text-[#4B5563]">
              <strong>{banTarget.name}</strong> ({banTarget.email}) platformadan bloklanacaq.
            </p>
            <div>
              <label className="block text-xs font-medium text-[#374151] mb-1">Ban Müddəti</label>
              <select
                value={banDays}
                onChange={(e) => setBanDays(e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-lg border border-[#D1D5DB] bg-white"
              >
                <option value="1">1 gün</option>
                <option value="7">7 gün</option>
                <option value="30">30 gün</option>
                <option value="permanent">Ömürlük (Daimi)</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-[#374151] mb-1">Ban Səbəbi</label>
              <input
                type="text"
                required
                value={banReason}
                onChange={(e) => setBanReason(e.target.value)}
                placeholder="Məs: Saxta cihaz satışı və ya fırıldaq"
                className="w-full px-3 py-2 text-sm rounded-lg border border-[#D1D5DB]"
              />
            </div>
            <label className="flex items-center gap-2 text-xs text-[#374151] cursor-pointer">
              <input
                type="checkbox"
                checked={banHideListings}
                onChange={(e) => setBanHideListings(e.target.checked)}
                className="rounded border-[#D1D5DB] text-[#DC2626]"
              />
              <span>İstifadəçinin bütün aktiv elanlarını dərhal gizlət</span>
            </label>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setBanTarget(null)}
                className="px-4 py-2 text-xs font-medium text-[#374151] hover:bg-[#F3F4F6] rounded-lg cursor-pointer"
              >
                Ləğv et
              </button>
              <button
                type="submit"
                className="px-4 py-2 text-xs font-semibold text-white bg-[#DC2626] hover:bg-[#B91C1C] rounded-lg cursor-pointer"
              >
                Hesabı Blokla (Ban)
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ==================== MODAL: WARN USER ==================== */}
      {warnTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <form
            onSubmit={submitWarn}
            className="w-full max-w-md bg-white rounded-2xl border border-[#E4E7EC] shadow-2xl p-6 space-y-4"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-[#111827] flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-[#D97706]" />
                Rəsmi Xəbərdarlıq Göndər
              </h3>
              <button
                type="button"
                onClick={() => setWarnTarget(null)}
                className="p-1 text-[#6B7280] hover:text-[#111827] cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <p className="text-xs text-[#4B5563]">
              <strong>{warnTarget.name}</strong> ({warnTarget.email}) hesabına rəsmi xəbərdarlıq bildirişi göndəriləcək.
            </p>
            <textarea
              rows={3}
              required
              value={warnMessage}
              onChange={(e) => setWarnMessage(e.target.value)}
              placeholder="Məs: Elan qiymətlərini real göstərin, əks halda elanlarınız silinəcək."
              className="w-full px-3 py-2 text-sm rounded-lg border border-[#D1D5DB]"
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setWarnTarget(null)}
                className="px-4 py-2 text-xs font-medium text-[#374151] hover:bg-[#F3F4F6] rounded-lg cursor-pointer"
              >
                Ləğv et
              </button>
              <button
                type="submit"
                className="px-4 py-2 text-xs font-semibold text-white bg-[#D97706] hover:bg-[#B45309] rounded-lg cursor-pointer"
              >
                Xəbərdarlığı Göndər
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ==================== MODAL: REJECT LISTING ==================== */}
      {rejectTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              await handleModerateListing(rejectTarget.id, 'reject', rejectReason);
              setRejectTarget(null);
            }}
            className="w-full max-w-md bg-white rounded-2xl border border-[#E4E7EC] shadow-2xl p-6 space-y-4"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-[#111827]">Elanı Rədd Et</h3>
              <button
                type="button"
                onClick={() => setRejectTarget(null)}
                className="p-1 text-[#6B7280] hover:text-[#111827] cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <p className="text-xs text-[#4B5563]">
              <strong>{rejectTarget.title}</strong> elanının rədd edilmə səbəbini qeyd edin:
            </p>
            <textarea
              rows={3}
              required
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="Məs: Telefonun real fotoları və batareya faizi əlavə edilməlidir."
              className="w-full px-3 py-2 text-sm rounded-lg border border-[#D1D5DB]"
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setRejectTarget(null)}
                className="px-4 py-2 text-xs font-medium text-[#374151] hover:bg-[#F3F4F6] rounded-lg cursor-pointer"
              >
                Ləğv et
              </button>
              <button
                type="submit"
                className="px-4 py-2 text-xs font-semibold text-white bg-[#D97706] hover:bg-[#B45309] rounded-lg cursor-pointer"
              >
                Rədd Et
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
