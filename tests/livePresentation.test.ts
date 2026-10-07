import test from 'node:test';
import assert from 'node:assert/strict';
import { deliveryLabel, liveCustomerHistory } from '../src/live/livePresentation.js';
import type { LiveCall } from '../src/live/types.js';
import { calculateCallRisk } from '../src/lib/riskPolicy.js';
import { customerCallHistory } from '../src/live/customerHistory.js';

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

test('customer history pages five received calls in global time order and keeps their IDs and scores independent', () => {
  const calls = Array.from({ length: 12 }, (_, index) => call(`call_${index}`, index % 2 ? 'customer_a' : 'customer_b', 'ended', `2026-10-05T00:${String(index).padStart(2, '0')}:00.000Z`));
  for (const [index, value] of calls.entries()) {
    value.consultation_id = `consultation_${index}`;
    value.final_result = { ...calculateCallRisk({ profanity_count: 0, threat_count: index % 3, blame_count: 0, sexual_count: 0, shouting_count: 0 }), call_id: value.call_id, customer_id: value.customer_id!, completed_at: value.ended_at! };
  }
  const before = structuredClone(calls);
  const first = customerCallHistory(calls, '', 'all', 1);
  const second = customerCallHistory(calls, '', 'all', 2);
  const last = customerCallHistory(calls, '', 'all', 3);
  assert.equal(first.pagination.totalPages, 3);
  assert.deepEqual(first.pagination.items.map(value => value.call_id), ['call_11', 'call_10', 'call_9', 'call_8', 'call_7']);
  assert.deepEqual(second.pagination.items.map(value => value.call_id), ['call_6', 'call_5', 'call_4', 'call_3', 'call_2']);
  assert.deepEqual(last.pagination.items.map(value => value.call_id), ['call_1', 'call_0']);
  assert.equal(second.pagination.items[0], calls[6]);
  assert.deepEqual(calls, before);
});

test('customer selection and status filtering never change the latest completed customer score', () => {
  const older = call('older', 'customer_a'), newer = call('newer', 'customer_a', 'ended', '2026-10-05T00:01:00.000Z');
  newer.final_result = { ...calculateCallRisk({ profanity_count: 0, threat_count: 2, blame_count: 0, sexual_count: 0, shouting_count: 0 }), call_id: newer.call_id, customer_id: 'customer_a', completed_at: newer.ended_at! };
  const active = call('active', 'customer_a', 'live', '2026-10-05T00:02:00.000Z');
  const other = call('other', 'customer_b', 'ended', '2026-10-05T00:03:00.000Z');
  const values = [older, newer, active, other];
  for (const status of ['all', 'live', 'connecting', 'ended', 'error'] as const) {
    const result = customerCallHistory(values, 'customer:customer_a', status, 3);
    assert.equal(result.selectedGroup?.latestCompleted, newer);
    assert.equal(result.selectedGroup?.latestCompleted?.final_result?.risk_score, 60);
    assert.ok(result.filtered.every(value => value.customer_id === 'customer_a' && (status === 'all' || value.status === status)));
    assert.equal(result.pagination.page, 1);
  }
  assert.deepEqual(customerCallHistory(values, 'customer:customer_a', 'live', 1).filtered, [active]);
});

test('latest unfinalized completion remains pending even when only active calls are visible', () => {
  const older = call('older', 'customer_a');
  older.final_result = { ...calculateCallRisk({ profanity_count: 0, threat_count: 1, blame_count: 0, sexual_count: 0, shouting_count: 0 }), call_id: older.call_id, customer_id: 'customer_a', completed_at: older.ended_at! };
  const latest = call('latest', 'customer_a', 'ended', '2026-10-05T00:01:00.000Z');
  const active = call('active', 'customer_a', 'live', '2026-10-05T00:02:00.000Z');
  const result = customerCallHistory([older, latest, active], 'customer:customer_a', 'live', 1);
  assert.equal(result.selectedGroup?.latestCompleted, latest);
  assert.equal(result.selectedGroup?.latestCompleted?.final_result, undefined);
  assert.deepEqual(result.filtered, [active]);
  assert.equal(customerCallHistory([active], 'customer:customer_a', 'all', 1).selectedGroup?.latestCompleted, null);
});

test('unidentified customer selections remain distinct calls and equal times preserve later arrival', () => {
  const calls = [call('unknown_a', null), call('unknown_b', null), call('A', 'customer_a'), call('B', 'customer_a')];
  assert.deepEqual(customerCallHistory(calls, 'call:unknown_a', 'all', 1).filtered.map(value => value.call_id), ['unknown_a']);
  assert.deepEqual(customerCallHistory(calls, 'call:unknown_b', 'all', 1).filtered.map(value => value.call_id), ['unknown_b']);
  assert.deepEqual(customerCallHistory(calls, 'customer:customer_a', 'all', 1).filtered.map(value => value.call_id), ['B', 'A']);
  assert.equal(customerCallHistory(calls, 'customer:customer_a', 'all', 1).selectedGroup?.latestCompleted?.call_id, 'B');
});

test('shrinking received history clamps the last page and zero to five rows have only one page', () => {
  const calls = Array.from({ length: 12 }, (_, index) => call(`call_${index}`, 'customer_a'));
  assert.equal(customerCallHistory(calls, '', 'all', 3).pagination.page, 3);
  assert.equal(customerCallHistory(calls.slice(0, 6), '', 'all', 3).pagination.page, 2);
  for (const length of [0, 1, 5]) {
    const result = customerCallHistory(calls.slice(0, length), '', 'all', 3);
    assert.equal(result.pagination.page, 1);
    assert.equal(result.pagination.totalPages, 1);
    assert.equal(result.pagination.items.length, length);
  }
  assert.deepEqual(customerCallHistory(calls, 'customer:removed', 'all', 1).filtered, []);
});
