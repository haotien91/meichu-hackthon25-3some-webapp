// Client-side storage helpers with safe JSON and simple throttling

export function isBrowser(): boolean {
  return typeof window !== "undefined" && typeof localStorage !== "undefined";
}

export function safeGet<T>(key: string, fallback: T | null = null): T | null {
  if (!isBrowser()) return fallback;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function safeSet<T>(key: string, value: T): void {
  if (!isBrowser()) return;
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // ignore quota/serialization errors
  }
}

export function safeRemove(key: string): void {
  if (!isBrowser()) return;
  try { localStorage.removeItem(key); } catch {}
}

export function throttle<F extends (...args: any[]) => void>(fn: F, wait = 800): F {
  let last = 0;
  let timeout: any = null;
  let lastArgs: any[] | null = null;
  const later = () => {
    last = Date.now();
    timeout = null;
    if (lastArgs) {
      fn(...lastArgs);
      lastArgs = null;
    }
  };
  return ((...args: any[]) => {
    const now = Date.now();
    const remaining = wait - (now - last);
    lastArgs = args;
    if (remaining <= 0 || remaining > wait) {
      if (timeout) { clearTimeout(timeout); timeout = null; }
      last = now;
      fn(...args);
      lastArgs = null;
    } else if (!timeout) {
      timeout = setTimeout(later, remaining);
    }
  }) as F;
}

