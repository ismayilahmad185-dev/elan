import {
  AlertCircle,
  Bell,
  CheckCircle2,
  Flame,
  Search,
  Shield,
  ShieldAlert,
  SlidersHorizontal,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { AdminAccessModal } from './components/AdminAccessModal.tsx';
import { AdminPanelView } from './components/AdminPanelView.tsx';
import { AuthModal } from './components/AuthModal.tsx';
import { ListingCard } from './components/ListingCard.tsx';
import { ListingDetailModal } from './components/ListingDetailModal.tsx';
import { ListingFormModal } from './components/ListingFormModal.tsx';
import { ModeratorAccessModal } from './components/ModeratorAccessModal.tsx';
import { ModeratorPanelView } from './components/ModeratorPanelView.tsx';
import { MyListingsView } from './components/MyListingsView.tsx';
import { TopBar, type AppView } from './components/TopBar.tsx';
import {
  apiFetch,
  ApiError,
  formatRelativeAz,
  registerModerationHandler,
  setAdminToken,
  setAuthToken,
  setModToken,
} from './lib/api.ts';
import type {
  CatalogConfig,
  PanelActorInfo,
  PhoneListing,
  PublicUser,
  UserNotification,
} from './types.ts';

const OWNER_EMAIL = 'ismayilahmad185@gmail.com';

interface PublicSettings {
  maintenanceMode: boolean;
  announcementBanner: string;
  allowNewRegistrations: boolean;
}

interface ClientNotification extends UserNotification {
  isRead: boolean;
}

const DEFAULT_BRANDS = ['Apple', 'Samsung', 'Xiaomi', 'Google', 'OnePlus', 'Honor', 'Nothing', 'Digər'];
const DEFAULT_CITIES = ['Bakı', 'Sumqayıt', 'Gəncə', 'Mingəçevir', 'Lənkəran', 'Şəki', 'Naxçıvan', 'Digər'];

export default function App() {
  const [user, setUser] = useState<PublicUser | null>(null);
  const [favorites, setFavorites] = useState<string[]>([]);
  const [notifications, setNotifications] = useState<ClientNotification[]>([]);
  const [catalog, setCatalog] = useState<CatalogConfig>({
    brands: DEFAULT_BRANDS,
    cities: DEFAULT_CITIES,
  });
  const [settingsPublic, setSettingsPublic] = useState<PublicSettings>({
    maintenanceMode: false,
    announcementBanner: '',
    allowNewRegistrations: true,
  });
  const [bannerDismissed, setBannerDismissed] = useState(false);

  const [activeView, setActiveView] = useState<AppView>('marketplace');
  const [adminRefreshKey, setAdminRefreshKey] = useState(0);
  const [listings, setListings] = useState<PhoneListing[]>([]);
  const [myListings, setMyListings] = useState<PhoneListing[]>([]);
  const [favoriteListings, setFavoriteListings] = useState<PhoneListing[]>([]);
  const [loadingListings, setLoadingListings] = useState(true);

  // Filters
  const [search, setSearch] = useState('');
  const [brand, setBrand] = useState('Hamısı');
  const [city, setCity] = useState('Hamısı');
  const [condition, setCondition] = useState('Hamısı');
  const [minPrice, setMinPrice] = useState('');
  const [maxPrice, setMaxPrice] = useState('');
  const [barterOnly, setBarterOnly] = useState(false);
  const [creditOnly, setCreditOnly] = useState(false);
  const [sort, setSort] = useState('featured');
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);

  // Modals & Panel Gates
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [adminGateOpen, setAdminGateOpen] = useState(false);
  const [adminUnlocked, setAdminUnlocked] = useState(false);
  const [adminActor, setAdminActor] = useState<PanelActorInfo | null>(null);
  const [modGateOpen, setModGateOpen] = useState(false);
  const [modUnlocked, setModUnlocked] = useState(false);
  const [modActor, setModActor] = useState<PanelActorInfo | null>(null);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [selectedListing, setSelectedListing] = useState<PhoneListing | null>(null);
  const [formModalOpen, setFormModalOpen] = useState(false);
  const [editingListing, setEditingListing] = useState<PhoneListing | null>(null);

  // Notifications & Kick/Ban Alert
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);
  const [moderationNotice, setModerationNotice] = useState<{
    code: 'USER_KICKED' | 'USER_BANNED';
    message: string;
    until?: string | null;
  } | null>(null);

  const notify = useCallback((msg: string, type: 'success' | 'error' = 'success') => {
    setToast({ msg, type });
    setTimeout(() => {
      setToast((prev) => (prev?.msg === msg ? null : prev));
    }, 4500);
  }, []);

  const loadCatalog = useCallback(async () => {
    try {
      const res = await apiFetch<{ catalog: CatalogConfig }>('/api/catalog');
      if (res.catalog) {
        setCatalog(res.catalog);
      }
    } catch {
      // keep fallback
    }
  }, []);

  const loadNotifications = useCallback(async () => {
    try {
      const res = await apiFetch<{ notifications: ClientNotification[] }>('/api/notifications');
      setNotifications(res.notifications || []);
    } catch {
      setNotifications([]);
    }
  }, []);

  const loadAdminStatus = useCallback(async (): Promise<boolean> => {
    try {
      const res = await apiFetch<{ unlocked: boolean; actor: PanelActorInfo | null }>(
        '/api/admin/auth/status'
      );
      const unlocked = Boolean(res.unlocked);
      setAdminUnlocked(unlocked);
      setAdminActor(res.actor || null);
      return unlocked;
    } catch {
      setAdminUnlocked(false);
      setAdminActor(null);
      return false;
    }
  }, []);

  const loadModeratorStatus = useCallback(async (): Promise<boolean> => {
    try {
      const res = await apiFetch<{ unlocked: boolean; actor: PanelActorInfo | null }>(
        '/api/moderator/auth/status'
      );
      const unlocked = Boolean(res.unlocked);
      setModUnlocked(unlocked);
      setModActor(res.actor || null);
      return unlocked;
    } catch {
      setModUnlocked(false);
      setModActor(null);
      return false;
    }
  }, []);

  const loadSession = useCallback(async () => {
    try {
      const res = await apiFetch<{
        user: PublicUser | null;
        favorites: string[];
        settingsPublic: PublicSettings;
      }>('/api/auth/me');
      setUser(res.user);
      setFavorites(res.favorites || []);
      if (res.settingsPublic) {
        setSettingsPublic(res.settingsPublic);
      }
      if (res.user) {
        await loadNotifications();
      } else {
        setNotifications([]);
      }
    } catch {
      setUser(null);
      setNotifications([]);
    }
  }, [loadNotifications]);

  useEffect(() => {
    registerModerationHandler((info) => {
      setUser(null);
      setNotifications([]);
      setAdminUnlocked(false);
      setAdminActor(null);
      setModUnlocked(false);
      setModActor(null);
      setActiveView('marketplace');
      setModerationNotice(info);
    });
  }, []);

  const loadMarketplace = useCallback(async () => {
    setLoadingListings(true);
    try {
      const params = new URLSearchParams();
      params.set('scope', 'public');
      if (search.trim()) params.set('search', search.trim());
      if (brand !== 'Hamısı') params.set('brand', brand);
      if (city !== 'Hamısı') params.set('city', city);
      if (condition !== 'Hamısı') params.set('condition', condition);
      if (minPrice) params.set('minPrice', minPrice);
      if (maxPrice) params.set('maxPrice', maxPrice);
      if (barterOnly) params.set('barter', 'true');
      if (creditOnly) params.set('credit', 'true');
      params.set('sort', sort);

      const res = await apiFetch<{ listings: PhoneListing[]; settingsPublic?: PublicSettings }>(
        `/api/listings?${params.toString()}`
      );
      setListings(res.listings);
      if (res.settingsPublic) {
        setSettingsPublic(res.settingsPublic);
      }
    } catch {
      notify('Elanlar yüklənərkən xəta baş verdi.', 'error');
    } finally {
      setLoadingListings(false);
    }
  }, [search, brand, city, condition, minPrice, maxPrice, barterOnly, creditOnly, sort, notify]);

  const loadMyListings = useCallback(async () => {
    if (!user) return;
    try {
      const res = await apiFetch<{ listings: PhoneListing[] }>('/api/listings?scope=mine');
      setMyListings(res.listings);
    } catch {
      // handled globally if kicked/banned
    }
  }, [user]);

  const loadFavoriteListings = useCallback(async () => {
    if (!user) return;
    try {
      const res = await apiFetch<{ listings: PhoneListing[] }>('/api/listings?scope=favorites');
      setFavoriteListings(res.listings);
    } catch {
      // ignore
    }
  }, [user]);

  useEffect(() => {
    loadSession();
    loadAdminStatus();
    loadModeratorStatus();
    loadCatalog();
  }, [loadSession, loadAdminStatus, loadModeratorStatus, loadCatalog]);

  useEffect(() => {
    const timer = setTimeout(() => {
      loadMarketplace();
    }, 150);
    return () => clearTimeout(timer);
  }, [loadMarketplace]);

  useEffect(() => {
    if (user && activeView === 'my_listings') {
      loadMyListings();
    } else if (user && activeView === 'favorites') {
      loadFavoriteListings();
    }
  }, [user, activeView, loadMyListings, loadFavoriteListings]);

  const handleLogout = async () => {
    try {
      await apiFetch('/api/auth/logout', { method: 'POST' });
    } catch {
      // ignore
    }
    setAuthToken(null);
    setUser(null);
    setFavorites([]);
    setNotifications([]);

    const [stillAdminUnlocked, stillModUnlocked] = await Promise.all([
      loadAdminStatus(),
      loadModeratorStatus(),
    ]);

    if (
      activeView === 'my_listings' ||
      activeView === 'favorites' ||
      (activeView === 'admin' && !stillAdminUnlocked) ||
      (activeView === 'moderator' && !stillModUnlocked)
    ) {
      setActiveView('marketplace');
    }
    notify('Hesabdan çıxış edildi.', 'success');
  };

  const handleLockAdminPanel = async () => {
    try {
      await apiFetch('/api/admin/auth/lock', { method: 'POST' });
    } catch {
      // ignore
    }
    setAdminToken(null);
    setAdminUnlocked(false);
    setAdminActor(null);
    if (activeView === 'admin') {
      setActiveView('marketplace');
    }
    notify('Admin Panel kilidləndi.', 'success');
  };

  const handleLockModeratorPanel = async () => {
    try {
      await apiFetch('/api/moderator/auth/lock', { method: 'POST' });
    } catch {
      // ignore
    }
    setModToken(null);
    setModUnlocked(false);
    setModActor(null);
    if (activeView === 'moderator') {
      setActiveView('marketplace');
    }
    notify('Moderator Panel kilidləndi.', 'success');
  };

  const handleOpenNotifications = async () => {
    setNotificationsOpen(true);
    try {
      await apiFetch('/api/notifications/read', { method: 'POST' });
      setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
    } catch {
      // ignore
    }
  };

  const handleToggleFavorite = async (listingId: string) => {
    if (!user) {
      setAuthModalOpen(true);
      return;
    }
    try {
      const res = await apiFetch<{ favorites: string[]; favoritesCount: number }>(
        `/api/listings/${listingId}/favorite`,
        { method: 'POST' }
      );
      setFavorites(res.favorites);
      setListings((prev) =>
        prev.map((l) => (l.id === listingId ? { ...l, favoritesCount: res.favoritesCount } : l))
      );
      if (selectedListing?.id === listingId) {
        setSelectedListing((prev) => (prev ? { ...prev, favoritesCount: res.favoritesCount } : null));
      }
      if (activeView === 'favorites') {
        loadFavoriteListings();
      }
    } catch (err) {
      notify(err instanceof ApiError ? err.message : 'Əməliyyat alınmadı.', 'error');
    }
  };

  const handleSelectListing = (listing: PhoneListing) => {
    setSelectedListing(listing);
    apiFetch(`/api/listings/${listing.id}/view`, { method: 'POST' }).catch(() => {});
  };

  const handleOpenPostListing = () => {
    if (!user) {
      setAuthModalOpen(true);
      return;
    }
    setEditingListing(null);
    setFormModalOpen(true);
  };

  const handleListingSaved = async (saved: PhoneListing, flagged?: boolean) => {
    await Promise.all([loadMarketplace(), loadMyListings()]);
    setAdminRefreshKey((k) => k + 1);
    if (editingListing) {
      notify('Elan məlumatları yeniləndi.', 'success');
    } else if (saved.status === 'pending') {
      notify(
        flagged
          ? 'Elan qadağan olunmuş söz filtri səbəbindən admin təsdiqinə göndərildi.'
          : 'Elanınız yaradıldı və admin təsdiqi gözləyir.',
        'success'
      );
    } else {
      notify('Elanınız uğurla dərc olundu!', 'success');
    }
  };

  const isOwner = user !== null && user.email.toLowerCase() === OWNER_EMAIL;
  const isAdmin =
    isOwner ||
    (user !== null &&
      (user.role === 'super_admin' || user.role === 'admin' || user.role === 'moderator'));

  const openProtectedPanel = (panel: 'admin' | 'moderator') => {
    if (panel === 'moderator') {
      if (modUnlocked) {
        setActiveView('moderator');
      } else {
        setModGateOpen(true);
      }
      return;
    }
    if (adminUnlocked) {
      setActiveView('admin');
    } else {
      setAdminGateOpen(true);
    }
  };

  const unreadCount = notifications.filter((n) => !n.isRead).length;
  const brandFilters = ['Hamısı', ...catalog.brands];
  const cityFilters = ['Hamısı', ...catalog.cities];

  return (
    <div className="min-h-screen flex flex-col bg-[#F7F8FA]">
      {/* Slim Dismissible Announcement Banner */}
      {settingsPublic.announcementBanner && !bannerDismissed && (
        <div className="bg-[#0F172A] text-white text-xs px-4 py-2 flex items-center justify-center gap-3">
          <p className="text-center truncate">{settingsPublic.announcementBanner}</p>
          <button
            type="button"
            aria-label="Bildirişi bağla"
            onClick={() => setBannerDismissed(true)}
            className="text-white/70 hover:text-white cursor-pointer shrink-0"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      <TopBar
        user={user}
        activeView={activeView}
        unreadNotificationsCount={unreadCount}
        adminUnlocked={adminUnlocked}
        modUnlocked={modUnlocked}
        adminActor={adminActor}
        modActor={modActor}
        onNavigate={(view) => {
          if (view === 'admin' || view === 'moderator') {
            openProtectedPanel(view);
            return;
          }
          setActiveView(view);
        }}
        onOpenAdminGate={(panel) => openProtectedPanel(panel)}
        onOpenPostListing={handleOpenPostListing}
        onOpenAuth={() => setAuthModalOpen(true)}
        onOpenNotifications={handleOpenNotifications}
        onLogout={handleLogout}
      />

      {/* Maintenance Notice */}
      {settingsPublic.maintenanceMode && (
        <div className="bg-[#FFFBEB] border-b border-[#FDE68A] px-4 py-2.5 text-center text-xs font-medium text-[#92400E]">
          Platformada texniki baxış aparılır — yeni elan yerləşdirmə müvəqqəti olaraq yalnız adminlər üçün açıqdır.
        </div>
      )}

      {/* User Posting Freeze / Warning Banner */}
      {user && !user.canPostListings && !isAdmin && (
        <div className="bg-[#FEF2F2] border-b border-[#FECACA] px-4 py-2.5 text-center text-xs font-medium text-[#991B1B]">
          Elan yerləşdirmə hüququnuz admin tərəfindən müvəqqəti məhdudlaşdırılıb.
          {user.lastWarning ? ` Son xəbərdarlıq: ${user.lastWarning}` : ''}
        </div>
      )}

      {/* ==================== VIEW: MARKETPLACE ==================== */}
      {activeView === 'marketplace' && (
        <main className="flex-1">
          {/* Split-Screen Editorial Hero */}
          <section className="bg-gradient-to-b from-white via-[#F8FAFC] to-[#F1F5F9] border-b border-[#E2E8F0]">
            <div className="max-w-[1360px] mx-auto px-4 sm:px-6 lg:px-8 py-9 lg:py-14 grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-10 items-stretch">
              <div className="lg:col-span-6 flex flex-col justify-center space-y-5">
                <p className="text-xs font-bold uppercase tracking-wider text-[#2563EB]">
                  Azərbaycanın Etibarlı Telefon Bazarı
                </p>
                <h1 className="font-display text-3xl sm:text-4xl lg:text-[44px] font-extrabold text-[#0F172A] leading-[1.12] tracking-tight text-balance">
                  Yoxlanılmış smartfon elanları, təhlükəsiz alqı-satqı.
                </h1>
                <p className="text-base text-[#475569] leading-relaxed max-w-xl">
                  Apple, Samsung, Xiaomi və Google flaqmanlarını IMEI və batareya göstəriciləri ilə şəffaf şəkildə müqayisə edin, Gmail hesabınızla saniyələr içində öz elanınızı yerləşdirin.
                </p>

                <div className="flex flex-wrap items-center gap-3 pt-1">
                  <button
                    type="button"
                    onClick={handleOpenPostListing}
                    className="px-5 py-2.5 bg-[#2563EB] hover:bg-[#1D4ED8] text-white text-sm font-semibold rounded-xl transition-colors cursor-pointer shadow-xs"
                  >
                    Elan Yerləşdir
                  </button>
                  <button
                    type="button"
                    onClick={() => openProtectedPanel('admin')}
                    className="inline-flex items-center gap-1.5 px-4 py-2.5 bg-[#0F172A] hover:bg-[#1E293B] text-white text-sm font-semibold rounded-xl transition-colors cursor-pointer shadow-xs"
                  >
                    <Shield className="w-4 h-4" />
                    {adminActor?.isReshid ? 'Rəşid · Admin Panel' : 'Admin Panel'}
                  </button>
                  <button
                    type="button"
                    onClick={() => openProtectedPanel('moderator')}
                    className="inline-flex items-center gap-1.5 px-4 py-2.5 bg-[#DC2626] hover:bg-[#B91C1C] text-white text-sm font-semibold rounded-xl transition-colors cursor-pointer shadow-xs"
                  >
                    <Flame className="w-4 h-4" />
                    {modActor?.isReshid ? 'Rəşid · Moderator Panel' : 'Moderator Panel'}
                  </button>
                  <a
                    href="#catalog"
                    className="px-4 py-2.5 bg-white hover:bg-[#F8FAFC] border border-[#CBD5E1] text-[#0F172A] text-sm font-semibold rounded-xl transition-colors"
                  >
                    Elanlara Bax
                  </a>
                </div>

                {/* Authorized Operator Quick Banner */}
                {(adminUnlocked || modUnlocked) && (
                  <p className="text-xs text-[#475569]">
                    <span className="font-semibold text-[#0F172A]">
                      {adminActor?.isReshid || modActor?.isReshid
                        ? 'Rəşid iş masası aktivdir:'
                        : 'Panel icazəniz aktivdir:'}
                    </span>{' '}
                    {adminUnlocked && 'Admin Panel'}
                    {adminUnlocked && modUnlocked ? ' və ' : ''}
                    {modUnlocked && 'Moderator Panel'}
                    {' '}üçün yuxarıdakı düymədən birbaşa daxil ola bilərsiniz.
                  </p>
                )}
              </div>

              <div className="lg:col-span-6">
                <div className="h-full min-h-[250px] lg:min-h-[340px] rounded-2xl overflow-hidden border border-[#CBD5E1] bg-[#E2E8F0] shadow-md">
                  <img
                    src="/src/assets/images/hero_flagship_phones_1795345108042.jpg"
                    alt="Flaqman smartfonlar kolleksiyası"
                    referrerPolicy="no-referrer"
                    className="w-full h-full object-cover"
                  />
                </div>
              </div>
            </div>
          </section>

          {/* Catalog & Filter Workspace */}
          <section id="catalog" className="max-w-[1360px] mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
            <div className="bg-white rounded-2xl border border-[#E2E8F0] shadow-xs p-4 sm:p-5 space-y-4">
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                <div className="relative flex-1">
                  <Search className="w-4 h-4 text-[#94A3B8] absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Model, yaddaş və ya şəhər axtar (məs: iPhone 16 Pro, 256 GB, Bakı)..."
                    className="w-full pl-10 pr-4 py-2.5 text-sm rounded-xl border border-[#CBD5E1] focus:outline-none focus:border-[#2563EB] focus:ring-2 focus:ring-[#2563EB]/15"
                  />
                </div>

                <div className="flex items-center gap-2.5 shrink-0">
                  <select
                    value={sort}
                    onChange={(e) => setSort(e.target.value)}
                    className="px-3.5 py-2.5 text-sm rounded-xl border border-[#CBD5E1] bg-white text-[#0F172A] focus:outline-none focus:border-[#2563EB]"
                  >
                    <option value="featured">Seçilmişlər (VIP)</option>
                    <option value="newest">Ən yeni elanlar</option>
                    <option value="price_asc">Ucuzdan bahaya</option>
                    <option value="price_desc">Bahadan ucuza</option>
                  </select>

                  <button
                    type="button"
                    onClick={() => setShowAdvancedFilters((v) => !v)}
                    className={`inline-flex items-center gap-2 px-3.5 py-2.5 text-sm font-medium rounded-xl border transition-colors cursor-pointer ${
                      showAdvancedFilters
                        ? 'bg-[#EFF6FF] border-[#2563EB] text-[#1D4ED8]'
                        : 'bg-white border-[#CBD5E1] text-[#334155] hover:bg-[#F8FAFC]'
                    }`}
                  >
                    <SlidersHorizontal className="w-4 h-4" />
                    Ətraflı Filtr
                  </button>
                </div>
              </div>

              {/* Brand Filter Strip */}
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
                {brandFilters.map((b) => (
                  <button
                    key={b}
                    type="button"
                    onClick={() => setBrand(b)}
                    className={`px-3.5 py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                      brand === b
                        ? 'bg-[#0F172A] text-white'
                        : 'bg-[#F1F5F9] text-[#475569] hover:text-[#0F172A]'
                    }`}
                  >
                    {b}
                  </button>
                ))}
              </div>

              {showAdvancedFilters && (
                <div className="pt-4 border-t border-[#F1F5F9] grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 items-end">
                  <div>
                    <label className="block text-xs font-medium text-[#475569] mb-1">Şəhər</label>
                    <select
                      value={city}
                      onChange={(e) => setCity(e.target.value)}
                      className="w-full px-3 py-2 text-xs rounded-lg border border-[#CBD5E1] bg-white"
                    >
                      {cityFilters.map((c) => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-[#475569] mb-1">Vəziyyət</label>
                    <select
                      value={condition}
                      onChange={(e) => setCondition(e.target.value)}
                      className="w-full px-3 py-2 text-xs rounded-lg border border-[#CBD5E1] bg-white"
                    >
                      <option value="Hamısı">Hamısı</option>
                      <option value="Yeni (Qutuda)">Yeni (Qutuda)</option>
                      <option value="İdeal">İdeal</option>
                      <option value="Yaxşı">Yaxşı</option>
                      <option value="Orta">Orta</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-[#475569] mb-1">Min. Qiymət (AZN)</label>
                    <input
                      type="number"
                      min={0}
                      value={minPrice}
                      onChange={(e) => setMinPrice(e.target.value)}
                      placeholder="0"
                      className="w-full px-3 py-2 text-xs rounded-lg border border-[#CBD5E1] tabular-nums"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-[#475569] mb-1">Maks. Qiymət (AZN)</label>
                    <input
                      type="number"
                      min={0}
                      value={maxPrice}
                      onChange={(e) => setMaxPrice(e.target.value)}
                      placeholder="5000"
                      className="w-full px-3 py-2 text-xs rounded-lg border border-[#CBD5E1] tabular-nums"
                    />
                  </div>
                  <div className="flex items-center gap-4 py-2">
                    <label className="inline-flex items-center gap-1.5 text-xs text-[#334155] cursor-pointer">
                      <input
                        type="checkbox"
                        checked={barterOnly}
                        onChange={(e) => setBarterOnly(e.target.checked)}
                        className="rounded border-[#CBD5E1] text-[#2563EB]"
                      />
                      Barter
                    </label>
                    <label className="inline-flex items-center gap-1.5 text-xs text-[#334155] cursor-pointer">
                      <input
                        type="checkbox"
                        checked={creditOnly}
                        onChange={(e) => setCreditOnly(e.target.checked)}
                        className="rounded border-[#CBD5E1] text-[#2563EB]"
                      />
                      Kredit
                    </label>
                  </div>
                </div>
              )}
            </div>

            <div className="flex items-center justify-between">
              <h2 className="font-display text-lg font-bold text-[#0F172A]">
                Telefon Elanları{' '}
                <span className="text-sm font-normal text-[#64748B] tabular-nums">
                  ({listings.length})
                </span>
              </h2>
              {(search || brand !== 'Hamısı' || city !== 'Hamısı' || condition !== 'Hamısı' || minPrice || maxPrice || barterOnly || creditOnly) && (
                <button
                  type="button"
                  onClick={() => {
                    setSearch('');
                    setBrand('Hamısı');
                    setCity('Hamısı');
                    setCondition('Hamısı');
                    setMinPrice('');
                    setMaxPrice('');
                    setBarterOnly(false);
                    setCreditOnly(false);
                  }}
                  className="text-xs font-medium text-[#2563EB] hover:underline cursor-pointer"
                >
                  Filtrləri sıfırla
                </button>
              )}
            </div>

            {loadingListings ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                {[1, 2, 3, 4, 5, 6].map((n) => (
                  <div key={n} className="h-80 bg-white rounded-2xl border border-[#E2E8F0]" />
                ))}
              </div>
            ) : listings.length === 0 ? (
              <div className="bg-white rounded-2xl border border-[#E2E8F0] p-12 text-center space-y-2">
                <p className="text-base font-semibold text-[#0F172A]">
                  Seçilən meyarlara uyğun telefon elanı tapılmadı
                </p>
                <p className="text-sm text-[#64748B]">
                  Axtarış sözünü və ya filtrləri dəyişərək yenidən yoxlayın.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                {listings.map((item) => (
                  <ListingCard
                    key={item.id}
                    listing={item}
                    isFavorited={favorites.includes(item.id)}
                    onSelect={handleSelectListing}
                    onToggleFavorite={handleToggleFavorite}
                  />
                ))}
              </div>
            )}
          </section>
        </main>
      )}

      {/* ==================== VIEW: FAVORITES ==================== */}
      {activeView === 'favorites' && (
        <main className="flex-1 max-w-[1360px] w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
          <div>
            <h1 className="font-display text-2xl font-bold text-[#0F172A]">Seçilmiş Elanlar</h1>
            <p className="text-sm text-[#64748B] mt-1">
              Bəyəndiyiniz və izlədiyiniz telefon elanları burada toplanır.
            </p>
          </div>

          {favoriteListings.length === 0 ? (
            <div className="bg-white rounded-2xl border border-[#E2E8F0] p-12 text-center">
              <p className="text-base font-semibold text-[#0F172A]">Seçilmiş elanınız yoxdur</p>
              <p className="text-sm text-[#64748B] mt-1">
                Elanların üzərindəki ürək işarəsinə klikləyərək onları buraya əlavə edə bilərsiniz.
              </p>
              <button
                type="button"
                onClick={() => setActiveView('marketplace')}
                className="mt-4 px-4 py-2 text-sm font-semibold text-white bg-[#2563EB] hover:bg-[#1D4ED8] rounded-lg cursor-pointer"
              >
                Elanlara Bax
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {favoriteListings.map((item) => (
                <ListingCard
                  key={item.id}
                  listing={item}
                  isFavorited={favorites.includes(item.id)}
                  onSelect={handleSelectListing}
                  onToggleFavorite={handleToggleFavorite}
                />
              ))}
            </div>
          )}
        </main>
      )}

      {/* ==================== VIEW: MY LISTINGS ==================== */}
      {activeView === 'my_listings' && user && (
        <main className="flex-1">
          <MyListingsView
            listings={myListings}
            loading={false}
            onRefresh={async () => {
              await Promise.all([loadMyListings(), loadMarketplace()]);
            }}
            onCreateNew={handleOpenPostListing}
            onEdit={(listing) => {
              setEditingListing(listing);
              setFormModalOpen(true);
            }}
            onViewDetail={handleSelectListing}
            onNotify={notify}
          />
        </main>
      )}

      {/* ==================== VIEW: ADMIN PANEL ==================== */}
      {activeView === 'admin' && adminUnlocked && (
        <main className="flex-1">
          <AdminPanelView
            currentUser={user}
            adminActor={adminActor}
            refreshTrigger={adminRefreshKey}
            onEditListing={(listing) => {
              setEditingListing(listing);
              setFormModalOpen(true);
            }}
            onCreateListing={() => {
              setEditingListing(null);
              setFormModalOpen(true);
            }}
            onViewListing={handleSelectListing}
            onOpenModeratorPanel={() => openProtectedPanel('moderator')}
            onBackToMarket={() => setActiveView('marketplace')}
            onLockAdmin={handleLockAdminPanel}
            onMarketplaceChanged={async () => {
              await Promise.all([
                loadMarketplace(),
                loadMyListings(),
                loadCatalog(),
                loadAdminStatus(),
                loadModeratorStatus(),
              ]);
            }}
            onNotify={notify}
          />
        </main>
      )}

      {/* ==================== VIEW: DANGEROUS MODERATOR PANEL ==================== */}
      {activeView === 'moderator' && modUnlocked && (
        <main className="flex-1">
          <ModeratorPanelView
            currentUser={user}
            modActor={modActor}
            refreshTrigger={adminRefreshKey}
            onViewListing={handleSelectListing}
            onOpenAdminPanel={() => openProtectedPanel('admin')}
            onBackToMarket={() => setActiveView('marketplace')}
            onLockModerator={handleLockModeratorPanel}
            onMarketplaceChanged={async () => {
              await Promise.all([
                loadMarketplace(),
                loadMyListings(),
                loadCatalog(),
                loadAdminStatus(),
                loadModeratorStatus(),
              ]);
            }}
            onNotify={notify}
          />
        </main>
      )}

      {/* Quiet Editorial Footer */}
      {activeView !== 'admin' && activeView !== 'moderator' && (
        <footer className="bg-white border-t border-[#E2E8F0] mt-12">
          <div className="max-w-[1360px] mx-auto px-4 sm:px-6 lg:px-8 py-6 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-[#64748B]">
            <p>© {new Date().getFullYear()} TelefonBazar. Bütün hüquqlar qorunur.</p>
            <div className="flex items-center gap-6">
              <button
                type="button"
                onClick={() => setActiveView('marketplace')}
                className="hover:text-[#0F172A] cursor-pointer"
              >
                Elanlar
              </button>
              <button
                type="button"
                onClick={handleOpenPostListing}
                className="hover:text-[#0F172A] cursor-pointer"
              >
                Elan Yerləşdir
              </button>
              <button
                type="button"
                onClick={() => openProtectedPanel('admin')}
                className="hover:text-[#0F172A] font-medium cursor-pointer"
              >
                Admin Panel
              </button>
              <button
                type="button"
                onClick={() => openProtectedPanel('moderator')}
                className="hover:text-[#DC2626] font-medium cursor-pointer"
              >
                Moderator Panel
              </button>
            </div>
          </div>
        </footer>
      )}

      {/* Modals */}
      <AuthModal
        isOpen={authModalOpen}
        onClose={() => setAuthModalOpen(false)}
        onSuccess={async (loggedInUser) => {
          setUser(loggedInUser);
          setModerationNotice(null);
          await Promise.all([loadSession(), loadAdminStatus(), loadModeratorStatus()]);
          notify(`Xoş gəldiniz, ${loggedInUser.name}!`, 'success');
        }}
      />

      <AdminAccessModal
        isOpen={adminGateOpen}
        onClose={() => setAdminGateOpen(false)}
        onOpenGmailAuth={() => setAuthModalOpen(true)}
        onUnlocked={async ({ actor, hasPairedMod }) => {
          setAdminUnlocked(true);
          setAdminActor(actor || null);
          if (hasPairedMod) {
            await loadModeratorStatus();
          }
          setActiveView('admin');
          notify(
            actor?.isReshid
              ? 'Xoş gəldiniz, Rəşid! Admin Panel açıldı.'
              : 'Admin Panel açıldı.',
            'success'
          );
        }}
      />

      <ModeratorAccessModal
        isOpen={modGateOpen}
        onClose={() => setModGateOpen(false)}
        onOpenGmailAuth={() => setAuthModalOpen(true)}
        onUnlocked={async ({ actor, hasPairedAdmin }) => {
          setModUnlocked(true);
          setModActor(actor || null);
          if (hasPairedAdmin) {
            await loadAdminStatus();
          }
          setActiveView('moderator');
          notify(
            actor?.isReshid
              ? 'Xoş gəldiniz, Rəşid! Moderator Panel açıldı.'
              : 'Moderator Panel açıldı.',
            'success'
          );
        }}
      />

      <ListingDetailModal
        listing={selectedListing}
        user={user}
        isFavorited={selectedListing ? favorites.includes(selectedListing.id) : false}
        onClose={() => setSelectedListing(null)}
        onToggleFavorite={handleToggleFavorite}
        onRequireAuth={() => setAuthModalOpen(true)}
        onNotify={notify}
      />

      <ListingFormModal
        isOpen={formModalOpen}
        editingListing={editingListing}
        brands={catalog.brands}
        cities={catalog.cities}
        onClose={() => {
          setFormModalOpen(false);
          setEditingListing(null);
        }}
        onSaved={handleListingSaved}
      />

      {/* Notifications Inbox Modal */}
      {notificationsOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/45 backdrop-blur-[2px]">
          <div className="w-full max-w-lg max-h-[80vh] bg-white rounded-2xl border border-[#E2E8F0] shadow-2xl overflow-hidden flex flex-col">
            <div className="px-6 py-4 border-b border-[#F1F5F9] flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2">
                <Bell className="w-4 h-4 text-[#2563EB]" />
                <h3 className="text-base font-bold text-[#0F172A]">Bildirişlər</h3>
              </div>
              <button
                type="button"
                onClick={() => setNotificationsOpen(false)}
                className="p-1 text-[#64748B] hover:text-[#0F172A] cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="overflow-y-auto p-5 divide-y divide-[#F1F5F9]">
              {notifications.length === 0 ? (
                <p className="py-8 text-center text-sm text-[#64748B]">Bildirişiniz yoxdur.</p>
              ) : (
                notifications.map((n) => (
                  <div key={n.id} className="py-3 space-y-1">
                    <div className="flex items-center justify-between gap-2 text-xs">
                      <span
                        className={`font-semibold ${
                          n.kind === 'warning'
                            ? 'text-[#DC2626]'
                            : n.kind === 'system'
                            ? 'text-[#2563EB]'
                            : 'text-[#0F172A]'
                        }`}
                      >
                        {n.title}
                      </span>
                      <span className="text-[#94A3B8] tabular-nums">{formatRelativeAz(n.createdAt)}</span>
                    </div>
                    <p className="text-xs text-[#475569] leading-relaxed">{n.message}</p>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* Kick / Ban Blocking Notice Modal */}
      {moderationNotice && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="w-full max-w-md bg-white rounded-2xl border border-[#FECACA] shadow-2xl p-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-[#FEF2F2] text-[#DC2626] flex items-center justify-center shrink-0">
                <ShieldAlert className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-[#0F172A]">
                  {moderationNotice.code === 'USER_BANNED'
                    ? 'Hesabınız Bloklanıb (Ban)'
                    : 'Sessiyanız Dayandırılıb (Kick)'}
                </h3>
                <p className="text-xs text-[#64748B]">
                  {moderationNotice.until
                    ? `Bitmə tarixi: ${new Date(moderationNotice.until).toLocaleString('az-AZ')}`
                    : 'Müddətsiz məhdudiyyət'}
                </p>
              </div>
            </div>
            <p className="text-sm text-[#334155] bg-[#FEF2F2] p-3.5 rounded-xl border border-[#FECACA]">
              Səbəb: {moderationNotice.message}
            </p>
            <button
              type="button"
              onClick={() => setModerationNotice(null)}
              className="w-full py-2.5 px-4 bg-[#0F172A] hover:bg-[#1E293B] text-white text-sm font-semibold rounded-lg cursor-pointer"
            >
              Anladım
            </button>
          </div>
        </div>
      )}

      {/* Toast Notification */}
      {toast && (
        <div className="fixed bottom-5 right-5 z-50 max-w-sm bg-[#0F172A] text-white px-4 py-3 rounded-xl shadow-lg flex items-center gap-2.5 text-sm">
          {toast.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 text-[#4ADE80] shrink-0" />
          ) : (
            <AlertCircle className="w-4 h-4 text-[#F87171] shrink-0" />
          )}
          <span>{toast.msg}</span>
        </div>
      )}
    </div>
  );
}
