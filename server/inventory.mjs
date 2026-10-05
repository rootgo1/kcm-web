/**
 * Smart inventory demo API. State lives in this server process only (no DB) and resets on restart.
 * Stores/models mirror the UI sample data. Rental status changes and LOW_STOCK are POSTed to n8n
 * when configured, for notifications only (n8n does not own the data).
 */

export const HOME_STORE_ID = 'DEMO-S001';

/** Virtual stores and stock only; not real store data. */
const seedStores = [
  { id: 'DEMO-S001', name: 'KT플라자 동성로점', is_home: true },
  { id: 'DEMO-S002', name: 'KCM 수성 데모점', is_home: false },
  { id: 'DEMO-S003', name: 'KCM 동성로 데모점', is_home: false },
  { id: 'DEMO-S004', name: 'KCM 성서 데모점', is_home: false },
  { id: 'DEMO-S005', name: 'KCM 구미 데모점', is_home: false },
];
const seedModels = [
  { id: 'DEMO-I001', name: 'Galaxy S 시리즈', variant: '256GB · 블랙' },
  { id: 'DEMO-I002', name: 'iPhone Pro', variant: '256GB · 내추럴' },
  { id: 'DEMO-I003', name: 'Galaxy Z 시리즈', variant: '256GB · 실버' },
];
/** @type {Record<string, Record<string, number>>} */
const seedStock = {
  'DEMO-S001': { 'DEMO-I001': 2, 'DEMO-I002': 0, 'DEMO-I003': 5 },
  'DEMO-S002': { 'DEMO-I001': 4, 'DEMO-I002': 3, 'DEMO-I003': 1 },
  'DEMO-S003': { 'DEMO-I001': 1, 'DEMO-I002': 0, 'DEMO-I003': 3 },
  'DEMO-S004': { 'DEMO-I001': 5, 'DEMO-I002': 2, 'DEMO-I003': 0 },
  'DEMO-S005': { 'DEMO-I001': 0, 'DEMO-I002': 1, 'DEMO-I003': 2 },
};

/** Team rule: alert when only 1 unit (or none) is left. */
export const LOW_STOCK_THRESHOLD = 1;

/** @typedef {'requested' | 'approved' | 'shipping' | 'delivered' | 'returned' | 'rejected'} RentalStatus */
/**
 * @typedef {{ rental_id: string, model_id: string, quantity: number, from_store_id: string, to_store_id: string,
 * status: RentalStatus, requested_at: string, updated_at: string,
 * history: { status: RentalStatus, at: string, store_id: string }[] }} Rental
 */
/** @typedef {Record<string, unknown>} InventoryEvent n8n notification payload (flat, camelCase). */
/** @typedef {{ ok: true, value: any, events?: InventoryEvent[] } | { ok: false, status: number, code: string }} Outcome */

/** n8n event name per status the rental moves into. */
const rentalEvents = /** @type {const} */ ({
  requested: 'RENTAL_REQUESTED', approved: 'RENTAL_APPROVED', rejected: 'RENTAL_REJECTED',
  shipping: 'RENTAL_SHIPPED', delivered: 'RENTAL_DELIVERED', returned: 'RENTAL_RETURNED',
});

const fail = (/** @type {number} */ status, /** @type {string} */ code) => /** @type {Outcome} */ ({ ok: false, status, code });

/** Server-only configuration. Separate from the call-result webhook. */
export function inventoryConfig(/** @type {NodeJS.ProcessEnv} */ env = process.env) {
  return { inventoryWebhookUrl: env.N8N_INVENTORY_WEBHOOK_URL?.trim() ?? '' };
}

/**
 * Single-process store: each operation runs synchronously, so a stock check and its change
 * can't interleave with another request (no double approval / overselling the last unit).
 * @param {{ now?: () => string }} [options]
 */
export function createInventoryStore({ now = () => new Date().toISOString() } = {}) {
  /** @type {Map<string, number>} */
  const stock = new Map();
  /** @type {Map<string, Rental>} */
  const rentals = new Map();
  let sequence = 0;
  const key = (/** @type {string} */ storeId, /** @type {string} */ modelId) => `${storeId}:${modelId}`;
  const store = (/** @type {unknown} */ id) => seedStores.find(item => item.id === id);
  const model = (/** @type {unknown} */ id) => seedModels.find(item => item.id === id);
  const quantityOf = (/** @type {string} */ storeId, /** @type {string} */ modelId) => stock.get(key(storeId, modelId)) ?? 0;
  const stockRow = (/** @type {string} */ storeId, /** @type {string} */ modelId) => {
    const s = /** @type {typeof seedStores[number]} */ (store(storeId)), m = /** @type {typeof seedModels[number]} */ (model(modelId));
    return { store_id: s.id, store_name: s.name, is_home: s.is_home, model_id: m.id, model_name: m.name, variant: m.variant, quantity: quantityOf(s.id, m.id) };
  };
  const view = (/** @type {Rental} */ rental) => ({
    ...rental, history: rental.history.map(entry => ({ ...entry })),
    model_name: model(rental.model_id)?.name ?? '', from_store_name: store(rental.from_store_id)?.name ?? '', to_store_name: store(rental.to_store_id)?.name ?? '',
  });
  const reset = () => {
    stock.clear(); rentals.clear(); sequence = 0;
    for (const [storeId, models] of Object.entries(seedStock)) for (const [modelId, quantity] of Object.entries(models)) stock.set(key(storeId, modelId), quantity);
  };
  reset();

  /** @param {Rental} rental @param {RentalStatus} status @param {string} at @returns {InventoryEvent} */
  const rentalEvent = (rental, status, at) => ({
    event: rentalEvents[/** @type {keyof typeof rentalEvents} */ (status)], rentalId: rental.rental_id,
    productName: model(rental.model_id)?.name ?? '', quantity: rental.quantity,
    fromStore: store(rental.from_store_id)?.name ?? '', toStore: store(rental.to_store_id)?.name ?? '',
    occurredAt: at,
  });
  /**
   * Sets a count and reports LOW_STOCK only when it newly crosses the threshold (no repeat alerts).
   * @param {string} storeId @param {string} modelId @param {number} quantity @returns {InventoryEvent[]}
   */
  const setStock = (storeId, modelId, quantity) => {
    const before = quantityOf(storeId, modelId);
    stock.set(key(storeId, modelId), quantity);
    if (before <= LOW_STOCK_THRESHOLD || quantity > LOW_STOCK_THRESHOLD) return [];
    return [{ event: 'LOW_STOCK', productName: model(modelId)?.name ?? '', store: store(storeId)?.name ?? '',
      quantity, threshold: LOW_STOCK_THRESHOLD, occurredAt: now() }];
  };

  /**
   * Shared rule for status changes: only the named party may act, and only from the expected status.
   * `apply` may block (return a failure) or return extra events such as LOW_STOCK.
   * @param {unknown} rentalId @param {unknown} actor @param {RentalStatus} from @param {RentalStatus} to
   * @param {'from_store_id' | 'to_store_id'} party @param {(rental: Rental) => Outcome | InventoryEvent[]} [apply]
   * @returns {Outcome}
   */
  const transition = (rentalId, actor, from, to, party, apply) => {
    const rental = typeof rentalId === 'string' ? rentals.get(rentalId) : undefined;
    if (!rental) return fail(404, 'RENTAL_NOT_FOUND');
    if (actor !== rental[party]) return fail(403, 'STORE_NOT_ALLOWED');
    if (rental.status !== from) return fail(409, 'INVALID_RENTAL_STATUS');
    const extra = apply?.(rental) ?? [];
    if (!Array.isArray(extra)) return extra;
    const at = now();
    rental.status = to; rental.updated_at = at;
    rental.history.push({ status: to, at, store_id: /** @type {string} */ (actor) });
    return { ok: true, value: view(rental), events: [rentalEvent(rental, to, at), ...extra] };
  };

  return {
    reset,
    stores: () => seedStores.map(item => ({ ...item })),
    /** @param {string | null} storeId */
    stock(storeId) {
      if (storeId !== null && !store(storeId)) return fail(404, 'STORE_NOT_FOUND');
      const rows = seedStores.filter(s => storeId === null || s.id === storeId).flatMap(s => seedModels.map(m => stockRow(s.id, m.id)));
      return /** @type {Outcome} */ ({ ok: true, value: rows });
    },
    /** Manual count correction; only the home store's own stock. */
    adjust(/** @type {unknown} */ storeId, /** @type {unknown} */ modelId, /** @type {unknown} */ quantity) {
      if (storeId !== HOME_STORE_ID) return store(storeId) ? fail(403, 'STORE_NOT_ALLOWED') : fail(404, 'STORE_NOT_FOUND');
      if (!model(modelId)) return fail(404, 'MODEL_NOT_FOUND');
      if (!Number.isInteger(quantity) || /** @type {number} */ (quantity) < 0 || /** @type {number} */ (quantity) > 9999) return fail(400, 'INVALID_QUANTITY');
      const events = setStock(HOME_STORE_ID, /** @type {string} */ (modelId), /** @type {number} */ (quantity));
      return /** @type {Outcome} */ ({ ok: true, value: stockRow(HOME_STORE_ID, /** @type {string} */ (modelId)), events });
    },
    /** Rentals the store sent or received, newest first. */
    rentals(/** @type {string} */ storeId) {
      if (!store(storeId)) return fail(404, 'STORE_NOT_FOUND');
      const rows = [...rentals.values()].filter(r => r.from_store_id === storeId || r.to_store_id === storeId).reverse().map(view);
      return /** @type {Outcome} */ ({ ok: true, value: rows });
    },
    /**
     * Home store borrows from another store. Without from_store_id, picks the store with the most units.
     * Stock is only checked here; it is deducted on approval.
     */
    request(/** @type {unknown} */ modelId, /** @type {unknown} */ quantity, /** @type {unknown} */ fromStoreId) {
      if (!model(modelId)) return fail(404, 'MODEL_NOT_FOUND');
      if (!Number.isInteger(quantity) || /** @type {number} */ (quantity) < 1 || /** @type {number} */ (quantity) > 99) return fail(400, 'INVALID_QUANTITY');
      const amount = /** @type {number} */ (quantity), modelKey = /** @type {string} */ (modelId);
      let lender = fromStoreId;
      if (lender === undefined || lender === null) {
        const candidates = seedStores.filter(s => !s.is_home && quantityOf(s.id, modelKey) >= amount);
        candidates.sort((a, b) => quantityOf(b.id, modelKey) - quantityOf(a.id, modelKey));
        if (!candidates.length) return fail(409, 'NO_LENDER_AVAILABLE');
        lender = candidates[0].id;
      }
      if (!store(lender)) return fail(404, 'STORE_NOT_FOUND');
      if (lender === HOME_STORE_ID) return fail(400, 'SAME_STORE');
      if (quantityOf(/** @type {string} */ (lender), modelKey) < amount) return fail(409, 'OUT_OF_STOCK');
      const at = now();
      /** @type {Rental} */
      const rental = { rental_id: `rental_${++sequence}`, model_id: modelKey, quantity: amount, from_store_id: /** @type {string} */ (lender), to_store_id: HOME_STORE_ID,
        status: 'requested', requested_at: at, updated_at: at, history: [{ status: 'requested', at, store_id: HOME_STORE_ID }] };
      rentals.set(rental.rental_id, rental);
      return /** @type {Outcome} */ ({ ok: true, value: view(rental), events: [rentalEvent(rental, 'requested', at)] });
    },
    /** Lender approves: stock leaves the lender at this point. */
    approve: (/** @type {unknown} */ id, /** @type {unknown} */ actor) => transition(id, actor, 'requested', 'approved', 'from_store_id', rental => {
      const available = quantityOf(rental.from_store_id, rental.model_id);
      if (available < rental.quantity) return fail(409, 'OUT_OF_STOCK');
      return setStock(rental.from_store_id, rental.model_id, available - rental.quantity);
    }),
    reject: (/** @type {unknown} */ id, /** @type {unknown} */ actor) => transition(id, actor, 'requested', 'rejected', 'from_store_id'),
    /** Lender sends the approved units. */
    ship: (/** @type {unknown} */ id, /** @type {unknown} */ actor) => transition(id, actor, 'approved', 'shipping', 'from_store_id'),
    /** Borrower confirms arrival. Borrowed units are not added to the borrower's own stock. */
    deliver: (/** @type {unknown} */ id, /** @type {unknown} */ actor) => transition(id, actor, 'shipping', 'delivered', 'to_store_id'),
    /** Lender confirms the units came back; stock is restored. */
    complete: (/** @type {unknown} */ id, /** @type {unknown} */ actor) => transition(id, actor, 'delivered', 'returned', 'from_store_id',
      rental => setStock(rental.from_store_id, rental.model_id, quantityOf(rental.from_store_id, rental.model_id) + rental.quantity)),
  };
}

/**
 * Fire-and-forget change events to n8n. One attempt, no retry; failures never affect the API response.
 * @param {{ webhookUrl: string, fetchImpl?: typeof fetch, log?: (line: string) => void, timeoutMs?: number }} options
 */
export function createInventoryEvents({ webhookUrl, fetchImpl = fetch, log = console.log, timeoutMs = 10_000 }) {
  const controllers = new Set();
  const report = (/** @type {string} */ message) => { try { log(message); } catch { /* logging must not affect the API */ } };
  /** @param {Record<string, unknown>} payload */
  const notify = async payload => {
    if (!webhookUrl) return;
    let url;
    try { url = new URL(webhookUrl); } catch { url = null; }
    if (!url || url.protocol !== 'https:' || url.username || url.password || url.hash) { report(`[n8n] inventory event skipped: ${payload.event} (N8N_INVENTORY_WEBHOOK_URL_INVALID)`); return; }
    const controller = new AbortController();
    controllers.add(controller);
    let failure = 'NETWORK_ERROR';
    try {
      const response = await fetchImpl(webhookUrl, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload), redirect: 'manual',
        signal: AbortSignal.any([controller.signal, AbortSignal.timeout(timeoutMs)]),
      });
      // Never read or log the response body.
      void response.body?.cancel().catch(() => {});
      if (!response.ok) { failure = `HTTP_${response.status}`; throw new Error(); }
      report(`[n8n] inventory event delivered: ${payload.event}`);
    } catch (error) {
      if (controller.signal.aborted) failure = 'SERVER_STOPPED';
      else if (error instanceof Error && error.name === 'TimeoutError') failure = 'TIMEOUT';
      report(`[n8n] inventory event failed: ${payload.event} (${failure})`);
    } finally { controllers.delete(controller); }
  };
  return {
    notify,
    close() { for (const controller of controllers) controller.abort(); },
  };
}

const rentalAction = /^\/api\/inventory\/rentals\/(rental_\d{1,9})\/(approve|reject|ship|deliver|return)$/;

/**
 * REST routes under /api/inventory. Returns null for paths it doesn't own.
 * The acting store comes from the body; there is no login yet, so this is demo-only trust.
 * @param {{ store: ReturnType<typeof createInventoryStore>, events: ReturnType<typeof createInventoryEvents> }} options
 */
export function createInventoryApi({ store, events }) {
  /** @param {Outcome} outcome */
  const respond = outcome => {
    if (!outcome.ok) return { status: outcome.status, body: { error_message: outcome.code } };
    for (const event of outcome.events ?? []) void events.notify(event);
    return { status: 200, body: outcome.value };
  };
  const optionalStore = (/** @type {unknown} */ value) => value === undefined ? HOME_STORE_ID : value;
  return {
    /**
     * @param {string} method @param {string} path @param {URLSearchParams} query @param {any} body
     * @returns {{ status: number, body: unknown } | null}
     */
    handle(method, path, query, body) {
      if (!path.startsWith('/api/inventory')) return null;
      if (method === 'GET') {
        if (path === '/api/inventory/stores') return { status: 200, body: store.stores() };
        if (path === '/api/inventory/stock') return respond(store.stock(query.get('store_id')));
        if (path === '/api/inventory/rentals') return respond(store.rentals(query.get('store_id') ?? HOME_STORE_ID));
        return { status: 404, body: { error_message: 'NOT_FOUND' } };
      }
      if (method !== 'POST') return { status: 405, body: { error_message: 'METHOD_NOT_ALLOWED' } };
      if (typeof body !== 'object' || body === null || Array.isArray(body)) return { status: 400, body: { error_message: 'INVALID_REQUEST_BODY' } };
      if (path === '/api/inventory/stock/adjust') return respond(store.adjust(optionalStore(body.store_id), body.model_id, body.quantity));
      if (path === '/api/inventory/rentals') return respond(store.request(body.model_id, body.quantity, body.from_store_id));
      if (path === '/api/inventory/reset') { store.reset(); return { status: 200, body: { reset: true } }; }
      const match = rentalAction.exec(path);
      if (!match) return { status: 404, body: { error_message: 'NOT_FOUND' } };
      const [, id, action] = match;
      if (action === 'approve') return respond(store.approve(id, body.store_id));
      if (action === 'reject') return respond(store.reject(id, body.store_id));
      if (action === 'ship') return respond(store.ship(id, body.store_id));
      if (action === 'deliver') return respond(store.deliver(id, optionalStore(body.store_id)));
      return respond(store.complete(id, body.store_id));
    },
  };
}
