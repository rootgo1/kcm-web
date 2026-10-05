import test from 'node:test';
import assert from 'node:assert/strict';
import { liveConnectionNotice, liveFinalizationNotice } from '../src/live/liveNotices.js';

test('live error notices never expose received URLs, credentials or raw transport errors', () => {
  const raw = [
    'Error: https://receiver.invalid/hook?token=private_fixture_token',
    'Authorization: Bearer private_fixture_token\nRETELL_API_KEY=private_fixture_key',
    '<script>private_fixture_payload</script>',
    'toString', '__proto__', 'constructor',
  ];
  for (const value of raw) {
    const connection = liveConnectionNotice(value), finalization = liveFinalizationNotice(value);
    assert.match(connection, /통화.*확인하지 못/);
    assert.match(connection, /종료 여부.*별도로 확인/);
    assert.match(finalization, /확인이 필요/);
    for (const notice of [connection, finalization]) {
      assert.ok(!notice.includes(value));
      assert.doesNotMatch(notice, /private_fixture|https?:|Bearer|API_KEY|<script>/);
    }
  }
});

test('missing live error and finalization reasons preserve waiting rather than claiming completion', () => {
  for (const value of [null, undefined, '']) {
    assert.equal(liveConnectionNotice(value), '');
    assert.match(liveFinalizationNotice(value), /기다리고/);
    assert.doesNotMatch(liveFinalizationNotice(value), /완료|확정되었습니다/);
  }
});

test('known finalization blocks retain their distinct reason and score hold', () => {
  const values = [
    ['텍스트 분석 확인 필요 · 점수 보류', /대화 분석.*부족/],
    ['고성 최종 상태 수신 대기 · 점수 보류', /음성 측정.*기다리고/],
    ['마이크 미측정·중단 구간 있음 · 점수 보류', /일부 음성 구간.*측정하지 못/],
  ] as const;
  for (const [reason, meaning] of values) {
    const notice = liveFinalizationNotice(reason);
    assert.match(notice, meaning);
    assert.match(notice, /보류/);
    assert.doesNotMatch(notice, /완료|확정되었습니다/);
  }
});
