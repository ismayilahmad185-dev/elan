import {
  AlertTriangle,
  Ban,
  Eye,
  EyeOff,
  Flame,
  Lock,
  LogOut,
  Power,
  RefreshCw,
  Search,
  Shield,
  ShieldAlert,
  Skull,
  Trash2,
  Unlock,
  UserCheck,
  UserX,
  X,
  Zap,
} from 'lucide-react';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { apiFetch, ApiError, formatPriceAzn, formatRelativeAz, setModToken } from '../lib/api.ts';
import { DelegatedAccessManager } from './DelegatedAccessManager.tsx';
import type { AuditLog, PanelActorInfo, PhoneListing, PublicUser, RiskFlaggedListing } from '../types.ts';

type ModTab = 'radar' | 'execution' | 'keywords' | 'blacklist' | 'emergency' | 'access' | 'strikes';

interface RadarStats {
  pendingCount: number;
  openReportsCount: number;
  shadowbannedCount: number;
  blacklistedCount: number;
  mutedCount: number;
  bannedCount: number;
  maintenanceMode: boolean;
  totalListings: number;
  totalUsers: number;
}

interface ModeratorPanelViewProps {
  currentUser?: PublicUser | null;
  modActor?: PanelActorInfo | null;
  refreshTrigger?: number;
  onViewListing: (listing: PhoneListing) => void;
  onOpenAdminPanel?: () => void;
  onBackToMarket: () => void;
  onLockModerator: () => Promise<void>;
  onMarketplaceChanged: () => Promise<void>;
  onNotify: (msg: string, type?: 'success' | 'error') => void;
}

const OWNER_EMAIL = 'ismayilahmad185@gmail.com';

export function ModeratorPanelView({
  currentUser = null,
  modActor = null,
  refreshTrigger = 0,
  onViewListing,
  onOpenAdminPanel,
  onBackToMarket,
  onLockModerator,
  onMarketplaceChanged,
  onNotify,
}: ModeratorPanelViewProps) {
  const [tab, setTab] = useState<ModTab>('radar');
  const [loading, setLoading] = useState(true);

  const [flaggedListings, setFlaggedListings] = useState<RiskFlaggedListing[]>([]);
  const [blacklistedEmails, setBlacklistedEmails] = useState<string[]>([]);
  const [moderatorLogs, setModeratorLogs] = useState<AuditLog[]>([]);
  const [radarStats, setRadarStats] = useState<RadarStats | null>(null);
  const [users, setUsers] = useState<PublicUser[]>([]);

  const [userSearch, setUserSearch] = useState('');
  const [radarFilter, setRadarFilter] = useState<'all' | 'critical'>('all');

  // Keyword sweep form
  const [sweepKeyword, setSweepKeyword] = useState('');
  const [sweepMode, setSweepMode] = useState<'delete' | 'reject_and_mute'>('delete');

  // Blacklist form
  const [blacklistEmailInput, setBlacklistEmailInput] = useState('');
  const [blacklistReason, setBlacklistReason] = useState('');
  const [blacklistPurgeListings, setBlacklistPurgeListings] = useState(true);

  // Emergency banner draft
  const [lockdownBanner, setLockdownBanner] = useState(
    'FÖVQƏLADƏ KİLİDLƏNMƏ: Təhlükəsizlik tədbirlərinə görə yeni elanlar və qeydiyyatlar müvəqqəti dayandırılıb.'
  );
  const [flushReason, setFlushReason] = useState('Kütləvi moderasiya təmizləməsi zamanı rədd edildi.');

  // Nuke user modal
  const [nukeTarget, setNukeTarget] = useState<PublicUser | null>(null);
  const [nukeDeleteAccount, setNukeDeleteAccount] = useState(false);
  const [nukeBlacklistEmail, setNukeBlacklistEmail] = useState(true);
  const [nukeReason, setNukeReason] = useState('');
  const [nukeSubmitting, setNukeSubmitting] = useState(false);

  // Generic in-app confirm modal for severe operations
  const [confirmAction, setConfirmAction] = useState<{
    title: string;
    description: string;
    confirmLabel: string;
    onConfirm: () => Promise<void>;
  } | null>(null);
  const [confirmBusy, setConfirmBusy] = useState(false);

  // Moderator passcode rotation
  const [usingEnvOverride, setUsingEnvOverride] = useState(false);
  const [currentModPasscode, setCurrentModPasscode] = useState('');
  const [newModPasscode, setNewModPasscode] = useState('');
  const [changingModPasscode, setChangingModPasscode] = useState(false);

  const isOwner = Boolean(
    (currentUser && currentUser.email.toLowerCase() === OWNER_EMAIL) ||
      modActor?.isOwner ||
      modActor?.isMasterPasscode ||
      modActor?.canManageAccess
  );
  const canManageAccess = Boolean(
    !modActor || modActor.isMasterPasscode || modActor.isOwner || modActor.canManageAccess
  );
  const canOpenAdmin = Boolean(onOpenAdminPanel && (modActor?.allowAdminPanel ?? true));

  const loadModeratorData = useCallback(async () => {
    setLoading(true);
    try {
      const [radarRes, usersRes] = await Promise.all([
        apiFetch<{
          flaggedListings: RiskFlaggedListing[];
          blacklistedEmails: string[];
          moderatorLogs: AuditLog[];
          usingEnvOverride?: boolean;
          stats: RadarStats;
        }>('/api/moderator/radar'),
        apiFetch<{ users: PublicUser[] }>('/api/moderator/users'),
      ]);
      setFlaggedListings(radarRes.flaggedListings);
      setBlacklistedEmails(radarRes.blacklistedEmails);
      setModeratorLogs(radarRes.moderatorLogs);
      setUsingEnvOverride(Boolean(radarRes.usingEnvOverride));
      setRadarStats(radarRes.stats);
      setUsers(usersRes.users);
    } catch (err) {
      onNotify(
        err instanceof ApiError ? err.message : 'Moderator məlumatları yüklənmədi.',
        'error'
      );
    } finally {
      setLoading(false);
    }
  }, [onNotify]);

  useEffect(() => {
    loadModeratorData();
  }, [loadModeratorData, refreshTrigger]);

  const syncAll = async () => {
    await Promise.all([loadModeratorData(), onMarketplaceChanged()]);
  };

  const findUserById = (userId: string): PublicUser | undefined =>
    users.find((u) => u.id === userId);

  const handleToggleShadowban = async (target: PublicUser) => {
    try {
      const res = await apiFetch<{ user: PublicUser }>(`/api/moderator/users/${target.id}/shadowban`, {
        method: 'POST',
      });
      await syncAll();
      onNotify(
        res.user.isShadowbanned
          ? `${target.name} Shadowban (Kölgə Blok) altına alındı — alıcılar onun heç bir elanını görməyəcək.`
          : `${target.name} üzərindən Shadowban ləğv edildi.`,
        'success'
      );
    } catch (err) {
      onNotify(err instanceof ApiError ? err.message : 'Shadowban tətbiq edilmədi.', 'error');
    }
  };

  const handleInstantKick = async (target: PublicUser) => {
    try {
      await apiFetch(`/api/moderator/users/${target.id}/kick`, {
        method: 'POST',
        body: JSON.stringify({
          minutes: 60,
          reason: 'Moderator tərəfindən fövqəladə Kick (60 dəq).',
        }),
      });
      await syncAll();
      onNotify(`${target.name} sessiyadan dərhal çıxarıldı (60 dəq Kick).`, 'success');
    } catch (err) {
      onNotify(err instanceof ApiError ? err.message : 'Kick alınmadı.', 'error');
    }
  };

  const handleInstantPermaban = (target: PublicUser) => {
    setConfirmAction({
      title: 'Ömürlük Ban Təsdiqi',
      description: `${target.name} (${target.email}) ömürlük bloklanacaq və bütün aktiv elanları gizlədiləcək.`,
      confirmLabel: 'Ömürlük Ban Et',
      onConfirm: async () => {
        await apiFetch(`/api/moderator/users/${target.id}/ban`, {
          method: 'POST',
          body: JSON.stringify({
            durationDays: null,
            reason: 'Moderator tərəfindən ömürlük bloklandı.',
            hideListings: true,
          }),
        });
        await syncAll();
        onNotify(`${target.name} ömürlük ban edildi.`, 'success');
      },
    });
  };

  const handleUnbanUser = async (target: PublicUser) => {
    try {
      await apiFetch(`/api/moderator/users/${target.id}/unban`, { method: 'POST' });
      await syncAll();
      onNotify(`${target.name} üçün blok açıldı.`, 'success');
    } catch (err) {
      onNotify(err instanceof ApiError ? err.message : 'Blok açılmadı.', 'error');
    }
  };

  const handleDeleteFlaggedListing = (listing: PhoneListing) => {
    setConfirmAction({
      title: 'Elanı Tam Məhv Et',
      description: `"${listing.title}" elanı bazadan birdəfəlik silinəcək və bərpa olunmayacaq.`,
      confirmLabel: 'Elanı Məhv Et',
      onConfirm: async () => {
        await apiFetch(`/api/moderator/listings/${listing.id}`, { method: 'DELETE' });
        await syncAll();
        onNotify('Riskli elan birdəfəlik silindi.', 'success');
      },
    });
  };

  const submitNukeUser = async (e: FormEvent) => {
    e.preventDefault();
    if (!nukeTarget) return;
    setNukeSubmitting(true);
    try {
      const res = await apiFetch<{ ok: boolean; deletedListingsCount: number }>(
        `/api/moderator/users/${nukeTarget.id}/nuke`,
        {
          method: 'POST',
          body: JSON.stringify({
            deleteAccount: nukeDeleteAccount,
            blacklistEmail: nukeBlacklistEmail,
            reason: nukeReason.trim() || undefined,
          }),
        }
      );
      setNukeTarget(null);
      setNukeReason('');
      await syncAll();
      onNotify(
        `${nukeTarget.name} tam məhv edildi: ${res.deletedListingsCount} elan silindi${
          nukeBlacklistEmail ? ', Gmail Qara Siyahıya salındı' : ''
        }.`,
        'success'
      );
    } catch (err) {
      onNotify(err instanceof ApiError ? err.message : 'Məhv etmə əməliyyatı alınmadı.', 'error');
    } finally {
      setNukeSubmitting(false);
    }
  };

  const handleRunKeywordSweep = (e: FormEvent) => {
    e.preventDefault();
    const label = sweepKeyword.trim()
      ? `"${sweepKeyword.trim()}" açar sözünə uyğun gələn bütün elanlar`
      : 'Sistemdəki bütün qadağan olunmuş açar sözlərə uyğun gələn elanlar';
    setConfirmAction({
      title: 'Kütləvi Açar Söz Təmizləməsi',
      description:
        sweepMode === 'delete'
          ? `${label} bazadan BİRDƏFƏLİK SİLİNƏCƏK.`
          : `${label} rədd ediləcək və satıcıların elan hüququ dərhal bağlanacaq.`,
      confirmLabel: sweepMode === 'delete' ? 'Hamısını Məhv Et' : 'Rədd Et və Susdur',
      onConfirm: async () => {
        const res = await apiFetch<{ affectedListings: number; mutedSellers: number }>(
          '/api/moderator/listings/keyword-sweep',
          {
            method: 'POST',
            body: JSON.stringify({
              keyword: sweepKeyword.trim() || undefined,
              mode: sweepMode,
            }),
          }
        );
        await syncAll();
        onNotify(
          `Təmizləmə bitdi: ${res.affectedListings} elan zərərsizləşdirildi, ${res.mutedSellers} satıcı susduruldu.`,
          'success'
        );
      },
    });
  };

  const handleAddBlacklist = async (e: FormEvent) => {
    e.preventDefault();
    try {
      const res = await apiFetch<{ blacklistedEmails: string[]; purgedCount: number }>(
        '/api/moderator/blacklist',
        {
          method: 'POST',
          body: JSON.stringify({
            email: blacklistEmailInput.trim(),
            purgeListings: blacklistPurgeListings,
            reason: blacklistReason.trim() || undefined,
          }),
        }
      );
      setBlacklistedEmails(res.blacklistedEmails);
      setBlacklistEmailInput('');
      setBlacklistReason('');
      await syncAll();
      onNotify(
        `Gmail Qara Siyahıya əlavə edildi${
          res.purgedCount > 0 ? ` (${res.purgedCount} elanı silindi)` : ''
        }.`,
        'success'
      );
    } catch (err) {
      onNotify(err instanceof ApiError ? err.message : 'Qara siyahıya əlavə edilmədi.', 'error');
    }
  };

  const handleRemoveBlacklist = async (email: string) => {
    try {
      const res = await apiFetch<{ blacklistedEmails: string[] }>(
        `/api/moderator/blacklist/${encodeURIComponent(email)}`,
        { method: 'DELETE' }
      );
      setBlacklistedEmails(res.blacklistedEmails);
      await loadModeratorData();
      onNotify(`${email} Qara Siyahıdan çıxarıldı.`, 'success');
    } catch (err) {
      onNotify(err instanceof ApiError ? err.message : 'Silinmədi.', 'error');
    }
  };

  const handleEmergencyLockdown = () => {
    setConfirmAction({
      title: 'FÖVQƏLADƏ SAYT KİLİDLƏNMƏSİ',
      description:
        'Bütün adi istifadəçilər üçün elan yerləşdirmə və yeni Gmail qeydiyyatları dərhal dayandırılacaq, sayt üzərində xəbərdarlıq zolağı aktivləşəcək.',
      confirmLabel: 'Saytı Dərhal Kilidlə',
      onConfirm: async () => {
        await apiFetch('/api/moderator/emergency/lockdown', {
          method: 'POST',
          body: JSON.stringify({ banner: lockdownBanner.trim() }),
        });
        await syncAll();
        onNotify('Fövqəladə kilidlənmə aktivləşdirildi.', 'success');
      },
    });
  };

  const handleEmergencyUnlock = async () => {
    try {
      await apiFetch('/api/moderator/emergency/unlock', { method: 'POST' });
      await syncAll();
      onNotify('Fövqəladə kilidlənmə ləğv edildi — platforma normal rejimə qayıtdı.', 'success');
    } catch (err) {
      onNotify(err instanceof ApiError ? err.message : 'Kilid açılmadı.', 'error');
    }
  };

  const handleGlobalSessionKill = () => {
    setConfirmAction({
      title: 'QLOBAL SESSİYA QƏTLİ (Bütün İstifadəçiləri Çıxar)',
      description:
        'Hazırda saytda olan bütün adi istifadəçilərin sessiyası dərhal ləğv ediləcək və onlar sistemdən atılacaq.',
      confirmLabel: 'Bütün Sessiyaları Kəs',
      onConfirm: async () => {
        const res = await apiFetch<{ affected: number }>(
          '/api/moderator/emergency/global-session-kill',
          { method: 'POST' }
        );
        await syncAll();
        onNotify(`${res.affected} istifadəçinin canlı sessiyası dərhal kəsildi.`, 'success');
      },
    });
  };

  const handleFlushPending = () => {
    setConfirmAction({
      title: 'Gözləyən Bütün Elanları Kütləvi Rədd Et',
      description:
        'Təsdiq növbəsində gözləyən bütün elanlar bir kliklə rədd ediləcək.',
      confirmLabel: 'Növbəni Təmizlə (Hamısını Rədd Et)',
      onConfirm: async () => {
        const res = await apiFetch<{ flushed: number }>('/api/moderator/emergency/flush-pending', {
          method: 'POST',
          body: JSON.stringify({ reason: flushReason.trim() }),
        });
        await syncAll();
        onNotify(`${res.flushed} gözləyən elan kütləvi rədd edildi.`, 'success');
      },
    });
  };

  const visibleFlagged =
    radarFilter === 'critical'
      ? flaggedListings.filter((f) => f.riskScore >= 40)
      : flaggedListings;

  const filteredUsers = users.filter((u) => {
    if (!userSearch.trim()) return true;
    const q = userSearch.toLowerCase();
    return `${u.name} ${u.email} ${u.role}`.toLowerCase().includes(q);
  });

  const navItems: { key: ModTab; label: string; icon: typeof Flame; badge?: number }[] = [
    { key: 'radar', label: 'Təhlükə Radarı', icon: Flame, badge: flaggedListings.length || undefined },
    { key: 'execution', label: 'Cəllad & Shadowban', icon: Skull },
    { key: 'keywords', label: 'Açar Söz Ovçusu', icon: Zap },
    { key: 'blacklist', label: 'Gmail Qara Siyahı', icon: Ban, badge: blacklistedEmails.length || undefined },
    { key: 'emergency', label: 'Fövqəladə Kilid', icon: Power },
    { key: 'access', label: 'Rəşid & İcazəli Şəxslər', icon: UserCheck },
    { key: 'strikes', label: 'Sərt Cəza Tarixçəsi', icon: ShieldAlert },
  ];

  return (
    <div className="min-h-[calc(100vh-4rem)] flex flex-col lg:flex-row bg-[#080B12] text-[#F1F5F9]">
      {/* Dark Crimson Moderator Sidebar */}
      <aside className="w-full lg:w-[276px] shrink-0 bg-[#05070D] border-b lg:border-b-0 lg:border-r border-[#1E293B] p-4 flex flex-col justify-between">
        <div>
          <div className="px-3.5 py-3 mb-4 rounded-xl bg-[#160A0E] border border-[#7F1D1D]/70">
            <div className="flex items-center gap-2 text-[#F87171]">
              <Flame className="w-4 h-4 shrink-0" />
              <span className="text-[11px] font-bold tracking-wider uppercase">
                {modActor?.isReshid ? 'Rəşid · Moderator Mərkəzi' : 'Təhlükəli Moderator'}
              </span>
            </div>
            <p className="text-sm font-bold text-white mt-1.5 truncate">
              {modActor?.name || currentUser?.name || 'Baş Moderator'}
            </p>
            <p className="text-[11px] text-[#FCA5A5] truncate mt-0.5">
              {modActor?.isReshid
                ? 'Rəşid Moderator & Admin İcazəsi'
                : modActor?.authMethod === 'gmail'
                ? `${modActor.email} · Gmail girişi`
                : modActor?.authMethod === 'operator_passcode'
                ? 'İcazəli Operator (Şəxsi Parol)'
                : 'Baş Moderator (Tam Səlahiyyət)'}
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
                      ? 'bg-[#DC2626] text-white shadow-xs'
                      : 'text-[#CBD5E1] hover:bg-[#1E293B] hover:text-white'
                  }`}
                >
                  <span className="inline-flex items-center gap-2.5">
                    <Icon className="w-4 h-4 shrink-0" />
                    <span>{item.label}</span>
                  </span>
                  {item.badge !== undefined && item.badge > 0 && (
                    <span className="font-mono-tabular text-xs px-1.5 py-0.5 rounded bg-black/30 text-white">
                      {item.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>
        </div>

        <div className="hidden lg:block pt-4 mt-6 border-t border-[#1E293B] space-y-2">
          {canOpenAdmin && (
            <button
              type="button"
              onClick={onOpenAdminPanel}
              className="w-full px-3 py-2 rounded-lg bg-[#111827] hover:bg-[#1E293B] border border-[#334155] text-xs font-semibold text-[#E2E8F0] flex items-center justify-center gap-2 cursor-pointer"
            >
              <Shield className="w-3.5 h-3.5 text-[#60A5FA]" />
              {modActor?.isReshid ? 'Rəşid Admin Paneli' : 'Admin Panelə Keç'}
            </button>
          )}
          <button
            type="button"
            onClick={onBackToMarket}
            className="w-full px-3 py-2 rounded-lg bg-[#111827] hover:bg-[#1E293B] border border-[#334155] text-xs font-medium text-[#CBD5E1] cursor-pointer"
          >
            Elanlara Qayıt
          </button>
          <p className="px-1 text-[11px] text-[#94A3B8] leading-relaxed">
            Bu paneldəki əmrlər geri dönüşsüzdür və birbaşa audit jurnalına yazılır.
          </p>
        </div>
      </aside>

      {/* Main Workspace */}
      <main className="flex-1 min-w-0 p-4 sm:p-6 lg:p-8 space-y-6">
        {modActor?.isReshid && (
          <div className="bg-[#160A0E] text-white rounded-xl border border-[#7F1D1D] px-5 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold text-[#FCA5A5] uppercase tracking-wider">
                Rəşid — Şəxsi Moderator & Admin İş Masası
              </p>
              <p className="text-sm font-bold mt-0.5">
                Xoş gəldiniz, {modActor.name}. Sizin üçün aktiv panellər:{' '}
                {[
                  modActor.allowModeratorPanel ? 'Moderator Panel' : null,
                  modActor.allowAdminPanel ? 'Admin Panel' : null,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </p>
            </div>
            {modActor.allowAdminPanel && onOpenAdminPanel && (
              <button
                type="button"
                onClick={onOpenAdminPanel}
                className="px-4 py-2 bg-[#2563EB] hover:bg-[#1D4ED8] text-white text-xs font-bold rounded-lg inline-flex items-center gap-1.5 shrink-0 cursor-pointer"
              >
                <Shield className="w-3.5 h-3.5" />
                Rəşid Admin Panelinə Keç
              </button>
            )}
          </div>
        )}

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-[#1F2937]">
          <div>
            <p className="text-xs font-semibold text-[#F87171]">
              Moderator İcra Mərkəzi / {navItems.find((n) => n.key === tab)?.label}
            </p>
            <h1 className="text-xl font-bold text-white mt-0.5">
              {navItems.find((n) => n.key === tab)?.label}
            </h1>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {canOpenAdmin && (
              <button
                type="button"
                onClick={onOpenAdminPanel}
                className="lg:hidden px-3 py-2 text-xs font-semibold text-[#E2E8F0] bg-[#111827] border border-[#334155] rounded-lg cursor-pointer"
              >
                Admin Panel
              </button>
            )}
            <button
              type="button"
              onClick={loadModeratorData}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-[#1E293B] hover:bg-[#334155] border border-[#334155] rounded-lg cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Skan Et & Yenilə
            </button>
            <button
              type="button"
              onClick={onLockModerator}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-[#FECACA] bg-[#450A0A] hover:bg-[#7F1D1D] border border-[#991B1B] rounded-lg cursor-pointer"
            >
              <Lock className="w-3.5 h-3.5" />
              Paneli Kilidlə
            </button>
          </div>
        </div>

        {/* Live Threat Metrics Strip */}
        {radarStats && (
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
            <div className="bg-[#111827] border border-[#1F2937] rounded-xl p-4">
              <p className="text-[11px] text-[#94A3B8]">Riskli Elanlar</p>
              <p className="mt-1 text-2xl font-bold text-[#F87171] tabular-nums">
                {flaggedListings.length}
              </p>
            </div>
            <div className="bg-[#111827] border border-[#1F2937] rounded-xl p-4">
              <p className="text-[11px] text-[#94A3B8]">Shadowban Satıcılar</p>
              <p className="mt-1 text-2xl font-bold text-[#FBBF24] tabular-nums">
                {radarStats.shadowbannedCount}
              </p>
            </div>
            <div className="bg-[#111827] border border-[#1F2937] rounded-xl p-4">
              <p className="text-[11px] text-[#94A3B8]">Qara Siyahı Gmail</p>
              <p className="mt-1 text-2xl font-bold text-[#EF4444] tabular-nums">
                {radarStats.blacklistedCount}
              </p>
            </div>
            <div className="bg-[#111827] border border-[#1F2937] rounded-xl p-4">
              <p className="text-[11px] text-[#94A3B8]">Ban / Məhdudiyyət</p>
              <p className="mt-1 text-2xl font-bold text-white tabular-nums">
                {radarStats.bannedCount} <span className="text-xs text-[#94A3B8]">/ {radarStats.mutedCount}</span>
              </p>
            </div>
            <div className="bg-[#111827] border border-[#1F2937] rounded-xl p-4">
              <p className="text-[11px] text-[#94A3B8]">Sistem Rejimi</p>
              <p
                className={`mt-1 text-sm font-bold ${
                  radarStats.maintenanceMode ? 'text-[#F87171]' : 'text-[#4ADE80]'
                }`}
              >
                {radarStats.maintenanceMode ? 'FÖVQƏLADƏ KİLİDLİ' : 'NORMAL İŞLƏK'}
              </p>
            </div>
          </div>
        )}

        {loading && !radarStats ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-28 bg-[#111827] border border-[#1F2937] rounded-xl animate-pulse" />
            ))}
          </div>
        ) : null}

        {/* ==================== 1. THREAT RADAR ==================== */}
        {tab === 'radar' && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="inline-flex items-center gap-1 p-1 bg-[#111827] border border-[#1F2937] rounded-lg">
                <button
                  type="button"
                  onClick={() => setRadarFilter('all')}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-md cursor-pointer ${
                    radarFilter === 'all' ? 'bg-[#DC2626] text-white' : 'text-[#94A3B8] hover:text-white'
                  }`}
                >
                  Bütün Şübhəlilər ({flaggedListings.length})
                </button>
                <button
                  type="button"
                  onClick={() => setRadarFilter('critical')}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-md cursor-pointer ${
                    radarFilter === 'critical'
                      ? 'bg-[#DC2626] text-white'
                      : 'text-[#94A3B8] hover:text-white'
                  }`}
                >
                  Kritik Risk ≥ 40 ({flaggedListings.filter((f) => f.riskScore >= 40).length})
                </button>
              </div>
              <p className="text-xs text-[#94A3B8]">
                Avtomatik skaner şübhəli aşağı qiymət, qadağan söz, şikayət və IMEI yoxluğunu ölçür.
              </p>
            </div>

            {visibleFlagged.length === 0 ? (
              <div className="bg-[#111827] border border-[#1F2937] rounded-xl p-12 text-center">
                <p className="text-sm font-semibold text-white">Risk radarında şübhəli elan aşkarlanmadı.</p>
                <p className="text-xs text-[#94A3B8] mt-1">Bütün elanlar təmiz görünür.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {visibleFlagged.map(({ listing, reasons, riskScore }) => {
                  const seller = findUserById(listing.sellerId);
                  const canPunishSeller =
                    seller &&
                    (!currentUser || seller.id !== currentUser.id) &&
                    seller.role !== 'super_admin' &&
                    seller.email.toLowerCase() !== OWNER_EMAIL &&
                    (isOwner || seller.role === 'user');
                  return (
                    <div
                      key={listing.id}
                      className="bg-[#111827] border border-[#1F2937] rounded-xl p-4 sm:p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4"
                    >
                      <div className="flex items-start gap-4 min-w-0">
                        <img
                          src={listing.imageUrl}
                          alt={listing.title}
                          referrerPolicy="no-referrer"
                          className="w-16 h-14 rounded-lg object-cover border border-[#334155] shrink-0"
                        />
                        <div className="min-w-0 space-y-1.5">
                          <div className="flex flex-wrap items-center gap-2.5">
                            <span
                              className={`text-xs font-bold tabular-nums ${
                                riskScore >= 60
                                  ? 'text-[#F87171]'
                                  : riskScore >= 30
                                  ? 'text-[#FBBF24]'
                                  : 'text-[#94A3B8]'
                              }`}
                            >
                              Risk: {riskScore}/100
                            </span>
                            <span className="text-[#475569]">·</span>
                            <button
                              type="button"
                              onClick={() => onViewListing(listing)}
                              className="text-sm font-bold text-white hover:text-[#60A5FA] text-left truncate cursor-pointer"
                            >
                              {listing.title}
                            </button>
                            <span className="text-xs font-bold text-[#38BDF8] tabular-nums">
                              {formatPriceAzn(listing.price)}
                            </span>
                          </div>
                          <p className="text-xs text-[#CBD5E1]">
                            Satıcı: <strong className="text-white">{listing.sellerName}</strong> ({listing.sellerEmail})
                            {seller?.isShadowbanned && (
                              <span className="ml-2 text-[#FBBF24] font-semibold">[SHADOWBAN]</span>
                            )}
                          </p>
                          <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-[#FCA5A5]">
                            {reasons.map((r) => (
                              <span key={r}>• {r}</span>
                            ))}
                          </div>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={() => onViewListing(listing)}
                          className="px-3 py-1.5 text-xs font-medium text-[#E2E8F0] bg-[#1E293B] hover:bg-[#334155] rounded-lg cursor-pointer inline-flex items-center gap-1"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          Bax
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteFlaggedListing(listing)}
                          className="px-3 py-1.5 text-xs font-semibold text-white bg-[#B91C1C] hover:bg-[#991B1B] rounded-lg cursor-pointer inline-flex items-center gap-1"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          Elanı Məhv Et
                        </button>
                        {canPunishSeller && seller && (
                          <>
                            <button
                              type="button"
                              onClick={() => handleToggleShadowban(seller)}
                              className={`px-3 py-1.5 text-xs font-semibold rounded-lg cursor-pointer inline-flex items-center gap-1 border ${
                                seller.isShadowbanned
                                  ? 'bg-[#F59E0B] text-[#111827] border-[#F59E0B]'
                                  : 'bg-[#1E293B] text-[#FBBF24] border-[#78350F] hover:bg-[#451A03]'
                              }`}
                            >
                              <EyeOff className="w-3.5 h-3.5" />
                              {seller.isShadowbanned ? 'Shadowban Aç' : 'Shadowban'}
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setNukeTarget(seller);
                                setNukeDeleteAccount(false);
                                setNukeBlacklistEmail(true);
                                setNukeReason(`Riskli elana görə (${listing.title}) tam məhv edildi.`);
                              }}
                              className="px-3 py-1.5 text-xs font-bold text-white bg-[#DC2626] hover:bg-[#B91C1C] rounded-lg cursor-pointer inline-flex items-center gap-1"
                            >
                              <Skull className="w-3.5 h-3.5" />
                              Satıcını Nuke Et
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ==================== 2. EXECUTION & SHADOWBAN ==================== */}
        {tab === 'execution' && (
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="relative flex-1 max-w-md">
                <Search className="w-4 h-4 text-[#94A3B8] absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={userSearch}
                  onChange={(e) => setUserSearch(e.target.value)}
                  placeholder="Ad, Gmail və ya rol üzrə hədəf axtar..."
                  className="w-full pl-9 pr-3 py-2 text-xs bg-[#111827] border border-[#334155] rounded-lg text-white placeholder-[#64748B]"
                />
              </div>
              <p className="text-xs text-[#94A3B8]">
                Shadowban satıcıya xəbər vermədən bütün elanlarını alıcılardan gizlədir.
              </p>
            </div>

            <div className="bg-[#111827] border border-[#1F2937] rounded-xl overflow-x-auto">
              <table className="w-full text-left border-collapse min-w-[920px]">
                <thead>
                  <tr className="border-b border-[#1F2937] bg-[#0B111E] text-[11px] font-semibold text-[#94A3B8]">
                    <th className="py-3 px-4">İstifadəçi / Gmail</th>
                    <th className="py-3 px-3">Rol</th>
                    <th className="py-3 px-3 text-right">Elan / Cəza</th>
                    <th className="py-3 px-3">Vəziyyət</th>
                    <th className="py-3 px-4 text-right">Sərt Cəza Əməliyyatları</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#1F2937] text-xs">
                  {filteredUsers.map((u) => {
                    const isTargetOwner =
                      u.role === 'super_admin' || u.email.toLowerCase() === OWNER_EMAIL;
                    const isSelf = currentUser ? u.id === currentUser.id : false;
                    const lockedTarget =
                      isSelf ||
                      isTargetOwner ||
                      ((u.role === 'admin' || u.role === 'moderator') && !isOwner);

                    return (
                      <tr key={u.id} className="hover:bg-[#1E293B]/40">
                        <td className="py-3 px-4">
                          <p className="font-semibold text-white">{u.name}</p>
                          <p className="text-[#94A3B8]">{u.email}</p>
                        </td>
                        <td className="py-3 px-3 font-medium text-[#CBD5E1]">
                          {u.role === 'super_admin'
                            ? 'Baş Admin'
                            : u.role === 'admin'
                            ? 'Admin'
                            : u.role === 'moderator'
                            ? 'Moderator'
                            : 'İstifadəçi'}
                        </td>
                        <td className="py-3 px-3 text-right tabular-nums text-[#CBD5E1]">
                          {u.listingsCount ?? 0} elan · {u.warningsCount} xəb.
                        </td>
                        <td className="py-3 px-3">
                          <div className="space-y-0.5">
                            <span
                              className={`font-semibold ${
                                u.status === 'active'
                                  ? 'text-[#4ADE80]'
                                  : u.status === 'kicked'
                                  ? 'text-[#FBBF24]'
                                  : 'text-[#F87171]'
                              }`}
                            >
                              {u.status === 'active'
                                ? 'Aktiv'
                                : u.status === 'kicked'
                                ? 'Kick'
                                : 'Ban'}
                            </span>
                            {u.isShadowbanned && (
                              <p className="text-[11px] font-bold text-[#FBBF24]">
                                Shadowban aktivdir
                              </p>
                            )}
                            {!u.canPostListings && (
                              <p className="text-[11px] text-[#FB923C]">Elan qadağası</p>
                            )}
                          </div>
                        </td>
                        <td className="py-3 px-4 text-right whitespace-nowrap">
                          {lockedTarget ? (
                            <span className="text-[11px] text-[#64748B]">Qorunan hesab</span>
                          ) : (
                            <div className="inline-flex flex-wrap items-center justify-end gap-1.5">
                              <button
                                type="button"
                                onClick={() => handleToggleShadowban(u)}
                                className={`px-2.5 py-1 text-[11px] font-semibold rounded-md cursor-pointer inline-flex items-center gap-1 border ${
                                  u.isShadowbanned
                                    ? 'bg-[#F59E0B] text-[#111827] border-[#F59E0B]'
                                    : 'bg-[#1E293B] text-[#FBBF24] border-[#78350F] hover:bg-[#451A03]'
                                }`}
                              >
                                <EyeOff className="w-3 h-3" />
                                {u.isShadowbanned ? 'Shadowban Aç' : 'Shadowban'}
                              </button>

                              {u.status === 'active' ? (
                                <>
                                  <button
                                    type="button"
                                    onClick={() => handleInstantKick(u)}
                                    className="px-2.5 py-1 text-[11px] font-semibold text-[#FBBF24] bg-[#1E293B] border border-[#475569] hover:bg-[#334155] rounded-md cursor-pointer inline-flex items-center gap-1"
                                  >
                                    <UserX className="w-3 h-3" />
                                    Kick 60d
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleInstantPermaban(u)}
                                    className="px-2.5 py-1 text-[11px] font-semibold text-[#FCA5A5] bg-[#450A0A] border border-[#7F1D1D] hover:bg-[#7F1D1D] rounded-md cursor-pointer inline-flex items-center gap-1"
                                  >
                                    <Ban className="w-3 h-3" />
                                    Ömürlük Ban
                                  </button>
                                </>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => handleUnbanUser(u)}
                                  className="px-2.5 py-1 text-[11px] font-semibold text-[#4ADE80] bg-[#052E16] border border-[#166534] hover:bg-[#14532D] rounded-md cursor-pointer inline-flex items-center gap-1"
                                >
                                  <Unlock className="w-3 h-3" />
                                  Bloku Aç
                                </button>
                              )}

                              <button
                                type="button"
                                onClick={() => {
                                  setNukeTarget(u);
                                  setNukeDeleteAccount(false);
                                  setNukeBlacklistEmail(true);
                                  setNukeReason('');
                                }}
                                className="px-2.5 py-1 text-[11px] font-bold text-white bg-[#DC2626] hover:bg-[#B91C1C] rounded-md cursor-pointer inline-flex items-center gap-1"
                              >
                                <Skull className="w-3 h-3" />
                                Məhv Et (Nuke)
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ==================== 3. KEYWORD EXTERMINATOR ==================== */}
        {tab === 'keywords' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <div className="lg:col-span-7 bg-[#111827] border border-[#1F2937] rounded-xl p-6 space-y-5">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl bg-[#450A0A] border border-[#7F1D1D] text-[#F87171] flex items-center justify-center shrink-0">
                  <Zap className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-white">Kütləvi Açar Söz Ovçusu</h2>
                  <p className="text-xs text-[#94A3B8] mt-1 leading-relaxed">
                    Başlıq, model və ya təsvirində şübhəli söz olan bütün elanları saniyələr içində bazadan silin və ya satıcılarını susdurun.
                  </p>
                </div>
              </div>

              <form onSubmit={handleRunKeywordSweep} className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-[#CBD5E1] mb-1.5">
                    Hədəf Açar Söz (boş buraxsanız sistemdəki bütün qadağan sözlər tətbiq olunacaq)
                  </label>
                  <input
                    type="text"
                    value={sweepKeyword}
                    onChange={(e) => setSweepKeyword(e.target.value)}
                    placeholder="Məs: klon, replika, kopya, pulsuz, telegram..."
                    className="w-full px-3.5 py-2.5 text-sm rounded-lg bg-[#090D16] border border-[#334155] text-white placeholder-[#64748B]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-[#CBD5E1] mb-1.5">Cəza Rejimi</label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => setSweepMode('delete')}
                      className={`p-3 rounded-xl border text-left cursor-pointer ${
                        sweepMode === 'delete'
                          ? 'bg-[#450A0A] border-[#DC2626] text-white'
                          : 'bg-[#090D16] border-[#334155] text-[#CBD5E1]'
                      }`}
                    >
                      <p className="text-xs font-bold">Tam Məhv Et (Delete)</p>
                      <p className="text-[11px] text-[#94A3B8] mt-0.5">
                        Uyğun elanları bazadan birdəfəlik silir.
                      </p>
                    </button>
                    <button
                      type="button"
                      onClick={() => setSweepMode('reject_and_mute')}
                      className={`p-3 rounded-xl border text-left cursor-pointer ${
                        sweepMode === 'reject_and_mute'
                          ? 'bg-[#450A0A] border-[#DC2626] text-white'
                          : 'bg-[#090D16] border-[#334155] text-[#CBD5E1]'
                      }`}
                    >
                      <p className="text-xs font-bold">Rədd Et + Satıcını Susdur</p>
                      <p className="text-[11px] text-[#94A3B8] mt-0.5">
                        Elanları rədd edir və satıcıların elan hüququnu bağlayır.
                      </p>
                    </button>
                  </div>
                </div>

                <button
                  type="submit"
                  className="w-full py-2.5 px-4 bg-[#DC2626] hover:bg-[#B91C1C] text-white text-sm font-bold rounded-lg cursor-pointer inline-flex items-center justify-center gap-2"
                >
                  <Zap className="w-4 h-4" />
                  Təmizləmə Əməliyyatını Başlat
                </button>
              </form>
            </div>

            <div className="lg:col-span-5 bg-[#111827] border border-[#1F2937] rounded-xl p-6 space-y-3 h-fit">
              <h3 className="text-sm font-bold text-white">Bu Alət Necə İşləyir?</h3>
              <ul className="space-y-2 text-xs text-[#94A3B8] leading-relaxed">
                <li>1. Bütün elanların başlığı, modeli və təsviri real vaxtda yoxlanılır.</li>
                <li>2. Boş buraxıldıqda Platforma Ayarlarındakı bütün qadağan edilmiş sözlər skan edilir.</li>
                <li>3. "Rədd Et + Susdur" seçildikdə satıcıya avtomatik xəbərdarlıq balı yazılır.</li>
                <li>4. Bütün əməliyyatlar Sərt Cəza Tarixçəsinə düşür.</li>
              </ul>
            </div>
          </div>
        )}

        {/* ==================== 4. GMAIL BLACKLIST ==================== */}
        {tab === 'blacklist' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <div className="lg:col-span-5 bg-[#111827] border border-[#1F2937] rounded-xl p-6 space-y-4 h-fit">
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-lg bg-[#450A0A] border border-[#7F1D1D] text-[#F87171] flex items-center justify-center shrink-0">
                  <Ban className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-white">Gmail Qara Siyahı</h2>
                  <p className="text-xs text-[#94A3B8] mt-0.5">
                    Qara siyahıdakı Gmail nə daxil ola, nə də yenidən qeydiyyatdan keçə bilər.
                  </p>
                </div>
              </div>

              <form onSubmit={handleAddBlacklist} className="space-y-3">
                <div>
                  <label className="block text-xs font-medium text-[#CBD5E1] mb-1">
                    Bloklanacaq Gmail Ünvanı
                  </label>
                  <input
                    type="email"
                    required
                    value={blacklistEmailInput}
                    onChange={(e) => setBlacklistEmailInput(e.target.value)}
                    placeholder="fırıldaqçı@gmail.com"
                    className="w-full px-3.5 py-2 text-sm rounded-lg bg-[#090D16] border border-[#334155] text-white placeholder-[#64748B]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#CBD5E1] mb-1">Səbəb</label>
                  <input
                    type="text"
                    value={blacklistReason}
                    onChange={(e) => setBlacklistReason(e.target.value)}
                    placeholder="Məs: Saxta cihaz satışı / təkrar spam"
                    className="w-full px-3.5 py-2 text-sm rounded-lg bg-[#090D16] border border-[#334155] text-white placeholder-[#64748B]"
                  />
                </div>
                <label className="flex items-center gap-2 text-xs text-[#CBD5E1] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={blacklistPurgeListings}
                    onChange={(e) => setBlacklistPurgeListings(e.target.checked)}
                    className="rounded border-[#475569] text-[#DC2626]"
                  />
                  <span>Mövcud bütün elanlarını dərhal sil</span>
                </label>
                <button
                  type="submit"
                  className="w-full py-2.5 px-4 bg-[#DC2626] hover:bg-[#B91C1C] text-white text-sm font-bold rounded-lg cursor-pointer"
                >
                  Qara Siyahıya Sal
                </button>
              </form>
            </div>

            <div className="lg:col-span-7 bg-[#111827] border border-[#1F2937] rounded-xl p-6">
              <h3 className="text-base font-bold text-white mb-4">
                Qara Siyahıdakı Gmail Ünvanları ({blacklistedEmails.length})
              </h3>
              {blacklistedEmails.length === 0 ? (
                <p className="text-xs text-[#94A3B8] py-6 text-center">
                  Qara siyahıda hələ heç bir Gmail yoxdur.
                </p>
              ) : (
                <div className="divide-y divide-[#1F2937]">
                  {blacklistedEmails.map((em) => (
                    <div key={em} className="py-3 flex items-center justify-between gap-3 text-xs">
                      <span className="font-semibold text-[#FCA5A5]">{em}</span>
                      <button
                        type="button"
                        onClick={() => handleRemoveBlacklist(em)}
                        className="px-3 py-1.5 text-xs font-medium text-[#CBD5E1] border border-[#334155] hover:bg-[#1E293B] rounded-lg cursor-pointer"
                      >
                        Siyahıdan Çıxar
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ==================== 5. EMERGENCY RED BUTTONS ==================== */}
        {tab === 'emergency' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Control 1: Site Emergency Lockdown */}
            <div className="bg-[#111827] border border-[#7F1D1D]/70 rounded-xl p-6 space-y-4 flex flex-col justify-between">
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-[#F87171]">
                  {radarStats?.maintenanceMode ? (
                    <Unlock className="w-5 h-5" />
                  ) : (
                    <Lock className="w-5 h-5" />
                  )}
                  <h2 className="text-base font-bold text-white">Fövqəladə Sayt Kilidi</h2>
                </div>
                <p className="text-xs text-[#94A3B8] leading-relaxed">
                  Hücum və ya kütləvi spam zamanı saytı dərhal kilidləyir: yeni qeydiyyatları və elan paylaşımını dayandırır.
                </p>
                <div>
                  <label className="block text-[11px] font-medium text-[#CBD5E1] mb-1">
                    Xəbərdarlıq Zolağı Mətni
                  </label>
                  <textarea
                    rows={3}
                    value={lockdownBanner}
                    onChange={(e) => setLockdownBanner(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-lg bg-[#090D16] border border-[#334155] text-white"
                  />
                </div>
              </div>
              {radarStats?.maintenanceMode ? (
                <button
                  type="button"
                  onClick={handleEmergencyUnlock}
                  className="w-full py-2.5 px-4 bg-[#16A34A] hover:bg-[#15803D] text-white text-xs font-bold rounded-lg cursor-pointer"
                >
                  Kilidi Aç (Normal Rejimə Qayıt)
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleEmergencyLockdown}
                  className="w-full py-2.5 px-4 bg-[#DC2626] hover:bg-[#B91C1C] text-white text-xs font-bold rounded-lg cursor-pointer"
                >
                  Fövqəladə Kilidi Aktivləşdir
                </button>
              )}
            </div>

            {/* Control 2: Global Session Kill */}
            <div className="bg-[#111827] border border-[#7F1D1D]/70 rounded-xl p-6 space-y-4 flex flex-col justify-between">
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-[#FBBF24]">
                  <LogOut className="w-5 h-5" />
                  <h2 className="text-base font-bold text-white">Qlobal Sessiya Qətli</h2>
                </div>
                <p className="text-xs text-[#94A3B8] leading-relaxed">
                  Bütün adi istifadəçilərin aktiv tokenlərini və cookiesini dərhal etibarsız edir — hamı saytdan çıxış etdirilir. Admin və moderatorlara toxunulmur.
                </p>
              </div>
              <button
                type="button"
                onClick={handleGlobalSessionKill}
                className="w-full py-2.5 px-4 bg-[#B45309] hover:bg-[#92400E] text-white text-xs font-bold rounded-lg cursor-pointer"
              >
                Bütün İstifadəçiləri Dərhal At
              </button>
            </div>

            {/* Control 3: Flush Pending Queue */}
            <div className="bg-[#111827] border border-[#7F1D1D]/70 rounded-xl p-6 space-y-4 flex flex-col justify-between">
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-[#F87171]">
                  <Trash2 className="w-5 h-5" />
                  <h2 className="text-base font-bold text-white">
                    Gözləyən Növbəni Sıfırla ({radarStats?.pendingCount ?? 0})
                  </h2>
                </div>
                <p className="text-xs text-[#94A3B8] leading-relaxed">
                  Təsdiq gözləyən bütün elanları tək əmrlə rədd edilmiş statusuna keçirir.
                </p>
                <div>
                  <label className="block text-[11px] font-medium text-[#CBD5E1] mb-1">
                    Rədd Səbəbi
                  </label>
                  <input
                    type="text"
                    value={flushReason}
                    onChange={(e) => setFlushReason(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-lg bg-[#090D16] border border-[#334155] text-white"
                  />
                </div>
              </div>
              <button
                type="button"
                onClick={handleFlushPending}
                className="w-full py-2.5 px-4 bg-[#DC2626] hover:bg-[#B91C1C] text-white text-xs font-bold rounded-lg cursor-pointer"
              >
                Gözləyən Bütün Elanları Rədd Et
              </button>
            </div>

            {/* Passcode Update */}
            {!usingEnvOverride && canManageAccess && (
              <div className="lg:col-span-3 bg-[#111827] border border-[#1F2937] rounded-xl p-6">
                <h3 className="text-sm font-bold text-white mb-1">Moderator Panel Parolunu Dəyiş</h3>
                <p className="text-xs text-[#94A3B8] mb-4">
                  Dəyişdikdən sonra digər açıq moderator sessiyaları avtomatik bağlanacaq.
                </p>
                <form
                  onSubmit={async (e) => {
                    e.preventDefault();
                    setChangingModPasscode(true);
                    try {
                      const res = await apiFetch<{ ok: boolean; modToken: string }>(
                        '/api/moderator/auth/change-passcode',
                        {
                          method: 'POST',
                          body: JSON.stringify({
                            currentPasscode: currentModPasscode,
                            newPasscode: newModPasscode,
                          }),
                        }
                      );
                      setModToken(res.modToken);
                      setCurrentModPasscode('');
                      setNewModPasscode('');
                      onNotify('Moderator parolu uğurla yeniləndi.', 'success');
                    } catch (err) {
                      onNotify(
                        err instanceof ApiError ? err.message : 'Parol dəyişdirilmədi.',
                        'error'
                      );
                    } finally {
                      setChangingModPasscode(false);
                    }
                  }}
                  className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end"
                >
                  <div>
                    <label className="block text-[11px] font-medium text-[#CBD5E1] mb-1">
                      Hazırkı Parol
                    </label>
                    <input
                      type="password"
                      required
                      value={currentModPasscode}
                      onChange={(e) => setCurrentModPasscode(e.target.value)}
                      className="w-full px-3 py-2 text-xs rounded-lg bg-[#090D16] border border-[#334155] text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium text-[#CBD5E1] mb-1">
                      Yeni Parol (min. 2 simvol)
                    </label>
                    <input
                      type="password"
                      required
                      minLength={2}
                      value={newModPasscode}
                      onChange={(e) => setNewModPasscode(e.target.value)}
                      className="w-full px-3 py-2 text-xs rounded-lg bg-[#090D16] border border-[#334155] text-white"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={changingModPasscode}
                    className="py-2 px-4 bg-[#1E293B] hover:bg-[#334155] border border-[#334155] text-white text-xs font-bold rounded-lg cursor-pointer"
                  >
                    {changingModPasscode ? 'Yenilənir...' : 'Parolu Yenilə'}
                  </button>
                </form>
              </div>
            )}
          </div>
        )}

        {/* ==================== 6. RƏŞİD & DELEGATED ACCESS ==================== */}
        {tab === 'access' && (
          <DelegatedAccessManager
            theme="dark"
            canManageAccess={canManageAccess}
            onNotify={onNotify}
            onChanged={loadModeratorData}
          />
        )}

        {/* ==================== 7. MODERATOR STRIKE LOG ==================== */}
        {tab === 'strikes' && (
          <div className="bg-[#111827] border border-[#1F2937] rounded-xl p-6 divide-y divide-[#1F2937]">
            {moderatorLogs.length === 0 ? (
              <p className="py-8 text-center text-sm text-[#94A3B8]">
                Hələ ağır moderator cəzası qeydə alınmayıb.
              </p>
            ) : (
              moderatorLogs.map((log) => (
                <div key={log.id} className="py-3 flex items-start justify-between gap-4 text-xs">
                  <div className="min-w-0">
                    <p className="font-bold text-[#FCA5A5]">
                      {log.action} · <span className="font-medium text-white">{log.targetLabel}</span>
                    </p>
                    <p className="text-[#94A3B8] mt-0.5">
                      İcraçı: {log.actorEmail} {log.reason ? `· Səbəb: ${log.reason}` : ''}
                    </p>
                  </div>
                  <span className="text-[#64748B] shrink-0 tabular-nums">
                    {formatRelativeAz(log.createdAt)}
                  </span>
                </div>
              ))
            )}
          </div>
        )}
      </main>

      {/* ==================== MODAL: NUKE USER ==================== */}
      {nukeTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-xs">
          <form
            onSubmit={submitNukeUser}
            className="w-full max-w-md bg-[#111827] text-white rounded-2xl border border-[#7F1D1D] shadow-2xl p-6 space-y-4"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-[#F87171] flex items-center gap-2">
                <Skull className="w-5 h-5" />
                İstifadəçini Tam Məhv Et (Nuke)
              </h3>
              <button
                type="button"
                onClick={() => setNukeTarget(null)}
                className="p-1 text-[#94A3B8] hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-3 rounded-xl bg-[#450A0A]/60 border border-[#7F1D1D] text-xs text-[#FECACA] leading-relaxed">
              <strong>{nukeTarget.name}</strong> ({nukeTarget.email}) istifadəçisinin BÜTÜN elanları bazadan silinəcək və hesab zərərsizləşdiriləcək.
            </div>
            <div>
              <label className="block text-xs font-medium text-[#CBD5E1] mb-1">Səbəb</label>
              <input
                type="text"
                required
                value={nukeReason}
                onChange={(e) => setNukeReason(e.target.value)}
                placeholder="Məs: Dələduzluq və saxta telefon satışı"
                className="w-full px-3 py-2 text-sm rounded-lg bg-[#090D16] border border-[#334155] text-white"
              />
            </div>
            <label className="flex items-center gap-2 text-xs text-[#E2E8F0] cursor-pointer">
              <input
                type="checkbox"
                checked={nukeBlacklistEmail}
                onChange={(e) => setNukeBlacklistEmail(e.target.checked)}
                className="rounded border-[#475569] text-[#DC2626]"
              />
              <span>Gmail ünvanını Qara Siyahıya sal (təkrar qeydiyyat qadağası)</span>
            </label>
            <label className="flex items-center gap-2 text-xs text-[#FCA5A5] cursor-pointer">
              <input
                type="checkbox"
                checked={nukeDeleteAccount}
                onChange={(e) => setNukeDeleteAccount(e.target.checked)}
                className="rounded border-[#7F1D1D] text-[#DC2626]"
              />
              <span>Hesabı bazadan TAMAMİLƏ SİL (ömürlük ban əvəzinə sil)</span>
            </label>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setNukeTarget(null)}
                className="px-4 py-2 text-xs font-medium text-[#CBD5E1] hover:bg-[#1E293B] rounded-lg cursor-pointer"
              >
                Ləğv et
              </button>
              <button
                type="submit"
                disabled={nukeSubmitting}
                className="px-4 py-2 text-xs font-bold text-white bg-[#DC2626] hover:bg-[#B91C1C] disabled:opacity-50 rounded-lg cursor-pointer"
              >
                {nukeSubmitting ? 'İcra olunur...' : 'Təsdiq Et və Məhv Et'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ==================== MODAL: IN-APP CONFIRM ==================== */}
      {confirmAction && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-xs">
          <div className="w-full max-w-md bg-[#111827] text-white rounded-2xl border border-[#7F1D1D] shadow-2xl p-6 space-y-4">
            <div className="flex items-center gap-2.5 text-[#F87171]">
              <AlertTriangle className="w-5 h-5 shrink-0" />
              <h3 className="text-base font-bold">{confirmAction.title}</h3>
            </div>
            <p className="text-xs text-[#CBD5E1] leading-relaxed">{confirmAction.description}</p>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                disabled={confirmBusy}
                onClick={() => setConfirmAction(null)}
                className="px-4 py-2 text-xs font-medium text-[#CBD5E1] hover:bg-[#1E293B] rounded-lg cursor-pointer"
              >
                İmtina et
              </button>
              <button
                type="button"
                disabled={confirmBusy}
                onClick={async () => {
                  setConfirmBusy(true);
                  try {
                    await confirmAction.onConfirm();
                    setConfirmAction(null);
                  } catch (err) {
                    onNotify(
                      err instanceof ApiError ? err.message : 'Əməliyyat icra olunmadı.',
                      'error'
                    );
                  } finally {
                    setConfirmBusy(false);
                  }
                }}
                className="px-4 py-2 text-xs font-bold text-white bg-[#DC2626] hover:bg-[#B91C1C] disabled:opacity-50 rounded-lg cursor-pointer"
              >
                {confirmBusy ? 'İcra edilir...' : confirmAction.confirmLabel}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
