import { AlertCircle, Flame, KeyRound, Mail, X } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { apiFetch, ApiError, setAdminToken, setModToken } from '../lib/api.ts';
import type { PanelActorInfo } from '../types.ts';

interface ModeratorAccessModalProps {
  isOpen: boolean;
  onClose: () => void;
  onUnlocked: (payload: { actor?: PanelActorInfo; hasPairedAdmin?: boolean }) => void;
  onOpenGmailAuth?: () => void;
}

export function ModeratorAccessModal({
  isOpen,
  onClose,
  onUnlocked,
  onOpenGmailAuth,
}: ModeratorAccessModalProps) {
  const [passcode, setPasscode] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setPasscode('');
    setError('');
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    if (!passcode.trim()) {
      setError('Moderator parolunu daxil edin.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await apiFetch<{
        ok: boolean;
        modToken: string;
        adminToken?: string;
        actor?: PanelActorInfo;
      }>('/api/moderator/auth/unlock', {
        method: 'POST',
        body: JSON.stringify({ passcode }),
      });
      setModToken(res.modToken);
      if (res.adminToken) {
        setAdminToken(res.adminToken);
      }
      setPasscode('');
      onUnlocked({ actor: res.actor, hasPairedAdmin: Boolean(res.adminToken) });
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Moderator parolu yanlışdır.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-[3px]">
      <div className="w-full max-w-md bg-[#0E131F] text-white rounded-2xl border border-[#7F1D1D] shadow-2xl overflow-hidden">
        <div className="px-6 py-4 bg-[#3B0A0A] border-b border-[#7F1D1D] flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-[#DC2626]/20 border border-[#F87171]/30 flex items-center justify-center">
              <Flame className="w-4 h-4 text-[#F87171]" />
            </div>
            <div>
              <h2 className="text-base font-bold leading-tight">Moderator Panel Girişi</h2>
              <p className="text-[11px] text-[#FCA5A5]">Yüksək səlahiyyətli təhlükəsizlik mərkəzi</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Bağla"
            className="p-1.5 rounded-lg text-[#FCA5A5] hover:text-white hover:bg-white/10 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          <div className="p-3.5 rounded-xl bg-[#070B14] border border-[#1F2937] flex items-start gap-3">
            <KeyRound className="w-5 h-5 text-[#F87171] shrink-0 mt-0.5" />
            <p className="text-xs text-[#CBD5E1] leading-relaxed">
              Əsas moderator parolu, <strong>Rəşidin</strong> şəxsi parolu və ya icazə verilmiş operator parolu ilə giriş edin. İcazəli Gmail-iniz varsa birbaşa daxil olun.
            </p>
          </div>

          {error && (
            <div className="p-3 rounded-lg bg-[#450A0A] border border-[#991B1B] flex items-start gap-2.5 text-sm text-[#FECACA]">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-[#F87171]" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-[#CBD5E1] mb-1.5">
                Moderator / Şəxsi Parol
              </label>
              <input
                type="password"
                required
                autoFocus
                value={passcode}
                onChange={(e) => setPasscode(e.target.value)}
                placeholder="Parolu daxil edin..."
                className="w-full px-3.5 py-2.5 text-sm rounded-lg bg-[#070B14] border border-[#334155] text-white placeholder-[#64748B] focus:outline-none focus:border-[#DC2626]"
              />
            </div>

            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-xs font-medium text-[#CBD5E1] hover:bg-[#1E293B] rounded-lg cursor-pointer"
              >
                Ləğv et
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="px-5 py-2.5 bg-[#DC2626] hover:bg-[#B91C1C] disabled:opacity-60 text-white text-xs font-bold rounded-lg cursor-pointer"
              >
                {submitting ? 'Yoxlanılır...' : 'Moderator Paneli Aç'}
              </button>
            </div>
          </form>

          {onOpenGmailAuth && (
            <div className="pt-3 border-t border-[#1F2937] flex items-center justify-between gap-2">
              <span className="text-[11px] text-[#94A3B8]">
                İcazəli Gmail hesabınız var?
              </span>
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenGmailAuth();
                }}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#FCA5A5] hover:text-white cursor-pointer"
              >
                <Mail className="w-3.5 h-3.5" />
                Gmail ilə Daxil Ol
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
