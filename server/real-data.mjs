/**
 * Server-only, read-only Supabase REST access.
 * Columns and relationships were verified against the KT Project metadata on 2026-10-06.
 * This module never calls the n8n briefing workflow, writes DB rows, or changes live call/risk state.
 */

/** @typedef {Record<string, any>} Row */
/** @typedef {{ok: true, data: Row[]} | {ok: false, code: string}} ReadResult */
/** @typedef {{select: string, filters?: Record<string, string>, order?: string, limit?: number}} ReadQuery */

/** Never return this configuration or its values to a browser or log. */
export function realDataConfig(/** @type {NodeJS.ProcessEnv} */ env = process.env) {
  return {
    supabaseUrl: (env.SUPABASE_URL?.trim() ?? '').replace(/\/+$/, ''),
    supabaseKey: env.SUPABASE_READ_KEY?.trim() ?? '',
  };
}

// Explicit verified-column allowlists. Raw transcripts, customer birth dates and employee
// phone numbers are unavailable. Reservation notes are read only for consented briefing details.
const columns = /** @type {Record<string, readonly string[]>} */ ({
  reservations: ['id', 'consultation_id', 'store_id', 'employee_id', 'source', 'reserved_at', 'visit_at', 'purpose', 'status', 'note'],
  customers: ['id', 'name', 'phone', 'privacy_consent', 'product_id', 'plan_id'],
  consultations: ['id', 'customer_id', 'store_id', 'purpose', 'status', 'used_ai', 'call_id', 'ai_summary', 'used_phone', 'used_visit', 'started_at', 'ended_at'],
  employees: ['id', 'store_id', 'name', 'job_title', 'gender', 'day_off', 'next_leave', 'score'],
  risks: ['id', 'consultation_id', 'customer_id', 'stage', 'risk_score', 'risk_level', 'created_at'],
  stores: ['id', 'name', 'address', 'phone', 'open_time', 'close_time', 'closed_day', 'score'],
  products: ['id', 'name', 'maker', 'storage_gb', 'color', 'price'],
  own_plans: ['id', 'name', 'group_name', 'type', 'monthly_fee', 'data_unlimited', 'data_gb', 'after_speed_kbps', 'share_data_gb', 'voice_unlimited', 'voice_minutes', 'video_minutes', 'text_unlimited', 'text_count', 'membership_grade', 'smart_device_count', 'data_share_count', 'insurance_discount', 'choice_benefit', 'roaming'],
  competitor_plans: ['id', 'company', 'name', 'group_name', 'type', 'monthly_fee', 'data_unlimited', 'data_gb', 'after_speed_kbps', 'share_data_gb', 'family_data_gb', 'voice_unlimited', 'voice_minutes', 'video_minutes', 'text_unlimited', 'text_count', 'membership_grade', 'smart_device_count', 'data_share_count', 'insurance_discount', 'benefit', 'roaming'],
  benefits: ['id', 'type', 'grade', 'name', 'description'],
  bundles: ['id', 'parent_id', 'name', 'type', 'description', 'family_required', 'internet_required', 'min_mobile_lines', 'max_mobile_lines', 'max_internet_lines', 'max_tv_lines', 'discount_method', 'family_relations'],
  bundle_rules: ['id', 'bundle_id', 'order_no', 'type', 'service', 'scope', 'fee_basis', 'min_fee', 'max_fee', 'min_speed', 'max_speed', 'min_line', 'max_line', 'customer_condition', 'internet_discount', 'mobile_discount', 'tv_discount', 'mobile_rate', 'extra_discount', 'description'],
  promotions: ['id', 'store_id', 'name', 'type', 'start_at', 'end_at', 'product_id', 'description'],
});

const object = (/** @type {any} */ value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const text = (/** @type {any} */ value) => typeof value === 'string' && value.trim().length > 0;
const safeFilter = (/** @type {string} */ value) =>
  /^(?:eq|gte|gt|lte|lt)\.[\p{L}\p{N}_+\-:. ]{1,160}$/u.test(value)
  || /^(?:is|not\.is)\.null$/.test(value)
  || /^in\.\([a-z_]+_[0-9]{3,}(?:,[a-z_]+_[0-9]{3,}){0,499}\)$/.test(value);
const errorResult = (/** @type {string} */ code) => /** @type {const} */ ({ ok: false, code });

/**
 * Only GET, known tables/columns, simple filters and bounded reads are possible.
 * No automatic retry, RPC, nested select, wildcard select, or caller-supplied HTTP method.
 * @param {{supabaseUrl?: string, supabaseKey?: string, fetchImpl?: typeof fetch, timeoutMs?: number}} options
 */
export function createSupabaseReadProvider({ supabaseUrl = '', supabaseKey = '', fetchImpl = fetch, timeoutMs = 10_000 } = {}) {
  let origin = '';
  let configError = '';
  if (!supabaseUrl || !supabaseKey) configError = 'REAL_DATA_NOT_CONFIGURED';
  else {
    try {
      const url = new URL(supabaseUrl);
      if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || !/^\/?$/.test(url.pathname)
        || /[\r\n]/.test(supabaseKey)) throw new Error();
      origin = url.origin;
    } catch { configError = 'REAL_DATA_CONFIG_INVALID'; }
  }
  let closed = false;
  const controllers = new Set();

  /** @param {string} table @param {ReadQuery} query @returns {Promise<ReadResult>} */
  async function read(table, query) {
    if (configError) return errorResult(configError);
    if (closed) return errorResult('REAL_DATA_UNAVAILABLE');
    const allowed = Object.hasOwn(columns, table) ? columns[table] : undefined;
    const selected = typeof query?.select === 'string' ? query.select.split(',') : [];
    const limit = query?.limit ?? 100;
    const filters = query?.filters ?? {};
    if (!allowed || !selected.length || selected.some(field => !allowed.includes(field))
      || new Set(selected).size !== selected.length || !Number.isSafeInteger(limit) || limit < 1 || limit > 1000
      || !object(filters) || Object.entries(filters).some(([field, value]) => !allowed.includes(field) || typeof value !== 'string' || !safeFilter(value))) {
      return errorResult('REAL_DATA_INVALID_QUERY');
    }
    if (query.order !== undefined && typeof query.order !== 'string') return errorResult('REAL_DATA_INVALID_QUERY');
    if (query.order && query.order.split(',').some(part => {
      const [field, direction, nulls, ...extra] = part.split('.');
      return !allowed.includes(field) || !['asc', 'desc'].includes(direction)
        || (nulls !== undefined && !['nullsfirst', 'nullslast'].includes(nulls)) || extra.length > 0;
    })) return errorResult('REAL_DATA_INVALID_QUERY');
    const url = new URL('/rest/v1/' + table, origin);
    url.searchParams.set('select', selected.join(','));
    url.searchParams.set('limit', String(limit));
    for (const [field, value] of Object.entries(filters)) url.searchParams.set(field, value);
    if (query.order) url.searchParams.set('order', query.order);
    const controller = new AbortController();
    controllers.add(controller);
    const deadline = AbortSignal.timeout(timeoutMs);
    try {
      // Modern publishable/secret keys are opaque API keys, not JWT bearer tokens.
      // Official reference: https://supabase.com/docs/guides/getting-started/api-keys#known-limitations
      const headers = /** @type {Record<string, string>} */ ({
        apikey: supabaseKey, Accept: 'application/json', 'Accept-Profile': 'public',
      });
      if (/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(supabaseKey)) headers.Authorization = 'Bearer ' + supabaseKey;
      const response = await fetchImpl(url.href, {
        method: 'GET', redirect: 'manual',
        headers,
        signal: AbortSignal.any([controller.signal, deadline]),
      });
      if (!response.ok) {
        void response.body?.cancel().catch(() => {});
        return errorResult(response.status === 401 || response.status === 403 ? 'REAL_DATA_ACCESS_DENIED' : 'REAL_DATA_UNAVAILABLE');
      }
      let rows;
      try {
        const body = await response.text();
        if (Buffer.byteLength(body) > 2_000_000) return errorResult('REAL_DATA_INVALID_RESPONSE');
        rows = JSON.parse(body);
      } catch {
        if (deadline.aborted) return errorResult('REAL_DATA_TIMEOUT');
        if (controller.signal.aborted) return errorResult('REAL_DATA_UNAVAILABLE');
        return errorResult('REAL_DATA_INVALID_RESPONSE');
      }
      if (!Array.isArray(rows) || rows.length > limit || rows.some(row => !object(row) || selected.some(field => !(field in row)))) {
        return errorResult('REAL_DATA_INVALID_RESPONSE');
      }
      // Do not retain unknown response fields even if a proxy/upstream ignores select.
      return { ok: true, data: rows.map(row => Object.fromEntries(selected.map(field => [field, row[field]]))) };
    } catch (error) {
      return errorResult(deadline.aborted || error instanceof Error && error.name === 'TimeoutError' ? 'REAL_DATA_TIMEOUT' : 'REAL_DATA_UNAVAILABLE');
    } finally { controllers.delete(controller); }
  }

  /** @param {string} table @param {ReadQuery} query */
  async function readOne(table, query) {
    const result = await read(table, { ...query, limit: 1 });
    return result.ok ? { ok: /** @type {const} */ (true), data: result.data[0] ?? null } : result;
  }
  return {
    configured: !configError,
    configError: configError || null,
    read, readOne,
    close() { closed = true; for (const controller of controllers) controller.abort(); },
  };
}

const ids = {
  reservation: /^reservation_[0-9]{3,}$/,
  consultation: /^consultation_[0-9]{3,}$/,
  customer: /^customer_[0-9]{3,}$/,
  employee: /^employee_[0-9]{3,}$/,
  store: /^store_[0-9]{3,}$/,
  risk: /^risk_[0-9]{3,}$/,
  product: /^product_[0-9]{3,}$/,
  plan: /^own_plan_[0-9]{3,}$/,
};
const reservationStatuses = new Set(['예약 확정', '방문 완료', '취소', '노쇼']);
const consultationStatuses = new Set(['진행 중', '방문 예정', '완료', '취소']);
const riskLevels = new Set(['정상', '주의', '경계', '위험', '매우 위험']);
const consultationSelect = 'id,customer_id,store_id,purpose,status,used_ai,call_id,used_phone,used_visit,started_at,ended_at';
const reservationSelect = 'id,consultation_id,store_id,employee_id,source,reserved_at,visit_at,purpose,status';
const riskSelect = 'id,consultation_id,customer_id,stage,risk_score,risk_level,created_at';

/** Accept valid Postgres ISO timestamps without replacing their date, offset, or precision. */
export function isStoredTimestamp(/** @type {unknown} */ value) {
  if (typeof value !== 'string') return false;
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,9})?(Z|[+-]\d{2}:\d{2})$/.exec(value);
  if (!match) return false;
  const [year, month, day, hour, minute, second] = match.slice(1, 7).map(Number);
  const calendar = new Date(0);
  calendar.setUTCFullYear(year, month - 1, day);
  const offset = match[7];
  return year >= 1 && month >= 1 && month <= 12 && day >= 1
    && calendar.getUTCFullYear() === year && calendar.getUTCMonth() === month - 1 && calendar.getUTCDate() === day
    && hour < 24 && minute < 60 && second < 60
    && (offset === 'Z' || Number(offset.slice(1, 3)) < 24 && Number(offset.slice(4, 6)) < 60)
    && Number.isFinite(Date.parse(value));
}

export function maskStoredName(/** @type {string} */ name) {
  const chars = Array.from(name.trim());
  return chars.length < 2 ? '*' : chars[0] + '*'.repeat(Math.max(1, chars.length - 2)) + (chars.length > 2 ? chars.at(-1) : '');
}
export function maskStoredPhone(/** @type {string} */ phone) {
  const digits = phone.replace(/\D/g, '');
  return digits.length >= 9 && digits.length <= 15 ? '***-****-' + digits.slice(-4) : '연락처 비공개';
}

/** Saved text is never generated or persisted here. Mask known contacts before returning a bounded projection. */
function narrative(/** @type {any} */ value, /** @type {Row} */ customer, maximum = 600) {
  if (value == null || typeof value === 'string' && !value.trim()) return null;
  if (typeof value !== 'string') throw new ReadFailure('REAL_DATA_INVALID_RESPONSE');
  return value.split(customer.name).join(maskStoredName(customer.name))
    .split(customer.phone).join(maskStoredPhone(customer.phone))
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[이메일 비공개]')
    .replace(/(?:\+?82[-\s]?)?(?:0?1[016789]|0?[2-6][1-5]?)[-\s]?\d{3,4}[-\s]?\d{4}/g, '[연락처 비공개]')
    .slice(0, maximum);
}

class ReadFailure extends Error {
  constructor(/** @type {string} */ code) { super(code); this.code = code; }
}
const requireValid = (/** @type {unknown} */ condition) => { if (!condition) throw new ReadFailure('REAL_DATA_INVALID_RESPONSE'); };
const id = (/** @type {any} */ value, /** @type {RegExp} */ pattern) => typeof value === 'string' && pattern.test(value);
const listEnvelope = (/** @type {any[]} */ items) => ({ source: 'supabase', readOnly: true, items });
const errors = /** @type {Record<string, number>} */ ({
  REAL_DATA_NOT_CONFIGURED: 503, REAL_DATA_CONFIG_INVALID: 503, HOME_STORE_NOT_CONFIGURED: 503,
  REAL_DATA_ACCESS_DENIED: 502, REAL_DATA_UNAVAILABLE: 502, REAL_DATA_TIMEOUT: 504, REAL_DATA_INVALID_RESPONSE: 502,
  REAL_DATA_INVALID_QUERY: 500,
  INVALID_CUSTOMER_ID: 400, INVALID_RESERVATION_ID: 400, INVALID_LIMIT: 400,
  CUSTOMER_PRIVACY_RESTRICTED: 403,
  CUSTOMER_NOT_FOUND: 404, RESERVATION_NOT_FOUND: 404, NOT_FOUND: 404, METHOD_NOT_ALLOWED: 405,
});
const fail = (/** @type {string} */ code) => ({ status: errors[code] ?? 502, body: { errorCode: Object.hasOwn(errors, code) ? code : 'REAL_DATA_UNAVAILABLE' } });

/**
 * Read-only business APIs. homeStoreId is server configuration, never a browser actor/filter.
 * @param {{provider: ReturnType<typeof createSupabaseReadProvider>, homeStoreId?: string | null}} options
 */
export function createRealDataApi({ provider, homeStoreId = null }) {
  const home = typeof homeStoreId === 'string' && ids.store.test(homeStoreId) ? homeStoreId : null;
  /** @param {string} table @param {ReadQuery} query */
  async function read(table, query) {
    const result = await provider.read(table, query);
    if (!result.ok) throw new ReadFailure(result.code);
    return result.data;
  }
  /** @param {string[]} values */
  const within = values => 'in.(' + [...new Set(values)].join(',') + ')';
  /** @param {Row} row */
  function validConsultationHeader(row) {
    requireValid(object(row) && id(row.id, ids.consultation) && id(row.customer_id, ids.customer) && row.store_id === home
      && text(row.purpose) && consultationStatuses.has(row.status) && isStoredTimestamp(row.started_at));
  }
  /** @param {Row} row */
  function validConsultation(row) {
    validConsultationHeader(row);
    requireValid([row.used_ai, row.used_phone, row.used_visit].every(value => typeof value === 'boolean')
      && (row.call_id === null || typeof row.call_id === 'string' && row.call_id.length > 0)
      && isStoredTimestamp(row.started_at) && (row.ended_at === null || isStoredTimestamp(row.ended_at) && Date.parse(row.ended_at) >= Date.parse(row.started_at)));
    return row;
  }
  /** @param {string[]} customerIds @param {boolean} [includeCurrent] */
  async function customers(customerIds, includeCurrent = false) {
    if (!customerIds.length) return new Map();
    const requested = new Set(customerIds);
    const rows = await read('customers', { select: 'id,name,phone,privacy_consent' + (includeCurrent ? ',product_id,plan_id' : ''), filters: { id: within(customerIds) }, limit: requested.size });
    const found = new Map();
    for (const row of rows) {
      requireValid(id(row.id, ids.customer) && requested.has(row.id) && !found.has(row.id) && text(row.name) && text(row.phone)
        && typeof row.privacy_consent === 'boolean'
        && (!includeCurrent || !row.privacy_consent || id(row.product_id, ids.product) && id(row.plan_id, ids.plan)));
      found.set(row.id, row);
    }
    requireValid(found.size === requested.size);
    return found;
  }
  /** Fetch current product/plan IDs in batches rather than making a request per customer. @param {Map<string, Row>} people */
  async function currentServices(people) {
    const current = new Map();
    const consented = [...people.values()].filter(customer => customer.privacy_consent);
    if (!consented.length) return current;
    const productIds = [...new Set(consented.map(customer => customer.product_id))];
    const planIds = [...new Set(consented.map(customer => customer.plan_id))];
    requireValid(productIds.every(value => id(value, ids.product)) && planIds.every(value => id(value, ids.plan)));
    const [productRows, planRows] = await Promise.all([
      read('products', { select: 'id,name,maker,storage_gb,color', filters: { id: within(productIds) }, limit: productIds.length }),
      read('own_plans', { select: 'id,name,monthly_fee', filters: { id: within(planIds) }, limit: planIds.length }),
    ]);
    const products = new Map();
    const plans = new Map();
    for (const row of productRows) {
      requireValid(productIds.includes(row.id) && !products.has(row.id) && text(row.name) && ['Samsung', 'Apple'].includes(row.maker)
        && Number.isSafeInteger(row.storage_gb) && row.storage_gb > 0 && text(row.color));
      products.set(row.id, { id: row.id, name: row.name, maker: row.maker, storageGb: row.storage_gb, color: row.color });
    }
    for (const row of planRows) {
      requireValid(planIds.includes(row.id) && !plans.has(row.id) && text(row.name) && Number.isSafeInteger(row.monthly_fee) && row.monthly_fee >= 0);
      plans.set(row.id, { id: row.id, name: row.name, monthlyFee: row.monthly_fee });
    }
    requireValid(products.size === productIds.length && plans.size === planIds.length);
    for (const customer of consented) current.set(customer.id, { currentProduct: products.get(customer.product_id), currentPlan: plans.get(customer.plan_id) });
    return current;
  }
  /** Read saved summaries only for consented, already-scoped consultation/customer pairs. @param {Row[]} consultations */
  async function savedSummaries(consultations) {
    const saved = new Map();
    if (!consultations.length) return saved;
    const linked = new Map(consultations.map(row => [row.id, row.customer_id]));
    const rows = await read('consultations', {
      select: 'id,customer_id,store_id,ai_summary',
      filters: { store_id: 'eq.' + home, id: within([...linked.keys()]) }, limit: linked.size,
    });
    for (const row of rows) {
      requireValid(linked.has(row.id) && linked.get(row.id) === row.customer_id && row.store_id === home
        && !saved.has(row.id) && (row.ai_summary === null || typeof row.ai_summary === 'string'));
      saved.set(row.id, row.ai_summary);
    }
    requireValid(saved.size === linked.size);
    return saved;
  }
  /** @param {Row[]} consultations */
  async function risks(consultations) {
    if (!consultations.length) return new Map();
    const linked = new Map(consultations.map(row => [row.id, row.customer_id]));
    const rows = await read('risks', { select: riskSelect, filters: { consultation_id: within([...linked.keys()]) }, order: 'created_at.desc', limit: Math.min(1000, consultations.length * 20) });
    const grouped = new Map();
    const seen = new Set();
    for (const row of rows) {
      requireValid(id(row.id, ids.risk) && !seen.has(row.id) && linked.has(row.consultation_id) && linked.get(row.consultation_id) === row.customer_id
        && ['AI', 'PHONE', 'VISIT'].includes(row.stage) && Number.isInteger(row.risk_score) && row.risk_score >= 0 && row.risk_score <= 99
        && riskLevels.has(row.risk_level) && isStoredTimestamp(row.created_at));
      seen.add(row.id);
      const group = grouped.get(row.consultation_id) ?? [];
      group.push({ id: row.id, stage: row.stage, score: row.risk_score, level: row.risk_level, createdAt: row.created_at });
      grouped.set(row.consultation_id, group);
    }
    return grouped;
  }
  /** @param {Row} row @param {Row} customer @param {any[]} riskRows */
  function consultationDto(row, customer, riskRows = []) {
    const summaryPreview = narrative(row.ai_summary, customer, 280);
    return {
      id: row.id, customerId: row.customer_id, storeId: row.store_id, callId: row.call_id, purpose: narrative(row.purpose, customer, 300),
      status: row.status, startedAt: row.started_at, endedAt: row.ended_at,
      summaryStatus: summaryPreview === null ? 'missing' : 'available', summaryPreview,
      usedAi: row.used_ai, usedPhone: row.used_phone, usedVisit: row.used_visit, risks: riskRows,
    };
  }
  /** @param {string} customerId @param {number} limit @param {Row} [knownCustomer] */
  async function history(customerId, limit, knownCustomer) {
    const rows = await read('consultations', { select: consultationSelect, filters: { store_id: 'eq.' + home, customer_id: 'eq.' + customerId }, order: 'started_at.desc,id.desc', limit });
    for (const row of rows) { validConsultation(row); requireValid(row.customer_id === customerId); }
    requireValid(new Set(rows.map(row => row.id)).size === rows.length);
    if (!rows.length) return [];
    const people = knownCustomer ? new Map([[customerId, knownCustomer]]) : await customers([customerId]);
    requireValid(people.get(customerId).id === customerId);
    if (!people.get(customerId).privacy_consent) throw new ReadFailure('CUSTOMER_PRIVACY_RESTRICTED');
    const [summaries, riskRows] = await Promise.all([savedSummaries(rows), risks(rows)]);
    return rows.map(row => consultationDto({ ...row, ai_summary: summaries.get(row.id) }, people.get(customerId), riskRows.get(row.id) ?? []));
  }
  /** @param {string | null} raw @param {number} fallback @param {number} maximum */
  function parseLimit(raw, fallback, maximum) {
    if (raw === null) return fallback;
    if (!/^[1-9]\d*$/.test(raw) || Number(raw) > maximum) throw new ReadFailure('INVALID_LIMIT');
    return Number(raw);
  }
  /** @param {string | null} reservationId @param {number} limit */
  async function appointments(reservationId, limit) {
    const rows = await read('reservations', {
      select: reservationSelect, filters: { store_id: 'eq.' + home, ...(reservationId ? { id: 'eq.' + reservationId } : {}) },
      order: 'visit_at.asc,id.asc', limit,
    });
    for (const row of rows) {
      requireValid(id(row.id, ids.reservation) && row.store_id === home && (!reservationId || row.id === reservationId)
        && id(row.consultation_id, ids.consultation) && id(row.employee_id, ids.employee) && ['AI', 'PHONE'].includes(row.source)
        && isStoredTimestamp(row.reserved_at) && isStoredTimestamp(row.visit_at) && text(row.purpose) && reservationStatuses.has(row.status));
    }
    if (!rows.length) return [];
    requireValid(new Set(rows.map(row => row.id)).size === rows.length);
    const consultationIds = [...new Set(rows.map(row => row.consultation_id))];
    const employeeIds = [...new Set(rows.map(row => row.employee_id))];
    const [consultationRows, employeeRows] = await Promise.all([
      read('consultations', { select: 'id,customer_id,store_id', filters: { store_id: 'eq.' + home, id: within(consultationIds) }, limit: consultationIds.length }),
      read('employees', { select: 'id,store_id,name', filters: { store_id: 'eq.' + home, id: within(employeeIds) }, limit: employeeIds.length }),
    ]);
    const related = new Map();
    const staff = new Map();
    for (const row of consultationRows) {
      requireValid(id(row.id, ids.consultation) && id(row.customer_id, ids.customer) && row.store_id === home
        && consultationIds.includes(row.id) && !related.has(row.id));
      related.set(row.id, row);
    }
    for (const row of employeeRows) { requireValid(employeeIds.includes(row.id) && row.store_id === home && !staff.has(row.id) && text(row.name)); staff.set(row.id, row); }
    requireValid(related.size === consultationIds.length && staff.size === employeeIds.length);
    const people = await customers(consultationRows.map(row => row.customer_id));
    const summaries = await savedSummaries(consultationRows.filter(row => people.get(row.customer_id).privacy_consent));
    return rows.map(row => {
      const consultation = related.get(row.consultation_id);
      const customer = people.get(consultation.customer_id);
      const privacy = customer.privacy_consent;
      const saved = { ...consultation, ai_summary: privacy ? summaries.get(consultation.id) : null };
      const summaryPreview = privacy ? narrative(saved.ai_summary, customer, 280) : null;
      return {
        id: row.id, consultationId: row.consultation_id, storeId: row.store_id,
        customerId: customer.id, privacyConsent: privacy,
        customerNameMasked: privacy ? maskStoredName(customer.name) : '비공개 고객', phoneMasked: privacy ? maskStoredPhone(customer.phone) : '연락처 비공개',
        employeeId: row.employee_id, employeeName: maskStoredName(staff.get(row.employee_id).name), source: row.source,
        reservedAt: row.reserved_at, visitAt: row.visit_at, purpose: privacy ? narrative(row.purpose, customer, 300) : '개인정보 동의 확인 필요', status: row.status,
        summaryStatus: !privacy ? 'restricted' : summaryPreview === null ? 'missing' : 'available', summaryPreview,
        // Internal only; removed before the API response.
        _consultation: saved, _customer: customer,
      };
    });
  }
  /** @param {Row} row */
  const publicAppointment = row => { const { _consultation, _customer, ...dto } = row; return dto; };

  return {
    /**
     * @param {string} method @param {string} path @param {URLSearchParams} [query]
     * @returns {Promise<{status: number, body: any} | null>}
     */
    async handle(method, path, query = new URLSearchParams()) {
      if (!path.startsWith('/api/data/') && !path.startsWith('/api/briefings/')) return null;
      if (method !== 'GET') return fail('METHOD_NOT_ALLOWED');
      if (path === '/api/data/status') return { status: 200, body: {
        source: 'supabase', readOnly: true, configured: provider.configured, scopeConfigured: Boolean(home),
        errorCode: provider.configError || (!home ? 'HOME_STORE_NOT_CONFIGURED' : null),
      } };
      if (provider.configError) return fail(provider.configError);
      if (!home) return fail('HOME_STORE_NOT_CONFIGURED');
      try {
        if (path === '/api/data/appointments') {
          const rows = await appointments(null, parseLimit(query.get('limit'), 50, 100));
          return { status: 200, body: listEnvelope(rows.map(publicAppointment)) };
        }
        if (path === '/api/data/customers') {
          const limit = parseLimit(query.get('limit'), 20, 100);
          // Customers have no store_id. Scope them through verified consultations, never the whole customer table.
          const rows = await read('consultations', { select: 'id,customer_id,store_id,purpose,status,started_at', filters: { store_id: 'eq.' + home }, order: 'started_at.desc,id.desc', limit: 500 });
          const latest = new Map();
          for (const row of rows) { validConsultationHeader(row); if (!latest.has(row.customer_id) && latest.size < limit) latest.set(row.customer_id, row); }
          const people = await customers([...latest.keys()], true);
          const current = await currentServices(people);
          return { status: 200, body: listEnvelope([...latest.entries()].map(([customerId, row]) => {
            const customer = people.get(customerId);
            const privacy = customer.privacy_consent;
            return { id: customerId, privacyConsent: privacy,
              nameMasked: privacy ? maskStoredName(customer.name) : '비공개 고객', phoneMasked: privacy ? maskStoredPhone(customer.phone) : '연락처 비공개',
              latestConsultationId: row.id, latestConsultationAt: row.started_at,
              latestPurpose: privacy ? narrative(row.purpose, customer, 300) : '개인정보 동의 확인 필요', latestStatus: row.status,
              currentProduct: current.get(customerId)?.currentProduct ?? null, currentPlan: current.get(customerId)?.currentPlan ?? null };
          })) };
        }
        const customerMatch = /^\/api\/data\/customers\/([^/]+)\/consultations$/.exec(path);
        if (customerMatch) {
          const customerId = customerMatch[1];
          if (!ids.customer.test(customerId)) return fail('INVALID_CUSTOMER_ID');
          const rows = await history(customerId, parseLimit(query.get('limit'), 5, 20));
          return rows.length ? { status: 200, body: listEnvelope(rows) } : fail('CUSTOMER_NOT_FOUND');
        }
        const briefingMatch = /^\/api\/briefings\/([^/]+)$/.exec(path);
        if (briefingMatch) {
          const reservationId = briefingMatch[1];
          if (!ids.reservation.test(reservationId)) return fail('INVALID_RESERVATION_ID');
          const rows = await appointments(reservationId, 1);
          if (!rows.length) return fail('RESERVATION_NOT_FOUND');
          const selected = rows[0];
          const summary = narrative(selected._consultation.ai_summary, selected._customer, 1200);
          const privacy = selected.privacyConsent;
          let currentProduct = null;
          let currentPlan = null;
          let requestNote = null;
          if (privacy) {
            const [customerResult, noteResult] = await Promise.all([
              provider.readOne('customers', { select: 'id,product_id,plan_id', filters: { id: 'eq.' + selected.customerId } }),
              provider.readOne('reservations', { select: 'id,store_id,note', filters: { id: 'eq.' + reservationId, store_id: 'eq.' + home } }),
            ]);
            if (!customerResult.ok) throw new ReadFailure(customerResult.code);
            if (!noteResult.ok) throw new ReadFailure(noteResult.code);
            const customer = customerResult.data;
            const note = noteResult.data;
            requireValid(customer && customer.id === selected.customerId && id(customer.product_id, ids.product) && id(customer.plan_id, ids.plan)
              && note && note.id === reservationId && note.store_id === home && (note.note === null || typeof note.note === 'string'));
            const current = await currentServices(new Map([[selected.customerId, { ...selected._customer, ...customer }]]));
            currentProduct = current.get(selected.customerId).currentProduct;
            currentPlan = current.get(selected.customerId).currentPlan;
            requestNote = narrative(note.note, selected._customer, 1200);
          }
          return { status: 200, body: {
            source: 'supabase', readOnly: true, reservation: publicAppointment(selected),
            summaryStatus: !privacy ? 'restricted' : summary === null ? 'missing' : 'available', summary,
            currentProduct, currentPlan, requestNote,
            desiredProduct: null, desiredDevice: null, desiredProductStatus: 'not_recorded', desiredDeviceStatus: 'not_recorded',
            checklist: !privacy ? ['고객 개인정보 동의 확인이 필요합니다. 상세 상담 기록은 조회하지 않습니다.']
              : ['예약 목적과 방문 일시, 현재 이용 상품·요금제를 확인하세요.',
                requestNote === null ? '저장된 예약 요청사항이 없습니다. 고객 요청을 직접 확인하세요.' : '저장된 예약 요청사항을 확인하세요.',
                '별도 희망 상품·단말 항목이 기록되어 있지 않습니다. 고객에게 직접 확인하세요.',
                summary === null ? '저장된 요약이 없습니다. 고객 요청을 직접 확인하세요.' : '저장된 상담 요약을 확인하고 필요한 내용을 고객에게 다시 확인하세요.'],
            history: privacy ? await history(selected.customerId, 5, selected._customer) : [],
          } };
        }
        return fail('NOT_FOUND');
      } catch (error) { return fail(error instanceof ReadFailure ? error.code : 'REAL_DATA_INVALID_RESPONSE'); }
    },
  };
}
