import type { LiveCall } from './types.js';
import { calculateCallRisk } from '../lib/riskPolicy.js';

/** Read-only estimate from received signals. Never finalizes or stores a call score. */
export function liveRiskEstimate(call: LiveCall) {
  const analysis = call.risk_analysis, audio = call.audio_signal;
  if ((call.status !== 'live' && call.status !== 'connecting') || !analysis || analysis.analyzedUserTurns === 0 || !audio?.available) return null;
  try {
    const explicitHarmThreat = Object.values(analysis.analysisByTurn).some(turn =>
      turn.signals.some(signal => signal.type === 'threat' && signal.explicitHarm === true));
    return calculateCallRisk({ profanity_count: analysis.profanityCount, threat_count: analysis.threatCount,
      blame_count: analysis.blameCount, sexual_count: analysis.sexualCount, shouting_count: audio.shouting_count }, { explicitHarmThreat });
  } catch { return null; } // Missing/invalid counts must not become a normal zero score.
}

/** Read-only grouping: unknown identities remain separate calls, never one customer. */
export function liveCustomerHistory(calls: readonly LiveCall[]) {
  const groups = new Map<string, { key: string; customerId: string | null; calls: LiveCall[] }>();
  for (const call of calls) {
    const customerId = call.customer_id?.trim() || null;
    const key = customerId ? 'customer:' + customerId : 'call:' + call.call_id;
    const group = groups.get(key) ?? { key, customerId, calls: [] };
    group.calls.push(call);
    groups.set(key, group);
  }
  return [...groups.values()].map(group => {
    // In one snapshot, equal millisecond timestamps use later arrival order.
    const history = group.calls.slice().reverse().sort((a, b) => (Date.parse(b.ended_at ?? b.started_at ?? b.updated_at) || 0) - (Date.parse(a.ended_at ?? a.started_at ?? a.updated_at) || 0));
    return { ...group, calls: history, latestCompleted: history.find(call => call.status === 'ended') ?? null };
  });
}

/** HTTP receipt is not proof that a downstream DB transaction succeeded. */
export function deliveryLabel(call: LiveCall): string {
  if (!call.final_result) return '최종 결과 확정 대기 · 전송 보류';
  switch (call.webhook_delivery?.status) {
    case 'pending': return 'n8n 전송 중';
    case 'sent': return 'n8n 수신 응답 확인 · DB 저장은 n8n에서 확인';
    case 'failed': return 'n8n 전송 실패 · 결과 보존됨';
    default: return 'n8n 전송 상태 확인 대기';
  }
}
