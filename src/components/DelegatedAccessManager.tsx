import {
  CheckCircle2,
  Flame,
  KeyRound,
  Mail,
  Plus,
  Shield,
  Trash2,
  UserCheck,
  UserPlus,
} from 'lucide-react';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { apiFetch, ApiError } from '../lib/api.ts';
import type { AdminPermissions, OperatorAccess } from '../types.ts';

interface DelegatedAccessManagerProps {
  theme: 'light' | 'dark';
  canManageAccess: boolean;
  onNotify: (msg: string, type?: 'success' | 'error') => void;
  onChanged?: () => void;
}

const FULL_PERMS: AdminPermissions = {
  canApproveListings: true,
  canEditDeleteListings: true,
  canKickBanUsers: true,
  canManageReports: true,
  canManageSettings: true,
  canManageCatalog: true,
  canSendBroadcasts: true,
  canUseDangerousMod: true,
};

const MOD_PERMS: AdminPermissions = {
  canApproveListings: true,
  canEditDeleteListings: false,
  canKickBanUsers: true,
  canManageReports: true,
  canManageSettings: false,
  canManageCatalog: false,
  canSendBroadcasts: true,
  canUseDangerousMod: true,
};

const PERM_OPTIONS: { key: keyof AdminPermissions; label: string; short: string }[] = [
  { key: 'canApproveListings', label: 'Elan təsdiqləmə və rədd etmə', short: 'Təsdiq' },
  { key: 'canEditDeleteListings', label: 'Elan redaktə, VIP və silmə', short: 'Redaktə/VIP' },
  { key: 'canKickBanUsers', label: 'İstifadəçiləri Kick / Ban etmə', short: 'Kick/Ban' },
  { key: 'canUseDangerousMod', label: 'Təhlükəli Moderator alətləri', short: 'Mod Alətləri' },
  { key: 'canManageReports', label: 'Şikayətlərə baxmaq', short: 'Şikayətlər' },
  { key: 'canManageCatalog', label: 'Brend və Şəhər kataloqu', short: 'Kataloq' },
  { key: 'canSendBroadcasts', label: 'Bildiriş göndərişi', short: 'Bildiriş' },
  { key: 'canManageSettings', label: 'Platforma ayarları & Backup', short: 'Ayarlar' },
];

export function DelegatedAccessManager({
  theme,
  canManageAccess,
  onNotify,
  onChanged,
}: DelegatedAccessManagerProps) {
  const isDark = theme === 'dark';
  const [loading, setLoading] = useState(true);
  const [reshid, setReshid] = useState<OperatorAccess | null>(null);
  const [operators, setOperators] = useState<OperatorAccess[]>([]);

  // Rəşid form state
  const [reshidName, setReshidName] = useState('Rəşid');
  const [reshidEmail, setReshidEmail] = useState('');
  const [reshidPasscode, setReshidPasscode] = useState('');
  const [reshidClearPasscode, setReshidClearPasscode] = useState(false);
  const [reshidAdmin, setReshidAdmin] = useState(true);
  const [reshidMod, setReshidMod] = useState(true);
  const [reshidActive, setReshidActive] = useState(true);
  const [reshidPerms, setReshidPerms] = useState<AdminPermissions>({ ...FULL_PERMS });
  const [savingReshid, setSavingReshid] = useState(false);

  // New operator invite state
  const [newName, setNewName] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newPasscode, setNewPasscode] = useState('');
  const [newAllowAdmin, setNewAllowAdmin] = useState(true);
  const [newAllowMod, setNewAllowMod] = useState(false);
  const [newPerms, setNewPerms] = useState<AdminPermissions>({ ...FULL_PERMS });
  const [creatingOp, setCreatingOp] = useState(false);

  const loadAccess = useCallback(async () => {
    if (!canManageAccess) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const res = await apiFetch<{
        reshid: OperatorAccess;
        operators: OperatorAccess[];
      }>('/api/access/operators');
      setReshid(res.reshid);
      setOperators(res.operators);
      setReshidName(res.reshid.displayName || 'Rəşid');
      setReshidEmail(res.reshid.email || '');
      setReshidAdmin(res.reshid.allowAdminPanel);
      setReshidMod(res.reshid.allowModeratorPanel);
      setReshidActive(res.reshid.active);
      setReshidPerms({ ...FULL_PERMS, ...res.reshid.permissions });
      setReshidPasscode('');
      setReshidClearPasscode(false);
    } catch (err) {
      onNotify(
        err instanceof ApiError ? err.message : 'İcazə siyahısı yüklənmədi.',
        'error'
      );
    } finally {
      setLoading(false);
    }
  }, [canManageAccess, onNotify]);

  useEffect(() => {
    loadAccess();
  }, [loadAccess]);

  const handleSaveReshid = async (e: FormEvent) => {
    e.preventDefault();
    setSavingReshid(true);
    try {
      const res = await apiFetch<{ reshid: OperatorAccess }>('/api/access/reshid', {
        method: 'PUT',
        body: JSON.stringify({
          displayName: reshidName.trim() || 'Rəşid',
          email: reshidEmail.trim(),
          passcode: reshidPasscode.trim() || undefined,
          clearPasscode: reshidClearPasscode,
          allowAdminPanel: reshidAdmin,
          allowModeratorPanel: reshidMod,
          active: reshidActive,
          permissions: reshidPerms,
        }),
      });
      setReshid(res.reshid);
      setReshidPasscode('');
      setReshidClearPasscode(false);
      onNotify('Rəşidin Admin və Moderator panel icazələri yadda saxlanıldı.', 'success');
      onChanged?.();
    } catch (err) {
      onNotify(err instanceof ApiError ? err.message : 'Rəşid ayarları saxlanılmadı.', 'error');
    } finally {
      setSavingReshid(false);
    }
  };

  const handleCreateOperator = async (e: FormEvent) => {
    e.preventDefault();
    setCreatingOp(true);
    try {
      await apiFetch('/api/access/operators', {
        method: 'POST',
        body: JSON.stringify({
          displayName: newName.trim(),
          email: newEmail.trim(),
          passcode: newPasscode.trim() || undefined,
          allowAdminPanel: newAllowAdmin,
          allowModeratorPanel: newAllowMod,
          permissions: newPerms,
        }),
      });
      setNewName('');
      setNewEmail('');
      setNewPasscode('');
      setNewAllowAdmin(true);
      setNewAllowMod(false);
      setNewPerms({ ...FULL_PERMS });
      await loadAccess();
      onNotify('Yeni şəxsə panel giriş icazəsi verildi.', 'success');
      onChanged?.();
    } catch (err) {
      onNotify(err instanceof ApiError ? err.message : 'İcazə əlavə edilmədi.', 'error');
    } finally {
      setCreatingOp(false);
    }
  };

  const handlePatchOperator = async (
    op: OperatorAccess,
    patch: Partial<{
      allowAdminPanel: boolean;
      allowModeratorPanel: boolean;
      active: boolean;
      permissions: AdminPermissions;
    }>
  ) => {
    try {
      const res = await apiFetch<{ operator: OperatorAccess }>(`/api/access/operators/${op.id}`, {
        method: 'PATCH',
        body: JSON.stringify(patch),
      });
      setOperators((prev) => prev.map((item) => (item.id === op.id ? res.operator : item)));
      onNotify(`${op.displayName} üçün icazələr yeniləndi.`, 'success');
      onChanged?.();
    } catch (err) {
      onNotify(err instanceof ApiError ? err.message : 'Yeniləmə alınmadı.', 'error');
    }
  };

  const handleDeleteOperator = async (op: OperatorAccess) => {
    try {
      await apiFetch(`/api/access/operators/${op.id}`, { method: 'DELETE' });
      setOperators((prev) => prev.filter((item) => item.id !== op.id));
      onNotify(`${op.displayName} icazə siyahısından silindi.`, 'success');
      onChanged?.();
    } catch (err) {
      onNotify(err instanceof ApiError ? err.message : 'Silinmədi.', 'error');
    }
  };

  const surfaceClass = isDark
    ? 'bg-[#111827] border border-[#1F2937] rounded-xl'
    : 'bg-white border border-[#E4E7EC] rounded-xl';
  const inputClass = isDark
    ? 'w-full px-3.5 py-2 text-sm rounded-lg bg-[#090D16] border border-[#334155] text-white placeholder-[#64748B] focus:outline-none focus:border-[#EF4444]'
    : 'w-full px-3.5 py-2 text-sm rounded-lg bg-white border border-[#D1D5DB] text-[#111827] placeholder-[#9CA3AF] focus:outline-none focus:border-[#2563EB]';
  const labelClass = isDark
    ? 'block text-xs font-medium text-[#CBD5E1] mb-1'
    : 'block text-xs font-medium text-[#374151] mb-1';
  const headingClass = isDark ? 'text-base font-bold text-white' : 'text-base font-bold text-[#111827]';
  const mutedClass = isDark ? 'text-xs text-[#94A3B8]' : 'text-xs text-[#6B7280]';

  if (!canManageAccess) {
    return (
      <div className={`${surfaceClass} p-6`}>
        <p className={isDark ? 'text-sm text-[#FCA5A5]' : 'text-sm text-[#991B1B]'}>
          Rəşid və digər icazəli şəxslərin siyahısını yalnız Baş Admin və ya əsas parol sessiyası idarə edə bilər.
        </p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className={`${surfaceClass} p-8 text-center`}>
        <p className={mutedClass}>Rəşid və icazəli operatorlar yüklənir...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* ==================== 1. DEDICATED RƏŞİD CARD ==================== */}
      <div
        className={
          isDark
            ? 'bg-[#111827] border border-[#334155] rounded-xl p-6 space-y-5'
            : 'bg-white border border-[#CBD5E1] rounded-xl p-6 space-y-5 shadow-xs'
        }
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-current/10">
          <div className="flex items-start gap-3">
            <div
              className={
                isDark
                  ? 'w-10 h-10 rounded-xl bg-[#1E293B] border border-[#334155] text-[#60A5FA] flex items-center justify-center shrink-0'
                  : 'w-10 h-10 rounded-xl bg-[#EFF6FF] border border-[#BFDBFE] text-[#2563EB] flex items-center justify-center shrink-0'
              }
            >
              <UserCheck className="w-5 h-5" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className={headingClass}>Rəşid — Şəxsi Admin & Moderator Paneli</h2>
                <span
                  className={`text-xs font-semibold ${
                    reshidActive
                      ? isDark
                        ? 'text-[#4ADE80]'
                        : 'text-[#16A34A]'
                      : isDark
                      ? 'text-[#F87171]'
                      : 'text-[#DC2626]'
                  }`}
                >
                  · {reshidActive ? 'Aktivdir' : 'Deaktivdir'}
                </span>
              </div>
              <p className={`${mutedClass} mt-1 leading-relaxed`}>
                Rəşid üçün həm Admin Panelini, həm də Moderator Panelini ayrıca açın. Rəşid təyin etdiyiniz Gmail ilə daxil olduqda və ya şəxsi parolunu yazdıqda birbaşa öz panelinə girəcək.
              </p>
            </div>
          </div>

          <label className="inline-flex items-center gap-2 text-xs font-semibold cursor-pointer shrink-0">
            <input
              type="checkbox"
              checked={reshidActive}
              onChange={(e) => setReshidActive(e.target.checked)}
              className="rounded border-[#475569] text-[#2563EB]"
            />
            <span className={isDark ? 'text-white' : 'text-[#111827]'}>Rəşid Girişi Aktivdir</span>
          </label>
        </div>

        <form onSubmit={handleSaveReshid} className="space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className={labelClass}>Paneldəki Ad</label>
              <input
                type="text"
                value={reshidName}
                onChange={(e) => setReshidName(e.target.value)}
                placeholder="Rəşid"
                className={inputClass}
              />
            </div>

            <div>
              <label className={labelClass}>
                Rəşidin Gmail Ünvanı (Gmail girişi üçün)
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 text-[#94A3B8] absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="email"
                  value={reshidEmail}
                  onChange={(e) => setReshidEmail(e.target.value)}
                  placeholder="reshid@gmail.com"
                  className={`${inputClass} pl-9`}
                />
              </div>
            </div>

            <div>
              <label className={labelClass}>
                Rəşidin Şəxsi Parolu{' '}
                {reshid?.hasPasscode ? '(Hal-hazırda təyin edilib)' : '(Təyin edilməyib)'}
              </label>
              <div className="relative">
                <KeyRound className="w-4 h-4 text-[#94A3B8] absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="password"
                  value={reshidPasscode}
                  onChange={(e) => {
                    setReshidPasscode(e.target.value);
                    if (e.target.value) setReshidClearPasscode(false);
                  }}
                  placeholder={reshid?.hasPasscode ? 'Dəyişmək üçün yeni parol yazın...' : 'Məs: reshid77'}
                  className={`${inputClass} pl-9`}
                />
              </div>
              {reshid?.hasPasscode && (
                <label className="mt-1.5 inline-flex items-center gap-1.5 text-[11px] text-[#94A3B8] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={reshidClearPasscode}
                    onChange={(e) => {
                      setReshidClearPasscode(e.target.checked);
                      if (e.target.checked) setReshidPasscode('');
                    }}
                  />
                  <span>Şəxsi parolu sil (yalnız Gmail ilə girsin)</span>
                </label>
              )}
            </div>
          </div>

          {/* Dedicated Panel Toggles for Rəşid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label
              className={`p-3.5 rounded-xl border cursor-pointer flex items-start gap-3 transition-colors ${
                reshidAdmin
                  ? isDark
                    ? 'bg-[#172554]/50 border-[#3B82F6] text-white'
                    : 'bg-[#EFF6FF] border-[#2563EB] text-[#111827]'
                  : isDark
                  ? 'bg-[#090D16] border-[#1F2937] text-[#94A3B8]'
                  : 'bg-[#F9FAFB] border-[#E4E7EC] text-[#4B5563]'
              }`}
            >
              <input
                type="checkbox"
                checked={reshidAdmin}
                onChange={(e) => setReshidAdmin(e.target.checked)}
                className="mt-0.5 rounded border-[#475569] text-[#2563EB]"
              />
              <div>
                <p className="text-xs font-bold flex items-center gap-1.5">
                  <Shield className="w-3.5 h-3.5 text-[#3B82F6]" />
                  Rəşid Üçün Admin Panel
                </p>
                <p className="text-[11px] opacity-80 mt-0.5">
                  Rəşid Admin Panelinə öz hesabından və ya şəxsi parolundan daxil ola bilsin.
                </p>
              </div>
            </label>

            <label
              className={`p-3.5 rounded-xl border cursor-pointer flex items-start gap-3 transition-colors ${
                reshidMod
                  ? isDark
                    ? 'bg-[#450A0A]/50 border-[#EF4444] text-white'
                    : 'bg-[#FEF2F2] border-[#DC2626] text-[#111827]'
                  : isDark
                  ? 'bg-[#090D16] border-[#1F2937] text-[#94A3B8]'
                  : 'bg-[#F9FAFB] border-[#E4E7EC] text-[#4B5563]'
              }`}
            >
              <input
                type="checkbox"
                checked={reshidMod}
                onChange={(e) => setReshidMod(e.target.checked)}
                className="mt-0.5 rounded border-[#475569] text-[#DC2626]"
              />
              <div>
                <p className="text-xs font-bold flex items-center gap-1.5">
                  <Flame className="w-3.5 h-3.5 text-[#EF4444]" />
                  Rəşid Üçün Moderator Panel
                </p>
                <p className="text-[11px] opacity-80 mt-0.5">
                  Rəşid Təhlükəli Moderator Panelinə öz hesabından və ya şəxsi parolundan daxil ola bilsin.
                </p>
              </div>
            </label>
          </div>

          {/* Granular Permissions for Rəşid */}
          <div className="space-y-2">
            <p className={labelClass}>Rəşidin Panel Daxili Səlahiyyətləri:</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
              {PERM_OPTIONS.map((perm) => (
                <label
                  key={perm.key}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-xs cursor-pointer ${
                    isDark
                      ? 'bg-[#090D16] border-[#1F2937] text-[#CBD5E1]'
                      : 'bg-[#F9FAFB] border-[#E4E7EC] text-[#374151]'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={reshidPerms[perm.key]}
                    onChange={(e) =>
                      setReshidPerms((prev) => ({ ...prev, [perm.key]: e.target.checked }))
                    }
                    className="rounded border-[#475569] text-[#2563EB]"
                  />
                  <span className="truncate" title={perm.label}>
                    {perm.short}
                  </span>
                </label>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
            <p className={mutedClass}>
              {reshid?.email || reshid?.hasPasscode
                ? `Aktiv giriş üsulları: ${[
                    reshid?.email ? `Gmail (${reshid.email})` : null,
                    reshid?.hasPasscode ? 'Şəxsi parol' : null,
                  ]
                    .filter(Boolean)
                    .join(' · ')}`
                : 'Rəşidin daxil ola bilməsi üçün Gmail ünvanı və ya şəxsi parol təyin edin.'}
            </p>
            <button
              type="submit"
              disabled={savingReshid}
              className="px-5 py-2.5 bg-[#2563EB] hover:bg-[#1D4ED8] disabled:opacity-60 text-white text-xs font-bold rounded-lg cursor-pointer inline-flex items-center gap-1.5"
            >
              <CheckCircle2 className="w-4 h-4" />
              {savingReshid ? 'Saxlanılır...' : 'Rəşid Ayarlarını Saxla'}
            </button>
          </div>
        </form>
      </div>

      {/* ==================== 2. ANY AUTHORIZED PEOPLE ==================== */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
        <div className={`xl:col-span-5 ${surfaceClass} p-6 space-y-4 h-fit`}>
          <div className="flex items-start gap-3">
            <div
              className={
                isDark
                  ? 'w-9 h-9 rounded-lg bg-[#450A0A] border border-[#7F1D1D] text-[#F87171] flex items-center justify-center shrink-0'
                  : 'w-9 h-9 rounded-lg bg-[#EFF6FF] text-[#2563EB] flex items-center justify-center shrink-0'
              }
            >
              <UserPlus className="w-5 h-5" />
            </div>
            <div>
              <h3 className={headingClass}>Başqa Şəxsə Panel İcazəsi Ver</h3>
              <p className={`${mutedClass} mt-0.5 leading-relaxed`}>
                İcazə verdiyiniz istənilən şəxs Gmail hesabına girdikdə və ya şəxsi parolunu daxil etdikdə seçilmiş panelə birbaşa girə bilər.
              </p>
            </div>
          </div>

          <form onSubmit={handleCreateOperator} className="space-y-3.5">
            <div>
              <label className={labelClass}>Ad / Qeyd *</label>
              <input
                type="text"
                required
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Məs: Murad (Moderator)"
                className={inputClass}
              />
            </div>

            <div>
              <label className={labelClass}>Gmail Ünvanı (istəyə bağlı, parol varsa)</label>
              <input
                type="email"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                placeholder="numune@gmail.com"
                className={inputClass}
              />
            </div>

            <div>
              <label className={labelClass}>Şəxsi Giriş Parolu (istəyə bağlı, Gmail varsa)</label>
              <input
                type="password"
                value={newPasscode}
                onChange={(e) => setNewPasscode(e.target.value)}
                placeholder="Məs: murad123"
                className={inputClass}
              />
            </div>

            <div className="grid grid-cols-2 gap-2 pt-1">
              <label
                className={`p-2.5 rounded-lg border text-xs font-semibold cursor-pointer flex items-center gap-2 ${
                  newAllowAdmin
                    ? isDark
                      ? 'bg-[#172554]/60 border-[#3B82F6] text-white'
                      : 'bg-[#EFF6FF] border-[#2563EB] text-[#1D4ED8]'
                    : isDark
                    ? 'bg-[#090D16] border-[#1F2937] text-[#94A3B8]'
                    : 'bg-white border-[#D1D5DB] text-[#4B5563]'
                }`}
              >
                <input
                  type="checkbox"
                  checked={newAllowAdmin}
                  onChange={(e) => {
                    const checked = e.target.checked;
                    setNewAllowAdmin(checked);
                    if (!checked && newAllowMod) setNewPerms({ ...MOD_PERMS });
                  }}
                />
                <span>Admin Panel</span>
              </label>

              <label
                className={`p-2.5 rounded-lg border text-xs font-semibold cursor-pointer flex items-center gap-2 ${
                  newAllowMod
                    ? isDark
                      ? 'bg-[#450A0A]/60 border-[#EF4444] text-white'
                      : 'bg-[#FEF2F2] border-[#DC2626] text-[#B91C1C]'
                    : isDark
                    ? 'bg-[#090D16] border-[#1F2937] text-[#94A3B8]'
                    : 'bg-white border-[#D1D5DB] text-[#4B5563]'
                }`}
              >
                <input
                  type="checkbox"
                  checked={newAllowMod}
                  onChange={(e) => setNewAllowMod(e.target.checked)}
                />
                <span>Moderator Panel</span>
              </label>
            </div>

            <div className="grid grid-cols-2 gap-1.5 pt-1">
              {PERM_OPTIONS.map((perm) => (
                <label
                  key={perm.key}
                  className={`flex items-center gap-1.5 text-[11px] cursor-pointer py-1 ${
                    isDark ? 'text-[#CBD5E1]' : 'text-[#374151]'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={newPerms[perm.key]}
                    onChange={(e) =>
                      setNewPerms((prev) => ({ ...prev, [perm.key]: e.target.checked }))
                    }
                    className="rounded border-[#475569] text-[#2563EB]"
                  />
                  <span className="truncate">{perm.short}</span>
                </label>
              ))}
            </div>

            <button
              type="submit"
              disabled={creatingOp}
              className={`w-full py-2.5 px-4 text-white text-xs font-bold rounded-lg cursor-pointer inline-flex items-center justify-center gap-1.5 ${
                isDark ? 'bg-[#DC2626] hover:bg-[#B91C1C]' : 'bg-[#0F172A] hover:bg-[#1E293B]'
              }`}
            >
              <Plus className="w-4 h-4" />
              {creatingOp ? 'Əlavə edilir...' : 'İcazə Ver və Siyahıya Sal'}
            </button>
          </form>
        </div>

        <div className={`xl:col-span-7 ${surfaceClass} p-6 space-y-4`}>
          <div>
            <h3 className={headingClass}>
              İcazə Verilmiş Şəxslər ({operators.length})
            </h3>
            <p className={`${mutedClass} mt-0.5`}>
              Bu siyahıdakı şəxslər əsas parolu bilmədən öz Gmail hesabı və ya şəxsi parolu ilə icazəli panellərə girə bilir.
            </p>
          </div>

          {operators.length === 0 ? (
            <div
              className={`p-8 rounded-xl border border-dashed text-center ${
                isDark ? 'border-[#334155] text-[#94A3B8]' : 'border-[#D1D5DB] text-[#6B7280]'
              }`}
            >
              <p className="text-sm font-medium">Hələ əlavə şəxs təyin edilməyib.</p>
              <p className="text-xs mt-1">
                Soldakı formdan istənilən şəxsin Gmail-ini və ya şəxsi parolunu yazıb ona Admin/Moderator icazəsi verə bilərsiniz.
              </p>
            </div>
          ) : (
            <div className={`divide-y ${isDark ? 'divide-[#1F2937]' : 'divide-[#F3F4F6]'}`}>
              {operators.map((op) => (
                <div key={op.id} className="py-4 space-y-3">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className={`text-sm font-bold flex items-center gap-2 ${isDark ? 'text-white' : 'text-[#111827]'}`}>
                        <span>{op.displayName}</span>
                        <span
                          className={`text-[11px] font-semibold ${
                            op.active
                              ? isDark
                                ? 'text-[#4ADE80]'
                                : 'text-[#16A34A]'
                              : isDark
                              ? 'text-[#F87171]'
                              : 'text-[#DC2626]'
                          }`}
                        >
                          · {op.active ? 'Aktiv' : 'Deaktiv'}
                        </span>
                      </p>
                      <p className={mutedClass}>
                        {[
                          op.email || null,
                          op.hasPasscode ? 'Şəxsi parol aktiv' : null,
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => handlePatchOperator(op, { active: !op.active })}
                        className={`px-2.5 py-1 text-[11px] font-semibold rounded-md border cursor-pointer ${
                          isDark
                            ? 'border-[#334155] text-[#E2E8F0] hover:bg-[#1E293B]'
                            : 'border-[#D1D5DB] text-[#374151] hover:bg-[#F9FAFB]'
                        }`}
                      >
                        {op.active ? 'Deaktiv Et' : 'Aktivləşdir'}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteOperator(op)}
                        className={`px-2.5 py-1 text-[11px] font-semibold rounded-md border cursor-pointer inline-flex items-center gap-1 ${
                          isDark
                            ? 'border-[#7F1D1D] text-[#FCA5A5] hover:bg-[#450A0A]'
                            : 'border-[#FECACA] text-[#DC2626] hover:bg-[#FEF2F2]'
                        }`}
                      >
                        <Trash2 className="w-3 h-3" />
                        Sil
                      </button>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-4 text-xs">
                    <label className="inline-flex items-center gap-1.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={op.allowAdminPanel}
                        onChange={(e) =>
                          handlePatchOperator(op, { allowAdminPanel: e.target.checked })
                        }
                        className="rounded border-[#475569] text-[#2563EB]"
                      />
                      <span className={isDark ? 'text-[#93C5FD] font-semibold' : 'text-[#1D4ED8] font-semibold'}>
                        Admin Panel
                      </span>
                    </label>
                    <label className="inline-flex items-center gap-1.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={op.allowModeratorPanel}
                        onChange={(e) =>
                          handlePatchOperator(op, { allowModeratorPanel: e.target.checked })
                        }
                        className="rounded border-[#475569] text-[#DC2626]"
                      />
                      <span className={isDark ? 'text-[#FCA5A5] font-semibold' : 'text-[#DC2626] font-semibold'}>
                        Moderator Panel
                      </span>
                    </label>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
