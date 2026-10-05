import type { InventoryStore, RentalRow, StockRow } from '../lib/inventory';

/** Error carrying the backend's `error_message` code (or NETWORK / HTTP_xxx). */
export class InventoryApiError extends Error {
  constructor(readonly code: string) { super(code); this.name = 'InventoryApiError'; }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try { response = await fetch(`/api/inventory${path}`, init); } catch { throw new InventoryApiError('NETWORK'); }
  let body: unknown;
  try { body = await response.json(); } catch { throw new InventoryApiError(response.ok ? 'INVALID_RESPONSE' : `HTTP_${response.status}`); }
  if (!response.ok) {
    const code = (body as { error_message?: unknown } | null)?.error_message;
    throw new InventoryApiError(typeof code === 'string' ? code : `HTTP_${response.status}`);
  }
  return body as T;
}

/** Browser → backend (/api/inventory, proxied by Vite in dev). The backend talks to n8n; the browser never does. */
export const inventoryApi = {
  stores: () => request<InventoryStore[]>('/stores'),
  stock: (storeId?: string) => request<StockRow[]>(`/stock${storeId ? `?store_id=${encodeURIComponent(storeId)}` : ''}`),
  rentals: () => request<RentalRow[]>('/rentals'),
  adjust: (modelId: string, quantity: number) => request<StockRow>('/stock/adjust', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model_id: modelId, quantity }),
  }),
};
