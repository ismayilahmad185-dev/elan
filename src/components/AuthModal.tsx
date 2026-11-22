import { AlertCircle, CheckCircle2, Mail, ShieldCheck, X } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { apiFetch, ApiError, setAuthToken } from '../lib/api.ts';
import type { PublicUser } from '../types.ts';

const REMEMBERED_GMAILS_KEY = 'tb_remembered_gmails';

function readRememberedGmails(): string[] {
  try {
    const raw = window.localStorage.getItem(REMEMBERED_GMAILS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((item): item is string => typeof item === 'string' && item.endsWith('@gmail.com'))
      .slice(0, 4);
  } catch {
    return [];
  }
}

function saveRememberedGmail(gmail: string): string[] {
  const normalized = gmail.trim().toLowerCase();
  const next = [normalized, ...readRememberedGmails().filter((item) => item !== normalized)].slice(0, 4);
  try {
    window.localStorage.setItem(REMEMBERED_GMAILS_KEY, JSON.stringify(next));
  } catch {
    // ignore storage restrictions
  }
  return next;
}

function removeRememberedGmail(gmail: string): string[] {
  const normalized = gmail.trim().toLowerCase();
  const next = readRememberedGmails().filter((item) => item !== normalized);
  try {
    if (next.length === 0) {
      window.localStorage.removeItem(REMEMBERED_GMAILS_KEY);
    } else {
      window.localStorage.setItem(REMEMBERED_GMAILS_KEY, JSON.stringify(next));
    }
  } catch {
    // ignore
  }
  return next;
}

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (user: PublicUser) => void;
}

export function AuthModal({ isOpen, onClose, onSuccess }: AuthModalProps) {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [rememberGmail, setRememberGmail] = useState(true);
  const [savedGmails, setSavedGmails] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const [ownerClaimRequired, setOwnerClaimRequired] = useState(false);
  const [ownerEmail, setOwnerEmail] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    setError('');
    const remembered = readRememberedGmails();
    setSavedGmails(remembered);
    if (remembered.length > 0 && !email) {
      setEmail(remembered[0]);
    }

    apiFetch<{ ownerClaimRequired: boolean; ownerEmail: string; allowNewRegistrations: boolean }>(
      '/api/auth/bootstrap-status'
    )
      .then((res) => {
        setOwnerClaimRequired(res.ownerClaimRequired);
        setOwnerEmail(res.ownerEmail);
        if (res.ownerClaimRequired && remembered.length === 0) {
          setMode('register');
          setEmail(res.ownerEmail);
          setName('İsmayıl Əhməd');
        }
      })
      .catch(() => {});
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    const normalized = email.trim().toLowerCase();
    if (!normalized.endsWith('@gmail.com')) {
      setError('Yalnız @gmail.com ünvanı ilə daxil ola və ya qeydiyyatdan keçə bilərsiniz.');
      return;
    }
    if (password.length < 6) {
      setError('Şifrə ən azı 6 simvoldan ibarət olmalıdır.');
      return;
    }

    setLoading(true);
    try {
      const endpoint = mode === 'login' ? '/api/auth/login' : '/api/auth/register';
      const payload = mode === 'login'
        ? { email: normalized, password }
        : { email: normalized, password, name: name.trim() };

      const res = await apiFetch<{ user: PublicUser; token: string }>(endpoint, {
        method: 'POST',
        body: JSON.stringify(payload),
      });

      if (rememberGmail) {
        setSavedGmails(saveRememberedGmail(normalized));
      } else {
        setSavedGmails(removeRememberedGmail(normalized));
      }

      setAuthToken(res.token);
      setPassword('');
      onSuccess(res.user);
      onClose();
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError('Giriş zamanı xəta baş verdi.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/45 backdrop-blur-[2px]">
      <div className="w-full max-w-md bg-white rounded-2xl border border-[#E4E7EC] shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#F3F4F6]">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-[#EFF6FF] flex items-center justify-center text-[#2563EB]">
              <Mail className="w-4 h-4" />
            </div>
            <h2 className="text-lg font-bold text-[#111827]">
              {mode === 'login' ? 'Gmail ilə Giriş' : 'Gmail Hesabı Yarat'}
            </h2>
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

        <div className="p-6 space-y-5">
          {ownerClaimRequired && ownerEmail && (
            <div className="p-3.5 rounded-xl bg-[#EFF6FF] border border-[#BFDBFE] flex items-start gap-3">
              <ShieldCheck className="w-5 h-5 text-[#2563EB] shrink-0 mt-0.5" />
              <div className="text-xs text-[#1E3A8A] leading-relaxed">
                <p className="font-semibold">Baş Admin hesabını aktivləşdirin</p>
                <p className="mt-0.5">
                  <span className="font-mono-tabular font-medium">{ownerEmail}</span> ünvanı ilə qeydiyyatdan keçərək şifrənizi təyin edin — bütün Admin Panel və səlahiyyət vermə funksiyaları avtomatik açılacaq.
                </p>
              </div>
            </div>
          )}

          {/* Segmented Mode Switch */}
          <div className="grid grid-cols-2 gap-1 p-1 bg-[#F3F4F6] rounded-lg">
            <button
              type="button"
              onClick={() => {
                setMode('login');
                setError('');
              }}
              className={`py-2 text-sm font-medium rounded-md transition-colors cursor-pointer ${
                mode === 'login'
                  ? 'bg-white text-[#111827] shadow-xs'
                  : 'text-[#6B7280] hover:text-[#111827]'
              }`}
            >
              Daxil ol
            </button>
            <button
              type="button"
              onClick={() => {
                setMode('register');
                setError('');
              }}
              className={`py-2 text-sm font-medium rounded-md transition-colors cursor-pointer ${
                mode === 'register'
                  ? 'bg-white text-[#111827] shadow-xs'
                  : 'text-[#6B7280] hover:text-[#111827]'
              }`}
            >
              Qeydiyyat
            </button>
          </div>

          {savedGmails.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-[11px] font-medium text-[#6B7280]">Yadda saxlanılmış Gmail-lər:</p>
              <div className="flex flex-wrap gap-1.5">
                {savedGmails.map((saved) => (
                  <div
                    key={saved}
                    className={`inline-flex items-center gap-1 rounded-lg border text-xs transition-colors ${
                      email.trim().toLowerCase() === saved
                        ? 'bg-[#EFF6FF] border-[#2563EB] text-[#1D4ED8]'
                        : 'bg-[#F8FAFC] border-[#E2E8F0] text-[#334155]'
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => setEmail(saved)}
                      className="pl-2.5 py-1 font-medium cursor-pointer"
                    >
                      {saved}
                    </button>
                    <button
                      type="button"
                      aria-label={`${saved} ünvanını sil`}
                      onClick={() => setSavedGmails(removeRememberedGmail(saved))}
                      className="pr-2 py-1 text-[#94A3B8] hover:text-[#DC2626] cursor-pointer"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {error && (
            <div className="p-3 rounded-lg bg-[#FEF2F2] border border-[#FECACA] flex items-start gap-2.5 text-sm text-[#B91C1C]">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === 'register' && (
              <div>
                <label className="block text-xs font-medium text-[#374151] mb-1.5">
                  Ad və Soyad
                </label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Məsələn: Əli Məmmədov"
                  className="w-full px-3.5 py-2.5 text-sm rounded-lg border border-[#D1D5DB] focus:outline-none focus:border-[#2563EB] focus:ring-2 focus:ring-[#2563EB]/15"
                />
              </div>
            )}

            <div>
              <label className="block text-xs font-medium text-[#374151] mb-1.5">
                Gmail Ünvanı
              </label>
              <input
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="adiniz@gmail.com"
                className="w-full px-3.5 py-2.5 text-sm rounded-lg border border-[#D1D5DB] focus:outline-none focus:border-[#2563EB] focus:ring-2 focus:ring-[#2563EB]/15"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-[#374151] mb-1.5">
                Şifrə
              </label>
              <input
                type="password"
                required
                minLength={6}
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Ən azı 6 simvol"
                className="w-full px-3.5 py-2.5 text-sm rounded-lg border border-[#D1D5DB] focus:outline-none focus:border-[#2563EB] focus:ring-2 focus:ring-[#2563EB]/15"
              />
            </div>

            <label className="flex items-center gap-2 text-xs text-[#374151] cursor-pointer">
              <input
                type="checkbox"
                checked={rememberGmail}
                onChange={(e) => setRememberGmail(e.target.checked)}
                className="rounded border-[#D1D5DB] text-[#2563EB]"
              />
              <span>Hər girişdə Gmail ünvanımı yadda saxla</span>
            </label>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 px-4 text-sm font-semibold text-white bg-[#2563EB] hover:bg-[#1D4ED8] disabled:opacity-60 rounded-lg transition-colors cursor-pointer"
            >
              {loading
                ? 'Yoxlanılır...'
                : mode === 'login'
                ? 'Gmail ilə Daxil ol'
                : 'Hesabı Yarat və Daxil ol'}
            </button>
          </form>

          <div className="pt-2 border-t border-[#F3F4F6] flex items-center gap-2 text-xs text-[#6B7280]">
            <CheckCircle2 className="w-4 h-4 text-[#16A34A] shrink-0" />
            <span>Sessiyanız və seçdiyiniz Gmail yadda saxlanılır, şifrələr serverdə qorunur.</span>
          </div>
        </div>
      </div>
    </div>
  );
}
