import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analyzeRiskText, analyzeTranscriptRisk, TEXT_RISK_RULE_VERSION } from '../text-risk.mjs';
import { createLiveCallStore } from '../live-calls.mjs';
import { calculateCallRisk } from '../../src/lib/riskPolicy.js';

const message = (id, content, role = 'user') => ({ turn_id: id, content, role, start_sec: 1, end_sec: null });
const turn = (id, content, role = 'user') => ({ id, content, role, time_sec: 1 });
const totals = result => [result.profanityCount, result.threatCount, result.blameCount, result.sexualCount];

const explicitThreats = [
  '다 뒤집어 엎는다.',
  '다 뒤집어엎는다.',
  '다뒤집어엎는다.',
  '[다 뒤집어 엎는다]',
  '다 뒤집어 엎어버린다.',
  '다 뒤집어엎어버릴 거야.',
  '다 뒤집어 엎을 거야.',
  '다 뒤집어엎을거야.',
  '모조리 뒤집어엎겠다.',
  '전부 뒤집어 엎겠다.',
  '매장 뒤집어 엎는다.',
  '매장을 뒤집어엎을 거야.',
  '매장에 가서 다 뒤집어 엎는다.',
  '매장 엎을 거야.',
  '다 엎을 거야.',
  '다 죽여버린다.',
  '다 죽여 버린다.',
  '다죽여버린다.',
  '[다 죽여버린다]',
  '다 죽인다.',
  '죽일 거야.',
  '죽일거야.',
  '너 죽여버릴 거야.',
  '너죽여버릴거야.',
  '모두 죽여버리겠다.',
  '모조리 죽여 버리겠어.',
  '죽여버릴 테니까 알아서 해.',
  '다죽여버릴테니까 알아서 해.',
  '싹 다 뒤엎을거야.',
  '전부죽일거야.',
  '매장부술거야.',
  '너때려버릴거야.',
  '너죽일게.',
  '너죽일까.',
  '사람들을다죽인다.',
  '너희들을모두죽인다.',
  '직원들을다죽인다.',
  '상담사들을다죽인다.',
  '다뒤집어엎어!',
  '다뒤집어엎어놓겠다.',
  '다뒤집어엎어놓을테니까.',
  '다죽여버려!',
  '니네들다죽인다.',
];

for (const text of explicitThreats) {
  test('expanded Korean destruction or killing assertion yields one explicit threat: ' + text, () => {
    const result = analyzeRiskText(text);
    assert.deepEqual(totals(result), [0, 1, 0, 0]);
    assert.equal(result.threatDetected, true);
    assert.equal(result.signals.length, 1);
    assert.equal(result.signals[0].type, 'threat');
    assert.equal(result.signals[0].explicitHarm, true);
    assert.ok(text.includes(result.signals[0].matchedText));
    assert.ok(result.signals[0].reason.length > 0);

    const score = calculateCallRisk({
      profanity_count: 0, threat_count: result.threatCount,
      blame_count: 0, sexual_count: 0, shouting_count: 0,
    }, { explicitHarmThreat: result.signals.some(signal => signal.explicitHarm === true) });
    assert.equal(score.scores.threat_score, 20);
    assert.equal(score.raw_score, 20);
    assert.equal(score.threat_floor, 60);
    assert.equal(score.risk_score, 60);
    assert.equal(score.risk_level, '위험');
  });
}

for (const text of [
  '상자를 뒤집어 놓고 확인하겠습니다.',
  '카드를 다 뒤집을 거야.',
  '매장에서 옷을 뒤집어 입을 거야.',
  '죽일 거야라는 표현을 쓰지 마세요.',
  '다 뒤집어 엎는다는 건 아닙니다.',
  '다 뒤집어 엎지 않겠습니다.',
  '다 죽여버린다는 뜻이 아닙니다.',
  '다 죽이지 않겠습니다.',
  '안 죽일 거야.',
  '다 뒤집어 엎는다고 신고했습니다.',
  '다 죽여버린다고 신고했습니다.',
  '죽여버릴 테니까라고 보고했습니다.',
  '다 죽여버릴 거야라고 하면 안 됩니다.',
  '다 죽여버리라는 요구는 거절했습니다.',
  '“다 뒤집어 엎는다”라는 말을 들었습니다.',
  '“다 죽여버린다”는 위협 표현의 예시입니다.',
  '교육 자료에서 "모두 죽여버리겠다"라는 문장을 설명합니다.',
  '모기를 다 죽여버린다.',
  '벌레를 다 죽인다.',
  '프로세스를 다 죽여버릴 거야.',
  '서버 프로세스를 죽일 거야.',
  '내가 나 자신을 죽일 거야.',
  '맛 죽인다.',
  '음질 죽인다.',
  '죽여주는 음질입니다.',
  '프로젝트를다뒤집어엎는다.',
  '다뒤집어엎어놓지는않겠다.',
  '다 뒤집어 엎어 놓지는 않겠다.',
  '다 뒤집어엎어야 하는 건 아니죠.',
  '다뒤집어엎어요라고신고했어요.',
  '죽일게임',
  '너죽일게임',
  '다뒤집어엎어달라는뜻은아닙니다.',
  '다뒤집어엎어줘라는말은안했습니다.',
  '다죽여버려놓지는않겠다.',
  '다죽여버려야한다는뜻은아닙니다.',
  '다죽여버려주세요라는뜻은아닙니다.',
  '다죽여버려달라는뜻은아닙니다.',
]) {
  test('expanded threat forms preserve ordinary action, nonassertion and nonhuman target exclusions: ' + text, () => {
    const result = analyzeRiskText(text);
    assert.deepEqual(totals(result), [0, 0, 0, 0]);
    assert.equal(result.threatDetected, false);
    assert.deepEqual(result.signals, []);
  });
}

for (const [text, expected] of [
  ['매장에 가서 다 뒤집어 엎어버린다.', 1],
  ['너 죽여버릴 거야.', 1],
  ['다 뒤집어 엎는다. 다 죽여버린다.', 2],
  ['다 죽인다. 다 죽인다.', 2],
  ['다 뒤집어 엎는다. 다 죽여버린다. 죽일 거야.', 3],
]) {
  test('overlapping variants count once per act and separate assertions remain separate: ' + text, () => {
    const result = analyzeRiskText(text);
    assert.equal(result.threatCount, expected);
    assert.equal(result.signals.length, expected);
    assert.ok(result.signals.every(signal => signal.type === 'threat' && signal.explicitHarm === true));
  });
}

test('expanded threats count USER turns only and last revision for a turn ID replaces earlier text', () => {
  const result = analyzeTranscriptRisk([
    message('a1', '다 뒤집어 엎는다. 다 죽여버린다.', 'agent'),
    message('u1', '오인식'), message('u1', '다 뒤집어 엎는다.'),
    message('u2', '다 죽여버린다.'),
  ]);
  assert.deepEqual(totals(result), [0, 2, 0, 0]);
  assert.equal(result.analyzedUserTurns, 2);
  assert.deepEqual(Object.keys(result.analysisByTurn), ['u1', 'u2']);
  assert.equal(result.analysisByTurn.u1.threatCount, 1);
  assert.equal(result.analysisByTurn.u2.threatCount, 1);
  assert.ok(Object.values(result.analysisByTurn).every(turnRisk => turnRisk.signals[0].explicitHarm === true));
});

for (const [fragment, action] of [
  ['다', '뒤집어 엎는다.'],
  ['다 뒤집어', '엎는다.'],
  ['다 죽여', '버릴 거야.'],
]) {
  test('unfinished USER threat fragments cross AGENT intervention once: ' + fragment + ' -> ' + action, () => {
    const messages = [
      message('u1', fragment), message('a1', '위협적인 말씀은 삼가 주세요.', 'agent'), message('u2', action),
    ];
    const result = analyzeTranscriptRisk(messages);
    assert.deepEqual(totals(result), [0, 1, 0, 0]);
    assert.equal(result.analysisByTurn.u1.threatCount, 0);
    assert.equal(result.analysisByTurn.u2.threatCount, 1);
    assert.equal(result.analysisByTurn.u2.signals[0].matchedText, action.slice(0, -1));
    assert.equal(result.analysisByTurn.u2.signals[0].explicitHarm, true);
    assert.equal(Object.hasOwn(result.analysisByTurn, 'a1'), false);
    assert.equal(analyzeTranscriptRisk(messages, messages, result).threatCount, 1);
  });

  test('an AGENT fragment cannot supply a target or verb for a USER threat: ' + fragment + ' -> ' + action, () => {
    const result = analyzeTranscriptRisk([message('a1', fragment, 'agent'), message('u1', action)]);
    assert.deepEqual(totals(result), [0, 0, 0, 0]);
    assert.equal(result.analyzedUserTurns, 1);
    assert.deepEqual(Object.keys(result.analysisByTurn), ['u1']);
    assert.deepEqual(result.analysisByTurn.u1.signals, []);
  });
}

test('a nearby unfinished USER software target also excludes a split killing idiom', () => {
  const result = analyzeTranscriptRisk([
    message('u1', '프로세스를다'),
    message('a1', '프로그램을 종료하시면 됩니다.', 'agent'),
    message('u2', '죽일거야.'),
  ]);
  assert.deepEqual(totals(result), [0, 0, 0, 0]);
  assert.equal(result.analyzedUserTurns, 2);
  assert.deepEqual(result.analysisByTurn.u2.signals, []);
});

test('unfinished USER destruction fragments preserve a negated compound action', () => {
  const result = analyzeTranscriptRisk([
    message('u1', '다 뒤집어'),
    message('a1', '제품 상태를 확인해 드리겠습니다.', 'agent'),
    message('u2', '엎어 놓지는 않겠다.'),
  ]);
  assert.deepEqual(totals(result), [0, 0, 0, 0]);
  assert.deepEqual(result.analysisByTurn.u2.signals, []);
});

test('split software target excludes only the first killing idiom and retains a later person threat', () => {
  const result = analyzeTranscriptRisk([
    message('u1', '프로세스를다'),
    message('a1', '프로그램을 종료하시면 됩니다.', 'agent'),
    message('u2', '죽일거야. 너 죽일거야.'),
  ]);
  assert.deepEqual(totals(result), [0, 1, 0, 0]);
  assert.equal(result.analysisByTurn.u1.threatCount, 0);
  const signals = result.analysisByTurn.u2.signals;
  assert.equal(signals.length, 1);
  assert.equal(signals[0].matchedText, '너 죽일거야');
  assert.equal(signals[0].explicitHarm, true);
});

test('unfinished USER plural person and collective target survives AGENT intervention once', () => {
  const messages = [
    message('u1', '사람들을다'),
    message('a1', '위협적인 말씀은 삼가 주세요.', 'agent'),
    message('u2', '죽인다.'),
  ];
  const result = analyzeTranscriptRisk(messages);
  assert.deepEqual(totals(result), [0, 1, 0, 0]);
  assert.equal(result.analysisByTurn.u1.threatCount, 0);
  assert.equal(result.analysisByTurn.u2.signals.length, 1);
  assert.equal(result.analysisByTurn.u2.signals[0].matchedText, '죽인다');
  assert.equal(result.analysisByTurn.u2.signals[0].explicitHarm, true);
  assert.equal(Object.hasOwn(result.analysisByTurn, 'a1'), false);
  assert.equal(analyzeTranscriptRisk(messages, messages, result).threatCount, 1);
});

test('expanded threat ASR growth, spacing revisions and repeated snapshots never append occurrences', () => {
  const store = createLiveCallStore(); store.connecting('expanded-asr'); store.live('expanded-asr');
  const apply = content => {
    const snapshot = [turn('a1', '다 뒤집어 엎는다. 다 죽여버린다.', 'agent'), turn('u1', content)];
    for (let index = 0; index < 5; index++) store.transcript('expanded-asr', snapshot);
    return store.snapshot()[0].risk_analysis;
  };
  for (const content of ['다 뒤집어', '다 뒤집어 엎는다.', '다뒤집어엎는다.', '다 죽여버린다.', '다죽여버린다.']) {
    const result = apply(content);
    assert.equal(result.threatCount, content === '다 뒤집어' ? 0 : 1);
    assert.equal(result.analyzedUserTurns, 1);
    assert.equal(Object.hasOwn(result.analysisByTurn, 'a1'), false);
    if (result.threatCount) assert.equal(result.analysisByTurn.u1.signals[0].explicitHarm, true);
  }
  assert.deepEqual(totals(apply('다 죽여버린다는 뜻이 아닙니다.')), [0, 0, 0, 0]);
  assert.deepEqual(totals(apply('방문해서 제품을 확인하겠습니다.')), [0, 0, 0, 0]);
  store.transcript('expanded-asr', [turn('u1', '다 죽여버린다.', 'agent')]);
  assert.deepEqual(totals(store.snapshot()[0].risk_analysis), [0, 0, 0, 0]);
  store.transcript('expanded-asr', []);
  assert.deepEqual(store.snapshot()[0].risk_analysis.analysisByTurn, {});
});

test('a version change reanalyzes an old cached miss for newly covered threats without duplicate counts', () => {
  const messages = [message('u1', '다 뒤집어 엎는다. 다 죽여버린다.')];
  const previous = analyzeTranscriptRisk(messages);
  previous.ruleVersion = 'local-text-rules-v7';
  previous.threatCount = 0; previous.threatDetected = false;
  previous.analysisByTurn.u1 = { ...previous.analysisByTurn.u1, threatCount: 0, threatDetected: false, signals: [] };
  assert.notEqual(TEXT_RISK_RULE_VERSION, previous.ruleVersion);
  const current = analyzeTranscriptRisk(messages, messages, previous);
  assert.equal(current.ruleVersion, TEXT_RISK_RULE_VERSION);
  assert.equal(current.threatCount, 2);
  assert.ok(current.analysisByTurn.u1.signals.every(signal => signal.explicitHarm === true));
  assert.equal(analyzeTranscriptRisk(messages, messages, current).threatCount, 2);
});

test('expanded physical threat reaches the existing 60 point live finalization policy exactly once', () => {
  const store = createLiveCallStore(); store.connecting('expanded-final'); store.live('expanded-final');
  const messages = [turn('u1', '다 뒤집어 엎는다.'), turn('a1', '다 죽여버린다.', 'agent')];
  for (let index = 0; index < 5; index++) store.transcript('expanded-final', messages);
  assert.equal(store.snapshot()[0].risk_analysis.threatCount, 1);
  assert.equal(store.snapshot()[0].final_result, null);
  store.ended('expanded-final');
  assert.equal(store.snapshot()[0].final_result, null);
  store.audio('expanded-final', { sequence: 1, shouting_count: 0, is_shouting: false, available: true, coverage_complete: true, closed: true });
  const result = store.snapshot()[0].final_result;
  assert.equal(result.signals.threat_count, 1);
  assert.equal(result.raw_score, 20);
  assert.equal(result.threat_floor, 60);
  assert.equal(result.risk_score, 60);
  assert.equal(result.risk_level, '위험');
  store.transcript('expanded-final', [turn('u1', '다 죽여버린다.')]);
  store.ended('expanded-final');
  assert.deepEqual(store.snapshot()[0].final_result, result);
});
