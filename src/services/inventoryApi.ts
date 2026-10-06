import { inventoryErrorCode, rentalStatusLabels, type InventoryStore, type RentalActionName, type RentalCandidate, type RentalRequestResult, type RentalRow, type StockRow } from '../lib/inventory.js';

/** Error carrying a documented code; unrecognized received details stay out of display errors. */
export class InventoryApiError extends Error {
  readonly code: string;
  constructor(code: unknown) {
    const safeCode = inventoryErrorCode(code);
    super(safeCode); this.code = safeCode; this.name = 'InventoryApiError';
  }
}

type ResponseCheck<T> = (value: unknown) => value is T;
const record = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const id = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0;
const text = (value: unknown): value is string => typeof value === 'string';
const count = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
const nullableText = (value: unknown) => value == null || text(value);
const optionalCount = (value: unknown) => value == null || count(value);
const nullableDistance = (value: unknown) => value === null || typeof value === 'number' && Number.isFinite(value) && value >= 0;
const listOf = <T>(check: ResponseCheck<T>): ResponseCheck<T[]> => (value): value is T[] => Array.isArray(value) && value.every(check);

const storeRow: ResponseCheck<InventoryStore> = (value): value is InventoryStore => record(value)
  && id(value.id) && nullableText(value.name) && typeof value.is_home === 'boolean';
const stockRow: ResponseCheck<StockRow> = (value): value is StockRow => record(value)
  && id(value.store_id) && nullableText(value.store_name) && typeof value.is_home === 'boolean'
  && id(value.model_id) && nullableText(value.model_name) && nullableText(value.variant) && count(value.quantity)
  && [value.stock_qty, value.reserved_qty, value.transfer_qty, value.available].every(optionalCount);
const rentalRow: ResponseCheck<RentalRow> = (value): value is RentalRow => record(value)
  && id(value.rental_id) && id(value.model_id) && nullableText(value.model_name) && count(value.quantity) && value.quantity > 0
  && (value.from_store_id == null || id(value.from_store_id)) && nullableText(value.from_store_name)
  && id(value.to_store_id) && nullableText(value.to_store_name) && typeof value.status === 'string' && Object.hasOwn(rentalStatusLabels, value.status)
  && nullableText(value.variant) && nullableText(value.requested_at);
const candidateRow: ResponseCheck<RentalCandidate> = (value): value is RentalCandidate => record(value)
  && id(value.store_id) && nullableText(value.store_name) && nullableDistance(value.distance_km)
  && (value.available === null || count(value.available));
const requestResult: ResponseCheck<RentalRequestResult | RentalRow> = (value): value is RentalRequestResult | RentalRow => rentalRow(value)
  || record(value) && rentalRow(value.rental) && nullableDistance(value.applied_radius_km) && listOf(candidateRow)(value.candidates);

async function request<T>(path: string, check: ResponseCheck<T>, init?: RequestInit): Promise<T> {
  let response: Response;
  try { response = await fetch(`/api/inventory${path}`, init); } catch { throw new InventoryApiError('NETWORK'); }
  let body: unknown;
  try { body = await response.json(); } catch { throw new InventoryApiError(response.ok ? 'INVALID_RESPONSE' : `HTTP_${response.status}`); }
  if (!response.ok) {
    const code = (body as { error_message?: unknown } | null)?.error_message;
    throw new InventoryApiError(typeof code === 'string' ? code : `HTTP_${response.status}`);
  }
  if (!check(body)) throw new InventoryApiError('INVALID_RESPONSE');
  return body;
}

/** Browser → backend (/api/inventory, proxied by Vite in dev). The backend talks to n8n; the browser never does. */
export const inventoryApi = {
  stores: () => request('/stores', listOf(storeRow)),
  stock: (storeId?: string) => request(`/stock${storeId ? `?store_id=${encodeURIComponent(storeId)}` : ''}`, listOf(stockRow)),
  rentals: () => request('/rentals', listOf(rentalRow)),
  adjust: (modelId: string, quantity: number) => request('/stock/adjust', stockRow, post({ model_id: modelId, quantity })),
  /** Ask nearby stores (DB mode: n8n picks by distance; can take ~10 s). Memory mode returns just the rental. */
  requestRental: async (modelId: string, quantity: number, radiusKm?: number): Promise<RentalRequestResult> => {
    const body = await request('/rentals', requestResult, post({ model_id: modelId, quantity, ...(radiusKm ? { radius_km: radiusKm } : {}) }));
    return 'rental' in body ? body : { rental: body, applied_radius_km: null, candidates: [] };
  },
  /** approve / cancel / ship / deliver / return, acting as `storeId` (our store). */
  rentalAction: (rentalId: string, action: RentalActionName, storeId: string) =>
    request(`/rentals/${encodeURIComponent(rentalId)}/${action}`, rentalRow, post({ store_id: storeId })),
};

function post(body: unknown): RequestInit {
  return { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
}
