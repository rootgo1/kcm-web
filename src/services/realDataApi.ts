/** Read-only browser contracts. Customer names/phones are masked by the backend. */
export type RealDataAvailability = 'loading' | 'configured' | 'unconfigured' | 'error';
export type ReservationStatus = '예약 확정' | '방문 완료' | '취소' | '노쇼';
export type StoredConsultationStatus = '진행 중' | '방문 예정' | '완료' | '취소';
export type StoredSummaryStatus = 'available' | 'missing';
export type SummaryStatus = StoredSummaryStatus | 'restricted';
export interface StoredProduct { id: string; name: string; maker: string; storageGb: number; color: string }
export interface StoredPlan { id: string; name: string; monthlyFee: number }
export interface RealAppointment {
  id: string; consultationId: string; storeId: string; customerId: string;
  customerNameMasked: string; phoneMasked: string; employeeId: string; employeeName: string;
  source: 'AI' | 'PHONE'; reservedAt: string; visitAt: string; purpose: string;
  status: ReservationStatus; privacyConsent: boolean; summaryStatus: SummaryStatus; summaryPreview: string | null;
}
export interface StoredCustomer {
  id: string; nameMasked: string; phoneMasked: string; latestConsultationId: string;
  latestConsultationAt: string; latestPurpose: string; latestStatus: StoredConsultationStatus; privacyConsent: boolean;
  currentProduct: StoredProduct | null; currentPlan: StoredPlan | null;
}
export interface StoredRisk {
  id: string; stage: 'AI' | 'PHONE' | 'VISIT'; score: number;
  level: '정상' | '주의' | '경계' | '위험' | '매우 위험'; createdAt: string;
}
export interface StoredConsultation {
  id: string; customerId: string; storeId: string; callId: string | null; purpose: string;
  status: StoredConsultationStatus; startedAt: string; endedAt: string | null;
  summaryStatus: StoredSummaryStatus; summaryPreview: string | null;
  usedAi: boolean; usedPhone: boolean; usedVisit: boolean; risks: StoredRisk[];
}
export interface RealDataList<T> { source: 'supabase'; readOnly: true; items: T[] }
export interface RealDataStatus {
  source: 'supabase'; readOnly: true; configured: boolean; scopeConfigured: boolean; errorCode: string | null;
}
export interface RealBriefing {
  source: 'supabase'; readOnly: true; reservation: RealAppointment; summaryStatus: SummaryStatus;
  summary: string | null; checklist: string[]; history: StoredConsultation[];
  currentProduct: StoredProduct | null;
  currentPlan: StoredPlan | null; requestNote: string | null;
  desiredProduct: null; desiredDevice: null; desiredProductStatus: 'not_recorded'; desiredDeviceStatus: 'not_recorded';
}

const errorMessages = {
  REAL_DATA_NOT_CONFIGURED: '저장 자료 조회가 아직 준비되지 않았습니다. 참고 자료는 운영 기록이 아닙니다.',
  REAL_DATA_CONFIG_INVALID: '저장 자료 조회 설정을 확인할 수 없습니다. 관리자에게 문의해 주세요.',
  HOME_STORE_NOT_CONFIGURED: '현재 매장 범위를 확인할 수 없습니다. 관리자에게 문의해 주세요.',
  REAL_DATA_ACCESS_DENIED: '저장 자료를 조회할 수 있는 권한을 확인해 주세요.',
  REAL_DATA_ACCESS_RESTRICTED: '공개 환경의 직원 조회 접근 설정이 준비되지 않았습니다. 관리자에게 문의해 주세요.',
  REAL_DATA_UNAVAILABLE: '저장 자료를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.',
  REAL_DATA_TIMEOUT: '자료 조회가 지연되고 있습니다. 잠시 후 다시 시도해 주세요.',
  REAL_DATA_INVALID_RESPONSE: '조회한 자료를 확인할 수 없습니다. 다시 시도해 주세요.',
  INVALID_CUSTOMER_ID: '조회할 고객 정보를 확인해 주세요.',
  INVALID_RESERVATION_ID: '조회할 예약 정보를 확인해 주세요.',
  INVALID_LIMIT: '조회 범위를 확인해 주세요.',
  CUSTOMER_NOT_FOUND: '해당 고객의 저장 자료를 찾을 수 없습니다.',
  RESERVATION_NOT_FOUND: '해당 예약의 저장 자료를 찾을 수 없습니다.',
  CUSTOMER_PRIVACY_RESTRICTED: '개인정보 동의를 확인하기 전에는 고객 상담 이력을 조회할 수 없습니다.',
  NETWORK: '저장 자료 서비스에 연결하지 못했습니다. 다시 시도해 주세요.',
  INVALID_RESPONSE: '조회한 자료를 확인할 수 없습니다. 다시 시도해 주세요.',
  UNKNOWN_ERROR: '자료 조회를 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.',
} as const;
export function realDataErrorCode(value: unknown): keyof typeof errorMessages {
  return typeof value === 'string' && Object.hasOwn(errorMessages, value) ? value as keyof typeof errorMessages : 'UNKNOWN_ERROR';
}
export function realDataErrorMessage(value: unknown): string { return errorMessages[realDataErrorCode(value)]; }
export class RealDataApiError extends Error {
  readonly code: keyof typeof errorMessages;
  constructor(code: unknown) {
    const safeCode = realDataErrorCode(code);
    super(safeCode); this.name = 'RealDataApiError'; this.code = safeCode;
  }
}
export function realDataAvailability(error: unknown): RealDataAvailability {
  return error instanceof RealDataApiError && error.code === 'REAL_DATA_NOT_CONFIGURED' ? 'unconfigured' : 'error';
}

const record = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const text = (value: unknown): value is string => typeof value === 'string';
const nonempty = (value: unknown): value is string => text(value) && value.trim().length > 0;
const validId = (kind: string, value: unknown): value is string => text(value) && new RegExp(`^${kind}_[0-9]{3,}$`).test(value);
const member = <T extends string>(values: readonly T[], value: unknown): value is T => text(value) && values.includes(value as T);
const reservationStatuses: readonly ReservationStatus[] = ['예약 확정', '방문 완료', '취소', '노쇼'];
const consultationStatuses: readonly StoredConsultationStatus[] = ['진행 중', '방문 예정', '완료', '취소'];
const summaryStatuses: readonly StoredSummaryStatus[] = ['available', 'missing'];

/** Reject impossible calendar/time values rather than letting Date silently roll them forward. */
export function validRealDataTimestamp(value: unknown): value is string {
  if (!text(value)) return false;
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,9})?(Z|[+-]\d{2}:\d{2})$/.exec(value);
  if (!match) return false;
  const [, yearText, monthText, dayText, hourText, minuteText, secondText, zone] = match;
  const [year, month, day, hour, minute, second] = [yearText, monthText, dayText, hourText, minuteText, secondText].map(Number);
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return year > 0 && month >= 1 && month <= 12 && day >= 1 && day <= days[month - 1]
    && hour <= 23 && minute <= 59 && second <= 59
    && (zone === 'Z' || Number(zone.slice(1, 3)) <= 23 && Number(zone.slice(4)) <= 59)
    && Number.isFinite(Date.parse(value));
}
const summaryPair = (status: unknown, value: unknown) => member(summaryStatuses, status)
  && (status === 'available' ? nonempty(value) : value === null);
function invalid(): never { throw new RealDataApiError('INVALID_RESPONSE'); }
function envelope(value: unknown): Record<string, unknown> {
  if (!record(value) || value.source !== 'supabase' || value.readOnly !== true) return invalid();
  return value;
}
function uniqueItems<T extends { id: string }>(value: unknown, parse: (row: unknown) => T): T[] {
  if (!Array.isArray(value)) return invalid();
  const items = value.map(parse);
  if (new Set(items.map(item => item.id)).size !== items.length) return invalid();
  return items;
}
function storedProduct(value: unknown): StoredProduct | null {
  if (value === null) return null;
  if (!record(value) || !validId('product', value.id) || !text(value.name) || !text(value.maker) || !text(value.color)
    || typeof value.storageGb !== 'number' || !Number.isSafeInteger(value.storageGb) || value.storageGb <= 0) return invalid();
  return { id: value.id, name: value.name, maker: value.maker, storageGb: value.storageGb, color: value.color };
}
function storedPlan(value: unknown): StoredPlan | null {
  if (value === null) return null;
  if (!record(value) || !validId('own_plan', value.id) || !text(value.name)
    || typeof value.monthlyFee !== 'number' || !Number.isSafeInteger(value.monthlyFee) || value.monthlyFee < 0) return invalid();
  return { id: value.id, name: value.name, monthlyFee: value.monthlyFee };
}

// Rebuild allowlisted DTOs: extra raw identity/transcript fields never enter component state.
function appointment(value: unknown): RealAppointment {
  if (!record(value) || !validId('reservation', value.id) || !validId('consultation', value.consultationId)
    || !validId('store', value.storeId) || !validId('customer', value.customerId) || !validId('employee', value.employeeId)
    || !nonempty(value.customerNameMasked) || !text(value.phoneMasked) || !text(value.employeeName)
    || !member(['AI', 'PHONE'] as const, value.source) || !validRealDataTimestamp(value.reservedAt) || !validRealDataTimestamp(value.visitAt)
    || !text(value.purpose) || !member(reservationStatuses, value.status) || typeof value.privacyConsent !== 'boolean'
    || !(value.privacyConsent ? summaryPair(value.summaryStatus, value.summaryPreview)
      : value.summaryStatus === 'restricted' && value.summaryPreview === null && value.customerNameMasked === '비공개 고객'
        && value.phoneMasked === '연락처 비공개' && value.purpose === '개인정보 동의 확인 필요')) return invalid();
  return { id: value.id, consultationId: value.consultationId, storeId: value.storeId, customerId: value.customerId,
    customerNameMasked: value.customerNameMasked, phoneMasked: value.phoneMasked, employeeId: value.employeeId, employeeName: value.employeeName,
    source: value.source, reservedAt: value.reservedAt, visitAt: value.visitAt, purpose: value.purpose, status: value.status,
    privacyConsent: value.privacyConsent, summaryStatus: value.summaryStatus as SummaryStatus, summaryPreview: value.summaryPreview as string | null };
}
function customer(value: unknown): StoredCustomer {
  if (!record(value) || !validId('customer', value.id) || !nonempty(value.nameMasked) || !text(value.phoneMasked)
    || !validId('consultation', value.latestConsultationId) || !validRealDataTimestamp(value.latestConsultationAt)
    || !text(value.latestPurpose) || !member(consultationStatuses, value.latestStatus) || typeof value.privacyConsent !== 'boolean'
    || !value.privacyConsent && (value.nameMasked !== '비공개 고객' || value.phoneMasked !== '연락처 비공개' || value.latestPurpose !== '개인정보 동의 확인 필요')) return invalid();
  const currentProduct = storedProduct(value.currentProduct); const currentPlan = storedPlan(value.currentPlan);
  if (!value.privacyConsent && (currentProduct !== null || currentPlan !== null)) return invalid();
  return { id: value.id, nameMasked: value.nameMasked, phoneMasked: value.phoneMasked, latestConsultationId: value.latestConsultationId,
    latestConsultationAt: value.latestConsultationAt, latestPurpose: value.latestPurpose, latestStatus: value.latestStatus, privacyConsent: value.privacyConsent,
    currentProduct, currentPlan };
}
function risk(value: unknown): StoredRisk {
  if (!record(value) || !validId('risk', value.id) || !member(['AI', 'PHONE', 'VISIT'] as const, value.stage)
    || typeof value.score !== 'number' || !Number.isSafeInteger(value.score) || value.score < 0 || value.score > 99
    || !member(['정상', '주의', '경계', '위험', '매우 위험'] as const, value.level) || !validRealDataTimestamp(value.createdAt)) return invalid();
  return { id: value.id, stage: value.stage, score: value.score, level: value.level, createdAt: value.createdAt };
}
function consultation(value: unknown): StoredConsultation {
  if (!record(value) || !validId('consultation', value.id) || !validId('customer', value.customerId) || !validId('store', value.storeId)
    || !(value.callId === null || nonempty(value.callId)) || !text(value.purpose) || !member(consultationStatuses, value.status)
    || !validRealDataTimestamp(value.startedAt) || !(value.endedAt === null || validRealDataTimestamp(value.endedAt))
    || !summaryPair(value.summaryStatus, value.summaryPreview) || typeof value.usedAi !== 'boolean'
    || typeof value.usedPhone !== 'boolean' || typeof value.usedVisit !== 'boolean') return invalid();
  const risks = uniqueItems(value.risks, risk);
  return { id: value.id, customerId: value.customerId, storeId: value.storeId, callId: value.callId, purpose: value.purpose,
    status: value.status, startedAt: value.startedAt, endedAt: value.endedAt as string | null,
    summaryStatus: value.summaryStatus as StoredSummaryStatus, summaryPreview: value.summaryPreview as string | null,
    usedAi: value.usedAi, usedPhone: value.usedPhone, usedVisit: value.usedVisit, risks };
}
function list<T extends { id: string }>(value: unknown, parse: (row: unknown) => T): RealDataList<T> {
  const body = envelope(value);
  return { source: 'supabase', readOnly: true, items: uniqueItems(body.items, parse) };
}
export function parseRealDataStatus(value: unknown): RealDataStatus {
  const body = envelope(value);
  if (typeof body.configured !== 'boolean' || typeof body.scopeConfigured !== 'boolean'
    || !(body.errorCode === null || text(body.errorCode) && Object.hasOwn(errorMessages, body.errorCode))) return invalid();
  return { source: 'supabase', readOnly: true, configured: body.configured, scopeConfigured: body.scopeConfigured, errorCode: body.errorCode as string | null };
}
export function parseRealAppointments(value: unknown): RealDataList<RealAppointment> { return list(value, appointment); }
export function parseStoredCustomers(value: unknown): RealDataList<StoredCustomer> { return list(value, customer); }
export function parseStoredConsultations(value: unknown, customerId?: string): RealDataList<StoredConsultation> {
  const body = list(value, consultation);
  if (customerId && body.items.some(item => item.customerId !== customerId)) return invalid();
  return body;
}
export function parseRealBriefing(value: unknown, reservationId?: string): RealBriefing {
  const body = envelope(value); const reservation = appointment(body.reservation);
  if (reservationId && reservation.id !== reservationId || !(reservation.privacyConsent ? summaryPair(body.summaryStatus, body.summary) : body.summaryStatus === 'restricted' && body.summary === null)
    || !Array.isArray(body.checklist) || !body.checklist.every(nonempty)) return invalid();
  const history = uniqueItems(body.history, consultation);
  if (history.some(item => item.customerId !== reservation.customerId) || !reservation.privacyConsent && history.length > 0) return invalid();
  const currentProduct = storedProduct(body.currentProduct); const currentPlan = storedPlan(body.currentPlan);
  if (!(body.requestNote === null || nonempty(body.requestNote)) || body.desiredProduct !== null || body.desiredDevice !== null
    || body.desiredProductStatus !== 'not_recorded' || body.desiredDeviceStatus !== 'not_recorded'
    || !reservation.privacyConsent && (currentProduct !== null || currentPlan !== null || body.requestNote !== null)) return invalid();
  return { source: 'supabase', readOnly: true, reservation, summaryStatus: body.summaryStatus as SummaryStatus,
    summary: body.summary as string | null, checklist: [...body.checklist] as string[], history, currentProduct, currentPlan, requestNote: body.requestNote,
    desiredProduct: null, desiredDevice: null, desiredProductStatus: 'not_recorded', desiredDeviceStatus: 'not_recorded' };
}

async function request<T>(path: string, parse: (value: unknown) => T, signal?: AbortSignal): Promise<T> {
  let response: Response;
  try { response = await fetch(path, { method: 'GET', signal, headers: { Accept: 'application/json' } }); }
  catch { throw new RealDataApiError('NETWORK'); }
  let body: unknown;
  try { body = await response.json(); }
  catch { throw new RealDataApiError(response.ok ? 'INVALID_RESPONSE' : 'REAL_DATA_UNAVAILABLE'); }
  if (!response.ok) {
    const code = record(body) ? body.errorCode ?? body.error : undefined;
    throw new RealDataApiError(code ?? (response.status === 401 || response.status === 403 ? 'REAL_DATA_ACCESS_DENIED' : 'REAL_DATA_UNAVAILABLE'));
  }
  return parse(body);
}
export const realDataApi = {
  status: (signal?: AbortSignal) => request('/api/data/status', parseRealDataStatus, signal),
  appointments: (signal?: AbortSignal) => request('/api/data/appointments', parseRealAppointments, signal),
  customers: (signal?: AbortSignal) => request('/api/data/customers', parseStoredCustomers, signal),
  customerConsultations: (customerId: string, limit = 5, signal?: AbortSignal) => {
    if (!validId('customer', customerId)) return Promise.reject(new RealDataApiError('INVALID_CUSTOMER_ID'));
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 20) return Promise.reject(new RealDataApiError('INVALID_LIMIT'));
    return request(`/api/data/customers/${encodeURIComponent(customerId)}/consultations?limit=${limit}`, value => parseStoredConsultations(value, customerId), signal);
  },
  briefing: (reservationId: string, signal?: AbortSignal) => {
    if (!validId('reservation', reservationId)) return Promise.reject(new RealDataApiError('INVALID_RESERVATION_ID'));
    return request(`/api/briefings/${encodeURIComponent(reservationId)}`, value => parseRealBriefing(value, reservationId), signal);
  },
};

export function formatRealDataDate(value: string | null): string {
  if (!validRealDataTimestamp(value)) return '미확인';
  return new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(value));
}
