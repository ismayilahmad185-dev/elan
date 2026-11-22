import {
  CheckCircle2,
  Eye,
  Flag,
  Heart,
  MapPin,
  Phone,
  ShieldCheck,
  Smartphone,
  X,
} from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { apiFetch, ApiError, formatPriceAzn, formatRelativeAz } from '../lib/api.ts';
import type { PhoneListing, PublicUser } from '../types.ts';

interface ListingDetailModalProps {
  listing: PhoneListing | null;
  user: PublicUser | null;
  isFavorited: boolean;
  onClose: () => void;
  onToggleFavorite: (listingId: string) => void;
  onRequireAuth: () => void;
  onNotify: (msg: string, type?: 'success' | 'error') => void;
}

const REPORT_REASONS = [
  'Saxta və ya kopya telefon',
  'Şəkil və ya məlumat uyğunsuzluğu',
  'Qiymət fırıldağı / Ön ödəniş tələbi',
  'Təkrar və ya spam elan',
  'Digər qayda pozuntusu',
];

export function ListingDetailModal({
  listing,
  user,
  isFavorited,
  onClose,
  onToggleFavorite,
  onRequireAuth,
  onNotify,
}: ListingDetailModalProps) {
  const [imgError, setImgError] = useState(false);
  const [showPhone, setShowPhone] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [reportReason, setReportReason] = useState(REPORT_REASONS[0]);
  const [reportDetails, setReportDetails] = useState('');
  const [reportSubmitting, setReportSubmitting] = useState(false);

  if (!listing) return null;

  const handleReportSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!user) {
      onRequireAuth();
      return;
    }
    setReportSubmitting(true);
    try {
      await apiFetch(`/api/listings/${listing.id}/report`, {
        method: 'POST',
        body: JSON.stringify({
          reason: reportReason,
          details: reportDetails,
        }),
      });
      onNotify('Şikayətiniz admin heyətinə göndərildi.', 'success');
      setReportOpen(false);
      setReportDetails('');
    } catch (err) {
      onNotify(err instanceof ApiError ? err.message : 'Şikayət göndərilmədi.', 'error');
    } finally {
      setReportSubmitting(false);
    }
  };

  const specs = [
    { label: 'Brend', value: listing.brand },
    { label: 'Model', value: listing.model },
    { label: 'Yaddaş', value: listing.storage },
    { label: 'Operativ yaddaş (RAM)', value: listing.ram },
    { label: 'Batareya sağlamlığı', value: `${listing.batteryHealth}%` },
    { label: 'Vəziyyət', value: listing.condition },
    { label: 'Rəng', value: listing.color },
    { label: 'Zəmanət', value: listing.warranty },
    { label: 'IMEI qeydiyyatı', value: listing.imeiVerified ? 'Bəyan olunub' : 'Dəqiqləşdirilməyib' },
    { label: 'Barter / Kredit', value: `${listing.barter ? 'Barter var' : 'Barter yoxdur'} · ${listing.credit ? 'Kredit var' : 'Nağd'}` },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-[2px]">
      <div className="w-full max-w-5xl max-h-[90vh] bg-white rounded-2xl border border-[#E4E7EC] shadow-2xl overflow-hidden flex flex-col">
        {/* Top Bar */}
        <div className="px-6 py-4 border-b border-[#F3F4F6] flex items-center justify-between gap-4 shrink-0">
          <div className="text-xs text-[#6B7280] flex items-center gap-2 truncate">
            <span>{listing.brand}</span>
            <span aria-hidden="true">·</span>
            <span>{listing.city}</span>
            <span aria-hidden="true">·</span>
            <span className="inline-flex items-center gap-1">
              <Eye className="w-3.5 h-3.5" />
              <span className="tabular-nums">{listing.views}</span> baxış
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Bağla"
            className="p-1.5 rounded-lg text-[#6B7280] hover:bg-[#F3F4F6] cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Contiguous Content */}
        <div className="overflow-y-auto p-6 grid grid-cols-1 lg:grid-cols-12 gap-8">
          {/* Left Gallery + Description */}
          <div className="lg:col-span-7 space-y-6">
            <div className="aspect-[4/3] rounded-xl bg-[#F3F4F6] overflow-hidden border border-[#E4E7EC]">
              {!imgError && listing.imageUrl ? (
                <img
                  src={listing.imageUrl}
                  alt={listing.title}
                  referrerPolicy="no-referrer"
                  onError={() => setImgError(true)}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex flex-col items-center justify-center text-[#6B7280]">
                  <Smartphone className="w-12 h-12 mb-2 text-[#9CA3AF]" />
                  <span className="text-sm font-medium">{listing.title}</span>
                </div>
              )}
            </div>

            <div>
              <h3 className="text-sm font-semibold text-[#111827] mb-2">Satıcı qeydi</h3>
              <p className="text-sm text-[#374151] leading-relaxed whitespace-pre-line">
                {listing.description}
              </p>
            </div>

            {/* Specifications Table */}
            <div>
              <h3 className="text-sm font-semibold text-[#111827] mb-3">Texniki göstəricilər</h3>
              <div className="border border-[#E4E7EC] rounded-xl divide-y divide-[#F3F4F6]">
                {specs.map((item) => (
                  <div
                    key={item.label}
                    className="px-4 py-2.5 flex items-center justify-between gap-4 text-sm"
                  >
                    <span className="text-[#6B7280]">{item.label}</span>
                    <span className="font-medium text-[#111827] text-right">{item.value}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Right Contiguous Purchase & Contact Module */}
          <div className="lg:col-span-5 space-y-5">
            <div className="p-6 rounded-xl border border-[#E4E7EC] bg-[#FAFAFB] space-y-5">
              <div>
                <div className="flex items-center justify-between gap-2 text-xs text-[#6B7280]">
                  <span>{formatRelativeAz(listing.updatedAt)}</span>
                  {listing.isFeatured && (
                    <span className="font-semibold text-[#2563EB]">VIP Elan</span>
                  )}
                </div>
                <h2 className="mt-1.5 text-2xl font-bold text-[#111827] leading-tight text-balance">
                  {listing.title}
                </h2>
                <p className="mt-3 text-3xl font-extrabold text-[#111827] tabular-nums">
                  {formatPriceAzn(listing.price)}
                </p>
              </div>

              <div className="pt-4 border-t border-[#E4E7EC] space-y-3">
                {showPhone ? (
                  <a
                    href={`tel:${listing.phone.replace(/\s+/g, '')}`}
                    className="w-full py-3 px-4 rounded-lg bg-[#16A34A] hover:bg-[#15803D] text-white font-semibold text-sm flex items-center justify-center gap-2 transition-colors tabular-nums"
                  >
                    <Phone className="w-4 h-4" />
                    {listing.phone}
                  </a>
                ) : (
                  <button
                    type="button"
                    onClick={() => setShowPhone(true)}
                    className="w-full py-3 px-4 rounded-lg bg-[#2563EB] hover:bg-[#1D4ED8] text-white font-semibold text-sm flex items-center justify-center gap-2 transition-colors cursor-pointer"
                  >
                    <Phone className="w-4 h-4" />
                    Nömrəni Göstər
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => onToggleFavorite(listing.id)}
                  className="w-full py-2.5 px-4 rounded-lg border border-[#D1D5DB] bg-white hover:bg-[#F9FAFB] text-sm font-medium text-[#111827] flex items-center justify-center gap-2 transition-colors cursor-pointer"
                >
                  <Heart className={`w-4 h-4 ${isFavorited ? 'fill-[#DC2626] text-[#DC2626]' : 'text-[#6B7280]'}`} />
                  {isFavorited ? 'Seçilmişlərdən çıxar' : 'Seçilmişlərə əlavə et'}
                </button>
              </div>

              {/* Seller Identity */}
              <div className="pt-4 border-t border-[#E4E7EC] space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold text-[#111827] flex items-center gap-1.5">
                      {listing.sellerName}
                      {listing.sellerVerified && (
                        <CheckCircle2 className="w-4 h-4 text-[#2563EB]" />
                      )}
                    </p>
                    <p className="text-xs text-[#6B7280] mt-0.5">
                      {listing.sellerVerified ? 'Təsdiqlənmiş satıcı' : 'Standart satıcı'}
                    </p>
                  </div>
                  <span className="text-xs text-[#4B5563] inline-flex items-center gap-1">
                    <MapPin className="w-3.5 h-3.5 text-[#6B7280]" />
                    {listing.city}
                  </span>
                </div>
              </div>
            </div>

            {/* Trust Note */}
            <div className="p-4 rounded-xl border border-[#E4E7EC] bg-white flex items-start gap-3 text-xs text-[#4B5563]">
              <ShieldCheck className="w-5 h-5 text-[#16A34A] shrink-0" />
              <p className="leading-relaxed">
                Görüş zamanı cihazın IMEI kodunu, batareya sağlamlığını və ekranını yerində yoxlayın. Ön ödəniş tələb edən elanları dərhal şikayət edin.
              </p>
            </div>

            {/* Report Action */}
            <div>
              {!reportOpen ? (
                <button
                  type="button"
                  onClick={() => (user ? setReportOpen(true) : onRequireAuth())}
                  className="text-xs font-medium text-[#6B7280] hover:text-[#DC2626] inline-flex items-center gap-1.5 cursor-pointer"
                >
                  <Flag className="w-3.5 h-3.5" />
                  Elanla bağlı şikayət et
                </button>
              ) : (
                <form
                  onSubmit={handleReportSubmit}
                  className="p-4 rounded-xl border border-[#FECACA] bg-[#FEF2F2]/60 space-y-3"
                >
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-semibold text-[#991B1B]">Şikayət göndər</h4>
                    <button
                      type="button"
                      onClick={() => setReportOpen(false)}
                      className="text-xs text-[#6B7280] hover:text-[#111827] cursor-pointer"
                    >
                      Ləğv et
                    </button>
                  </div>
                  <select
                    value={reportReason}
                    onChange={(e) => setReportReason(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-lg border border-[#D1D5DB] bg-white"
                  >
                    {REPORT_REASONS.map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </select>
                  <textarea
                    rows={2}
                    value={reportDetails}
                    onChange={(e) => setReportDetails(e.target.value)}
                    placeholder="Əlavə qeydiniz (istəyə bağlı)"
                    className="w-full px-3 py-2 text-xs rounded-lg border border-[#D1D5DB] bg-white"
                  />
                  <button
                    type="submit"
                    disabled={reportSubmitting}
                    className="w-full py-2 px-3 rounded-lg bg-[#DC2626] hover:bg-[#B91C1C] text-white text-xs font-semibold cursor-pointer"
                  >
                    {reportSubmitting ? 'Göndərilir...' : 'Şikayəti Göndər'}
                  </button>
                </form>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
