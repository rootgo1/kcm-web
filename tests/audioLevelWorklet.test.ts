import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runInNewContext } from 'node:vm';
import { auxMicWorkletModuleSource, registerAuxMicLevelWorklet, type LevelWorkletScope } from '../src/dev/audioLevelWorklet.js';

function worklet(isolated = false) {
  const posted: Record<string, unknown>[] = [];
  class BaseProcessor {
    port = {
      onmessage: null as ((event: { data: unknown }) => void) | null,
      postMessage(value: unknown) { posted.push(value as Record<string, unknown>); },
    };
  }
  type Processor = BaseProcessor & { process(inputs: Float32Array[][], outputs: Float32Array[][]): boolean };
  let ProcessorClass!: new () => Processor;
  const scope: LevelWorkletScope = {
    AudioWorkletProcessor: BaseProcessor, currentFrame: 0, sampleRate: 48000,
    registerProcessor(name, processor) { assert.equal(name, 'kcm-aux-mic-level'); ProcessorClass = processor as new () => Processor; },
  };
  if (isolated) runInNewContext(auxMicWorkletModuleSource(), scope);
  else registerAuxMicLevelWorklet(scope);
  const processor = new ProcessorClass();
  return {
    posted, processor, scope,
    block(level: number, frames = 128) {
      const output = new Float32Array(frames).fill(0.9);
      assert.equal(processor.process([[new Float32Array(frames).fill(level)]], [[output]]), true);
      assert.ok(output.every(sample => sample === 0), 'the microphone must never be audible in the destination');
      scope.currentFrame += frames;
    },
    feed(level: number, blocks: number) { for (let n = 0; n < blocks; n++) this.block(level); },
    flush(requestId: number) { processor.port.onmessage?.({ data: { type: 'flush', requestId } }); },
  };
}

test('audio worklet: emits 2048-sample RMS near 100ms on audio clock and output stays silent', () => {
  const s = worklet();
  s.feed(0.25, 37); assert.equal(s.posted.length, 0);
  s.block(0.25);
  assert.equal(s.posted.length, 1);
  assert.equal(s.posted[0].type, 'level');
  assert.equal(s.posted[0].level, 0.25);
  assert.ok(Number(s.posted[0].sampledAtMs) >= 100 && Number(s.posted[0].sampledAtMs) <= 104);
  assert.deepEqual(Object.keys(s.posted[0]).sort(), ['level', 'sampledAtMs', 'type']);
  s.feed(0.5, 38);
  assert.equal(s.posted.at(-1)?.level, 0.5);
  assert.ok(Number(s.posted.at(-1)?.sampledAtMs) > Number(s.posted[0].sampledAtMs));
});

test('audio worklet: latest 2048 samples replace old audio and silence remains a measured zero', () => {
  const s = worklet();
  s.feed(0.5, 38);
  s.feed(0, 16); // Exactly 2048 samples replace the entire old window.
  s.flush(1);
  assert.equal(s.posted.at(-2)?.type, 'level');
  assert.equal(s.posted.at(-2)?.level, 0);
  assert.deepEqual(s.posted.at(-1), { type: 'flushed', requestId: 1, observed: true });
  s.feed(2, 16); s.flush(2);
  assert.equal(s.posted.at(-2)?.level, 1);
});

test('audio worklet: flush sends the final partial reporting window before its ACK', () => {
  const s = worklet();
  s.feed(0.25, 38);
  const before = Number(s.posted.at(-1)?.sampledAtMs);
  s.block(0.5);
  assert.equal(s.posted.length, 1);
  s.flush(17);
  assert.equal(s.posted.length, 3);
  assert.equal(s.posted[1].type, 'level');
  assert.ok(Number(s.posted[1].sampledAtMs) > before);
  assert.deepEqual(s.posted[2], { type: 'flushed', requestId: 17, observed: true });
});

test('audio worklet: missing/invalid input is unavailable rather than a zero count and unobserved flush cannot succeed', () => {
  const s = worklet();
  s.processor.process([], [[new Float32Array(128)]]);
  assert.deepEqual(s.posted, [{ type: 'unavailable' }]);
  s.flush(1);
  assert.deepEqual(s.posted.at(-1), { type: 'flushed', requestId: 1, observed: false });
  s.block(NaN);
  assert.equal(s.posted.at(-1)?.type, 'unavailable');
  const count = s.posted.length;
  s.processor.port.onmessage?.({ data: { type: 'flush', requestId: 'bad' } });
  assert.equal(s.posted.length, count);
});

test('audio worklet: Blob module source registers in an isolated global without imports or module globals', () => {
  const source = auxMicWorkletModuleSource();
  assert.doesNotMatch(source, /import\.meta|require\(|import\s/);
  const s = worklet(true);
  s.feed(0.25, 38);
  assert.equal(s.posted[0].level, 0.25);
  s.flush(3);
  assert.equal(s.posted.at(-1)?.type, 'flushed');
});
