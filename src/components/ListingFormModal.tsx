import { Image as ImageIcon, Upload, X } from 'lucide-react';
import { useEffect, useState, type ChangeEvent, type FormEvent } from 'react';
import { apiFetch, ApiError } from '../lib/api.ts';
import type { PhoneCondition, PhoneListing } from '../types.ts';

interface ListingFormModalProps {
  isOpen: boolean;
  editingListing: PhoneListing | null;
  brands?: string[];
  cities?: string[];
  onClose: () => void;
  onSaved: (listing: PhoneListing, flagged?: boolean) => void;
}

const DEFAULT_BRANDS = ['Apple', 'Samsung', 'Xiaomi', 'Google', 'OnePlus', 'Honor', 'Nothing', 'Digər'];
const DEFAULT_CITIES = ['Bakı', 'Sumqayıt', 'Gəncə', 'Mingəçevir', 'Lənkəran', 'Şəki', 'Naxçıvan', 'Digər'];
const STORAGES = ['64 GB', '128 GB', '256 GB', '512 GB', '1 TB'];
const RAMS = ['4 GB', '6 GB', '8 GB', '12 GB', '16 GB', '24 GB'];
const CONDITIONS: PhoneCondition[] = ['Yeni (Qutuda)', 'İdeal', 'Yaxşı', 'Orta'];
const WARRANTIES = ['Yoxdur', 'Mağaza zəmanəti', 'Rəsmi zəmanət'];

const STUDIO_PRESETS = [
  { label: 'Titanium Pro', url: '/src/assets/images/phone_iphone_pro_1795345109178.jpg' },
  { label: 'Ultra Black', url: '/src/assets/images/phone_samsung_ultra_1795345109304.jpg' },
  { label: 'Porcelain', url: '/src/assets/images/phone_pixel_pro_1795345108667.jpg' },
  { label: 'Obsidian Cam', url: '/src/assets/images/phone_xiaomi_fold_1795345108772.jpg' },
];

export function ListingFormModal({
  isOpen,
  editingListing,
  brands = DEFAULT_BRANDS,
  cities = DEFAULT_CITIES,
  onClose,
  onSaved,
}: ListingFormModalProps) {
  const brandOptions = brands.length > 0 ? brands : DEFAULT_BRANDS;
  const cityOptions = cities.length > 0 ? cities : DEFAULT_CITIES;
  const [brand, setBrand] = useState('Apple');
  const [model, setModel] = useState('');
  const [title, setTitle] = useState('');
  const [price, setPrice] = useState('');
  const [storage, setStorage] = useState('256 GB');
  const [ram, setRam] = useState('8 GB');
  const [batteryHealth, setBatteryHealth] = useState('96');
  const [condition, setCondition] = useState<PhoneCondition>('İdeal');
  const [city, setCity] = useState('Bakı');
  const [color, setColor] = useState('');
  const [warranty, setWarranty] = useState('Rəsmi zəmanət');
  const [imeiVerified, setImeiVerified] = useState(true);
  const [barter, setBarter] = useState(false);
  const [credit, setCredit] = useState(false);
  const [phone, setPhone] = useState('+994 ');
  const [description, setDescription] = useState('');
  const [imageUrl, setImageUrl] = useState(STUDIO_PRESETS[0].url);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setError('');
    if (editingListing) {
      setBrand(editingListing.brand);
      setModel(editingListing.model);
      setTitle(editingListing.title);
      setPrice(String(editingListing.price));
      setStorage(editingListing.storage);
      setRam(editingListing.ram);
      setBatteryHealth(String(editingListing.batteryHealth));
      setCondition(editingListing.condition);
      setCity(editingListing.city);
      setColor(editingListing.color);
      setWarranty(editingListing.warranty);
      setImeiVerified(editingListing.imeiVerified);
      setBarter(editingListing.barter);
      setCredit(editingListing.credit);
      setPhone(editingListing.phone);
      setDescription(editingListing.description);
      setImageUrl(editingListing.imageUrl);
    } else {
      setBrand('Apple');
      setModel('');
      setTitle('');
      setPrice('');
      setStorage('256 GB');
      setRam('8 GB');
      setBatteryHealth('98');
      setCondition('İdeal');
      setCity('Bakı');
      setColor('Natural Titanium');
      setWarranty('Rəsmi zəmanət');
      setImeiVerified(true);
      setBarter(false);
      setCredit(false);
      setPhone('+994 ');
      setDescription('');
      setImageUrl(STUDIO_PRESETS[0].url);
    }
  }, [isOpen, editingListing]);

  if (!isOpen) return null;

  const handleFileUpload = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const maxDim = 960;
        let { width, height } = img;
        if (width > maxDim || height > maxDim) {
          if (width > height) {
            height = Math.round((height * maxDim) / width);
            width = maxDim;
          } else {
            width = Math.round((width * maxDim) / height);
            height = maxDim;
          }
        }
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0, width, height);
          const compressed = canvas.toDataURL('image/jpeg', 0.82);
          setImageUrl(compressed);
        }
      };
      if (typeof reader.result === 'string') {
        img.src = reader.result;
      }
    };
    reader.readAsDataURL(file);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      const payload = {
        brand,
        model: model.trim(),
        title: title.trim() || `${brand} ${model.trim()} ${storage} ${color.trim()}`.trim(),
        price: Number(price),
        storage,
        ram,
        batteryHealth: Number(batteryHealth),
        condition,
        city,
        color: color.trim() || 'Qara',
        warranty,
        imeiVerified,
        barter,
        credit,
        phone: phone.trim(),
        description: description.trim(),
        imageUrl,
      };

      if (editingListing) {
        const res = await apiFetch<{ listing: PhoneListing }>(`/api/listings/${editingListing.id}`, {
          method: 'PATCH',
          body: JSON.stringify(payload),
        });
        onSaved(res.listing);
      } else {
        const res = await apiFetch<{ listing: PhoneListing; flaggedByKeyword?: boolean }>('/api/listings', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        onSaved(res.listing, res.flaggedByKeyword);
      }
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Elan yadda saxlanılmadı.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-[2px]">
      <div className="w-full max-w-2xl max-h-[90vh] bg-white rounded-2xl border border-[#E4E7EC] shadow-2xl overflow-hidden flex flex-col">
        <div className="px-6 py-4 border-b border-[#F3F4F6] flex items-center justify-between shrink-0">
          <h2 className="text-lg font-bold text-[#111827]">
            {editingListing ? 'Elanı Redaktə Et' : 'Yeni Telefon Elanı Yerləşdir'}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Bağla"
            className="p-1.5 rounded-lg text-[#6B7280] hover:bg-[#F3F4F6] cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="overflow-y-auto p-6 space-y-5">
          {error && (
            <div className="p-3 rounded-lg bg-[#FEF2F2] border border-[#FECACA] text-sm text-[#B91C1C]">
              {error}
            </div>
          )}

          {/* Photo Picker */}
          <div className="space-y-2.5">
            <label className="block text-xs font-semibold text-[#374151]">
              Telefon Şəkli (Studiya şablonu seçin və ya öz şəklinizi yükləyin)
            </label>
            <div className="grid grid-cols-5 gap-2.5">
              {STUDIO_PRESETS.map((preset) => (
                <button
                  key={preset.url}
                  type="button"
                  onClick={() => setImageUrl(preset.url)}
                  className={`relative aspect-[4/3] rounded-lg overflow-hidden border-2 transition-all cursor-pointer ${
                    imageUrl === preset.url ? 'border-[#2563EB] ring-2 ring-[#2563EB]/20' : 'border-[#E4E7EC]'
                  }`}
                >
                  <img src={preset.url} alt={preset.label} className="w-full h-full object-cover" />
                </button>
              ))}
              <label className="aspect-[4/3] rounded-lg border-2 border-dashed border-[#D1D5DB] hover:border-[#2563EB] bg-[#F9FAFB] flex flex-col items-center justify-center gap-1 text-[11px] font-medium text-[#4B5563] cursor-pointer transition-colors">
                <Upload className="w-4 h-4 text-[#2563EB]" />
                <span>Yüklə</span>
                <input type="file" accept="image/*" onChange={handleFileUpload} className="hidden" />
              </label>
            </div>
            <div className="flex items-center gap-2">
              <ImageIcon className="w-4 h-4 text-[#9CA3AF] shrink-0" />
              <input
                type="text"
                value={imageUrl.startsWith('data:') ? 'Yüklənmiş lokal şəkil hazırdır' : imageUrl}
                onChange={(e) => setImageUrl(e.target.value)}
                readOnly={imageUrl.startsWith('data:')}
                placeholder="Və ya https:// şəkil linki daxil edin"
                className="w-full px-3 py-1.5 text-xs rounded-lg border border-[#E4E7EC] text-[#4B5563]"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-[#374151] mb-1">Brend</label>
              <select
                value={brand}
                onChange={(e) => setBrand(e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-lg border border-[#D1D5DB] bg-white"
              >
                {brandOptions.map((b) => (
                  <option key={b} value={b}>{b}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-[#374151] mb-1">Model *</label>
              <input
                type="text"
                required
                value={model}
                onChange={(e) => setModel(e.target.value)}
                placeholder="Məs: iPhone 16 Pro Max"
                className="w-full px-3 py-2 text-sm rounded-lg border border-[#D1D5DB]"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-[#374151] mb-1">
              Elan Başlığı (boş qalsa avtomatik yaranacaq)
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Məs: Apple iPhone 16 Pro 256 GB Natural Titanium"
              className="w-full px-3 py-2 text-sm rounded-lg border border-[#D1D5DB]"
            />
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div>
              <label className="block text-xs font-medium text-[#374151] mb-1">Qiymət (AZN) *</label>
              <input
                type="number"
                required
                min={1}
                max={50000}
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                placeholder="2150"
                className="w-full px-3 py-2 text-sm rounded-lg border border-[#D1D5DB] tabular-nums"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[#374151] mb-1">Yaddaş</label>
              <select
                value={storage}
                onChange={(e) => setStorage(e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-lg border border-[#D1D5DB] bg-white"
              >
                {STORAGES.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-[#374151] mb-1">RAM</label>
              <select
                value={ram}
                onChange={(e) => setRam(e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-lg border border-[#D1D5DB] bg-white"
              >
                {RAMS.map((r) => (
                  <option key={r} value={r}>{r}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-[#374151] mb-1">Batareya (%)</label>
              <input
                type="number"
                min={40}
                max={100}
                value={batteryHealth}
                onChange={(e) => setBatteryHealth(e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-lg border border-[#D1D5DB] tabular-nums"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-[#374151] mb-1">Vəziyyət</label>
              <select
                value={condition}
                onChange={(e) => setCondition(e.target.value as PhoneCondition)}
                className="w-full px-3 py-2 text-sm rounded-lg border border-[#D1D5DB] bg-white"
              >
                {CONDITIONS.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-[#374151] mb-1">Şəhər</label>
              <select
                value={city}
                onChange={(e) => setCity(e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-lg border border-[#D1D5DB] bg-white"
              >
                {cityOptions.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-[#374151] mb-1">Zəmanət</label>
              <select
                value={warranty}
                onChange={(e) => setWarranty(e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-lg border border-[#D1D5DB] bg-white"
              >
                {WARRANTIES.map((w) => (
                  <option key={w} value={w}>{w}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-[#374151] mb-1">Rəng</label>
              <input
                type="text"
                value={color}
                onChange={(e) => setColor(e.target.value)}
                placeholder="Məs: Desert Titanium"
                className="w-full px-3 py-2 text-sm rounded-lg border border-[#D1D5DB]"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[#374151] mb-1">Əlaqə Nömrəsi *</label>
              <input
                type="tel"
                required
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+994 50 000 00 00"
                className="w-full px-3 py-2 text-sm rounded-lg border border-[#D1D5DB] tabular-nums"
              />
            </div>
          </div>

          <div className="flex flex-wrap gap-6 pt-1">
            <label className="inline-flex items-center gap-2 text-sm text-[#374151] cursor-pointer">
              <input
                type="checkbox"
                checked={imeiVerified}
                onChange={(e) => setImeiVerified(e.target.checked)}
                className="rounded border-[#D1D5DB] text-[#2563EB]"
              />
              IMEI Bəyan / Qeydiyyatlıdır
            </label>
            <label className="inline-flex items-center gap-2 text-sm text-[#374151] cursor-pointer">
              <input
                type="checkbox"
                checked={barter}
                onChange={(e) => setBarter(e.target.checked)}
                className="rounded border-[#D1D5DB] text-[#2563EB]"
              />
              Barter mümkündür
            </label>
            <label className="inline-flex items-center gap-2 text-sm text-[#374151] cursor-pointer">
              <input
                type="checkbox"
                checked={credit}
                onChange={(e) => setCredit(e.target.checked)}
                className="rounded border-[#D1D5DB] text-[#2563EB]"
              />
              Kredit / Taksit var
            </label>
          </div>

          <div>
            <label className="block text-xs font-medium text-[#374151] mb-1">
              Ətraflı Təsvir *
            </label>
            <textarea
              required
              minLength={10}
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Telefonun komplektasiyası, təmir olunub-olunmaması və əlavə üstünlükləri barədə yazın..."
              className="w-full px-3 py-2 text-sm rounded-lg border border-[#D1D5DB]"
            />
          </div>

          <div className="pt-2 border-t border-[#F3F4F6] flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-[#374151] hover:bg-[#F3F4F6] rounded-lg cursor-pointer"
            >
              Ləğv et
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-5 py-2 text-sm font-semibold text-white bg-[#2563EB] hover:bg-[#1D4ED8] disabled:opacity-60 rounded-lg cursor-pointer"
            >
              {submitting
                ? 'Yadda saxlanır...'
                : editingListing
                ? 'Dəyişiklikləri Saxla'
                : 'Elanı Göndər'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
