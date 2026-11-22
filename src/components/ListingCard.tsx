import { CheckCircle2, Heart, Smartphone } from 'lucide-react';
import { useState } from 'react';
import { formatPriceAzn, formatRelativeAz } from '../lib/api.ts';
import type { PhoneListing } from '../types.ts';

interface ListingCardProps {
  listing: PhoneListing;
  isFavorited: boolean;
  onSelect: (listing: PhoneListing) => void;
  onToggleFavorite: (listingId: string) => void;
}

export function ListingCard({
  listing,
  isFavorited,
  onSelect,
  onToggleFavorite,
}: ListingCardProps) {
  const [imgError, setImgError] = useState(false);

  return (
    <article
      onClick={() => onSelect(listing)}
      className="group bg-white rounded-2xl border border-[#E2E8F0] overflow-hidden cursor-pointer transition-all duration-200 hover:-translate-y-0.5 hover:border-[#CBD5E1] hover:shadow-lg flex flex-col"
    >
      {/* 4:3 Studio Image Frame */}
      <div className="relative aspect-[4/3] bg-[#F1F5F9] overflow-hidden">
        {!imgError && listing.imageUrl ? (
          <img
            src={listing.imageUrl}
            alt={listing.title}
            referrerPolicy="no-referrer"
            onError={() => setImgError(true)}
            className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
          />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-br from-[#F1F5F9] to-[#E2E8F0] text-[#64748B] p-4 text-center">
            <Smartphone className="w-10 h-10 mb-2 text-[#94A3B8]" />
            <span className="text-xs font-medium text-[#475569] line-clamp-1">{listing.model}</span>
          </div>
        )}

        <button
          type="button"
          aria-label={isFavorited ? 'Seçilmişlərdən çıxar' : 'Seçilmişlərə əlavə et'}
          onClick={(e) => {
            e.stopPropagation();
            onToggleFavorite(listing.id);
          }}
          className="absolute top-3 right-3 w-9 h-9 rounded-xl bg-white/95 backdrop-blur-xs border border-[#E2E8F0] shadow-xs flex items-center justify-center text-[#334155] hover:text-[#DC2626] transition-colors cursor-pointer"
        >
          <Heart
            className={`w-4 h-4 ${isFavorited ? 'fill-[#DC2626] text-[#DC2626]' : ''}`}
          />
        </button>

        {listing.isFeatured && (
          <div className="absolute bottom-3 left-3 px-2.5 py-1 rounded-md bg-[#0F172A]/90 backdrop-blur-xs text-[11px] font-semibold text-white tracking-wide">
            VIP Elan
          </div>
        )}
      </div>

      {/* Card Body — Zero-Pill Unboxed Metadata */}
      <div className="p-4 sm:p-5 flex-1 flex flex-col justify-between gap-3.5">
        <div>
          <div className="flex items-center justify-between gap-2 text-xs text-[#64748B]">
            <span className="font-medium text-[#475569] truncate">
              {listing.brand} · {listing.city}
            </span>
            <span className="shrink-0 tabular-nums">{formatRelativeAz(listing.updatedAt)}</span>
          </div>

          <h3 className="font-display mt-1.5 text-[15px] font-bold text-[#0F172A] leading-snug line-clamp-2 group-hover:text-[#2563EB] transition-colors">
            {listing.title}
          </h3>

          <p className="mt-1.5 text-xs text-[#64748B] truncate tabular-nums">
            {listing.storage} · Batareya {listing.batteryHealth}% · {listing.condition}
          </p>
        </div>

        <div className="pt-3 border-t border-[#F1F5F9] flex items-center justify-between gap-2">
          <span className="font-display text-lg font-extrabold text-[#0F172A] tabular-nums tracking-tight">
            {formatPriceAzn(listing.price)}
          </span>
          <span className="text-xs text-[#475569] inline-flex items-center gap-1 truncate max-w-[140px]">
            {listing.sellerVerified && (
              <CheckCircle2 className="w-3.5 h-3.5 text-[#2563EB] shrink-0" />
            )}
            <span className="truncate">{listing.sellerName}</span>
          </span>
        </div>
      </div>
    </article>
  );
}
