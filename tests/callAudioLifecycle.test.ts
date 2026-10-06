import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCallAudioFinish, createMicReadyCallStart } from '../src/dev/callAudioLifecycle.js';
import { createLiveAudioReporter } from '../src/dev/liveAudioReporter.js';
import type { AudioSignalUpdate } from '../src/live/types.js';
import type { SessionHooks, WebCallSession } from 'retell-client-js-sdk';
import { createCallController } from '../src/dev/retellCall.js';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(yes => { resolve = yes; });
  return { promise, resolve };
}

test('call preparation waits for a measured microphone before creating Retell, including double clicks', async () => {
  const mic = deferred<boolean>(), states: boolean[] = [];
  let preparations = 0, calls = 0;
  const start = createMicReadyCallStart(() => { preparations++; return mic.promise; }, () => { calls++; }, value => states.push(value));
  const pending = start.start();
  assert.equal(await start.start(), false);
  assert.equal(preparations, 1);
  assert.equal(calls, 0);
  assert.deepEqual(states, [true]);
  mic.resolve(true);
  assert.equal(await pending, true);
  assert.equal(calls, 1);
  assert.deepEqual(states, [true, false]);
});

test('failed microphone preparation cannot create an unmeasured call', async () => {
  for (const prepare of [async () => false, async () => { throw new Error('device failure'); }]) {
    let calls = 0;
    const states: boolean[] = [];
    const start = createMicReadyCallStart(prepare, () => { calls++; }, value => states.push(value));
    assert.equal(await start.start(), false);
    assert.equal(calls, 0);
    assert.deepEqual(states, [true, false]);
  }
});

test('cancelled preparation cannot start a call later or overwrite a new preparation', async () => {
  const oldMic = deferred<boolean>(), newMic = deferred<boolean>(), states: boolean[] = [];
  let preparations = 0, calls = 0;
  const start = createMicReadyCallStart(() => ++preparations === 1 ? oldMic.promise : newMic.promise,
    () => { calls++; }, value => states.push(value));
  const oldStart = start.start();
  start.cancel();
  const newStart = start.start();
  oldMic.resolve(true);
  assert.equal(await oldStart, false);
  assert.equal(calls, 0);
  assert.deepEqual(states, [true, false, true]);
  newMic.resolve(true);
  assert.equal(await newStart, true);
  assert.equal(calls, 1);
  assert.deepEqual(states, [true, false, true, false]);
});

test('unmount cancels late preparation without publishing or calling Retell', async () => {
  const mic = deferred<boolean>(), states: boolean[] = [];
  let calls = 0;
  const start = createMicReadyCallStart(() => mic.promise, () => { calls++; }, value => states.push(value));
  const pending = start.start();
  start.dispose();
  mic.resolve(true);
  assert.equal(await pending, false);
  assert.equal(await start.start(), false);
  assert.equal(calls, 0);
  assert.deepEqual(states, [true]);
});

test('manual and AI hang-up share one flush, report and cleanup; repeat hang-up does not overwrite final audio', { timeout: 1000 }, async () => {
  const flush = deferred<boolean>(), report = deferred<void>(), reportStarted = deferred<void>(), events: string[] = [], states: boolean[] = [];
  const finish = createCallAudioFinish(async () => { events.push('flush'); return flush.promise; },
    async () => { events.push('report'); reportStarted.resolve(); await report.promise; }, () => { events.push('stop'); }, value => states.push(value));
  const manual = finish.finish(), agent = finish.finish();
  assert.equal(manual, agent);
  assert.equal(finish.reset(), false);
  assert.deepEqual(events, ['flush']);
  flush.resolve(true);
  await reportStarted.promise;
  assert.deepEqual(events, ['flush', 'report']);
  report.resolve(); await manual;
  await finish.finish();
  assert.deepEqual(events, ['flush', 'report', 'stop']);
  assert.deepEqual(states, [true, false]);
  assert.equal(finish.reset(), true);
  await finish.finish();
  assert.deepEqual(events, ['flush', 'report', 'stop', 'flush', 'report', 'stop']);
});

test('a delayed Retell hang-up keeps observing audio until onEnd before closing its report', async () => {
  const ended = deferred<void>(), sent: AudioSignalUpdate[] = [];
  const reporter = createLiveAudioReporter(() => {}, async (_id, value) => { sent.push(value); });
  const mic = { status: 'running' as const, starting: false, level: 0.2, error: '' };
  let stops = 0, hooks!: SessionHooks;
  const finish = createCallAudioFinish(async () => true, () => reporter.finish(), () => { stops++; }, () => {});
  const controller = createCallController({
    createWebCall(options) {
      hooks = options.hooks!;
      return { callId: 'call_end_boundary', async end() { await ended.promise; hooks.onEnd?.({}); } } as WebCallSession;
    }, stopCall: async () => {},
  }, 'agent_test', next => {
    if (next.status === 'live') reporter.begin(next.callId, true);
    if (next.status === 'ended') void finish.finish();
  });
  const start = createMicReadyCallStart(async () => true, () => { finish.reset(); controller.start(); }, () => {});
  await start.start(); hooks.onStatus?.('live'); reporter.observe(mic, 0);
  const ending = controller.end();
  assert.equal(stops, 0);
  assert.equal(sent.some(value => value.closed), false);
  for (const at of [100, 200, 300, 400, 500]) reporter.observe(mic, at);
  ended.resolve(); await ending; await finish.finish();
  assert.equal(stops, 1);
  assert.equal(sent.at(-1)?.closed, true);
  assert.equal(sent.at(-1)?.shouting_count, 1);
  assert.equal(sent.at(-1)?.coverage_complete, true);
  controller.dispose(); reporter.dispose();
});

test('the last queued audio samples are observed before finalizing a hang-up', async () => {
  const sent: AudioSignalUpdate[] = [];
  const reporter = createLiveAudioReporter(() => {}, async (_id, value) => { sent.push(value); });
  reporter.begin('call_flush', true);
  const mic = { status: 'running' as const, starting: false, level: 0.2, error: '' };
  reporter.observe(mic, 0);
  const finish = createCallAudioFinish(async () => {
    // These measurements occurred on the audio thread while the UI was delayed.
    for (const at of [100, 200, 300, 400]) reporter.observe(mic, at);
    return true;
  }, () => reporter.finish(), () => {}, () => {});
  await finish.finish();
  assert.equal(sent.at(-1)?.shouting_count, 1);
  assert.equal(sent.at(-1)?.coverage_complete, true);
  assert.equal(sent.at(-1)?.closed, true);
});

test('failed audio flush preserves incomplete coverage instead of inventing zero measurements', async () => {
  const sent: AudioSignalUpdate[] = [];
  const reporter = createLiveAudioReporter(() => {}, async (_id, value) => { sent.push(value); });
  reporter.begin('call_interrupted', true);
  const finish = createCallAudioFinish(async () => {
    reporter.observe({ status: 'error', starting: false, level: 0, error: 'interrupted' }, 10);
    return false;
  }, () => reporter.finish(), () => {}, () => {});
  await finish.finish();
  assert.equal(sent.at(-1)?.coverage_complete, false);
  assert.equal(sent.at(-1)?.available, false);
  assert.equal(sent.at(-1)?.closed, true);
});

test('report failure still releases the owned microphone, and unmount prevents late reports', async () => {
  let stops = 0;
  const finish = createCallAudioFinish(async () => true, async () => { throw new Error('send failure'); }, () => { stops++; }, () => {});
  await assert.rejects(finish.finish(), /send failure/);
  assert.equal(stops, 1);

  const flush = deferred<boolean>(), events: string[] = [];
  const unmount = createCallAudioFinish(() => flush.promise, async () => { events.push('report'); }, () => { events.push('stop'); }, () => {});
  const pending = unmount.finish();
  unmount.dispose();
  flush.resolve(true); await pending;
  assert.deepEqual(events, ['stop']);
  assert.equal(unmount.reset(), false);
});
