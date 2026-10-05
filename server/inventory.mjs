/**
 * Smart inventory API, backed by the n8n DB webhook `kcm-inventory-db` (the old in-memory demo store was removed).
 * Without N8N_INVENTORY_BASE_URL every /api/inventory route answers 503 INVENTORY_NOT_CONFIGURED.
 * The backend never connects to the DB; every read/write goes through n8n (project doc KCM스마트재고.md §3).
 * Naming: DB `inventories` = per-store stock counts (actions *_INVENTORY); DB `stocks` = rentals (actions *_RENTAL).
 * Wired: GET /stores, GET /stock, POST /stock/adjust, GET /rentals, POST /rentals, POST /rentals/:id/(approve|cancel|ship|deliver|return). Other inventory routes answer 501 in DB mode until they are connected.
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

  /**
   * @param {string} action @param {Record<string, unknown>} [fields]
   * @param {{ timeoutMs?: number }} [options] per-call override (CREATE_RENTAL geocodes every candidate store and is slow)
   * @returns {Promise<DbResult>}
   */
  async function call(action, fields = {}, options = {}) {
    if (!valid || !url) { report(`[n8n] inventory db skipped: ${action} (N8N_INVENTORY_BASE_URL_INVALID)`); return unavailable; }
    const controller = new AbortController();
    controllers.add(controller);
    let failure = 'NETWORK_ERROR';
    try {
      const response = await fetchImpl(url.href, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, ...fields }), redirect: 'manual',
        signal: AbortSignal.any([controller.signal, AbortSignal.timeout(options.timeoutMs ?? timeoutMs)]),
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

export const RENTAL_STATUS_PATH = '/kcm-rental-status';
export const INVENTORY_CHANGED_PATH = '/kcm-inventory-changed';

/**
 * Fire-and-forget notifications to the n8n alert webhooks (contract §4): rental status and low stock.
 * One attempt, no retry, 10 s; failures never affect the API response. Only the event and a fixed code are logged
 * (never phone numbers, the URL or the response body). Payloads without recipients are skipped.
 * @param {{ baseUrl: string, fetchImpl?: typeof fetch, log?: (line: string) => void, timeoutMs?: number }} options
 */
export function createInventoryNotifier({ baseUrl, fetchImpl = fetch, log = console.log, timeoutMs = 10_000 }) {
  const controllers = new Set();
  const report = (/** @type {string} */ message) => { try { log(message); } catch { /* logging must not affect the API */ } };
  let valid = false;
  try { const url = new URL(baseUrl + RENTAL_STATUS_PATH); valid = url.protocol === 'https:' && !url.username && !url.password && !url.search && !url.hash; } catch { valid = false; }
  /** @param {string} path @param {Record<string, unknown>} payload */
  async function send(path, payload) {
    const event = String(payload.event);
    if (!valid) { report(`[n8n] inventory notify skipped: ${event} (N8N_INVENTORY_BASE_URL_INVALID)`); return; }
    if (!Array.isArray(payload.recipients) || payload.recipients.length === 0) { report(`[n8n] inventory notify skipped: ${event} (NO_RECIPIENTS)`); return; }
    const controller = new AbortController();
    controllers.add(controller);
    let failure = 'NETWORK_ERROR';
    try {
      const response = await fetchImpl(baseUrl + path, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload), redirect: 'manual',
        signal: AbortSignal.any([controller.signal, AbortSignal.timeout(timeoutMs)]),
      });
      void response.body?.cancel().catch(() => {});
      if (!response.ok) { failure = `HTTP_${response.status}`; throw new Error(failure); }
      report(`[n8n] inventory notify delivered: ${event}`);
    } catch (error) {
      if (controller.signal.aborted) failure = 'SERVER_STOPPED';
      else if (error instanceof Error && error.name === 'TimeoutError') failure = 'TIMEOUT';
      report(`[n8n] inventory notify failed: ${event} (${failure})`);
    } finally { controllers.delete(controller); }
  }
  return {
    /** @param {Record<string, unknown>} payload */
    rentalStatus: payload => send(RENTAL_STATUS_PATH, payload),
    /** @param {Record<string, unknown>} payload */
    inventoryChanged: payload => send(INVENTORY_CHANGED_PATH, payload),
    close() { for (const controller of controllers) controller.abort(); },
  };
}

/** Used when N8N_INVENTORY_BASE_URL is not set: inventory routes answer 503 instead of pretending to work. */
export const inventoryNotConfiguredApi = {
  /** @param {string} _method @param {string} path @returns {Promise<{ status: number, body: unknown } | null>} */
  async handle(_method, path) {
    return path.startsWith('/api/inventory') ? { status: 503, body: { error_message: 'INVENTORY_NOT_CONFIGURED' } } : null;
  },
};

/** Team rule: alert when only 1 unit (or none) is available. */
export const DB_LOW_STOCK_THRESHOLD = 1;

/** n8n/contract error code → HTTP status for the browser. Unknown codes are treated as upstream failures. */
const httpStatus = /** @type {Record<string, number>} */ ({
  RENTAL_NOT_FOUND: 404, INVENTORY_NOT_FOUND: 404, STORE_NOT_FOUND: 404, MODEL_NOT_FOUND: 404,
  STORE_NOT_ALLOWED: 403,
  SAME_STORE: 409, INVALID_RENTAL_STATUS: 409, OUT_OF_STOCK: 409, NO_LENDER_AVAILABLE: 409,
  INVALID_QUANTITY: 400, INVALID_RADIUS: 400,
  NOT_IMPLEMENTED: 501,
  HOME_STORE_NOT_CONFIGURED: 503,
});

const dbStoreId = /^store_\d{3,}$/;
const dbProductId = /^product_\d{3,}$/;
const pendingPost = new Set(['/api/inventory/reset']);
/** CREATE_RENTAL: n8n geocodes the requester and every candidate store (Kakao), then inserts; measured ~7 s without the insert. */
export const CREATE_RENTAL_TIMEOUT_MS = 25_000;

/**
 * DB `stocks.delivery_status` + `return_status` → API status (contract §3.4). There is no `rejected` in DB mode.
 * DB rule `stocks_check2`: `return_status` only has a value once delivered (`배송 완료`).
 * @param {unknown} deliveryStatus @param {unknown} returnStatus
 */
export function rentalStatus(deliveryStatus, returnStatus) {
  if (deliveryStatus === '배송 완료' && returnStatus === '반납 완료') return 'returned';
  if (deliveryStatus === '배송 완료' && returnStatus === '반납 중') return 'returning';
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
const rentalActionPath = /^\/api\/inventory\/rentals\/(stock_\d{3,})\/(approve|cancel|ship|deliver|return)$/;

/**
 * Status changes on one rental (contract §3.10–3.12). `actor` is who may do it; the SQL in n8n is the final check.
 * `notify` names the kcm-rental-status event (sent later; logged for now). Cancel and deliver send none.
 */
const rentalActions = /** @type {const} */ ({
  approve: { action: 'APPROVE_RENTAL', actor: 'lender', notify: 'RENTAL_APPROVED' },
  cancel: { action: 'CANCEL_RENTAL', actor: 'requester', notify: null },
  ship: { action: 'SHIP_RENTAL', actor: 'lender', notify: 'RENTAL_SHIPPED' },
  deliver: { action: 'DELIVER_RENTAL', actor: 'requester', notify: null },
  return: { action: 'RETURN_RENTAL', actor: 'lender', notify: 'RENTAL_RETURNED' },
});

/**
 * REST routes under /api/inventory in DB mode. Responses keep the in-memory API's field names
 * (store_id, model_id, quantity, ...) so the screen works with either mode; DB-only fields are added alongside.
 * `quantity` is the available count (stock − reserved − transfer). Employee phone numbers never go to the browser.
 * @param {{ db: ReturnType<typeof createInventoryDb>, homeStoreId?: string | null, log?: (line: string) => void,
 *   notify?: Pick<ReturnType<typeof createInventoryNotifier>, 'rentalStatus' | 'inventoryChanged'> | null }} options
 */
export function createDbInventoryApi({ db, homeStoreId = null, log = console.log, notify = null }) {
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
  /** Candidate stores for the browser: no employee names or phone numbers (those are only for notifications). */
  const candidateRow = (/** @type {any} */ row) => ({
    store_id: row.storeId, store_name: row.storeName, distance_km: row.distanceKm ?? null, available: row.available ?? null,
  });
  /** Placeholder until the kcm-inventory-changed webhook is wired: log only when the count newly crosses the threshold. */
  /** A recipient for n8n (name + phone), or null when there is no phone to send to. */
  const person = (/** @type {any} */ p) => p && typeof p.phone === 'string' && p.phone ? { name: typeof p.name === 'string' ? p.name : '', phone: p.phone } : null;
  /** Low stock alert (kcm-inventory-changed) only when the available count newly crosses the threshold (no repeats). */
  const lowStock = (/** @type {any} */ row) => {
    const before = Number(row.availableBefore), after = Number(row.available);
    if (!Number.isFinite(before) || !Number.isFinite(after)) return;
    if (!(before > DB_LOW_STOCK_THRESHOLD && after <= DB_LOW_STOCK_THRESHOLD)) return;
    report(`[inventory] low stock: ${row.storeId} ${row.productId} available=${after}`);
    const recipient = person(row.manager);
    void notify?.inventoryChanged({
      event: 'INVENTORY_CHANGED', storeName: row.storeName, productName: row.productName, storageGb: row.storageGb ?? undefined, color: row.color ?? undefined,
      stockQuantity: row.stockQty, reservedQuantity: row.reservedQty, transferQuantity: row.transferQty, threshold: DB_LOW_STOCK_THRESHOLD,
      recipients: recipient ? [recipient] : [],
    });
  };
  /** Rental status alert (kcm-rental-status). */
  const rentalNotice = (/** @type {string} */ event, /** @type {any} */ rental, /** @type {{ name: string, phone: string }[]} */ recipients) => {
    if (!notify) { report(`[inventory] ${event} not sent (notifier not configured): ${rental.rentalId}`); return; }
    void notify.rentalStatus({
      event, rentalId: rental.rentalId, productName: rental.productName, quantity: rental.quantity,
      ...(rental.provideStoreName ? { fromStore: rental.provideStoreName } : {}), toStore: rental.requestStoreName, recipients,
    });
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
      if (path === '/api/inventory/rentals') {
        // Home store asks nearby stores at once (n8n picks candidates by distance); the first to approve takes it.
        if (!homeStoreId) return fail('HOME_STORE_NOT_CONFIGURED');
        if (typeof body.model_id !== 'string' || !dbProductId.test(body.model_id)) return fail('MODEL_NOT_FOUND');
        if (!Number.isInteger(body.quantity) || body.quantity < 1 || body.quantity > 99) return fail('INVALID_QUANTITY');
        const radius = body.radius_km;
        if (radius !== undefined && !(typeof radius === 'number' && Number.isFinite(radius) && radius > 0 && radius <= 50)) return fail('INVALID_RADIUS');
        const result = await db.call('CREATE_RENTAL',
          { requestStoreId: homeStoreId, productId: body.model_id, quantity: body.quantity, ...(radius === undefined ? {} : { radiusKm: radius }) },
          { timeoutMs: CREATE_RENTAL_TIMEOUT_MS });
        if (!result.ok) return fail(result.code);
        const data = /** @type {any} */ (result.data);
        const rental = Array.isArray(data?.rental) ? data.rental[0] : data?.rental;
        if (!rental || typeof rental.rentalId !== 'string') return fail('DB_UNAVAILABLE');
        const candidates = Array.isArray(data.candidates) ? data.candidates.filter((/** @type {any} */ c) => c && typeof c.storeId === 'string') : [];
        // Every candidate store's manager, with store name and distance for the message.
        rentalNotice('RENTAL_REQUESTED', rental, candidates.flatMap((/** @type {any} */ c) => {
          const p = person(c.manager);
          return p ? [{ ...p, storeName: c.storeName, ...(typeof c.distanceKm === 'number' ? { distanceKm: c.distanceKm } : {}) }] : [];
        }));
        return { status: 200, body: {
          rental: { ...rentalRow(rental), role: 'sent' },
          applied_radius_km: data.appliedRadiusKm ?? null,
          candidates: candidates.map(candidateRow),
        } };
      }
      const match = rentalActionPath.exec(path);
      if (match) {
        const [, rentalId, name] = match;
        const spec = rentalActions[/** @type {keyof typeof rentalActions} */ (name)];
        // No login yet: the acting store comes from the body (default: home store) — demo trust. n8n checks it is the right party.
        const storeId = body.store_id ?? homeStoreId;
        if (!storeId) return fail('HOME_STORE_NOT_CONFIGURED');
        if (typeof storeId !== 'string' || !dbStoreId.test(storeId)) return fail('STORE_NOT_FOUND');
        const result = singleRow(await db.call(spec.action, { rentalId, storeId }));
        if (!result.ok) return fail(result.code);
        const rental = /** @type {any} */ (result.data);
        if (typeof rental.rentalId !== 'string') return fail('DB_UNAVAILABLE');
        // Approve/ship/return go to the requesting store (contract §4.1).
        if (spec.notify) { const p = person(rental.requester); rentalNotice(spec.notify, rental, p ? [p] : []); }
        if (name === 'approve') {
          // Approval moved units into transfer_qty at the lender: before = after + quantity.
          const after = rental.provideInventory?.available;
          const inv = rental.provideInventory;
          if (typeof after === 'number') lowStock({ storeId, productId: rental.productId, storeName: rental.provideStoreName, productName: rental.productName,
            storageGb: rental.storageGb, color: rental.color, stockQty: inv.stockQty, reservedQty: inv.reservedQty, transferQty: inv.transferQty,
            availableBefore: after + Number(rental.quantity), available: after, manager: rental.approver });
        }
        const row = rentalRow(rental);
        // A cancelled request no longer exists in the DB; the response is its last state.
        return { status: 200, body: { ...row, role: storeId === rental.requestStoreId ? 'sent' : 'lending', ...(name === 'cancel' ? { status: 'cancelled' } : {}) } };
      }
      if (pendingPost.has(path)) return fail('NOT_IMPLEMENTED');
      return { status: 404, body: { error_message: 'NOT_FOUND' } };
    },
  };
}
