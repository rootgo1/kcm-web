import { test } from 'node:test';
import assert from 'node:assert/strict';
import { auxMicErrorMessage, createAuxMicController, normalizedRms, type AuxMicView } from '../src/dev/auxMic.js';
import './audioLevelWorklet.test.js';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

function microphone() {
  const track = Object.assign(new EventTarget(), {
    readyState: 'live', muted: false, stops: 0,
    stop() { this.stops++; this.readyState = 'ended'; },
  });
  const stream = { getTracks: () => [track], getAudioTracks: () => [track] } as unknown as MediaStream;
  return { track, stream };
}

function setup(options: { media?: () => Promise<MediaStream>; resume?: () => Promise<void>; workletError?: boolean;
  load?: () => Promise<void>; autoSample?: boolean; flushAck?: boolean; readyTimeoutMs?: number; flushTimeoutMs?: number } = {}) {
  const mic = microphone();
  const contexts: ReturnType<typeof makeContext>[] = [];
  const nodes: ReturnType<typeof makeNode>[] = [];
  let mediaCalls = 0;
  let sample = 0.25;
  const views: AuxMicView[] = [];
  const makeNode = () => {
    const events = new EventTarget();
    const node = Object.assign(events, {
      connections: [] as unknown[], disconnects: 0,
      connect(destination: unknown) { this.connections.push(destination); },
      disconnect() { this.disconnects++; },
      port: {
        onmessage: null as ((event: MessageEvent) => void) | null, closes: 0, messages: [] as unknown[],
        close() { this.closes++; },
        postMessage(message: { type: string; requestId: number }) {
          this.messages.push(message);
          if (options.flushAck !== false) {
            node.emit({ type: 'level', level: sample, sampledAtMs: 150 });
            node.emit({ type: 'flushed', requestId: message.requestId, observed: true });
          }
        },
      },
      emit(data: unknown) { this.port.onmessage?.({ data } as MessageEvent); },
    });
    return node;
  };
  const makeContext = () => {
    const events = new EventTarget();
    const source = { connections: [] as unknown[], disconnects: 0,
      connect(node: unknown) {
        this.connections.push(node);
        if (options.autoSample !== false) queueMicrotask(() => (node as ReturnType<typeof makeNode>).emit({ type: 'level', level: sample, sampledAtMs: 100 }));
      }, disconnect() { this.disconnects++; } };
    return Object.assign(events, {
      state: 'suspended', currentTime: 0, closes: 0, source, destination: {},
      async resume() { await options.resume?.(); this.state = 'running'; },
      async close() { this.closes++; this.state = 'closed'; events.dispatchEvent(new Event('statechange')); },
      createMediaStreamSource(stream: MediaStream) { assert.equal(stream.getAudioTracks().length, 1); return source; },
    });
  };
  const controller = createAuxMicController(view => views.push(view), {
    getUserMedia: constraints => { assert.deepEqual(constraints, { audio: true }); mediaCalls++; return options.media?.() ?? Promise.resolve(mic.stream); },
    createContext: () => { const context = makeContext(); contexts.push(context); return context as unknown as AudioContext; },
    loadWorklet: async () => { await options.load?.(); if (options.workletError) throw new Error('setup failure'); },
    createWorkletNode: () => { const node = makeNode(); nodes.push(node); return node as unknown as AudioWorkletNode; },
    readyTimeoutMs: options.readyTimeoutMs, flushTimeoutMs: options.flushTimeoutMs,
  });
  return {
    controller, mic, contexts, views, nodes, mediaCalls: () => mediaCalls,
    sample(value: number) { sample = value; },
    tick(time: number) { nodes.at(-1)?.emit({ type: 'level', level: sample, sampledAtMs: time }); },
  };
}

test('aux mic: RMS uses waveform amplitude, includes silence and clamps to 0–1', () => {
  assert.equal(normalizedRms(new Float32Array()), 0);
  assert.equal(normalizedRms(new Float32Array([0, 0])), 0);
  assert.equal(normalizedRms(new Float32Array([0.5, -0.5])), 0.5);
  assert.equal(normalizedRms(new Float32Array([1, -1])), 1);
  assert.equal(normalizedRms(new Float32Array([2, -2])), 1);
});

test('aux mic: works without a Retell session, updates levels and does not play audio', async () => {
  const s = setup();
  assert.equal(await s.controller.start(), true);
  assert.equal(s.views.at(-1)?.status, 'running');
  assert.equal(s.views.at(-1)?.level, 0.25);
  assert.deepEqual(s.contexts[0].source.connections, [s.nodes[0]]);
  assert.deepEqual(s.nodes[0].connections, [s.contexts[0].destination]);
  assert.equal(s.views.at(-1)?.sampledAtMs, 100);
  s.sample(0.5); s.tick(200);
  assert.equal(s.views.at(-1)?.level, 0.5);
  s.sample(0); s.tick(300);
  assert.equal(s.views.at(-1)?.level, 0);
  s.controller.dispose();
});

test('aux mic: duplicate starts are blocked while permission is pending and while active', async () => {
  const permission = deferred<MediaStream>();
  const mic = microphone();
  const s = setup({ media: () => permission.promise });
  const start = s.controller.start();
  const duplicate = s.controller.start();
  assert.equal(duplicate, start);
  assert.equal(s.views.at(-1)?.starting, true);
  assert.equal(s.mediaCalls(), 1);
  permission.resolve(mic.stream); assert.equal(await start, true);
  assert.equal(await duplicate, true);
  assert.equal(await s.controller.start(), true);
  assert.equal(s.mediaCalls(), 1);
  s.controller.dispose();
});

test('aux mic: stop releases only owned tracks/context/ports, without later updates', async () => {
  const unrelatedRetellMic = microphone();
  const s = setup(); await s.controller.start();
  s.controller.stop(); s.controller.stop();
  assert.equal(s.views.at(-1)?.status, 'idle');
  assert.equal(s.views.at(-1)?.level, 0);
  assert.equal(s.mic.track.stops, 1);
  assert.equal(s.contexts[0].closes, 1);
  assert.equal(s.contexts[0].source.disconnects, 1);
  assert.equal(s.nodes[0].disconnects, 1);
  assert.equal(s.nodes[0].port.closes, 1);
  assert.equal(s.nodes[0].port.onmessage, null);
  assert.equal(unrelatedRetellMic.track.stops, 0);
  const count = s.views.length;
  s.tick(300); s.mic.track.dispatchEvent(new Event('ended'));
  assert.equal(s.views.length, count);
});

test('aux mic: unmount releases resources and prevents new starts or notifications', async () => {
  const s = setup(); await s.controller.start();
  const count = s.views.length;
  s.controller.dispose(); s.controller.dispose(); s.controller.stop(); await s.controller.start();
  s.tick(300);
  assert.equal(s.views.length, count);
  assert.equal(s.mic.track.stops, 1);
  assert.equal(s.contexts[0].closes, 1);
  assert.equal(s.mediaCalls(), 1);
  assert.equal(s.nodes[0].port.closes, 1);
});

test('aux mic: a stream granted after stop/unmount is immediately released', async () => {
  for (const action of ['stop', 'dispose'] as const) {
    const permission = deferred<MediaStream>();
    const mic = microphone();
    const s = setup({ media: () => permission.promise });
    const start = s.controller.start();
    s.controller[action]();
    const count = s.views.length;
    permission.resolve(mic.stream); assert.equal(await start, false);
    assert.equal(mic.track.stops, 1);
    assert.equal(s.contexts[0].closes, 1);
    assert.equal(s.nodes.length, 0);
    assert.equal(s.views.length, count);
  }
});

test('aux mic: canceled acquisition cannot replace or close a restarted microphone', async () => {
  const first = deferred<MediaStream>();
  const oldMic = microphone();
  const newMic = microphone();
  let requests = 0;
  const s = setup({ media: () => ++requests === 1 ? first.promise : Promise.resolve(newMic.stream) });
  const oldStart = s.controller.start();
  s.controller.stop(); await s.controller.start();
  first.resolve(oldMic.stream); assert.equal(await oldStart, false);
  assert.equal(s.views.at(-1)?.status, 'running');
  assert.equal(oldMic.track.stops, 1);
  assert.equal(newMic.track.stops, 0);
  assert.equal(s.contexts[1].closes, 0);
  s.controller.dispose();
});

test('aux mic: permission/device errors are explicit and release the context', async () => {
  for (const [name, message] of [['NotAllowedError', /권한이 거부/], ['NotReadableError', /장치 점유/], ['NotFoundError', /마이크를 찾지/]] as const) {
    const s = setup({ media: () => Promise.reject(new DOMException('private device details', name)) });
    assert.equal(await s.controller.start(), false);
    assert.equal(s.views.at(-1)?.status, 'error');
    assert.match(s.views.at(-1)!.error, message);
    assert.doesNotMatch(s.views.at(-1)!.error, /private device details/);
    assert.equal(s.contexts[0].closes, 1);
  }
  assert.match(auxMicErrorMessage(new DOMException('', 'NotSupportedError')), /localhost 또는 HTTPS/);
});

test('aux mic: failed AudioContext resume also cleans a subsequently granted stream', async () => {
  const permission = deferred<MediaStream>();
  const mic = microphone();
  const s = setup({ media: () => permission.promise, resume: () => Promise.reject(new DOMException('', 'NotAllowedError')) });
  assert.equal(await s.controller.start(), false);
  assert.equal(s.views.at(-1)?.status, 'error');
  permission.resolve(mic.stream); await Promise.resolve();
  assert.equal(mic.track.stops, 1);
  assert.equal(s.contexts[0].closes, 1);
});

test('aux mic: setup failure releases an acquired stream', async () => {
  const s = setup({ workletError: true });
  assert.equal(await s.controller.start(), false);
  assert.equal(s.views.at(-1)?.status, 'error');
  assert.equal(s.mic.track.stops, 1);
  assert.equal(s.contexts[0].closes, 1);
});

test('aux mic: device loss or context interruption displays an error and clears resources', async () => {
  for (const interruption of ['device', 'context']) {
    const s = setup(); await s.controller.start();
    if (interruption === 'device') s.mic.track.dispatchEvent(new Event('ended'));
    else { s.contexts[0].state = 'suspended'; s.contexts[0].dispatchEvent(new Event('statechange')); }
    assert.equal(s.views.at(-1)?.status, 'error');
    assert.match(s.views.at(-1)!.error, /중단/);
    assert.equal(s.nodes[0].port.closes, 1);
    assert.equal(s.mic.track.stops, 1);
    assert.equal(s.contexts[0].closes, 1);
  }
});

test('aux mic: readiness waits for an actual worklet sample and cancel settles a pending acquisition', async () => {
  const s = setup({ autoSample: false });
  const started = s.controller.start();
  await new Promise<void>(resolve => setImmediate(resolve));
  assert.equal(s.views.at(-1)?.starting, true);
  let ready = false;
  void started.then(() => { ready = true; });
  await Promise.resolve(); assert.equal(ready, false);
  s.tick(100); assert.equal(await started, true);
  s.controller.dispose();
  const canceled = setup({ autoSample: false });
  const pending = canceled.controller.start();
  await new Promise<void>(resolve => setImmediate(resolve));
  canceled.controller.stop(); assert.equal(await pending, false);
  assert.equal(canceled.nodes[0].port.closes, 1);
});

test('aux mic: delayed main-thread deliveries retain AudioContext sample timestamps', async () => {
  const s = setup(); await s.controller.start();
  // These messages can be delivered as a queued batch after a background/rendering pause.
  s.tick(200); s.tick(300); s.tick(400);
  assert.deepEqual(s.views.filter(view => view.status === 'running').map(view => view.sampledAtMs), [100, 200, 300, 400]);
  assert.equal(s.views.at(-1)?.status, 'running');
  s.controller.dispose();
});

test('aux mic: flush includes final queued level before ACK and survives later duplicate/unknown ACK', async () => {
  const s = setup(); await s.controller.start();
  s.sample(0.5);
  assert.equal(await s.controller.flush(), true);
  assert.equal(s.views.at(-1)?.level, 0.5);
  assert.equal(s.views.at(-1)?.sampledAtMs, 150);
  const count = s.views.length;
  s.nodes[0].emit({ type: 'flushed', requestId: 1, observed: true });
  s.nodes[0].emit({ type: 'flushed', requestId: 999, observed: true });
  assert.equal(s.views.length, count);
  s.controller.dispose();
  assert.equal(await s.controller.flush(), false);
});

test('aux mic: missing first sample and flush timeout report actual analysis failure and release resources', async () => {
  const waiting = setup({ autoSample: false, readyTimeoutMs: 5 });
  assert.equal(await waiting.controller.start(), false);
  assert.equal(waiting.views.at(-1)?.status, 'error');
  assert.equal(waiting.mic.track.stops, 1);
  const s = setup({ flushAck: false, flushTimeoutMs: 5 }); await s.controller.start();
  assert.equal(await s.controller.flush(), false);
  assert.equal(s.views.at(-1)?.status, 'error');
  assert.equal(s.nodes[0].port.closes, 1);
  assert.equal(s.contexts[0].closes, 1);
});

test('aux mic: invalid worklet samples and processor failure are never converted into measured silence', async () => {
  for (const failure of ['processorerror', 'unavailable', 'invalid']) {
    const s = setup(); await s.controller.start();
    if (failure === 'processorerror') s.nodes[0].dispatchEvent(new Event('processorerror'));
    else if (failure === 'unavailable') s.nodes[0].emit({ type: 'unavailable' });
    else s.nodes[0].emit({ type: 'level', level: NaN, sampledAtMs: 200 });
    assert.equal(s.views.at(-1)?.status, 'error');
    assert.equal(s.nodes[0].port.closes, 1);
    assert.equal(s.mic.track.stops, 1);
    assert.equal(await s.controller.flush(), false);
  }
});

test('aux mic: initially muted live track waits for unmute and fresh audio rather than accepting synthetic zero', async () => {
  const s = setup({ autoSample: false });
  s.mic.track.muted = true;
  s.sample(0);
  const started = s.controller.start();
  await new Promise<void>(resolve => setImmediate(resolve));
  s.tick(100);
  assert.equal(s.views.at(-1)?.starting, true);
  assert.equal(s.views.some(view => view.status === 'running'), false);
  s.contexts[0].currentTime = 0.2;
  s.mic.track.muted = false;
  s.mic.track.dispatchEvent(new Event('unmute'));
  s.tick(150); // A queued muted sample stays invalid even after the device became usable.
  assert.equal(s.views.some(view => view.status === 'running'), false);
  s.tick(300);
  assert.equal(await started, true);
  assert.equal(s.views.at(-1)?.level, 0); // Actual unmuted silence remains valid.
  assert.equal(s.views.at(-1)?.sampledAtMs, 300);
  s.controller.dispose();
});

test('aux mic: initially muted input that never becomes usable fails readiness without a measured zero', async () => {
  const s = setup({ readyTimeoutMs: 5 });
  s.mic.track.muted = true;
  assert.equal(await s.controller.start(), false);
  assert.equal(s.views.some(view => view.status === 'running'), false);
  assert.equal(s.views.at(-1)?.status, 'error');
  assert.equal(s.mic.track.stops, 1);
  assert.equal(s.nodes[0].port.closes, 1);
});

test('aux mic: mute after readiness is an interruption and cannot be repaired into complete silent audio', async () => {
  const s = setup(); await s.controller.start();
  const before = s.views.filter(view => view.status === 'running').length;
  s.mic.track.muted = true;
  s.mic.track.dispatchEvent(new Event('mute'));
  assert.equal(s.views.at(-1)?.status, 'error');
  assert.equal(s.nodes[0].port.closes, 1);
  assert.equal(s.mic.track.stops, 1);
  s.mic.track.muted = false;
  s.mic.track.dispatchEvent(new Event('unmute'));
  s.tick(300);
  assert.equal(s.views.filter(view => view.status === 'running').length, before);
  assert.equal(await s.controller.flush(), false);
});

test('aux mic: muted track is checked during final flush even if the mute event was unavailable', async () => {
  const s = setup(); await s.controller.start();
  s.mic.track.muted = true;
  assert.equal(await s.controller.flush(), false);
  assert.equal(s.views.at(-1)?.status, 'error');
  assert.equal(s.nodes[0].port.closes, 1);
  assert.equal(s.mic.track.stops, 1);
});
