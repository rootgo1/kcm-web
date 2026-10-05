import test from 'node:test';
import assert from 'node:assert/strict';
import { deliveryLabel, liveCustomerHistory } from '../src/live/livePresentation.js';
import type { LiveCall } from '../src/live/types.js';
import { calculateCallRisk } from '../src/lib/riskPolicy.js';

const call = (id: string, customer: string | null, status: LiveCall['status'] = 'ended', ended = '2026-10-05T00:00:00.000Z'): LiveCall => ({
  call_id: id, customer_id: customer, status, started_at: '2026-10-04T23:59:00.000Z',
  ended_at: status === 'ended' ? ended : null, updated_at: ended, messages: [], error: null,
});
test('live customer history groups by exact ID and keeps unidentified calls separate', () => {
  const calls = [call('A','customer_a'),call('B','customer_a'),call('C','customer_A'),call('D',null),call('E',null)];
  const before = structuredClone(calls), groups = liveCustomerHistory(calls);
  assert.deepEqual(groups.map(group => group.calls.map(item => item.call_id)), [['B','A'],['C'],['D'],['E']]);
  assert.equal(groups[0].latestCompleted?.call_id,'B'); // Same timestamp: later received call wins.
  assert.deepEqual(calls,before);
});
test('latest completed call does not use a live call or conceal an unfinalized newest call with an older score', () => {
  const older = call('A','customer_a'), newer = call('B','customer_a','ended','2026-10-05T00:01:00.000Z');
  older.final_result = { ...calculateCallRisk({profanity_count:0,threat_count:0,blame_count:0,sexual_count:0,shouting_count:1}), call_id:'A',customer_id:'customer_a',completed_at:older.ended_at! };
  const active = call('C','customer_a','live','2026-10-05T00:02:00.000Z');
  const group = liveCustomerHistory([older,active,newer])[0];
  assert.equal(group.latestCompleted?.call_id,'B');
  assert.equal(group.latestCompleted?.final_result,undefined);
  assert.equal(liveCustomerHistory([active])[0].latestCompleted,null);
});
test('n8n labels separate finalization, HTTP receipt, delivery failure and downstream DB success', () => {
  const value=call('A','customer_a');
  assert.match(deliveryLabel(value),/확정 대기/);
  value.final_result = { ...calculateCallRisk({profanity_count:0,threat_count:0,blame_count:0,sexual_count:0,shouting_count:0}),call_id:'A',customer_id:'customer_a',completed_at:value.ended_at! };
  assert.match(deliveryLabel(value),/상태 확인 대기/);
  for(const status of ['pending','sent','failed'] as const) {
    value.webhook_delivery={status,attempted_at:value.ended_at!,completed_at:null,error:null};
    assert.match(deliveryLabel(value), status==='pending' ? /전송 중/ : status==='sent' ? /DB 저장은 n8n에서 확인/ : /실패.*결과 보존/);
    assert.doesNotMatch(deliveryLabel(value),/DB 저장 완료/);
  }
});
