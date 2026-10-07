import test from 'node:test';
import assert from 'node:assert/strict';
import { registerAuxMicLevelWorklet } from '../../.test-dist/src/dev/audioLevelWorklet.js';
import { createLiveAudioReporter } from '../../.test-dist/src/dev/liveAudioReporter.js';
import { createMicReadyCallStart } from '../../.test-dist/src/dev/callAudioLifecycle.js';
import { createLiveCallStore } from '../live-calls.mjs';
import { createN8nDelivery } from '../n8n-delivery.mjs';

const tick = () => new Promise(resolve => setImmediate(resolve));
function measuredCall(t) {
  const store = createLiveCallStore(), posts = [], samples = [];
  const delivery = createN8nDelivery({ liveCalls: store, webhookUrl: 'https://workflow.example.test/audio-regression',
    webhookAuthToken: 'synthetic_audio_webhook_token_000000000000',
    log: () => {}, fetchImpl: async (_url, init) => { posts.push(JSON.parse(init.body)); return new Response(null, { status: 200 }); } });
  const reporter = createLiveAudioReporter(() => {}, async (id, value) => { store.audio(id, value); });
  let Processor;
  const scope = { sampleRate: 48000, currentFrame: 0,
    AudioWorkletProcessor: class { port = { onmessage: null, postMessage: value => samples.push(value) }; },
    registerProcessor: (_name, constructor) => { Processor = constructor; } };
  registerAuxMicLevelWorklet(scope);
  const processor = new Processor();
  store.connecting('call_audio_fixture', 'customer_audio_fixture', undefined, 'store_audio_fixture');
  store.live('call_audio_fixture'); reporter.begin('call_audio_fixture', true);
  t.after(() => { reporter.dispose(); delivery.close(); });
  return { store, posts, reporter, samples, scope, processor,
    feed(blocks) {
      for (let n = 0; n < blocks; n++) {
        processor.process([[new Float32Array(128).fill(0.2)]], [[new Float32Array(128)]]);
        scope.currentFrame += 128;
      }
    },
    drain() {
      for (const sample of samples.splice(0)) if (sample.type === 'level') {
        reporter.observe({ status: 'running', starting: false, level: sample.level, error: '', sampledAtMs: sample.sampledAtMs }, sample.sampledAtMs);
      }
    },
  };
}

test('audio-thread samples delayed at the UI retain complete coverage, final threat floor and one n8n payload', async t => {
  const f = measuredCall(t);
  f.store.transcript('call_audio_fixture', [
    { id: 'u1', role: 'user', content: '씨발. 내가 니 찾아간다고.', time_sec: 1 },
    { id: 'a1', role: 'agent', content: '씨발. 내가 니 찾아간다고.', time_sec: 2 },
    { id: 'u2', role: 'user', content: '당신 찾아가서 내가 엎어버릴 거야.', time_sec: 3 },
  ]);
  f.feed(400); // >1 second of actual audio, delivered together after a UI stall.
  assert.equal(f.posts.length, 0);
  f.store.ended('call_audio_fixture');
  assert.equal(f.posts.length, 0);
  f.processor.port.onmessage({ data: { type: 'flush', requestId: 1 } });
  f.drain(); await f.reporter.finish(); await tick();
  const call = f.store.snapshot()[0];
  assert.equal(call.audio_signal.coverage_complete, true);
  assert.equal(call.final_result.signals.shouting_count, 1);
  assert.equal(call.final_result.signals.profanity_count, 1);
  assert.equal(call.final_result.signals.threat_count, 2);
  assert.equal(call.final_result.risk_score, 60);
  assert.equal(call.final_result.risk_level, '위험');
  assert.equal(call.webhook_delivery.status, 'sent');
  assert.equal(f.posts.length, 1);
  assert.equal(f.posts[0].risk_score, 60);
  assert.equal(f.posts[0].consultation.transcript.length, 3);
  assert.doesNotMatch(JSON.stringify(f.posts), /sampledAtMs|coverage_complete|AudioContext|access_token/);
  f.store.ended('call_audio_fixture'); await f.reporter.finish(); await tick();
  assert.equal(f.posts.length, 1);
});

test('an actual missing audio interval still blocks finalization and n8n delivery', async t => {
  const f = measuredCall(t);
  f.feed(80); f.drain();
  f.scope.currentFrame += 24000; // 500ms with no audio processing, unlike delayed MessagePort delivery.
  f.feed(80); f.drain();
  f.store.ended('call_audio_fixture'); await f.reporter.finish(); await tick();
  const call = f.store.snapshot()[0];
  assert.equal(call.audio_signal.coverage_complete, false);
  assert.equal(call.final_result, null);
  assert.equal(call.webhook_delivery, null);
  assert.equal(f.posts.length, 0);
});

test('filming script retains two profanities and one facility threat through finalization and one delivery', async t => {
  const f = measuredCall(t);
  const transcript = [
    { id: 'script_a1', role: 'agent', content: '안녕하세요. 동성로점 고객 상담을 도와드리는 KCM입니다. 동의하시겠습니까?', time_sec: 0 },
    { id: 'script_u1', role: 'user', content: '네.', time_sec: 5 },
    { id: 'script_u2', role: 'user', content: 'S26 울트라 512 실버요. 있죠?', time_sec: 12 },
    { id: 'script_u3', role: 'user', content: '아 씨발, 장난해요? 폰도 없이 장사를 해요? 일 처리 진짜 개판이네. …하, 토요일 2시요. 그날도 없으면 매장 뒤집어 놓을 거니까 알아서 하세요.', time_sec: 27 },
    { id: 'script_a2', role: 'agent', content: '매장 뒤집어 놓을 거니까라는 말씀은 삼가 주세요. 예산과 요금제를 알려주시겠어요?', time_sec: 36 },
    { id: 'script_u4', role: 'user', content: '아 그런 건 가서 얘기할게요.', time_sec: 39 },
    { id: 'script_a3', role: 'agent', content: '갤럭시 S26 울트라 512GB 실버, 토요일 오후 2시 방문으로 확인했습니다. 이 내용으로 접수해 드릴까요?', time_sec: 42 },
    { id: 'script_u5', role: 'user', content: '네네.', time_sec: 47 },
    { id: 'script_a4', role: 'agent', content: '네, 상담 예약 접수되었습니다.', time_sec: 51 },
  ];
  f.store.transcript('call_audio_fixture', transcript);
  f.store.transcript('call_audio_fixture', transcript); // Full snapshots replace, never append.
  const analysis = f.store.snapshot()[0].risk_analysis;
  assert.equal(analysis.profanityCount, 2);
  assert.equal(analysis.threatCount, 1);
  assert.equal(analysis.blameCount, 0);
  assert.equal(analysis.sexualCount, 0);
  assert.deepEqual(analysis.analysisByTurn.script_u3.signals.filter(signal => signal.type === 'threat').map(signal => signal.matchedText), ['매장 뒤집어 놓을 거니까']);
  assert.equal(analysis.analysisByTurn.script_a2, undefined);
  f.feed(400); f.drain();
  assert.equal(f.store.snapshot()[0].final_result, null);
  assert.equal(f.posts.length, 0);
  f.store.ended('call_audio_fixture');
  f.processor.port.onmessage({ data: { type: 'flush', requestId: 1 } });
  f.drain(); await f.reporter.finish(); await tick();
  const call = f.store.snapshot()[0];
  assert.equal(call.final_result.signals.profanity_count, 2);
  assert.equal(call.final_result.signals.threat_count, 1);
  assert.equal(call.final_result.threat_floor, 60);
  assert.equal(call.final_result.risk_score, 60);
  assert.equal(call.final_result.risk_level, '위험');
  assert.equal(f.posts.length, 1);
  assert.equal(f.posts[0].signals.threat_count, 1);
  assert.equal(f.posts[0].risk_score, 60);
  assert.equal(f.posts[0].risk_level, '위험');
  assert.doesNotMatch(JSON.stringify(f.posts), /explicitHarm/);
  f.store.ended('call_audio_fixture'); await f.reporter.finish(); await tick();
  assert.equal(f.posts.length, 1);
});

test('unready microphone preparation creates neither a Retell call nor a downstream webhook record', async () => {
  const store = createLiveCallStore();
  const start = createMicReadyCallStart(async () => false,
    () => store.connecting('must_not_exist', 'customer_audio_fixture', undefined, 'store_audio_fixture'), () => {});
  assert.equal(await start.start(), false);
  assert.deepEqual(store.snapshot(), []);
});

test('actual ASR 놓을 테니까 snapshot finalizes to 60 and delivers once without changing the transcript', async t => {
  const f = measuredCall(t);
  const transcript = [
    { id: 'asr_a1', role: 'agent', content: '통화 내용이 녹음되고 음성 분석이 진행됩니다. 동의하시겠습니까?', time_sec: 0 },
    { id: 'asr_u1', role: 'user', content: '아 씨발, 장난해요?', time_sec: 13 },
    { id: 'asr_u2', role: 'user', content: '처리 진짜 개판이네. 그날도 없으면 매장 뒤집어 놓을 테니까 알아서 하세요.', time_sec: 15 },
    { id: 'asr_a2', role: 'agent', content: '매장 뒤집어 놓을 테니까라는 말씀은 삼가 주세요.', time_sec: 21 },
  ];
  f.store.transcript('call_audio_fixture', transcript);
  for (let n = 0; n < 10; n++) f.store.transcript('call_audio_fixture', transcript);
  const analysis = f.store.snapshot()[0].risk_analysis;
  assert.equal(analysis.profanityCount, 2);
  assert.equal(analysis.threatCount, 1);
  assert.equal(analysis.blameCount, 0);
  assert.equal(analysis.sexualCount, 0);
  assert.equal(analysis.analysisByTurn.asr_a2, undefined);
  const signal = analysis.analysisByTurn.asr_u2.signals.find(value => value.type === 'threat');
  assert.equal(signal.matchedText, '매장 뒤집어 놓을 테니까');
  assert.equal(signal.explicitHarm, true);
  assert.equal(f.posts.length, 0);
  f.feed(400); f.drain();
  f.store.ended('call_audio_fixture');
  f.processor.port.onmessage({ data: { type: 'flush', requestId: 1 } });
  f.drain(); await f.reporter.finish(); await tick();
  const final = f.store.snapshot()[0].final_result;
  assert.equal(final.raw_score, 28);
  assert.equal(final.signals.profanity_count, 2);
  assert.equal(final.signals.threat_count, 1);
  assert.equal(final.threat_floor, 60);
  assert.equal(final.risk_score, 60);
  assert.equal(final.risk_level, '위험');
  assert.equal(f.posts.length, 1);
  assert.equal(f.posts[0].risk_score, 60);
  assert.equal(f.posts[0].risk_level, '위험');
  assert.equal(f.posts[0].consultation.transcript[2].content, transcript[2].content);
  f.store.ended('call_audio_fixture'); await f.reporter.finish(); await tick();
  assert.equal(f.posts.length, 1);
});
