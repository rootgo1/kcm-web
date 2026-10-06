import { validRealDataTimestamp, type StoredPlan, type StoredProduct } from './realDataApi.js';
import { confirmedBriefingNarrative } from '../lib/briefingNarrative.js';

export interface LiveBriefingRisk {
  id: string; score: number; level: '정상' | '주의' | '경계' | '위험' | '매우 위험';
  stage: 'AI' | 'PHONE' | 'VISIT'; createdAt: string;
  profanityCount: number | null; threatCount: number | null; blameCount: number | null;
  sexualCount: number | null; shoutingCount: number | null;
}
export interface LiveBriefing {
  source: 'supabase'; readOnly: true; customer: { id: string; nameMasked: string }; privacyConsent: boolean;
  currentProduct: StoredProduct | null; currentPlan: StoredPlan | null;
  recentConsultation: { id: string; purpose: string | null; summary: string | null; endedAt: string } | null;
  previousRisk: LiveBriefingRisk | null; guidance: string[];
}

const errorMessages = {
  REAL_DATA_NOT_CONFIGURED: '저장 자료 조회가 아직 준비되지 않았습니다.',
  REAL_DATA_CONFIG_INVALID: '저장 자료 조회 설정을 확인해 주세요.',
  HOME_STORE_NOT_CONFIGURED: '현재 매장 범위를 확인할 수 없습니다.',
  REAL_DATA_ACCESS_DENIED: '저장 자료 조회 권한을 확인해 주세요.',
  REAL_DATA_ACCESS_RESTRICTED: '이 고객의 사전 브리핑은 현재 환경에서 조회할 수 없습니다.',
  REAL_DATA_UNAVAILABLE: '잠시 후 다시 조회해 주세요.',
  REAL_DATA_TIMEOUT: '자료 조회가 지연되고 있습니다. 잠시 후 다시 조회해 주세요.',
  REAL_DATA_INVALID_RESPONSE: '조회한 자료를 확인할 수 없습니다.',
  INVALID_CUSTOMER_ID: '조회할 고객 정보를 확인해 주세요.',
  INVALID_LIVE_BRIEFING_CONTEXT: '현재 통화와 고객 정보를 확인할 수 없습니다.',
  INVALID_CALL_ID: '조회할 통화 정보를 확인해 주세요.',
  CALL_NOT_FOUND: '현재 통화 정보를 찾을 수 없습니다.',
  STORE_NOT_ALLOWED: '현재 매장 범위에서 조회할 수 없는 통화입니다.',
  CUSTOMER_NOT_FOUND: '해당 고객의 저장 자료를 찾을 수 없습니다.',
  CUSTOMER_PRIVACY_RESTRICTED: '고객 개인정보 동의 확인이 필요합니다.',
  NETWORK: '저장 자료 서비스에 연결하지 못했습니다. 다시 조회해 주세요.',
  INVALID_RESPONSE: '조회한 자료를 확인할 수 없습니다.',
  UNKNOWN_ERROR: '잠시 후 다시 조회해 주세요.',
} as const;
export type LiveBriefingErrorCode = keyof typeof errorMessages;
export function liveBriefingErrorCode(value: unknown): LiveBriefingErrorCode {
  return typeof value === 'string' && Object.hasOwn(errorMessages, value) ? value as LiveBriefingErrorCode : 'UNKNOWN_ERROR';
}
export function liveBriefingErrorMessage(value: unknown): string { return errorMessages[liveBriefingErrorCode(value)]; }
export class LiveBriefingApiError extends Error {
  readonly code: LiveBriefingErrorCode;
  constructor(code: unknown) {
    const safeCode = liveBriefingErrorCode(code);
    super(safeCode); this.name = 'LiveBriefingApiError'; this.code = safeCode;
  }
}

const record = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const nonempty = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0;
const validId = (kind: string, value: unknown): value is string => typeof value === 'string' && new RegExp(`^${kind}_[0-9]{3,}$`).test(value);
const integer = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
const narrative = (value: unknown): value is string | null => value === null || nonempty(value);
function invalid(): never { throw new LiveBriefingApiError('INVALID_RESPONSE'); }
function product(value: unknown): StoredProduct | null {
  if (value === null) return null;
  if (!record(value) || !validId('product', value.id) || !nonempty(value.name) || typeof value.maker !== 'string'
    || typeof value.color !== 'string' || !integer(value.storageGb) || value.storageGb === 0) return invalid();
  return { id: value.id, name: value.name, maker: value.maker, storageGb: value.storageGb, color: value.color };
}
function plan(value: unknown): StoredPlan | null {
  if (value === null) return null;
  if (!record(value) || !validId('own_plan', value.id) || !nonempty(value.name) || !integer(value.monthlyFee)) return invalid();
  return { id: value.id, name: value.name, monthlyFee: value.monthlyFee };
}
function recent(value: unknown): LiveBriefing['recentConsultation'] {
  if (value === null) return null;
  if (!record(value) || !validId('consultation', value.id) || !narrative(value.purpose) || !narrative(value.summary)
    || !validRealDataTimestamp(value.endedAt)) return invalid();
  return { id: value.id, purpose: confirmedBriefingNarrative(value.purpose),
    summary: confirmedBriefingNarrative(value.summary), endedAt: value.endedAt };
}
function risk(value: unknown): LiveBriefingRisk | null {
  if (value === null) return null;
  if (!record(value) || !validId('risk', value.id) || !integer(value.score) || value.score > 99
    || !(['정상', '주의', '경계', '위험', '매우 위험'] as unknown[]).includes(value.level)
    || !(['AI', 'PHONE', 'VISIT'] as unknown[]).includes(value.stage) || !validRealDataTimestamp(value.createdAt)) return invalid();
  const keys = ['profanityCount', 'threatCount', 'blameCount', 'sexualCount', 'shoutingCount'] as const;
  if (!keys.every(key => value[key] === null || integer(value[key]))) return invalid();
  return { id: value.id, score: value.score, level: value.level as LiveBriefingRisk['level'], stage: value.stage as LiveBriefingRisk['stage'],
    createdAt: value.createdAt, profanityCount: value.profanityCount as number | null, threatCount: value.threatCount as number | null,
    blameCount: value.blameCount as number | null, sexualCount: value.sexualCount as number | null, shoutingCount: value.shoutingCount as number | null };
}

/** Only the masked, read-only contract enters component state; extra identity/transcript fields are discarded. */
export function parseLiveBriefing(value: unknown): LiveBriefing {
  if (!record(value) || value.source !== 'supabase' || value.readOnly !== true || !record(value.customer)
    || !validId('customer', value.customer.id) || !nonempty(value.customer.nameMasked) || typeof value.privacyConsent !== 'boolean'
    || !Array.isArray(value.guidance) || !value.guidance.every(nonempty)) return invalid();
  const currentProduct = product(value.currentProduct), currentPlan = plan(value.currentPlan);
  const recentConsultation = recent(value.recentConsultation), previousRisk = risk(value.previousRisk);
  if (previousRisk !== null && recentConsultation === null) return invalid();
  if (value.privacyConsent ? value.guidance.length < 2 || value.guidance.length > 4
    : value.customer.nameMasked !== '비공개 고객' || currentProduct !== null || currentPlan !== null || recentConsultation !== null
      || previousRisk !== null || value.guidance.length !== 1 || value.guidance[0] !== '고객 개인정보 동의 확인이 필요합니다.') return invalid();
  return { source: 'supabase', readOnly: true, customer: { id: value.customer.id, nameMasked: value.customer.nameMasked },
    privacyConsent: value.privacyConsent, currentProduct, currentPlan, recentConsultation, previousRisk, guidance: [...value.guidance] };
}

/** Same-origin GET only. Timeout, cancellation and error bodies never expose upstream text. */
export async function fetchLiveBriefing(customerId: string, callId: string, signal?: AbortSignal, timeoutMs = 10_000): Promise<LiveBriefing> {
  if (!validId('customer', customerId)) throw new LiveBriefingApiError('INVALID_CUSTOMER_ID');
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(callId)) throw new LiveBriefingApiError('INVALID_CALL_ID');
  const controller = new AbortController();
  const cancel = () => controller.abort();
  if (signal?.aborted) cancel(); else signal?.addEventListener('abort', cancel, { once: true });
  let timedOut = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const operation = (async () => {
    try {
      if (controller.signal.aborted) throw new LiveBriefingApiError('NETWORK');
      const query = new URLSearchParams({ call_id: callId });
      const response = await fetch(`/api/live-briefing/${encodeURIComponent(customerId)}?${query}`, {
        method: 'GET', signal: controller.signal, headers: { Accept: 'application/json' },
      });
      let body: unknown;
      try { body = await response.json(); } catch { throw new LiveBriefingApiError('INVALID_RESPONSE'); }
      if (!response.ok) throw new LiveBriefingApiError(record(body) ? body.errorCode : 'UNKNOWN_ERROR');
      const result = parseLiveBriefing(body);
      if (result.customer.id !== customerId) return invalid();
      return result;
    } catch (error) {
      if (timedOut) throw new LiveBriefingApiError('REAL_DATA_TIMEOUT');
      if (error instanceof LiveBriefingApiError) throw error;
      throw new LiveBriefingApiError('NETWORK');
    }
  })();
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => { timedOut = true; controller.abort(); reject(new LiveBriefingApiError('REAL_DATA_TIMEOUT')); }, timeoutMs);
  });
  try { return await Promise.race([operation, timeout]); }
  finally { if (timer !== undefined) clearTimeout(timer); signal?.removeEventListener('abort', cancel); }
}

type Selection = { callId: string; customerId: string | null };
export type LiveBriefingState = Selection & (
  { status: 'missing-customer' } | { status: 'loading' } | { status: 'ready'; data: LiveBriefing }
  | { status: 'error'; errorCode: LiveBriefingErrorCode }
);
type Loader = (customerId: string, callId: string, signal: AbortSignal) => Promise<LiveBriefing>;

/** Selection identity is independent of transcript snapshots. A generation also blocks loaders that ignore abort. */
export function createLiveBriefingController(onChange: (state: LiveBriefingState) => void, load: Loader = fetchLiveBriefing) {
  let selection: Selection | null = null;
  let generation = 0;
  let active: AbortController | null = null;
  let disposed = false;
  function start(next: Selection) {
    const version = ++generation;
    active?.abort(); active = null; selection = next;
    if (!next.customerId) { onChange({ ...next, status: 'missing-customer' }); return; }
    const customerId = next.customerId;
    const controller = new AbortController(); active = controller;
    onChange({ ...next, status: 'loading' });
    // StrictMode's immediate mount cleanup cancels before a browser request starts.
    void Promise.resolve().then(async () => {
      if (disposed || generation !== version) return;
      try {
        const data = await load(customerId, next.callId, controller.signal);
        if (!disposed && generation === version) onChange({ ...next, status: 'ready', data });
      } catch (error) {
        if (!disposed && generation === version) onChange({ ...next, status: 'error', errorCode: error instanceof LiveBriefingApiError ? error.code : 'UNKNOWN_ERROR' });
      }
    });
  }
  return {
    select(callId: string, customerId: string | null) {
      if (disposed || selection?.callId === callId && selection.customerId === customerId) return;
      start({ callId, customerId });
    },
    reload() { if (!disposed && selection?.customerId) start(selection); },
    dispose() { disposed = true; ++generation; active?.abort(); active = null; },
  };
}
