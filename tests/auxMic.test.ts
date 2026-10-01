import { test } from 'node:test';
import assert from 'node:assert/strict';
import { auxMicErrorMessage, createAuxMicController, normalizedRms, type AuxMicView } from '../src/dev/auxMic.js';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

function microphone() {
  const track = Object.assign(new EventTarget(), {
    readyState: 'live', stops: 0,
    stop() { this.stops++; this.readyState = 'ended'; },
  });
  const stream = { getTracks: () => [track], getAudioTracks: () => [track] } as unknown as MediaStream;
  return { track, stream };
}

function setup(options: { media?: () => Promise<MediaStream>; resume?: () => Promise<void>; analyserError?: boolean } = {}) {
  const mic = microphone();
  const contexts: ReturnType<typeof makeContext>[] = [];
  const frames = new Map<number, FrameRequestCallback>();
  let frameId = 0;
  let mediaCalls = 0;
  let sample = 0.25;
  const views: AuxMicView[] = [];
  const makeContext = () => {
    const events = new EventTarget();
    const analyser = { fftSize: 0, disconnects: 0, disconnect() { this.disconnects++; }, getFloatTimeDomainData(data: Float32Array) { data.fill(sample); } };
    const source = { connections: [] as unknown[], disconnects: 0, connect(node: unknown) { this.connections.push(node); }, disconnect() { this.disconnects++; } };
    return Object.assign(events, {
      state: 'suspended', closes: 0, analyser, source,
      async resume() { await options.resume?.(); this.state = 'running'; },
      async close() { this.closes++; this.state = 'closed'; events.dispatchEvent(new Event('statechange')); },
      createAnalyser() { if (options.analyserError) throw new Error('setup failure'); return analyser; },
      createMediaStreamSource(stream: MediaStream) { assert.equal(stream.getAudioTracks().length, 1); return source; },
    });
  };
  const controller = createAuxMicController(view => views.push(view), {
    getUserMedia: constraints => { assert.deepEqual(constraints, { audio: true }); mediaCalls++; return options.media?.() ?? Promise.resolve(mic.stream); },
    createContext: () => { const context = makeContext(); contexts.push(context); return context as unknown as AudioContext; },
    requestFrame: callback => { frames.set(++frameId, callback); return frameId; },
    cancelFrame: id => { frames.delete(id); },
  });
  return {
    controller, mic, contexts, views, frames, mediaCalls: () => mediaCalls,
    sample(value: number) { sample = value; },
    tick(time: number) { const pending = [...frames.values()]; frames.clear(); pending.forEach(callback => callback(time)); },
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
  await s.controller.start();
  assert.equal(s.views.at(-1)?.status, 'running');
  assert.equal(s.views.at(-1)?.level, 0.25);
  assert.deepEqual(s.contexts[0].source.connections, [s.contexts[0].analyser]);
  s.sample(0.5); s.tick(100);
  assert.equal(s.views.at(-1)?.level, 0.5);
  s.sample(0); s.tick(200);
  assert.equal(s.views.at(-1)?.level, 0);
  s.controller.dispose();
});

test('aux mic: duplicate starts are blocked while permission is pending and while active', async () => {
  const permission = deferred<MediaStream>();
  const mic = microphone();
  const s = setup({ media: () => permission.promise });
  const start = s.controller.start();
  await s.controller.start();
  assert.equal(s.views.at(-1)?.starting, true);
  assert.equal(s.mediaCalls(), 1);
  permission.resolve(mic.stream); await start;
  await s.controller.start();
  assert.equal(s.mediaCalls(), 1);
  s.controller.dispose();
});

test('aux mic: stop releases only owned tracks/context/frames, without later updates', async () => {
  const unrelatedRetellMic = microphone();
  const s = setup(); await s.controller.start();
  s.controller.stop(); s.controller.stop();
  assert.equal(s.views.at(-1)?.status, 'idle');
  assert.equal(s.views.at(-1)?.level, 0);
  assert.equal(s.mic.track.stops, 1);
  assert.equal(s.contexts[0].closes, 1);
  assert.equal(s.contexts[0].source.disconnects, 1);
  assert.equal(s.contexts[0].analyser.disconnects, 1);
  assert.equal(s.frames.size, 0);
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
  assert.equal(s.frames.size, 0);
});

test('aux mic: a stream granted after stop/unmount is immediately released', async () => {
  for (const action of ['stop', 'dispose'] as const) {
    const permission = deferred<MediaStream>();
    const mic = microphone();
    const s = setup({ media: () => permission.promise });
    const start = s.controller.start();
    s.controller[action]();
    const count = s.views.length;
    permission.resolve(mic.stream); await start;
    assert.equal(mic.track.stops, 1);
    assert.equal(s.contexts[0].closes, 1);
    assert.equal(s.frames.size, 0);
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
  first.resolve(oldMic.stream); await oldStart;
  assert.equal(s.views.at(-1)?.status, 'running');
  assert.equal(oldMic.track.stops, 1);
  assert.equal(newMic.track.stops, 0);
  assert.equal(s.contexts[1].closes, 0);
  s.controller.dispose();
});

test('aux mic: permission/device errors are explicit and release the context', async () => {
  for (const [name, message] of [['NotAllowedError', /권한이 거부/], ['NotReadableError', /장치 점유/], ['NotFoundError', /마이크를 찾지/]] as const) {
    const s = setup({ media: () => Promise.reject(new DOMException('private device details', name)) });
    await s.controller.start();
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
  await s.controller.start();
  assert.equal(s.views.at(-1)?.status, 'error');
  permission.resolve(mic.stream); await Promise.resolve();
  assert.equal(mic.track.stops, 1);
  assert.equal(s.contexts[0].closes, 1);
});

test('aux mic: setup failure releases an acquired stream', async () => {
  const s = setup({ analyserError: true });
  await s.controller.start();
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
    assert.equal(s.frames.size, 0);
    assert.equal(s.mic.track.stops, 1);
    assert.equal(s.contexts[0].closes, 1);
  }
});
