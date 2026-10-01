import type { CallAnalysis, CallDemoState, CallResultDraft, DemoCall } from '../types.js';
import { scorePreview } from './callRisk.js';


export const callOutcomes = { resolved: '해결', needs_check: '추가 확인 필요', unresolved: '미해결' } as const;
export const emptyCallDraft = (): CallResultDraft => ({ outcome: '', content: '', followUp: '' });
export type DraftHandler = (id: string, field: keyof CallResultDraft, value: string) => void;
export function validateCallResult(result: CallResultDraft): string {
  if (!Object.hasOwn(callOutcomes, result.outcome)) return '문의 처리 결과를 선택해 주세요.';
  if (!result.content.trim()) return '처리 내용을 입력해 주세요. 공백만 입력할 수 없습니다.';
  if (result.content.length > 1000) return '처리 내용은 1,000자 이내로 입력해 주세요.';
  if (result.followUp.length > 300) return '후속 조치 메모는 300자 이내로 입력해 주세요.';
  if (result.outcome !== 'resolved' && !result.followUp.trim()) return '추가 확인 필요·미해결이면 후속 조치 메모가 필수입니다.';
  return '';
}
export function updateCallDraft(state: CallDemoState, id: string, field: keyof CallResultDraft, value: string): CallDemoState {
  const call = state.calls.find(item => item.id === id);
  if (!call || call.status !== 'staff_consulting' || !['outcome', 'content', 'followUp'].includes(field)) return state;
  if (field === 'outcome' && value !== '' && !Object.hasOwn(callOutcomes, value)) return state;
  return { ...state, calls: state.calls.map(item => item === call ? { ...item, draft: { ...item.draft, [field]: value } } : item) };
}
export function scorePendingReason(call: DemoCall): string {
  if (call.scoreRecord) return '통화별 점수 확정 완료';
  if (!call.endedAt || !Number.isFinite(Date.parse(call.endedAt))) return '통화 종료 대기 · 아직 최종 점수 없음';
  const preview = scorePreview(call);
  if (!preview.value) return preview.error + ' · 확정 보류';
  return '점수 확정 준비';
}
/** Each call is finalized once, independently of customer history and staff records. */
export function applyFinalCallScore(state: CallDemoState, id: string, at: string): CallDemoState {
  const call = state.calls.find(item => item.id === id);
  if (!call || call.scoreRecord || !Number.isFinite(Date.parse(at)) || scorePendingReason(call) !== '점수 확정 준비') return state;
  const value = scorePreview(call).value!;
  return { ...state, calls: state.calls.map(item => item === call ? { ...item, scoreRecord: {
    ...value, call_id: call.id, customerId: call.customerId, completedAt: call.endedAt!, appliedAt: at,
  } } : item) };
}
/** Canonical history is derived from immutable per-call records, never a rolling total. */
export function customerRiskHistory(calls: readonly DemoCall[], customerId: string | null) {
  if (!customerId) return [];
  return calls.filter(call => call.customerId === customerId && call.scoreRecord)
    .map(call => call.scoreRecord!).sort((a, b) => Date.parse(b.completedAt) - Date.parse(a.completedAt) || b.call_id.localeCompare(a.call_id));
}
export function latestCustomerRisk(calls: readonly DemoCall[], customerId: string | null) {
  return latestCompletedCustomerCall(calls, customerId)?.scoreRecord ?? null;
}
export function latestCompletedCustomerCall(calls: readonly DemoCall[], customerId: string | null) {
  if (!customerId) return null;
  return calls.filter(call => call.customerId === customerId && call.endedAt && Number.isFinite(Date.parse(call.endedAt)))
    .sort((a, b) => Date.parse(b.endedAt!) - Date.parse(a.endedAt!) || b.id.localeCompare(a.id))[0] ?? null;
}
/** 직원 상담 시작 여부와 무관한 종료 이벤트. AI 단독 통화에도 재사용할 수 있습니다. */
export function simulateCallEnd(state: CallDemoState, id: string, at: string): CallDemoState {
  const call = state.calls.find(item => item.id === id);
  if (!call || !Number.isFinite(Date.parse(at))) return state;
  const ended = call.endedAt ? state : { ...state, calls: state.calls.map(item => item === call ? { ...item, endedAt: at } : item) };
  return applyFinalCallScore(ended, id, at);
}
export function receiveCallAnalysis(state: CallDemoState, id: string, analysis: CallAnalysis, at: string): CallDemoState {
  const call = state.calls.find(item => item.id === id);
  if (!call || call.scoreRecord) return state; // 확정된 분석·점수를 조용히 재산정하지 않습니다.
  const next = { ...state, calls: state.calls.map(item => item === call ? { ...item, analysis: structuredClone(analysis) } : item) };
  return applyFinalCallScore(next, id, at);
}
export function completeCallRecord(state: CallDemoState, id: string, at: string, actor: string): CallDemoState {
  const call = state.calls.find(item => item.id === id);
  if (!call || call.status !== 'staff_consulting' || !call.startedAt || !Number.isFinite(Date.parse(call.startedAt))
    || !Number.isFinite(Date.parse(at)) || !actor.trim() || validateCallResult(call.draft)) return state;
  return { ...state, calls: state.calls.map(item => item === call ? {
    ...item, status: 'completed', completedAt: at, completedBy: actor,
    result: { outcome: item.draft.outcome, content: item.draft.content.trim(), followUp: item.draft.followUp.trim() },
  } : item) };
}
export function completeDemoCall(state: CallDemoState, id: string, at: string, actor: string): CallDemoState {
  const next = completeCallRecord(state, id, at, actor);
  return next === state ? state : simulateCallEnd(next, id, at);
}
export function nextCallBlocker(calls: readonly DemoCall[], source: DemoCall): DemoCall | undefined {
  return calls.find(item => item.customerId === source.customerId && item.id !== source.id
    && ((item.status !== 'completed' && item.status !== 'ended') || !item.scoreRecord));
}
export function createNextDemoCall(state: CallDemoState, sourceId: string): CallDemoState {
  const source = state.calls.find(item => item.id === sourceId);
  if (!source || source.status !== 'completed' || !source.scoreRecord || !source.customerId || nextCallBlocker(state.calls, source)) return state;
  const customer = state.customers.find(item => item.id === source.customerId);
  if (!customer) return state;
  let number = state.calls.length + 1;
  while (state.calls.some(item => item.id === `C-${String(number).padStart(3, '0')}`)) number++;
  const call: DemoCall = {
    id: `C-${String(number).padStart(3, '0')}`, customerId: customer.id, customerLabel: source.customerLabel,
    inquiryType: '동일 고객 후속 문의 (데모)', status: 'waiting', startedAt: null, endedAt: null, completedAt: null, completedBy: null,
    historyStatus: 'known', initialScore: 0, scoreRecord: null, supportRequests: [], draft: emptyCallDraft(), result: null,
    aiActions: ['후속 문의 내용 확인 (가상 샘플)'],
    analysis: { status: 'completed', phase: 'final', shoutingCount: 0, profanityCount: 0, threatCount: 0, blameCount: 0, sexualCount: 0,
      summary: '동일 고객의 다음 통화 가상 샘플입니다. 이전 문의의 추가 안내를 요청합니다.',
      signals: { shouting: [], profanity: [], threat: [], blame: [], sexual: [] },
      recommendedActions: ['이번 문의를 확인하고 필요한 안내를 진행합니다.'], openingLine: '추가로 확인하고 싶으신 내용을 말씀해 주세요.' },
  };
  return { ...state, calls: [...state.calls, call] };
}
