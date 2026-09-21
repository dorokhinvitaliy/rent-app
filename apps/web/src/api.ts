export async function api<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
  const res = await fetch('/api' + path, {
    method,
    headers: method === 'GET' ? {} : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) {
    if (res.status === 401 && !path.startsWith('/auth/'))
      window.dispatchEvent(new Event('auth-required'));
    let message = 'Не удалось выполнить запрос';
    try {
      message = (await res.json()).message || message;
    } catch {}
    throw new Error(Array.isArray(message) ? message.join(', ') : message);
  }
  return res.json();
}
export type Job = {
  id: string;
  url: string;
  status: string;
  message: string;
  count: number;
  added?: number;
  updated?: number;
  alreadySaved?: number;
  canOpenBrowser?: boolean;
  warnings: string[];
  listingIds?: string[];
  urls?: string[];
  search?: import('@rent/shared').CianSearch;
  scanned?: number;
  skipped?: number;
  createdAt: string;
};
