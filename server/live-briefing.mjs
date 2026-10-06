import { isStoredTimestamp, maskStoredName, projectStoredNarrative } from './real-data.mjs';

/** @typedef {Record<string, any>} Row */
/** @typedef {{currentCallId?: string, currentConsultationId?: string | null, currentStartedAt?: string, customerId?: string, storeId?: string}} LiveBriefingContext */
/** @typedef {{id: string, score: number, level: string, stage: string, createdAt: string, profanityCount: number | null, threatCount: number | null, blameCount: number | null, sexualCount: number | null, shoutingCount: number | null}} PreviousRisk */

const ids = { customer: /^customer_[0-9]{3,}$/, consultation: /^consultation_[0-9]{3,}$/, store: /^store_[0-9]{3,}$/,
  product: /^product_[0-9]{3,}$/, plan: /^own_plan_[0-9]{3,}$/, risk: /^risk_[0-9]{3,}$/ };
const text = (/** @type {any} */ value) => typeof value === 'string' && value.trim().length > 0;
const object = (/** @type {any} */ value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const integer = (/** @type {any} */ value) => Number.isSafeInteger(value) && value >= 0;
const riskLevels = new Set(['정상', '주의', '경계', '위험', '매우 위험']);
const consultationSelect = 'id,customer_id,store_id,purpose,status,call_id,started_at,ended_at';
const riskSelect = 'id,consultation_id,customer_id,stage,risk_score,risk_level,created_at,profanity_count,threat_violence_count,verbal_abuse_count,sexual_count,shouting_count';
const errorStatus = /** @type {Record<string, number>} */ ({
  INVALID_CUSTOMER_ID: 400, INVALID_LIVE_BRIEFING_CONTEXT: 400, STORE_NOT_ALLOWED: 403,
  CUSTOMER_NOT_FOUND: 404, NOT_FOUND: 404, METHOD_NOT_ALLOWED: 405,
  REAL_DATA_NOT_CONFIGURED: 503, REAL_DATA_CONFIG_INVALID: 503, HOME_STORE_NOT_CONFIGURED: 503,
  REAL_DATA_ACCESS_DENIED: 502, REAL_DATA_UNAVAILABLE: 502, REAL_DATA_TIMEOUT: 504,
  REAL_DATA_INVALID_RESPONSE: 502, REAL_DATA_INVALID_QUERY: 500,
});
class BriefingFailure extends Error {
  constructor(/** @type {string} */ code) { super(code); this.code = code; }
}
const valid = (/** @type {unknown} */ condition) => { if (!condition) throw new BriefingFailure('REAL_DATA_INVALID_RESPONSE'); };
const failure = (/** @type {string} */ code) => {
  const safeCode = Object.hasOwn(errorStatus, code) ? code : 'REAL_DATA_UNAVAILABLE';
  return { status: errorStatus[safeCode], body: { errorCode: safeCode } };
};

/** Preserve sub-millisecond precision when comparing Postgres timestamps and offsets. */
function instant(/** @type {string} */ value) {
  const fraction = /\.(\d+)(?:Z|[+-])/u.exec(value)?.[1] ?? '';
  const whole = value.replace(/\.\d+(?=Z|[+-])/u, '');
  return BigInt(Date.parse(whole)) * 1_000_000n + BigInt(fraction.padEnd(9, '0') || '0');
}
function latest(/** @type {Row} */ left, /** @type {Row} */ right, /** @type {string} */ field) {
  const a = instant(left[field]), b = instant(right[field]);
  return a > b ? -1 : a < b ? 1 : right.id.localeCompare(left.id);
}

/** Completed consultations only; current call/consultation and equal-or-later end times are excluded. */
export function selectPreviousConsultation(/** @type {Row[]} */ rows, /** @type {LiveBriefingContext} */ context = {}) {
  const eligible = rows.filter(row => {
    valid(object(row) && ids.consultation.test(row.id) && row.status === '완료'
      && (row.purpose === null || typeof row.purpose === 'string') && (row.started_at === null || isStoredTimestamp(row.started_at))
      && (row.call_id === null || text(row.call_id))
      && (row.ended_at === null || isStoredTimestamp(row.ended_at) && (row.started_at === null || instant(row.ended_at) >= instant(row.started_at))));
    return row.ended_at !== null && row.id !== context.currentConsultationId
      && (!context.currentCallId || row.call_id !== context.currentCallId)
      && (!context.currentStartedAt || instant(row.ended_at) < instant(context.currentStartedAt));
  });
  return eligible.sort((a, b) => latest(a, b, 'ended_at'))[0] ?? null;
}

/** AI first, newest within AI; otherwise newest PHONE/VISIT together. No score/count aggregation. */
export function selectPreviousRisk(/** @type {Row[]} */ rows) {
  const seen = new Set();
  const projected = rows.map(row => {
    valid(object(row) && ids.risk.test(row.id) && !seen.has(row.id)
      && ['AI', 'PHONE', 'VISIT'].includes(row.stage) && integer(row.risk_score) && row.risk_score <= 99
      && riskLevels.has(row.risk_level) && isStoredTimestamp(row.created_at));
    seen.add(row.id);
    const count = (/** @type {string} */ field) => {
      if (row[field] == null) return null;
      valid(integer(row[field]));
      return /** @type {number} */ (row[field]);
    };
    return { id: row.id, score: row.risk_score, level: row.risk_level, stage: row.stage, createdAt: row.created_at,
      profanityCount: count('profanity_count'), threatCount: count('threat_violence_count'), blameCount: count('verbal_abuse_count'),
      sexualCount: count('sexual_count'), shoutingCount: count('shouting_count') };
  });
  const ai = projected.filter(row => row.stage === 'AI');
  return (ai.length ? ai : projected).sort((a, b) => latest(a, b, 'createdAt'))[0] ?? null;
}

/** Stored facts produce 2–4 short cautions; no generated summary or judgement about the current caller. */
export function buildLiveBriefingGuidance(/** @type {{privacyConsent: boolean, recentConsultation: Row | null, previousRisk: PreviousRisk | null}} */ { privacyConsent, recentConsultation, previousRisk }) {
  if (!privacyConsent) return ['고객 개인정보 동의 확인이 필요합니다.'];
  const messages = [];
  if (previousRisk?.threatCount != null && previousRisk.threatCount >= 1) {
    messages.push('이전 상담에 위협 표현 기록이 있습니다. 현재 상담의 위험 신호를 주의 깊게 확인하세요.');
  }
  if (previousRisk?.profanityCount != null && previousRisk.profanityCount >= 1) {
    messages.push('이전 욕설 기록이 있습니다. 감정적 대응을 피하고 안내 기준을 명확히 전달하세요.');
  }
  if (previousRisk && (['위험', '매우 위험'].includes(previousRisk.level) || (previousRisk.threatCount ?? 0) >= 1)) {
    messages.push('필요 시 관리자 지원을 준비하세요.');
  }
  if (recentConsultation?.summary) messages.push('이전 문의 내용을 먼저 확인한 뒤 중복 질문을 줄이세요.');
  if (previousRisk?.sexualCount != null && previousRisk.sexualCount >= 1) messages.push('이전 선정적 표현 기록이 있습니다. 상담 범위와 안내 기준을 명확히 전달하세요.');
  if (previousRisk?.shoutingCount != null && previousRisk.shoutingCount >= 1) messages.push('이전 고성 기록이 있습니다. 차분하게 안내하고 현재 통화의 음성 신호를 확인하세요.');
  if (previousRisk?.blameCount != null && previousRisk.blameCount >= 1) messages.push('이전 비난 표현 기록이 있습니다. 확인된 사실과 처리 기준을 중심으로 안내하세요.');
  if (messages.length < 2) messages.push(recentConsultation && !recentConsultation.summary
    ? '저장된 상담 요약이 없으므로 최근 상담 목적을 먼저 확인하세요.'
    : '현재 고객 요청과 필요한 확인 사항을 먼저 확인하세요.');
  if (messages.length < 2) messages.push('이전 상담 이력과 현재 통화의 위험 신호를 구분해 확인하세요.');
  return messages.slice(0, 4);
}

/**
 * context must come from a matching server live-call record, never directly from browser query fields.
 * Without context, a stored consultation in the configured home store is required before customer lookup.
 * @param {{provider: ReturnType<import('./real-data.mjs').createSupabaseReadProvider>, homeStoreId?: string | null}} options
 */
export function createLiveBriefingApi({ provider, homeStoreId = null }) {
  const home = typeof homeStoreId === 'string' && ids.store.test(homeStoreId) ? homeStoreId : null;
  const read = async (/** @type {string} */ table, /** @type {import('./real-data.mjs').ReadQuery} */ query) => {
    let result;
    try { result = await provider.read(table, query); } catch { throw new BriefingFailure('REAL_DATA_UNAVAILABLE'); }
    if (!result.ok) throw new BriefingFailure(result.code);
    valid(Array.isArray(result.data));
    return result.data;
  };
  const one = async (/** @type {string} */ table, /** @type {import('./real-data.mjs').ReadQuery} */ query) => {
    const rows = await read(table, { ...query, limit: 1 });
    valid(rows.length <= 1);
    return rows[0] ?? null;
  };
  return {
    /** @param {string} method @param {string} path @param {LiveBriefingContext} [context] */
    async handle(method, path, context = {}) {
      const match = /^\/api\/live-briefing\/([^/]+)$/u.exec(path);
      if (!match) return path.startsWith('/api/live-briefing/') ? failure('NOT_FOUND') : null;
      if (method !== 'GET') return failure('METHOD_NOT_ALLOWED');
      const customerId = match[1];
      if (!ids.customer.test(customerId)) return failure('INVALID_CUSTOMER_ID');
      if (provider.configError) return failure(provider.configError);
      if (!home) return failure('HOME_STORE_NOT_CONFIGURED');
      try {
        if (!object(context)) throw new BriefingFailure('INVALID_LIVE_BRIEFING_CONTEXT');
        const scoped = Object.keys(context).length > 0;
        if (scoped) {
          if (context.customerId !== customerId || context.storeId !== home) throw new BriefingFailure('STORE_NOT_ALLOWED');
          if (typeof context.currentCallId !== 'string' || !context.currentCallId.trim() || context.currentCallId.length > 200 || /[\r\n]/u.test(context.currentCallId)
            || !isStoredTimestamp(context.currentStartedAt)
            || context.currentConsultationId != null && !ids.consultation.test(context.currentConsultationId)) {
            throw new BriefingFailure('INVALID_LIVE_BRIEFING_CONTEXT');
          }
        } else {
          const link = await one('consultations', { select: 'id,customer_id,store_id',
            filters: { customer_id: 'eq.' + customerId, store_id: 'eq.' + home }, order: 'id.desc' });
          if (!link) return failure('CUSTOMER_NOT_FOUND');
          valid(ids.consultation.test(link.id) && link.customer_id === customerId && link.store_id === home);
        }
        const customer = await one('customers', { select: 'id,name,privacy_consent', filters: { id: 'eq.' + customerId } });
        if (!customer) return failure('CUSTOMER_NOT_FOUND');
        valid(object(customer) && customer.id === customerId && text(customer.name) && typeof customer.privacy_consent === 'boolean');
        const envelope = { source: 'supabase', readOnly: true, privacyConsent: customer.privacy_consent,
          customer: { id: customerId, nameMasked: customer.privacy_consent ? maskStoredName(customer.name) : '비공개 고객' } };
        if (!customer.privacy_consent) return { status: 200, body: { ...envelope, currentProduct: null, currentPlan: null,
          recentConsultation: null, previousRisk: null,
          guidance: buildLiveBriefingGuidance({ privacyConsent: false, recentConsultation: null, previousRisk: null }) } };
        const detail = await one('customers', { select: 'id,product_id,plan_id', filters: { id: 'eq.' + customerId } });
        valid(detail && detail.id === customerId
          && (detail.product_id === null || ids.product.test(detail.product_id)) && (detail.plan_id === null || ids.plan.test(detail.plan_id)));
        const people = { ...customer, name: customer.name.trim() };
        const filters = /** @type {Record<string, string>} */ ({ customer_id: 'eq.' + customerId, store_id: 'eq.' + home, status: 'eq.완료',
          ended_at: scoped ? 'lt.' + context.currentStartedAt : 'not.is.null' });
        const [product, plan, completed] = await Promise.all([
          detail.product_id === null ? null : one('products', { select: 'id,name,maker,storage_gb,color', filters: { id: 'eq.' + detail.product_id } }),
          detail.plan_id === null ? null : one('own_plans', { select: 'id,name,monthly_fee', filters: { id: 'eq.' + detail.plan_id } }),
          read('consultations', { select: consultationSelect, filters, order: 'ended_at.desc.nullslast,id.desc', limit: 100 }),
        ]);
        let currentProduct = null, currentPlan = null;
        if (detail.product_id !== null) {
          if (!product) throw new BriefingFailure('REAL_DATA_INVALID_RESPONSE');
          valid(product.id === detail.product_id && text(product.name) && ['Samsung', 'Apple'].includes(product.maker)
            && integer(product.storage_gb) && product.storage_gb > 0 && text(product.color));
          currentProduct = { id: product.id, name: product.name, maker: product.maker, storageGb: product.storage_gb, color: product.color };
        }
        if (detail.plan_id !== null) {
          if (!plan) throw new BriefingFailure('REAL_DATA_INVALID_RESPONSE');
          valid(plan.id === detail.plan_id && text(plan.name) && integer(plan.monthly_fee));
          currentPlan = { id: plan.id, name: plan.name, monthlyFee: plan.monthly_fee };
        }
        const seen = new Set();
        for (const row of completed) {
          valid(object(row) && row.customer_id === customerId && row.store_id === home && !seen.has(row.id));
          seen.add(row.id);
        }
        const recent = selectPreviousConsultation(completed, context);
        let recentConsultation = null, previousRisk = null;
        if (recent) {
          const summary = await one('consultations', { select: 'id,customer_id,store_id,ai_summary',
            filters: { id: 'eq.' + recent.id, customer_id: 'eq.' + customerId, store_id: 'eq.' + home } });
          valid(summary && summary.id === recent.id && summary.customer_id === customerId && summary.store_id === home
            && (summary.ai_summary === null || typeof summary.ai_summary === 'string'));
          recentConsultation = { id: recent.id, purpose: projectStoredNarrative(recent.purpose, people, 300),
            summary: projectStoredNarrative(summary.ai_summary, people, 1200), endedAt: recent.ended_at };
          const risks = await read('risks', { select: riskSelect, filters: { consultation_id: 'eq.' + recent.id, customer_id: 'eq.' + customerId },
            order: 'created_at.desc,id.desc', limit: 1000 });
          for (const risk of risks) valid(object(risk) && risk.consultation_id === recent.id && risk.customer_id === customerId);
          previousRisk = selectPreviousRisk(risks);
        }
        return { status: 200, body: { ...envelope, currentProduct, currentPlan, recentConsultation, previousRisk,
          guidance: buildLiveBriefingGuidance({ privacyConsent: true, recentConsultation, previousRisk }) } };
      } catch (error) { return failure(error instanceof BriefingFailure ? error.code : 'REAL_DATA_INVALID_RESPONSE'); }
    },
  };
}
