import { Bell, Flame, LogOut, Menu, Plus, Shield, Smartphone, User as UserIcon, X } from 'lucide-react';
import { useState } from 'react';
import type { PanelActorInfo, PublicUser } from '../types.ts';

export type AppView = 'marketplace' | 'favorites' | 'my_listings' | 'admin' | 'moderator';

const OWNER_EMAIL = 'ismayilahmad185@gmail.com';

interface TopBarProps {
  user: PublicUser | null;
  activeView: AppView;
  unreadNotificationsCount: number;
  adminUnlocked?: boolean;
  modUnlocked?: boolean;
  adminActor?: PanelActorInfo | null;
  modActor?: PanelActorInfo | null;
  onNavigate: (view: AppView) => void;
  onOpenAdminGate: (targetPanel: 'admin' | 'moderator') => void;
  onOpenPostListing: () => void;
  onOpenAuth: () => void;
  onOpenNotifications: () => void;
  onLogout: () => void;
}

export function TopBar({
  user,
  activeView,
  unreadNotificationsCount,
  adminUnlocked = false,
  modUnlocked = false,
  adminActor = null,
  modActor = null,
  onNavigate,
  onOpenAdminGate,
  onOpenPostListing,
  onOpenAuth,
  onOpenNotifications,
  onLogout,
}: TopBarProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);

  const isOwner = user !== null && user.email.toLowerCase() === OWNER_EMAIL;

  const handleNav = (view: AppView) => {
    onNavigate(view);
    setMobileMenuOpen(false);
  };

  const handlePanelClick = (panel: 'admin' | 'moderator') => {
    setMobileMenuOpen(false);
    setAccountMenuOpen(false);
    onOpenAdminGate(panel);
  };

  const adminButtonLabel = adminActor?.isReshid ? 'Rəşid · Admin' : 'Admin Panel';
  const modButtonLabel = modActor?.isReshid ? 'Rəşid · Moderator' : 'Moderator Panel';

  return (
    <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-md border-b border-[#E2E8F0]">
      <div className="max-w-[1360px] mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4 lg:gap-8">
        {/* Zone 1: Single-line Brand Wordmark */}
        <button
          type="button"
          onClick={() => handleNav('marketplace')}
          className="inline-flex items-center gap-2.5 text-xl font-extrabold tracking-tight text-[#0F172A] whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#2563EB]"
        >
          <span className="w-8 h-8 rounded-lg bg-[#0F172A] text-white flex items-center justify-center shrink-0">
            <Smartphone className="w-4 h-4" />
          </span>
          <span className="font-display">TelefonBazar</span>
        </button>

        {/* Zone 2: Clean Single-Line Nav Links */}
        <nav className="hidden md:flex items-center gap-4 lg:gap-5 text-sm font-medium text-[#475569]">
          <button
            type="button"
            onClick={() => handleNav('marketplace')}
            className={`whitespace-nowrap shrink-0 py-1 transition-colors cursor-pointer border-b-2 ${
              activeView === 'marketplace'
                ? 'text-[#0F172A] border-[#2563EB] font-semibold'
                : 'border-transparent hover:text-[#0F172A]'
            }`}
          >
            Elanlar
          </button>
          <button
            type="button"
            onClick={() => (user ? handleNav('favorites') : onOpenAuth())}
            className={`whitespace-nowrap shrink-0 py-1 transition-colors cursor-pointer border-b-2 ${
              activeView === 'favorites'
                ? 'text-[#0F172A] border-[#2563EB] font-semibold'
                : 'border-transparent hover:text-[#0F172A]'
            }`}
          >
            Seçilmişlər
          </button>
          <button
            type="button"
            onClick={() => (user ? handleNav('my_listings') : onOpenAuth())}
            className={`whitespace-nowrap shrink-0 py-1 transition-colors cursor-pointer border-b-2 ${
              activeView === 'my_listings'
                ? 'text-[#0F172A] border-[#2563EB] font-semibold'
                : 'border-transparent hover:text-[#0F172A]'
            }`}
          >
            Mənim Elanlarım
          </button>
          <button
            type="button"
            onClick={() => handlePanelClick('admin')}
            className={`whitespace-nowrap shrink-0 px-3 py-1.5 rounded-lg text-sm font-semibold transition-all cursor-pointer inline-flex items-center gap-1.5 border ${
              activeView === 'admin'
                ? 'bg-[#0F172A] text-white border-[#0F172A] shadow-xs'
                : adminUnlocked
                ? 'bg-[#EFF6FF] text-[#1D4ED8] border-[#BFDBFE] hover:bg-[#0F172A] hover:text-white hover:border-[#0F172A]'
                : 'bg-[#F8FAFC] text-[#0F172A] border-[#CBD5E1] hover:bg-[#0F172A] hover:text-white hover:border-[#0F172A]'
            }`}
          >
            <Shield className="w-3.5 h-3.5 shrink-0" />
            {adminButtonLabel}
          </button>
          <button
            type="button"
            onClick={() => handlePanelClick('moderator')}
            className={`whitespace-nowrap shrink-0 px-3 py-1.5 rounded-lg text-sm font-semibold transition-all cursor-pointer inline-flex items-center gap-1.5 border ${
              activeView === 'moderator'
                ? 'bg-[#DC2626] text-white border-[#DC2626] shadow-xs'
                : modUnlocked
                ? 'bg-[#FEE2E2] text-[#B91C1C] border-[#FCA5A5] hover:bg-[#DC2626] hover:text-white hover:border-[#DC2626]'
                : 'bg-[#FEF2F2] text-[#991B1B] border-[#FECACA] hover:bg-[#DC2626] hover:text-white hover:border-[#DC2626]'
            }`}
          >
            <Flame className="w-3.5 h-3.5 shrink-0" />
            {modButtonLabel}
          </button>
        </nav>

        {/* Zone 3: Primary Action + Account */}
        <div className="flex items-center gap-3 shrink-0">
          {user ? (
            <div className="relative hidden sm:block">
              <button
                type="button"
                onClick={() => setAccountMenuOpen((v) => !v)}
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-[#E2E8F0] hover:bg-[#F8FAFC] transition-colors text-sm text-[#0F172A] whitespace-nowrap shrink-0 cursor-pointer"
              >
                <span
                  className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-semibold text-white shrink-0"
                  style={{ backgroundColor: user.avatarColor || '#2563EB' }}
                >
                  {user.name.slice(0, 1).toUpperCase()}
                </span>
                <span className="max-w-[120px] truncate font-medium">{user.name}</span>
                {unreadNotificationsCount > 0 && (
                  <span className="text-[11px] font-semibold text-[#DC2626] tabular-nums">
                    ({unreadNotificationsCount})
                  </span>
                )}
              </button>

              {accountMenuOpen && (
                <div
                  className="absolute right-0 mt-2 w-64 bg-white border border-[#E2E8F0] rounded-xl shadow-lg py-2 z-50"
                  onMouseLeave={() => setAccountMenuOpen(false)}
                >
                  <div className="px-4 py-2.5 border-b border-[#F1F5F9]">
                    <p className="text-sm font-semibold text-[#0F172A] truncate">{user.name}</p>
                    <p className="text-xs text-[#64748B] truncate">{user.email}</p>
                    <p className="text-[11px] font-medium text-[#2563EB] mt-1">
                      {isOwner || user.role === 'super_admin'
                        ? 'Baş Admin (Super Admin)'
                        : user.role === 'admin'
                        ? 'Admin'
                        : user.role === 'moderator'
                        ? 'Moderator'
                        : adminUnlocked || modUnlocked
                        ? 'İcazəli Operator'
                        : 'İstifadəçi'}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setAccountMenuOpen(false);
                      handleNav('my_listings');
                    }}
                    className="w-full text-left px-4 py-2 text-sm text-[#334155] hover:bg-[#F8FAFC] flex items-center gap-2 cursor-pointer"
                  >
                    <UserIcon className="w-4 h-4 text-[#64748B]" />
                    Mənim Elanlarım
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setAccountMenuOpen(false);
                      onOpenNotifications();
                    }}
                    className="w-full text-left px-4 py-2 text-sm text-[#334155] hover:bg-[#F8FAFC] flex items-center justify-between gap-2 cursor-pointer"
                  >
                    <span className="inline-flex items-center gap-2">
                      <Bell className="w-4 h-4 text-[#64748B]" />
                      Bildirişlər
                    </span>
                    {unreadNotificationsCount > 0 && (
                      <span className="text-xs font-bold text-[#DC2626] tabular-nums">
                        {unreadNotificationsCount}
                      </span>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => handlePanelClick('admin')}
                    className="w-full text-left px-4 py-2 text-sm text-[#0F172A] font-medium hover:bg-[#F8FAFC] flex items-center justify-between gap-2 cursor-pointer"
                  >
                    <span className="inline-flex items-center gap-2">
                      <Shield className="w-4 h-4 text-[#2563EB]" />
                      {adminButtonLabel}
                    </span>
                    {adminUnlocked && (
                      <span className="text-[11px] font-semibold text-[#2563EB]">Açıq</span>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => handlePanelClick('moderator')}
                    className="w-full text-left px-4 py-2 text-sm text-[#991B1B] font-medium hover:bg-[#FEF2F2] flex items-center justify-between gap-2 cursor-pointer"
                  >
                    <span className="inline-flex items-center gap-2">
                      <Flame className="w-4 h-4 text-[#DC2626]" />
                      {modButtonLabel}
                    </span>
                    {modUnlocked && (
                      <span className="text-[11px] font-semibold text-[#DC2626]">Açıq</span>
                    )}
                  </button>
                  <div className="border-t border-[#F1F5F9] mt-1 pt-1">
                    <button
                      type="button"
                      onClick={() => {
                        setAccountMenuOpen(false);
                        onLogout();
                      }}
                      className="w-full text-left px-4 py-2 text-sm text-[#DC2626] hover:bg-[#FEF2F2] flex items-center gap-2 cursor-pointer"
                    >
                      <LogOut className="w-4 h-4" />
                      Çıxış et
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <button
              type="button"
              onClick={onOpenAuth}
              className="hidden sm:inline-flex items-center px-3.5 py-2 text-sm font-medium text-[#0F172A] hover:bg-[#F1F5F9] rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              Gmail ilə Giriş
            </button>
          )}

          <button
            type="button"
            onClick={() => (user ? onOpenPostListing() : onOpenAuth())}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-semibold text-white bg-[#2563EB] hover:bg-[#1D4ED8] rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer shadow-xs"
          >
            <Plus className="w-4 h-4" />
            Elan Yerləşdir
          </button>

          <button
            type="button"
            aria-label="Menyu"
            onClick={() => setMobileMenuOpen((v) => !v)}
            className="md:hidden p-2 rounded-lg text-[#334155] hover:bg-[#F1F5F9] cursor-pointer"
          >
            {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {/* Mobile Nav Drawer */}
      {mobileMenuOpen && (
        <div className="md:hidden border-t border-[#E2E8F0] bg-white px-4 py-3 space-y-1">
          <button
            type="button"
            onClick={() => handleNav('marketplace')}
            className="w-full text-left px-3 py-2.5 rounded-lg text-sm font-medium text-[#0F172A] hover:bg-[#F8FAFC]"
          >
            Elanlar
          </button>
          <button
            type="button"
            onClick={() => (user ? handleNav('favorites') : onOpenAuth())}
            className="w-full text-left px-3 py-2.5 rounded-lg text-sm font-medium text-[#0F172A] hover:bg-[#F8FAFC]"
          >
            Seçilmişlər
          </button>
          <button
            type="button"
            onClick={() => (user ? handleNav('my_listings') : onOpenAuth())}
            className="w-full text-left px-3 py-2.5 rounded-lg text-sm font-medium text-[#0F172A] hover:bg-[#F8FAFC]"
          >
            Mənim Elanlarım
          </button>
          <button
            type="button"
            onClick={() => handlePanelClick('admin')}
            className="w-full text-left px-3 py-2.5 rounded-lg text-sm font-semibold text-[#0F172A] bg-[#F1F5F9] hover:bg-[#E2E8F0] flex items-center justify-between gap-2"
          >
            <span className="inline-flex items-center gap-2">
              <Shield className="w-4 h-4 text-[#2563EB]" />
              {adminButtonLabel}
            </span>
            {adminUnlocked && <span className="text-[11px] text-[#2563EB]">Açıq</span>}
          </button>
          <button
            type="button"
            onClick={() => handlePanelClick('moderator')}
            className="w-full text-left px-3 py-2.5 rounded-lg text-sm font-semibold text-[#991B1B] bg-[#FEF2F2] hover:bg-[#FEE2E2] flex items-center justify-between gap-2"
          >
            <span className="inline-flex items-center gap-2">
              <Flame className="w-4 h-4 text-[#DC2626]" />
              {modButtonLabel}
            </span>
            {modUnlocked && <span className="text-[11px] text-[#DC2626]">Açıq</span>}
          </button>
          {user && (
            <button
              type="button"
              onClick={() => {
                setMobileMenuOpen(false);
                onOpenNotifications();
              }}
              className="w-full text-left px-3 py-2.5 rounded-lg text-sm font-medium text-[#0F172A] hover:bg-[#F8FAFC] flex items-center justify-between"
            >
              <span>Bildirişlər</span>
              {unreadNotificationsCount > 0 && (
                <span className="text-xs font-bold text-[#DC2626] tabular-nums">
                  {unreadNotificationsCount}
                </span>
              )}
            </button>
          )}
          <div className="pt-2 border-t border-[#F1F5F9]">
            {user ? (
              <div className="flex items-center justify-between px-3 py-2">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-[#0F172A] truncate">{user.name}</p>
                  <p className="text-xs text-[#64748B] truncate">{user.email}</p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setMobileMenuOpen(false);
                    onLogout();
                  }}
                  className="text-xs font-medium text-[#DC2626] px-2.5 py-1.5 rounded-md hover:bg-[#FEF2F2]"
                >
                  Çıxış
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setMobileMenuOpen(false);
                  onOpenAuth();
                }}
                className="w-full text-left px-3 py-2.5 rounded-lg text-sm font-semibold text-[#2563EB] hover:bg-[#EFF6FF]"
              >
                Gmail ilə Giriş / Qeydiyyat
              </button>
            )}
          </div>
        </div>
      )}
    </header>
  );
}
