import type { Appointment, DemoCall, FollowUp } from '../types.js';
import { outcomeLabels } from './consultation.js';
import { callOutcomes } from './callWorkflow.js';

export type ContactConsent = 'granted' | 'declined' | 'unknown';
export const consentLabels = { granted: '동의', declined: '미동의', unknown: '미확인' } as const;
export interface AftercareItem {
  id: string; sourceId: string; source: '통화 상담' | '방문 예약'; customerId: string | null; customerName: string;
  inquiryType: string; summary: string; outcome: string; followUp: FollowUp; followUpMemo: string; completedAt: string | null;
  consent: ContactConsent; hasResult: boolean;
}
export interface AftercareRecord { status: 'reviewed' | 'sent'; message: string; sourceSignature: string; reviewedAt: string; reviewedBy: string; sentAt: string | null; sentBy: string | null }
export type AftercareState = Record<string, AftercareRecord>;

/** Read-only projection. Appointment and call IDs remain distinct; no records are invented. */
export function aftercareItems(appointments: readonly Appointment[], calls: readonly DemoCall[], consents: Readonly<Record<string, ContactConsent>>): AftercareItem[] {
  return [
    ...calls.filter(call => call.status === 'completed').map(call => ({
      id: 'call:' + call.id, sourceId: call.id, source: '통화 상담' as const, customerId: call.customerId, customerName: call.customerLabel,
      inquiryType: call.inquiryType, summary: call.result?.content ?? '', outcome: call.result?.outcome ? callOutcomes[call.result.outcome] : '결과 기록 없음',
      followUp: (call.result ? call.result.outcome !== 'resolved' || call.result.followUp.trim() ? 'required' : 'none' : 'unknown') as FollowUp,
      followUpMemo: call.result?.followUp ?? '', completedAt: call.completedAt, consent: call.customerId ? consents[call.customerId] ?? 'unknown' : 'unknown', hasResult: Boolean(call.result?.outcome && call.result.content.trim()),
    })),
    ...appointments.filter(item => item.status === 'completed').map(item => ({
      id: 'appointment:' + item.id, sourceId: item.id, source: '방문 예약' as const, customerId: item.customerId, customerName: item.customerName,
      inquiryType: item.purpose, summary: item.consultation?.result?.summary ?? '', outcome: item.consultation?.result?.outcome ? outcomeLabels[item.consultation.result.outcome] : '결과 기록 없음',
      followUp: item.consultation?.result?.followUp ?? 'unknown', followUpMemo: item.consultation?.result?.followUpMemo ?? '', completedAt: item.consultation?.completedAt ?? null,
      consent: consents[item.customerId] ?? 'unknown', hasResult: Boolean(item.consultation?.result?.outcome && item.consultation.result.summary.trim()),
    })),
  ].sort((a,b) => (Date.parse(b.completedAt ?? '') || 0) - (Date.parse(a.completedAt ?? '') || 0));
}
export function recommendedAftercareMessage(item: AftercareItem, store: string): string {
  if (!item.hasResult || item.followUp !== 'required') return '';
  return `안녕하세요, ${store}입니다. ${item.inquiryType} 관련 사후 안내드립니다. ${item.followUpMemo.trim() || '추가 확인이 필요한 내용을 확인한 뒤 다시 안내드리겠습니다.'}`;
}
export function aftercareBlocker(item: AftercareItem): string {
  if (!item.hasResult) return '완료된 상담 결과 기록이 필요합니다.';
  if (item.consent !== 'granted') return item.consent === 'declined' ? '연락·안내에 동의하지 않은 고객입니다.' : '연락·안내 동의 확인이 필요합니다.';
  if (item.followUp !== 'required') return item.followUp === 'none' ? '후속 안내가 필요 없는 상담입니다.' : '후속 안내 필요 여부를 확인해 주세요.';
  return '';
}
const signature = (item: AftercareItem) => JSON.stringify([item.id, item.customerId, item.inquiryType, item.summary, item.outcome, item.followUp, item.followUpMemo, item.consent]);
export function aftercareReviewed(item: AftercareItem, record?: AftercareRecord): boolean {
  return Boolean(record?.status === 'reviewed' && record.sourceSignature === signature(item) && !aftercareBlocker(item));
}
export function reviewAftercare(state: AftercareState, item: AftercareItem, message: string, at: string, actor: string): AftercareState {
  if (state[item.id]?.status === 'sent' || aftercareBlocker(item) || !message.trim() || message.length > 1000 || !actor.trim() || !Number.isFinite(Date.parse(at))) return state;
  return { ...state, [item.id]: { status: 'reviewed', message: message.trim(), sourceSignature: signature(item), reviewedAt: at, reviewedBy: actor, sentAt: null, sentBy: null } };
}
/** Local demo transition only. Guards repeated clicks and stale reviews without touching source consultations. */
export function sendAftercare(state: AftercareState, item: AftercareItem, at: string, actor: string): AftercareState {
  const record = state[item.id];
  if (!aftercareReviewed(item, record) || !Number.isFinite(Date.parse(at)) || !actor.trim()) return state;
  return { ...state, [item.id]: { ...record, status: 'sent', sentAt: at, sentBy: actor } };
}
