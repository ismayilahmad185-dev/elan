import {
  AlertTriangle,
  ArrowUpCircle,
  CheckCircle,
  Edit3,
  Eye,
  Heart,
  Plus,
  RotateCcw,
  Trash2,
} from 'lucide-react';
import { useState } from 'react';
import { apiFetch, ApiError, formatPriceAzn, formatRelativeAz } from '../lib/api.ts';
import type { ListingStatus, PhoneListing } from '../types.ts';

interface MyListingsViewProps {
  listings: PhoneListing[];
  loading: boolean;
  onRefresh: () => Promise<void>;
  onCreateNew: () => void;
  onEdit: (listing: PhoneListing) => void;
  onViewDetail: (listing: PhoneListing) => void;
  onNotify: (msg: string, type?: 'success' | 'error') => void;
}

const STATUS_TABS: { key: 'all' | ListingStatus; label: string }[] = [
  { key: 'all', label: 'Hamısı' },
  { key: 'active', label: 'Aktiv' },
  { key: 'pending', label: 'Gözləmədə' },
  { key: 'sold', label: 'Satıldı' },
  { key: 'rejected', label: 'Rədd edildi' },
];

export function MyListingsView({
  listings,
  loading,
  onRefresh,
  onCreateNew,
  onEdit,
  onViewDetail,
  onNotify,
}: MyListingsViewProps) {
  const [statusFilter, setStatusFilter] = useState<'all' | ListingStatus>('all');
  const [busyId, setBusyId] = useState<string | null>(null);

  const filtered = listings.filter((l) =>
    statusFilter === 'all' ? true : l.status === statusFilter
  );

  const runAction = async (id: string, action: 'mark_sold' | 'bump' | 'reopen') => {
    setBusyId(id);
    try {
      await apiFetch(`/api/listings/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ action }),
      });
      await onRefresh();
      onNotify(
        action === 'mark_sold'
          ? 'Elan satıldı kimi işarələndi.'
          : action === 'bump'
          ? 'Elan ön sıralara qaldırıldı.'
          : 'Elan yenidən yoxlanışa göndərildi.',
        'success'
      );
    } catch (err) {
      onNotify(err instanceof ApiError ? err.message : 'Əməliyyat uğursuz oldu.', 'error');
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async (id: string) => {
    setBusyId(id);
    try {
      await apiFetch(`/api/listings/${id}`, { method: 'DELETE' });
      await onRefresh();
      onNotify('Elan silindi.', 'success');
    } catch (err) {
      onNotify(err instanceof ApiError ? err.message : 'Silinmə zamanı xəta baş verdi.', 'error');
    } finally {
      setBusyId(null);
    }
  };

  const statusMeta = (status: ListingStatus) => {
    switch (status) {
      case 'active':
        return { label: 'Aktivdir', cls: 'text-[#16A34A]' };
      case 'pending':
        return { label: 'Admin təsdiqi gözləyir', cls: 'text-[#D97706]' };
      case 'sold':
        return { label: 'Satılıb', cls: 'text-[#4B5563]' };
      case 'rejected':
        return { label: 'Rədd edilib', cls: 'text-[#DC2626]' };
    }
  };

  return (
    <section className="max-w-[1360px] mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[#111827]">Mənim Elanlarım</h1>
          <p className="text-sm text-[#6B7280] mt-1">
            Elanlarınızın statusunu izləyin, qiymət yeniləyin, önə çəkin və ya satıldı kimi qeyd edin.
          </p>
        </div>
        <button
          type="button"
          onClick={onCreateNew}
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-[#2563EB] hover:bg-[#1D4ED8] text-white text-sm font-semibold rounded-lg whitespace-nowrap shrink-0 cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          Yeni Elan Yarat
        </button>
      </div>

      {/* Filter Tabs */}
      <div className="inline-flex flex-wrap items-center gap-1 p-1 bg-[#E5E7EB]/60 rounded-lg">
        {STATUS_TABS.map((t) => {
          const count = t.key === 'all' ? listings.length : listings.filter((l) => l.status === t.key).length;
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => setStatusFilter(t.key)}
              className={`px-3.5 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                statusFilter === t.key
                  ? 'bg-white text-[#111827] shadow-xs'
                  : 'text-[#4B5563] hover:text-[#111827]'
              }`}
            >
              {t.label} ({count})
            </button>
          );
        })}
      </div>

      {loading ? (
        <div className="grid grid-cols-1 gap-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-28 bg-white rounded-xl border border-[#E4E7EC] animate-pulse" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-xl border border-[#E4E7EC] p-12 text-center">
          <p className="text-base font-semibold text-[#111827]">Bu kateqoriyada elanınız yoxdur</p>
          <p className="text-sm text-[#6B7280] mt-1">
            Telefonunuzu satmaq üçün ilk elanınızı indi yerləşdirə bilərsiniz.
          </p>
          <button
            type="button"
            onClick={onCreateNew}
            className="mt-4 px-4 py-2 text-sm font-semibold text-white bg-[#2563EB] hover:bg-[#1D4ED8] rounded-lg cursor-pointer"
          >
            Elan Yerləşdir
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((item) => {
            const meta = statusMeta(item.status);
            const busy = busyId === item.id;
            return (
              <div
                key={item.id}
                className="bg-white rounded-xl border border-[#E4E7EC] p-4 flex flex-col md:flex-row md:items-center justify-between gap-4"
              >
                <div
                  onClick={() => onViewDetail(item)}
                  className="flex items-start sm:items-center gap-4 min-w-0 cursor-pointer"
                >
                  <img
                    src={item.imageUrl}
                    alt={item.title}
                    referrerPolicy="no-referrer"
                    className="w-24 h-18 rounded-lg object-cover bg-[#F3F4F6] border border-[#E4E7EC] shrink-0"
                  />
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <span className={`font-semibold ${meta.cls}`}>{meta.label}</span>
                      <span className="text-[#9CA3AF]">·</span>
                      <span className="text-[#6B7280]">{formatRelativeAz(item.updatedAt)}</span>
                      {item.isFeatured && (
                        <>
                          <span className="text-[#9CA3AF]">·</span>
                          <span className="font-semibold text-[#2563EB]">VIP</span>
                        </>
                      )}
                    </div>
                    <h3 className="mt-1 text-base font-semibold text-[#111827] truncate">
                      {item.title}
                    </h3>
                    <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-[#6B7280] tabular-nums">
                      <span className="font-bold text-[#111827] text-sm">
                        {formatPriceAzn(item.price)}
                      </span>
                      <span>·</span>
                      <span className="inline-flex items-center gap-1">
                        <Eye className="w-3.5 h-3.5" /> {item.views}
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <Heart className="w-3.5 h-3.5" /> {item.favoritesCount}
                      </span>
                    </div>
                    {item.status === 'rejected' && item.rejectionReason && (
                      <p className="mt-1.5 text-xs text-[#B91C1C] flex items-center gap-1.5">
                        <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                        <span>Səbəb: {item.rejectionReason}</span>
                      </p>
                    )}
                  </div>
                </div>

                {/* Action Controls */}
                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => onEdit(item)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-[#374151] border border-[#D1D5DB] hover:bg-[#F9FAFB] rounded-lg cursor-pointer whitespace-nowrap"
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                    Redaktə
                  </button>

                  {item.status === 'active' && (
                    <>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => runAction(item.id, 'bump')}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-[#2563EB] border border-[#BFDBFE] hover:bg-[#EFF6FF] rounded-lg cursor-pointer whitespace-nowrap"
                      >
                        <ArrowUpCircle className="w-3.5 h-3.5" />
                        İrəli çək
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => runAction(item.id, 'mark_sold')}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-[#16A34A] border border-[#BBF7D0] hover:bg-[#F0FDF4] rounded-lg cursor-pointer whitespace-nowrap"
                      >
                        <CheckCircle className="w-3.5 h-3.5" />
                        Satıldı et
                      </button>
                    </>
                  )}

                  {(item.status === 'sold' || item.status === 'rejected') && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => runAction(item.id, 'reopen')}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-[#2563EB] border border-[#BFDBFE] hover:bg-[#EFF6FF] rounded-lg cursor-pointer whitespace-nowrap"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      Yenidən aç
                    </button>
                  )}

                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => handleDelete(item.id)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-[#DC2626] border border-[#FECACA] hover:bg-[#FEF2F2] rounded-lg cursor-pointer whitespace-nowrap"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    Sil
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
