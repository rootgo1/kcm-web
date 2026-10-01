import type { DemoCall } from '../types.js';

/** 최신 상태를 기준으로 한 번만 시작합니다. 예약·분석·지원 요청 데이터는 변경하지 않습니다. */
export function startCallConsultation(calls: DemoCall[], id: string, at: string): DemoCall[] {
  const selected = calls.find(call => call.id === id);
  if (!selected || selected.status !== 'waiting') return calls;
  return calls.map(call => call === selected
    ? { ...call, status: 'staff_consulting', startedAt: call.startedAt ?? at }
    : call);
}
