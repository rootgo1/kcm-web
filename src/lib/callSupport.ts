import type { CallSupportRequest, DemoCall, SupportReason, SupportStatus } from '../types.js';

export const SUPPORT_TEXT_LIMIT = 300;
export const supportReasons: Record<SupportReason, string> = {
  guidance: '응대 방법 확인', abuse: '폭언·위협 대응 지원', policy: '상담 내용·정책 확인', other: '기타',
};
export const supportStatusLabels: Record<SupportStatus | 'none', string> = {
  none: '요청 없음', pending: '요청 대기', in_progress: '지원 중', completed: '지원 완료',
};
export type SupportAction =
  | { type: 'request'; requestId: string; reason: SupportReason | ''; memo: string; actor: string }
  | { type: 'acknowledge'; requestId: string; actor: string }
  | { type: 'complete'; requestId: string; content: string; actor: string };
export type SupportHandler = (callId: string, action: SupportAction) => void;
export const canRequestSupport = (call: DemoCall) => call.status === 'waiting' || call.status === 'staff_consulting';
export const isOpenSupport = (request: CallSupportRequest) => request.status === 'pending' || request.status === 'in_progress';
export const latestSupport = (call: DemoCall) => call.supportRequests.at(-1);
export function validateSupportRequest(reason: string, memo: string): string {
  if (!Object.hasOwn(supportReasons, reason)) return '요청 사유를 선택해 주세요.';
  return memo.length > SUPPORT_TEXT_LIMIT ? '추가 메모는 300자 이내로 입력해 주세요.' : '';
}
export function validateSupportContent(content: string): string {
  if (!content.trim()) return '지원 내용을 입력해 주세요. 공백만 입력할 수 없습니다.';
  return content.length > SUPPORT_TEXT_LIMIT ? '지원 내용은 300자 이내로 입력해 주세요.' : '';
}

/** UI와 별개로 중복·잘못된 전이를 거부합니다. 통화 상태/분석은 변경하지 않습니다. */
export function applyCallSupport(calls: DemoCall[], callId: string, action: SupportAction, at: string): DemoCall[] {
  const call = calls.find(item => item.id === callId);
  if (!call || !action.requestId || !action.actor.trim() || !Number.isFinite(Date.parse(at))) return calls;
  let requests: CallSupportRequest[];
  if (action.type === 'request') {
    if (!canRequestSupport(call) || call.supportRequests.some(isOpenSupport)
      || calls.some(item => item.supportRequests.some(request => request.id === action.requestId))
      || validateSupportRequest(action.reason, action.memo)) return calls;
    requests = [...call.supportRequests, {
      id: action.requestId, callId, status: 'pending', reason: action.reason as SupportReason,
      memo: action.memo.trim(), requestedAt: at, requestedBy: action.actor,
      acknowledgedAt: null, acknowledgedBy: null, completedAt: null, completedBy: null, content: null,
    }];
  } else {
    const request = latestSupport(call);
    if (!request || request.id !== action.requestId || request.callId !== callId) return calls;
    let next: CallSupportRequest;
    if (action.type === 'acknowledge') {
      if (request.status !== 'pending') return calls;
      next = { ...request, status: 'in_progress', acknowledgedAt: at, acknowledgedBy: action.actor };
    } else {
      if (request.status !== 'in_progress' || validateSupportContent(action.content)) return calls;
      next = { ...request, status: 'completed', content: action.content.trim(), completedAt: at, completedBy: action.actor };
    }
    requests = call.supportRequests.map(item => item === request ? next : item);
  }
  return calls.map(item => item === call ? { ...call, supportRequests: requests } : item);
}
