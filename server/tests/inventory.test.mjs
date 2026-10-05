import { test } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createBackend } from '../app.mjs';
import { createInventoryDb, createDbInventoryApi, createInventoryNotifier, inventoryDbConfig, INVENTORY_DB_PATH, rentalStatus } from '../inventory.mjs';

// Synthetic fixtures only: never the real n8n URL or real store data.
const baseUrl = 'https://workflow.example.test/webhook';
const dbUrl = baseUrl + INVENTORY_DB_PATH;
const json = (/** @type {unknown} */ body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const stores = [
  { storeId: 'store_001', storeName: '테스트 1호점', address: '주소 1', phone: '000-0000-0001' },
  { storeId: 'store_005', storeName: '테스트 5호점', address: '주소 5', phone: '000-0000-0005' },
];
const stock = [
  { storeId: 'store_001', storeName: '테스트 1호점', productId: 'product_001', productName: '모델 A', maker: 'Samsung', storageGb: 256, color: '블랙', price: 1000,
    stockQty: 5, reservedQty: 1, transferQty: 2, available: 2 },
  { storeId: 'store_005', storeName: '테스트 5호점', productId: 'product_001', productName: '모델 A', maker: 'Samsung', storageGb: 256, color: '블랙', price: 1000,
    stockQty: 3, reservedQty: 0, transferQty: 0, available: 3 },
];

test('config reads N8N_INVENTORY_BASE_URL, trims it and drops trailing slashes', () => {
  assert.deepEqual(inventoryDbConfig({}), { inventoryBaseUrl: '' });
  assert.deepEqual(inventoryDbConfig({ N8N_INVENTORY_BASE_URL: ` ${baseUrl}// ` }), { inventoryBaseUrl: baseUrl });
});

test('db client: sends { action, ...fields } and passes ok/data and ok:false codes through', async () => {
  const sent = [];
  const db = createInventoryDb({ baseUrl, log: () => {}, fetchImpl: async (url, init) => {
    sent.push({ url, body: JSON.parse(String(init?.body)) });
    return sent.length === 1 ? json({ ok: true, data: [1] }) : json({ ok: false, code: 'OUT_OF_STOCK' });
  } });
  assert.deepEqual(await db.call('GET_INVENTORY', { storeId: 'store_001' }), { ok: true, data: [1] });
  assert.deepEqual(await db.call('APPROVE_RENTAL'), { ok: false, code: 'OUT_OF_STOCK' });
  assert.deepEqual(sent, [{ url: dbUrl, body: { action: 'GET_INVENTORY', storeId: 'store_001' } }, { url: dbUrl, body: { action: 'APPROVE_RENTAL' } }]);
});

test('db client: empty body, bad JSON shape, HTTP error, network error, timeout and bad URL → DB_UNAVAILABLE with a code-only log', async () => {
  const cases = [
    [async () => new Response(''), 'INVALID_RESPONSE'],               // unknown action today: 200 with empty body
    [async () => json({ rows: [] }), 'INVALID_RESPONSE'],
    [async () => json({ ok: false, code: 'lower case' }), 'INVALID_RESPONSE'],
    [async () => new Response('secret', { status: 500 }), 'HTTP_500'],
    [async () => { throw new TypeError('fetch failed'); }, 'NETWORK_ERROR'],
    [(_url, init) => new Promise((_, reject) => init.signal.addEventListener('abort', () => reject(init.signal.reason))), 'TIMEOUT'],
  ];
  for (const [fetchImpl, code] of cases) {
    const logs = [];
    const db = createInventoryDb({ baseUrl, fetchImpl, log: line => logs.push(line), timeoutMs: 20 });
    // AbortSignal.timeout does not keep the event loop alive; a real server would.
    const keepAlive = setTimeout(() => {}, 1000);
    assert.deepEqual(await db.call('GET_INVENTORY'), { ok: false, code: 'DB_UNAVAILABLE' });
    clearTimeout(keepAlive);
    assert.deepEqual(logs, [`[n8n] inventory db failed: GET_INVENTORY (${code})`]);
  }
  let called = false;
  const logs = [];
  const insecure = createInventoryDb({ baseUrl: 'http://workflow.example.test/webhook', fetchImpl: async () => { called = true; return json({}); }, log: line => logs.push(line) });
  assert.deepEqual(await insecure.call('GET_INVENTORY'), { ok: false, code: 'DB_UNAVAILABLE' });
  assert.equal(called, false);
  assert.deepEqual(logs, ['[n8n] inventory db skipped: GET_INVENTORY (N8N_INVENTORY_BASE_URL_INVALID)']);
});

test('api: maps DB rows to the in-memory field names, marks the home store, drops empty n8n items', async () => {
  const calls = [];
  const db = { call: async (action, fields = {}) => { calls.push({ action, ...fields }); return { ok: true, data: action === 'GET_STORES' ? [...stores, {}] : stock }; }, close() {} };
  const api = createDbInventoryApi({ db, homeStoreId: 'store_005' });
  const q = (/** @type {string} */ s) => new URLSearchParams(s);

  const storeList = await api.handle('GET', '/api/inventory/stores', q(''), {});
  assert.equal(storeList?.status, 200);
  assert.deepEqual(storeList?.body, [
    { id: 'store_001', name: '테스트 1호점', is_home: false, address: '주소 1', phone: '000-0000-0001' },
    { id: 'store_005', name: '테스트 5호점', is_home: true, address: '주소 5', phone: '000-0000-0005' },
  ]);

  const all = await api.handle('GET', '/api/inventory/stock', q(''), {});
  assert.deepEqual(all?.body[0], {
    store_id: 'store_001', store_name: '테스트 1호점', is_home: false, model_id: 'product_001', model_name: '모델 A', variant: '256GB · 블랙',
    quantity: 2, maker: 'Samsung', price: 1000, stock_qty: 5, reserved_qty: 1, transfer_qty: 2, available: 2,
  });
  await api.handle('GET', '/api/inventory/stock', q('store_id=store_005'), {});
  assert.deepEqual(calls, [{ action: 'GET_STORES' }, { action: 'GET_INVENTORY', storeId: '' }, { action: 'GET_INVENTORY', storeId: 'store_005' }]);

  // Not a DB store id: rejected before calling n8n.
  assert.deepEqual(await api.handle('GET', '/api/inventory/stock', q('store_id=DEMO-S001'), {}), { status: 404, body: { error_message: 'STORE_NOT_FOUND' } });
  assert.equal(calls.length, 3);
});

test('api: upstream failure is 502, unwired routes are 501, unknown paths 404', async () => {
  const api = createDbInventoryApi({ db: { call: async () => ({ ok: false, code: 'DB_UNAVAILABLE' }), close() {} } });
  const q = new URLSearchParams();
  assert.deepEqual(await api.handle('GET', '/api/inventory/stock', q, {}), { status: 502, body: { error_message: 'DB_UNAVAILABLE' } });
  for (const [method, path] of [
    ['POST', '/api/inventory/reset']]) {
    assert.equal((await api.handle(method, path, q, {}))?.status, 501, `${method} ${path}`);
  }
  assert.equal((await api.handle('GET', '/api/inventory/nope', q, {}))?.status, 404);
  assert.equal((await api.handle('DELETE', '/api/inventory/stock', q, {}))?.status, 405);
  assert.equal(await api.handle('GET', '/retell/config', q, {}), null);
});

test('HTTP: with N8N_INVENTORY_BASE_URL the backend serves stock from n8n; without it inventory routes answer 503', async t => {
  const sent = [];
  const dbServer = createBackend({ key: '', agentId: '', monitors: { start() {}, close() {}, release() {} }, log: () => {},
    demoStoreId: 'store_005', inventoryBaseUrl: baseUrl,
    webhookFetchImpl: async (url, init) => { sent.push(url); return json({ ok: true, data: JSON.parse(String(init?.body)).action === 'GET_STORES' ? stores : stock }); } });
  const offServer = createBackend({ key: '', agentId: '', monitors: { start() {}, close() {}, release() {} }, log: () => {} });
  for (const server of [dbServer, offServer]) {
    server.listen(0, '127.0.0.1'); await once(server, 'listening');
    t.after(() => { server.closeAllConnections(); server.close(); });
  }
  const base = (/** @type {any} */ server) => `http://127.0.0.1:${server.address().port}/api/inventory`;

  const dbStock = await (await fetch(`${base(dbServer)}/stock?store_id=store_005`)).json();
  assert.equal(dbStock.length, 2);
  assert.equal(dbStock.find(row => row.is_home).store_id, 'store_005');
  assert.equal((await (await fetch(`${base(dbServer)}/stores`)).json()).length, 2);
  assert.ok(sent.every(url => url === dbUrl));
  assert.equal((await fetch(`${base(dbServer)}/reset`, { method: 'POST', headers: { Origin: 'http://127.0.0.1:5173', 'Content-Type': 'application/json' }, body: '{}' })).status, 501);

  const off = await fetch(`${base(offServer)}/stock`);
  assert.equal(off.status, 503);
  assert.deepEqual(await off.json(), { error_message: 'INVENTORY_NOT_CONFIGURED' });
  assert.equal((await fetch(`http://127.0.0.1:${offServer.address().port}/retell/config`)).status, 200, 'other routes unaffected');
});

const dbRental = {
  rentalId: 'stock_040', productId: 'product_004', productName: '모델 B', storageGb: 512, color: '실버', quantity: 2,
  requestStoreId: 'store_005', requestStoreName: '테스트 5호점', provideStoreId: 'store_001', provideStoreName: '테스트 1호점',
  deliveryStatus: '배송 완료', returnStatus: '반납 완료', requestedAt: '2026-09-25T06:13:58.488Z', returnedAt: '2026-09-30T06:13:58.488Z',
  requester: { name: '요청자', phone: '000-0000-0020' }, approver: { name: '승인자', phone: '000-0000-0002' },
  provideInventory: { stockQty: 9, reservedQty: 2, transferQty: 0, available: 7 }, role: 'SENT',
};
const adjustRow = (/** @type {Record<string, unknown>} */ over = {}) => ({
  code: 'OK', storeId: 'store_005', storeName: '테스트 5호점', productId: 'product_001', productName: '모델 A', storageGb: 256, color: '블랙',
  availableBefore: 3, stockQty: 4, reservedQty: 1, transferQty: 2, available: 1, manager: { name: '점장', phone: '000-0000-0017' }, ...over,
});

test('rentalStatus maps DB delivery/return status to API status (contract §3.4)', () => {
  assert.equal(rentalStatus('요청 중', null), 'requested');
  assert.equal(rentalStatus('요청 승인', null), 'approved');
  assert.equal(rentalStatus('배송 중', null), 'shipping');
  assert.equal(rentalStatus('배송 완료', '반납 전'), 'delivered');
  assert.equal(rentalStatus('배송 완료', '반납 중'), 'returning');
  assert.equal(rentalStatus('배송 완료', '반납 완료'), 'returned');
  assert.equal(rentalStatus('???', null), 'unknown');
});

test('api GET /rentals: home store by default, maps rows, never exposes phone numbers', async () => {
  const calls = [];
  const api = createDbInventoryApi({ db: { call: async (action, fields = {}) => { calls.push({ action, ...fields }); return { ok: true, data: [dbRental] }; }, close() {} }, homeStoreId: 'store_005' });
  const res = await api.handle('GET', '/api/inventory/rentals', new URLSearchParams(), {});
  assert.equal(res?.status, 200);
  assert.deepEqual(res?.body, [{
    rental_id: 'stock_040', model_id: 'product_004', model_name: '모델 B', variant: '512GB · 실버', quantity: 2,
    from_store_id: 'store_001', from_store_name: '테스트 1호점', to_store_id: 'store_005', to_store_name: '테스트 5호점',
    status: 'returned', role: 'sent', requested_at: '2026-09-25T06:13:58.488Z', returned_at: '2026-09-30T06:13:58.488Z',
    requester_name: '요청자', approver_name: '승인자', delivery_status: '배송 완료', return_status: '반납 완료',
  }]);
  assert.ok(!JSON.stringify(res?.body).includes('000-0000'), 'no phone numbers to the browser');
  await api.handle('GET', '/api/inventory/rentals', new URLSearchParams('store_id=store_001'), {});
  assert.deepEqual(calls, [{ action: 'GET_RENTALS', storeId: 'store_005' }, { action: 'GET_RENTALS', storeId: 'store_001' }]);
  assert.equal((await api.handle('GET', '/api/inventory/rentals', new URLSearchParams('store_id=DEMO-S001'), {}))?.status, 404);
  const empty = createDbInventoryApi({ db: { call: async () => ({ ok: true, data: [{}] }), close() {} }, homeStoreId: 'store_005' });
  assert.deepEqual((await empty.handle('GET', '/api/inventory/rentals', new URLSearchParams(), {}))?.body, [], 'n8n empty item → []');
  const noHome = createDbInventoryApi({ db: { call: async () => ({ ok: true, data: [] }), close() {} } });
  assert.equal((await noHome.handle('GET', '/api/inventory/rentals', new URLSearchParams(), {}))?.status, 503);
});

const recorder = () => {
  /** @type {[string, any][]} */
  const sent = [];
  return { sent, notify: { rentalStatus: (/** @type {any} */ p) => { sent.push(['rental', p]); }, inventoryChanged: (/** @type {any} */ p) => { sent.push(['low', p]); } } };
};

test('api POST /stock/adjust: validates input, sends ADJUST_INVENTORY, accepts both n8n response shapes', async () => {
  const { sent, notify } = recorder();
  const calls = [];
  let reply = { ok: true, data: [adjustRow()] };
  const logs = [];
  const api = createDbInventoryApi({ db: { call: async (action, fields = {}) => { calls.push({ action, ...fields }); return reply; }, close() {} },
    homeStoreId: 'store_005', log: line => logs.push(line), notify });
  const post = (/** @type {unknown} */ body) => api.handle('POST', '/api/inventory/stock/adjust', new URLSearchParams(), body);

  const ok = await post({ model_id: 'product_001', quantity: 4 });
  assert.equal(ok?.status, 200);
  assert.equal(ok?.body.quantity, 1); assert.equal(ok?.body.stock_qty, 4); assert.equal(ok?.body.is_home, true);
  assert.deepEqual(calls, [{ action: 'ADJUST_INVENTORY', storeId: 'store_005', productId: 'product_001', stockQty: 4 }]);
  assert.deepEqual(logs, ['[inventory] low stock: store_005 product_001 available=1']);
  assert.deepEqual(sent, [['low', { event: 'INVENTORY_CHANGED', storeName: '테스트 5호점', productName: '모델 A', storageGb: 256, color: '블랙',
    stockQuantity: 4, reservedQuantity: 1, transferQuantity: 2, threshold: 1, recipients: [{ name: '점장', phone: '000-0000-0017' }] }]]);
  assert.ok(!logs.join().includes('000-0000'));

  // Already at/below the threshold before: no repeat alert. Above after: none either.
  reply = { ok: true, data: [adjustRow({ availableBefore: 1, available: 0 })] }; await post({ model_id: 'product_001', quantity: 3 });
  reply = { ok: true, data: adjustRow({ availableBefore: 1, available: 5 }) }; assert.equal((await post({ model_id: 'product_001', quantity: 8 }))?.status, 200, 'object data also accepted');
  assert.equal(logs.length, 1);

  // Failure codes inside the row (current n8n) and as ok:false (contract) both map to HTTP errors.
  reply = { ok: true, data: [adjustRow({ code: 'INVALID_QUANTITY' })] };
  assert.deepEqual(await post({ model_id: 'product_001', quantity: 0 }), { status: 400, body: { error_message: 'INVALID_QUANTITY' } });
  reply = { ok: false, code: 'INVENTORY_NOT_FOUND' };
  assert.deepEqual(await post({ model_id: 'product_999', quantity: 1 }), { status: 404, body: { error_message: 'INVENTORY_NOT_FOUND' } });
  reply = { ok: true, data: [] };
  assert.equal((await post({ model_id: 'product_001', quantity: 1 }))?.status, 502);

  // Rejected before calling n8n.
  const before = calls.length;
  assert.equal((await post({ store_id: 'store_001', model_id: 'product_001', quantity: 1 }))?.body.error_message, 'STORE_NOT_ALLOWED');
  assert.equal((await post({ store_id: 'DEMO-S001', model_id: 'product_001', quantity: 1 }))?.body.error_message, 'STORE_NOT_FOUND');
  assert.equal((await post({ model_id: 'DEMO-I001', quantity: 1 }))?.body.error_message, 'MODEL_NOT_FOUND');
  for (const quantity of [-1, 1.5, 10000, '3']) assert.equal((await post({ model_id: 'product_001', quantity }))?.body.error_message, 'INVALID_QUANTITY');
  assert.equal((await post([]))?.status, 400);
  assert.equal(calls.length, before);
  const noHome = createDbInventoryApi({ db: { call: async () => reply, close() {} } });
  assert.equal((await noHome.handle('POST', '/api/inventory/stock/adjust', new URLSearchParams(), { model_id: 'product_001', quantity: 1 }))?.status, 503);
});

test('api POST /rentals: home store asks nearby stores via CREATE_RENTAL; phones never reach the browser', async () => {
  const { sent, notify } = recorder();
  const calls = [];
  const logs = [];
  const created = { ...dbRental, rentalId: 'stock_041', provideStoreId: null, provideStoreName: null, deliveryStatus: '요청 중', returnStatus: null,
    approver: null, provideInventory: null, role: undefined };
  const candidates = [
    { storeId: 'store_001', storeName: '테스트 1호점', distanceKm: 1.2, available: 3, manager: { name: '점장1', phone: '000-0000-0101' }, noStore: false, appliedRadiusKm: 3 },
    { storeId: 'store_004', storeName: '테스트 4호점', distanceKm: 2.8, available: 5, manager: { name: '점장4', phone: '000-0000-0104' }, noStore: false, appliedRadiusKm: 3 },
  ];
  let reply = { ok: true, data: { rental: created, appliedRadiusKm: 3, candidates } };
  const api = createDbInventoryApi({ db: { call: async (action, fields = {}, options = {}) => { calls.push({ action, fields, options }); return reply; }, close() {} },
    homeStoreId: 'store_005', log: line => logs.push(line), notify });
  const post = (/** @type {unknown} */ body) => api.handle('POST', '/api/inventory/rentals', new URLSearchParams(), body);

  const res = await post({ model_id: 'product_001', quantity: 1, radius_km: 3 });
  assert.equal(res?.status, 200);
  assert.equal(res?.body.rental.rental_id, 'stock_041');
  assert.equal(res?.body.rental.status, 'requested');
  assert.equal(res?.body.rental.role, 'sent');
  assert.equal(res?.body.rental.from_store_id, null);
  assert.equal(res?.body.applied_radius_km, 3);
  assert.deepEqual(res?.body.candidates, [
    { store_id: 'store_001', store_name: '테스트 1호점', distance_km: 1.2, available: 3 },
    { store_id: 'store_004', store_name: '테스트 4호점', distance_km: 2.8, available: 5 },
  ]);
  assert.ok(!JSON.stringify(res?.body).includes('000-0000'), 'no phone numbers to the browser');
  assert.deepEqual(calls[0].fields, { requestStoreId: 'store_005', productId: 'product_001', quantity: 1, radiusKm: 3 });
  assert.equal(calls[0].action, 'CREATE_RENTAL');
  assert.ok(calls[0].options.timeoutMs >= 20_000, 'geocoding is slow: longer timeout');
  assert.deepEqual(logs, []);
  assert.deepEqual(sent, [['rental', { event: 'RENTAL_REQUESTED', rentalId: 'stock_041', productName: '모델 B', quantity: 2, toStore: '테스트 5호점', recipients: [
    { name: '점장1', phone: '000-0000-0101', storeName: '테스트 1호점', distanceKm: 1.2 },
    { name: '점장4', phone: '000-0000-0104', storeName: '테스트 4호점', distanceKm: 2.8 },
  ] }]], 'every candidate manager, no fromStore before approval');

  await post({ model_id: 'product_001', quantity: 2 });
  assert.deepEqual(calls[1].fields, { requestStoreId: 'store_005', productId: 'product_001', quantity: 2 }, 'radius omitted → n8n default');

  reply = { ok: false, code: 'NO_LENDER_AVAILABLE' };
  assert.deepEqual(await post({ model_id: 'product_001', quantity: 99 }), { status: 409, body: { error_message: 'NO_LENDER_AVAILABLE' } });
  reply = { ok: true, data: { candidates } };
  assert.equal((await post({ model_id: 'product_001', quantity: 1 }))?.status, 502, 'missing rental → upstream failure');

  const before = calls.length;
  assert.equal((await post({ model_id: 'DEMO-I002', quantity: 1 }))?.body.error_message, 'MODEL_NOT_FOUND');
  for (const quantity of [0, 100, 1.5, '1']) assert.equal((await post({ model_id: 'product_001', quantity }))?.body.error_message, 'INVALID_QUANTITY');
  for (const radius_km of [0, -1, 51, '3']) assert.equal((await post({ model_id: 'product_001', quantity: 1, radius_km }))?.body.error_message, 'INVALID_RADIUS');
  assert.equal(calls.length, before, 'invalid input never reaches n8n');
  const noHome = createDbInventoryApi({ db: { call: async () => reply, close() {} } });
  assert.equal((await noHome.handle('POST', '/api/inventory/rentals', new URLSearchParams(), { model_id: 'product_001', quantity: 1 }))?.status, 503);
});

test('db client: a per-call timeout overrides the default', async () => {
  const logs = [];
  const db = createInventoryDb({ baseUrl, log: line => logs.push(line), timeoutMs: 10_000,
    fetchImpl: (_url, init) => new Promise((_, reject) => init.signal.addEventListener('abort', () => reject(init.signal.reason))) });
  const keepAlive = setTimeout(() => {}, 1000);
  const started = Date.now();
  assert.deepEqual(await db.call('CREATE_RENTAL', {}, { timeoutMs: 20 }), { ok: false, code: 'DB_UNAVAILABLE' });
  clearTimeout(keepAlive);
  assert.ok(Date.now() - started < 1000);
  assert.deepEqual(logs, ['[n8n] inventory db failed: CREATE_RENTAL (TIMEOUT)']);
});

test('api POST /rentals/:id/approve: lender approves via APPROVE_RENTAL, low stock alert on crossing, no phones', async () => {
  const { sent, notify } = recorder();
  const calls = [];
  const logs = [];
  const approved = { ...dbRental, rentalId: 'stock_041', productId: 'product_001', quantity: 1, requestStoreId: 'store_005', provideStoreId: 'store_001',
    deliveryStatus: '요청 승인', returnStatus: null, returnedAt: null, provideInventory: { stockQty: 15, reservedQty: 2, transferQty: 1, available: 12 }, role: undefined };
  let reply = { ok: true, data: approved };
  const api = createDbInventoryApi({ db: { call: async (action, fields = {}) => { calls.push({ action, ...fields }); return reply; }, close() {} },
    homeStoreId: 'store_005', log: line => logs.push(line), notify });
  const approve = (/** @type {string} */ id, /** @type {unknown} */ body) => api.handle('POST', `/api/inventory/rentals/${id}/approve`, new URLSearchParams(), body);

  const res = await approve('stock_041', { store_id: 'store_001' });
  assert.equal(res?.status, 200);
  assert.equal(res?.body.status, 'approved');
  assert.equal(res?.body.from_store_id, 'store_001');
  assert.equal(res?.body.role, 'lending');
  assert.ok(!JSON.stringify(res?.body).includes('000-0000'));
  assert.deepEqual(calls, [{ action: 'APPROVE_RENTAL', rentalId: 'stock_041', storeId: 'store_001' }]);
  assert.deepEqual(logs, [], '12 left: no low-stock alert');
  assert.deepEqual(sent, [['rental', { event: 'RENTAL_APPROVED', rentalId: 'stock_041', productName: '모델 B', quantity: 1,
    fromStore: '테스트 1호점', toStore: '테스트 5호점', recipients: [{ name: '요청자', phone: '000-0000-0020' }] }]], 'approval goes to the requester');

  // Lender drops from 2 to 1 available → low stock crossing is logged once.
  reply = { ok: true, data: [{ ...approved, provideInventory: { stockQty: 3, reservedQty: 1, transferQty: 1, available: 1 } }] };
  await approve('stock_041', {});
  assert.deepEqual(calls[1], { action: 'APPROVE_RENTAL', rentalId: 'stock_041', storeId: 'store_005' }, 'default: home store acts');
  assert.equal(logs.at(-1), '[inventory] low stock: store_005 product_001 available=1');
  assert.deepEqual(sent.at(-1), ['low', { event: 'INVENTORY_CHANGED', storeName: '테스트 1호점', productName: '모델 B', storageGb: 512, color: '실버',
    stockQuantity: 3, reservedQuantity: 1, transferQuantity: 1, threshold: 1, recipients: [{ name: '승인자', phone: '000-0000-0002' }] }], 'low stock goes to the lender');

  for (const code of ['SAME_STORE', 'INVALID_RENTAL_STATUS', 'OUT_OF_STOCK']) {
    reply = { ok: false, code };
    assert.deepEqual(await approve('stock_041', { store_id: 'store_001' }), { status: 409, body: { error_message: code } });
  }
  reply = { ok: false, code: 'RENTAL_NOT_FOUND' };
  assert.equal((await approve('stock_999', { store_id: 'store_001' }))?.status, 404);
  reply = { ok: true, data: [] };
  assert.equal((await approve('stock_041', { store_id: 'store_001' }))?.status, 502);

  const before = calls.length;
  assert.equal((await approve('stock_041', { store_id: 'DEMO-S002' }))?.body.error_message, 'STORE_NOT_FOUND');
  assert.equal((await approve('rental_1', { store_id: 'store_001' }))?.status, 404, 'old demo id format is not a DB rental');
  assert.equal(calls.length, before);
});

test('api POST /rentals/:id/(cancel|ship|deliver|return): one rule each, notifications only for ship/return', async () => {
  const { sent, notify } = recorder();
  const calls = [];
  const logs = [];
  const base = { ...dbRental, rentalId: 'stock_041', requestStoreId: 'store_005', provideStoreId: 'store_001', returnedAt: null, role: undefined };
  const replies = {
    CANCEL_RENTAL: { ...base, provideStoreId: null, provideStoreName: null, deliveryStatus: '요청 중', returnStatus: null, approver: null, provideInventory: null },
    SHIP_RENTAL: { ...base, deliveryStatus: '배송 중', returnStatus: null },
    DELIVER_RENTAL: { ...base, deliveryStatus: '배송 완료', returnStatus: '반납 전' },
    RETURN_RENTAL: { ...base, deliveryStatus: '배송 완료', returnStatus: '반납 완료', returnedAt: '2026-10-05T06:47:21.270Z' },
  };
  const api = createDbInventoryApi({ db: { call: async (action, fields = {}) => { calls.push({ action, ...fields }); return { ok: true, data: [replies[action]] }; }, close() {} },
    homeStoreId: 'store_005', log: line => logs.push(line), notify });
  const act = (/** @type {string} */ name, /** @type {unknown} */ body) => api.handle('POST', `/api/inventory/rentals/stock_041/${name}`, new URLSearchParams(), body);

  const cancelled = await act('cancel', {});
  assert.equal(cancelled?.body.status, 'cancelled'); assert.equal(cancelled?.body.role, 'sent');
  const shipped = await act('ship', { store_id: 'store_001' });
  assert.equal(shipped?.body.status, 'shipping'); assert.equal(shipped?.body.role, 'lending');
  assert.equal((await act('deliver', {}))?.body.status, 'delivered');
  const returned = await act('return', { store_id: 'store_001' });
  assert.equal(returned?.body.status, 'returned'); assert.equal(returned?.body.returned_at, '2026-10-05T06:47:21.270Z');

  assert.deepEqual(calls, [
    { action: 'CANCEL_RENTAL', rentalId: 'stock_041', storeId: 'store_005' },
    { action: 'SHIP_RENTAL', rentalId: 'stock_041', storeId: 'store_001' },
    { action: 'DELIVER_RENTAL', rentalId: 'stock_041', storeId: 'store_005' },
    { action: 'RETURN_RENTAL', rentalId: 'stock_041', storeId: 'store_001' },
  ]);
  assert.deepEqual(logs, []);
  assert.deepEqual(sent.map(([, p]) => [p.event, p.recipients]), [
    ['RENTAL_SHIPPED', [{ name: '요청자', phone: '000-0000-0020' }]],
    ['RENTAL_RETURNED', [{ name: '요청자', phone: '000-0000-0020' }]],
  ], 'no notification for cancel or deliver; ship/return go to the requester');
  for (const res of [cancelled, shipped, returned]) assert.ok(!JSON.stringify(res?.body).includes('000-0000'));

  const failing = createDbInventoryApi({ db: { call: async () => ({ ok: false, code: 'STORE_NOT_ALLOWED' }), close() {} }, homeStoreId: 'store_005' });
  assert.deepEqual(await failing.handle('POST', '/api/inventory/rentals/stock_041/ship', new URLSearchParams(), {}), { status: 403, body: { error_message: 'STORE_NOT_ALLOWED' } });
  const mismatch = createDbInventoryApi({ db: { call: async () => ({ ok: false, code: 'INVENTORY_MISMATCH' }), close() {} }, homeStoreId: 'store_005' });
  assert.equal((await mismatch.handle('POST', '/api/inventory/rentals/stock_041/return', new URLSearchParams(), {}))?.status, 502, 'unknown-to-browser codes are upstream failures');
  assert.equal((await api.handle('POST', '/api/inventory/rentals/stock_041/reject', new URLSearchParams(), {}))?.status, 404, 'reject no longer exists');
});

test('notifier: posts to the two alert webhooks, skips empty recipients, logs codes only', async () => {
  const posted = [];
  const logs = [];
  let status = 200;
  const n = createInventoryNotifier({ baseUrl, log: line => logs.push(line),
    fetchImpl: async (url, init) => { posted.push({ url, body: JSON.parse(String(init?.body)) }); return new Response('secret', { status }); } });
  await n.rentalStatus({ event: 'RENTAL_SHIPPED', rentalId: 'stock_041', recipients: [{ name: 'a', phone: '000-0000-9999' }] });
  await n.inventoryChanged({ event: 'INVENTORY_CHANGED', recipients: [{ name: 'b', phone: '000-0000-9998' }] });
  await n.rentalStatus({ event: 'RENTAL_APPROVED', recipients: [] });
  status = 500; await n.rentalStatus({ event: 'RENTAL_RETURNED', recipients: [{ name: 'c', phone: '000-0000-9997' }] });
  assert.deepEqual(posted.map(p => p.url), [`${baseUrl}/kcm-rental-status`, `${baseUrl}/kcm-inventory-changed`, `${baseUrl}/kcm-rental-status`]);
  assert.deepEqual(logs, [
    '[n8n] inventory notify delivered: RENTAL_SHIPPED',
    '[n8n] inventory notify delivered: INVENTORY_CHANGED',
    '[n8n] inventory notify skipped: RENTAL_APPROVED (NO_RECIPIENTS)',
    '[n8n] inventory notify failed: RENTAL_RETURNED (HTTP_500)',
  ]);
  assert.ok(!logs.join().includes('000-0000') && !logs.join().includes('secret'));
  const insecure = createInventoryNotifier({ baseUrl: 'http://workflow.example.test/webhook', log: line => logs.push(line), fetchImpl: async () => { throw new Error('must not call'); } });
  await insecure.rentalStatus({ event: 'RENTAL_SHIPPED', recipients: [{ name: 'a', phone: '1' }] });
  assert.equal(logs.at(-1), '[n8n] inventory notify skipped: RENTAL_SHIPPED (N8N_INVENTORY_BASE_URL_INVALID)');
});

test('HTTP: in DB mode the backend sends alerts to n8n after a successful change (and not after a failed one)', async t => {
  const posted = [];
  const detail = { ...dbRental, rentalId: 'stock_041', requestStoreId: 'store_005', provideStoreId: 'store_001', deliveryStatus: '배송 중', returnStatus: null, role: undefined };
  const server = createBackend({ key: '', agentId: '', monitors: { start() {}, close() {}, release() {} }, log: () => {},
    demoStoreId: 'store_005', inventoryBaseUrl: baseUrl,
    webhookFetchImpl: async (url, init) => {
      const body = JSON.parse(String(init?.body));
      if (String(url).endsWith(INVENTORY_DB_PATH)) return json(body.rentalId === 'stock_999' ? { ok: false, code: 'RENTAL_NOT_FOUND' } : { ok: true, data: detail });
      posted.push({ url, event: body.event, to: body.recipients.map((/** @type {any} */ r) => r.phone) });
      return new Response('ok');
    } });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(() => { server.closeAllConnections(); server.close(); });
  const post = (/** @type {string} */ path) => fetch(`http://127.0.0.1:${server.address().port}/api/inventory${path}`,
    { method: 'POST', headers: { Origin: 'http://127.0.0.1:5173', 'Content-Type': 'application/json' }, body: JSON.stringify({ store_id: 'store_001' }) });
  assert.equal((await post('/rentals/stock_041/ship')).status, 200);
  assert.equal((await post('/rentals/stock_999/ship')).status, 404);
  await new Promise(resolve => setTimeout(resolve, 20));
  assert.deepEqual(posted, [{ url: `${baseUrl}/kcm-rental-status`, event: 'RENTAL_SHIPPED', to: ['000-0000-0020'] }]);
});
