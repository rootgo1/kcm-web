import type { InventoryStore, RentalActionName, RentalRequestResult, RentalRow, StockRow } from '../lib/inventory';

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
  adjust: (modelId: string, quantity: number) => request<StockRow>('/stock/adjust', post({ model_id: modelId, quantity })),
  /** Ask nearby stores (DB mode: n8n picks by distance; can take ~10 s). Memory mode returns just the rental. */
  requestRental: async (modelId: string, quantity: number, radiusKm?: number): Promise<RentalRequestResult> => {
    const body = await request<RentalRequestResult | RentalRow>('/rentals', post({ model_id: modelId, quantity, ...(radiusKm ? { radius_km: radiusKm } : {}) }));
    return 'rental' in body ? body : { rental: body, applied_radius_km: null, candidates: [] };
  },
  /** approve / cancel / ship / deliver / return, acting as `storeId` (our store). */
  rentalAction: (rentalId: string, action: RentalActionName, storeId: string) =>
    request<RentalRow>(`/rentals/${encodeURIComponent(rentalId)}/${action}`, post({ store_id: storeId })),
};

function post(body: unknown): RequestInit {
  return { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
}
