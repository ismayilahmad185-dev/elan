let memoryToken: string | null = null;
let memoryModToken: string | null = null;
let memoryAdminToken: string | null = null;
let onModerationBlock: ((info: { code: 'USER_KICKED' | 'USER_BANNED'; message: string; until?: string | null }) => void) | null = null;

export function setAuthToken(token: string | null) {
  memoryToken = token;
}

export function getAuthToken(): string | null {
  return memoryToken;
}

export function setModToken(token: string | null) {
  memoryModToken = token;
}

export function getModToken(): string | null {
  return memoryModToken;
}

export function setAdminToken(token: string | null) {
  memoryAdminToken = token;
}

export function getAdminToken(): string | null {
  return memoryAdminToken;
}

export function registerModerationHandler(
  handler: (info: { code: 'USER_KICKED' | 'USER_BANNED'; message: string; until?: string | null }) => void
) {
  onModerationBlock = handler;
}

export class ApiError extends Error {
  status: number;
  code?: string;
  until?: string | null;

  constructor(message: string, status: number, code?: string, until?: string | null) {
    super(message);
    this.status = status;
    this.code = code;
    this.until = until;
  }
}

export async function apiFetch<T>(url: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers || {});
  headers.set('X-Requested-With', 'XMLHttpRequest');
  if (options.body && !(options.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  if (memoryToken && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${memoryToken}`);
  }
  if (memoryModToken && !headers.has('X-Mod-Token')) {
    headers.set('X-Mod-Token', memoryModToken);
  }
  if (memoryAdminToken && !headers.has('X-Admin-Token')) {
    headers.set('X-Admin-Token', memoryAdminToken);
  }

  const res = await fetch(url, {
    ...options,
    headers,
    credentials: 'include',
  });

  const data = await res.json().catch(() => ({})) as Record<string, unknown>;

  if (!res.ok) {
    const code = typeof data.code === 'string' ? data.code : undefined;
    const message = typeof data.error === 'string' ? data.error : 'Sorğu zamanı xəta baş verdi.';
    const until = typeof data.until === 'string' || data.until === null ? (data.until as string | null) : undefined;

    if ((code === 'USER_KICKED' || code === 'USER_BANNED') && onModerationBlock) {
      setAuthToken(null);
      onModerationBlock({ code, message, until });
    }

    throw new ApiError(message, res.status, code, until);
  }

  return data as T;
}

export function formatPriceAzn(price: number): string {
  return `${new Intl.NumberFormat('az-AZ').format(price)} ₼`;
}

export function formatRelativeAz(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'İndicə';
  if (mins < 60) return `${mins} dəq əvvəl`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} saat əvvəl`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} gün əvvəl`;
  return new Date(iso).toLocaleDateString('az-AZ', { day: '2-digit', month: 'short', year: 'numeric' });
}
