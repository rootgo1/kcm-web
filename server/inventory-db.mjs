/**
 * Smart inventory backed by the n8n DB webhook `kcm-inventory-db`.
 * The backend never connects to the DB; every read/write goes through n8n (project doc KCM스마트재고.md §3).
 * Naming: DB `inventories` = per-store stock counts (actions *_INVENTORY); DB `stocks` = rentals (actions *_RENTAL).
 * Wired so far: GET /stores, GET /stock, POST /stock/adjust, GET /rentals. Other inventory routes answer 501 in DB mode until they are connected.
 */

export const INVENTORY_DB_PATH = '/kcm-inventory-db';

/** Server-only configuration. An empty base URL keeps the in-memory demo store. */
export function inventoryDbConfig(/** @type {NodeJS.ProcessEnv} */ env = process.env) {
  return { inventoryBaseUrl: (env.N8N_INVENTORY_BASE_URL?.trim() ?? '').replace(/\/+$/, '') };
}

/** @typedef {{ ok: true, data: unknown } | { ok: false, code: string }} DbResult */

/**
 * Calls n8n with `{ action, ...fields }` and expects `{ ok: true, data }` or `{ ok: false, code }`.
 * One attempt, no retry. Network errors, timeouts, non-2xx and malformed bodies all become DB_UNAVAILABLE;
 * only a fixed code is logged (never the URL or response body).
 * @param {{ baseUrl: string, fetchImpl?: typeof fetch, log?: (line: string) => void, timeoutMs?: number }} options
 */
export function createInventoryDb({ baseUrl, fetchImpl = fetch, log = console.log, timeoutMs = 10_000 }) {
  /** @type {URL | null} */
  let url = null;
  try { url = new URL(baseUrl + INVENTORY_DB_PATH); } catch { url = null; }
  const valid = Boolean(url && url.protocol === 'https:' && !url.username && !url.password && !url.search && !url.hash);
  const controllers = new Set();
  const report = (/** @type {string} */ message) => { try { log(message); } catch { /* logging must not affect the API */ } };
  /** @type {DbResult} */
  const unavailable = { ok: false, code: 'DB_UNAVAILABLE' };

  /** @param {string} action @param {Record<string, unknown>} [fields] @returns {Promise<DbResult>} */
  async function call(action, fields = {}) {
    if (!valid || !url) { report(`[n8n] inventory db skipped: ${action} (N8N_INVENTORY_BASE_URL_INVALID)`); return unavailable; }
    const controller = new AbortController();
    controllers.add(controller);
    let failure = 'NETWORK_ERROR';
    try {
      const response = await fetchImpl(url.href, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, ...fields }), redirect: 'manual',
        signal: AbortSignal.any([controller.signal, AbortSignal.timeout(timeoutMs)]),
      });
      if (!response.ok) { failure = `HTTP_${response.status}`; void response.body?.cancel().catch(() => {}); throw new Error(failure); }
      /** @type {any} */
      let body;
      try { body = JSON.parse(await response.text()); } catch { failure = 'INVALID_RESPONSE'; throw new Error(failure); }
      if (body && body.ok === true && 'data' in body) return { ok: true, data: body.data };
      if (body && body.ok === false && typeof body.code === 'string' && /^[A-Z_]{1,64}$/.test(body.code)) return { ok: false, code: body.code };
      failure = 'INVALID_RESPONSE';
      throw new Error(failure);
    } catch (error) {
      if (controller.signal.aborted) failure = 'SERVER_STOPPED';
      else if (error instanceof Error && error.name === 'TimeoutError') failure = 'TIMEOUT';
      report(`[n8n] inventory db failed: ${action} (${failure})`);
      return unavailable;
    } finally { controllers.delete(controller); }
  }

  return {
    call,
    close() { for (const controller of controllers) controller.abort(); },
  };
}

/** Team rule: alert when only 1 unit (or none) is available. */
export const DB_LOW_STOCK_THRESHOLD = 1;

/** n8n/contract error code → HTTP status for the browser. Unknown codes are treated as upstream failures. */
const httpStatus = /** @type {Record<string, number>} */ ({
  RENTAL_NOT_FOUND: 404, INVENTORY_NOT_FOUND: 404, STORE_NOT_FOUND: 404, MODEL_NOT_FOUND: 404,
  STORE_NOT_ALLOWED: 403,
  SAME_STORE: 409, INVALID_RENTAL_STATUS: 409, OUT_OF_STOCK: 409, NO_LENDER_AVAILABLE: 409,
  INVALID_QUANTITY: 400,
  NOT_IMPLEMENTED: 501,
  HOME_STORE_NOT_CONFIGURED: 503,
});

const dbStoreId = /^store_\d{3,}$/;
const dbProductId = /^product_\d{3,}$/;
const pendingPost = new Set(['/api/inventory/rentals', '/api/inventory/reset']);

/**
 * DB `stocks.delivery_status` + `return_status` → API status (contract §3.4). There is no `rejected` in DB mode.
 * @param {unknown} deliveryStatus @param {unknown} returnStatus
 */
export function rentalStatus(deliveryStatus, returnStatus) {
  if (deliveryStatus === '배송 완료' && returnStatus === '반납 완료') return 'returned';
  if (deliveryStatus === '요청 중') return 'requested';
  if (deliveryStatus === '요청 승인') return 'approved';
  if (deliveryStatus === '배송 중') return 'shipping';
  if (deliveryStatus === '배송 완료') return 'delivered';
  return 'unknown';
}

/**
 * Single-row actions (ADJUST_INVENTORY, later the rental changes) report their result in a `code` column.
 * Accept both `{ ok:false, code }` and `{ ok:true, data: row | [row] }` with `row.code !== 'OK'`.
 * @param {DbResult} result @returns {DbResult}
 */
function singleRow(result) {
  if (!result.ok) return result;
  const row = Array.isArray(result.data) ? result.data[0] : result.data;
  if (!row || typeof row !== 'object') return { ok: false, code: 'DB_UNAVAILABLE' };
  const code = /** @type {any} */ (row).code;
  if (code !== undefined && code !== 'OK') return { ok: false, code: typeof code === 'string' && /^[A-Z_]{1,64}$/.test(code) ? code : 'DB_UNAVAILABLE' };
  return { ok: true, data: row };
}
const pendingRentalAction = /^\/api\/inventory\/rentals\/(stock_\d{3,})\/(approve|cancel|ship|deliver|return)$/;

/**
 * REST routes under /api/inventory in DB mode. Responses keep the in-memory API's field names
 * (store_id, model_id, quantity, ...) so the screen works with either mode; DB-only fields are added alongside.
 * `quantity` is the available count (stock − reserved − transfer). Employee phone numbers never go to the browser.
 * @param {{ db: ReturnType<typeof createInventoryDb>, homeStoreId?: string | null, log?: (line: string) => void }} options
 */
export function createDbInventoryApi({ db, homeStoreId = null, log = console.log }) {
  const report = (/** @type {string} */ message) => { try { log(message); } catch { /* logging must not affect the API */ } };
  const fail = (/** @type {string} */ code) => ({ status: httpStatus[code] ?? 502, body: { error_message: code } });
  /** @param {DbResult} result @param {(row: any) => unknown} map @param {string} key */
  const rows = (result, map, key) => {
    if (!result.ok) return fail(result.code);
    if (!Array.isArray(result.data)) return fail('DB_UNAVAILABLE');
    // n8n can emit an empty item when a query returns nothing; keep only real rows.
    return { status: 200, body: result.data.filter(row => row && typeof row[key] === 'string').map(map) };
  };
  const storeRow = (/** @type {any} */ row) => ({
    id: row.storeId, name: row.storeName, is_home: row.storeId === homeStoreId, address: row.address ?? null, phone: row.phone ?? null,
  });
  const variant = (/** @type {any} */ row) => [row.storageGb ? `${row.storageGb}GB` : '', row.color ?? ''].filter(Boolean).join(' · ');
  const stockRow = (/** @type {any} */ row) => ({
    store_id: row.storeId, store_name: row.storeName, is_home: row.storeId === homeStoreId,
    model_id: row.productId, model_name: row.productName,
    variant: variant(row),
    quantity: row.available,
    maker: row.maker ?? null, price: row.price ?? null,
    stock_qty: row.stockQty, reserved_qty: row.reservedQty, transfer_qty: row.transferQty, available: row.available,
  });
  const rentalRow = (/** @type {any} */ row) => ({
    rental_id: row.rentalId, model_id: row.productId, model_name: row.productName, variant: variant(row), quantity: row.quantity,
    from_store_id: row.provideStoreId ?? null, from_store_name: row.provideStoreName ?? null,
    to_store_id: row.requestStoreId, to_store_name: row.requestStoreName,
    status: rentalStatus(row.deliveryStatus, row.returnStatus),
    // sent = we asked, lending = we lent, incoming = an open request we could approve
    role: typeof row.role === 'string' ? row.role.toLowerCase() : null,
    requested_at: row.requestedAt ?? null, returned_at: row.returnedAt ?? null,
    requester_name: row.requester?.name ?? null, approver_name: row.approver?.name ?? null,
    delivery_status: row.deliveryStatus ?? null, return_status: row.returnStatus ?? null,
  });
  /** Placeholder until the kcm-inventory-changed webhook is wired: log only when the count newly crosses the threshold. */
  const lowStock = (/** @type {any} */ row) => {
    const before = Number(row.availableBefore), after = Number(row.available);
    if (!(before > DB_LOW_STOCK_THRESHOLD && after <= DB_LOW_STOCK_THRESHOLD)) return;
    report(`[inventory] low stock (notification pending): ${row.storeId} ${row.productId} available=${after}`);
  };

  return {
    /**
     * @param {string} method @param {string} path @param {URLSearchParams} query @param {any} body
     * @returns {Promise<{ status: number, body: unknown } | null>}
     */
    async handle(method, path, query, body) {
      if (!path.startsWith('/api/inventory')) return null;
      if (method === 'GET') {
        if (path === '/api/inventory/stores') return rows(await db.call('GET_STORES'), storeRow, 'storeId');
        if (path === '/api/inventory/stock') {
          const storeId = query.get('store_id');
          if (storeId !== null && !dbStoreId.test(storeId)) return fail('STORE_NOT_FOUND');
          return rows(await db.call('GET_INVENTORY', { storeId: storeId ?? '' }), stockRow, 'storeId');
        }
        if (path === '/api/inventory/rentals') {
          const storeId = query.get('store_id') ?? homeStoreId;
          if (!storeId) return fail('HOME_STORE_NOT_CONFIGURED');
          if (!dbStoreId.test(storeId)) return fail('STORE_NOT_FOUND');
          return rows(await db.call('GET_RENTALS', { storeId }), rentalRow, 'rentalId');
        }
        return { status: 404, body: { error_message: 'NOT_FOUND' } };
      }
      if (method !== 'POST') return { status: 405, body: { error_message: 'METHOD_NOT_ALLOWED' } };
      if (typeof body !== 'object' || body === null || Array.isArray(body)) return { status: 400, body: { error_message: 'INVALID_REQUEST_BODY' } };
      if (path === '/api/inventory/stock/adjust') {
        // Manual count correction: only the home store's own stock (no login yet, demo trust).
        if (!homeStoreId) return fail('HOME_STORE_NOT_CONFIGURED');
        const storeId = body.store_id ?? homeStoreId;
        if (storeId !== homeStoreId) return fail(typeof storeId === 'string' && dbStoreId.test(storeId) ? 'STORE_NOT_ALLOWED' : 'STORE_NOT_FOUND');
        if (typeof body.model_id !== 'string' || !dbProductId.test(body.model_id)) return fail('MODEL_NOT_FOUND');
        if (!Number.isInteger(body.quantity) || body.quantity < 0 || body.quantity > 9999) return fail('INVALID_QUANTITY');
        const result = singleRow(await db.call('ADJUST_INVENTORY', { storeId, productId: body.model_id, stockQty: body.quantity }));
        if (!result.ok) return fail(result.code);
        lowStock(result.data);
        return { status: 200, body: stockRow(result.data) };
      }
      if (pendingPost.has(path) || pendingRentalAction.test(path)) return fail('NOT_IMPLEMENTED');
      return { status: 404, body: { error_message: 'NOT_FOUND' } };
    },
  };
}
