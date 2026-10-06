/** This function is self-contained so its emitted JavaScript can run in AudioWorkletGlobalScope. */
export interface LevelWorkletScope {
  AudioWorkletProcessor: new () => { port: {
    onmessage: ((event: { data: unknown }) => void) | null;
    postMessage: (value: unknown) => void;
  } };
  sampleRate: number;
  currentFrame: number;
  registerProcessor: (name: string, processor: new () => {
    process: (inputs: Float32Array[][], outputs: Float32Array[][]) => boolean;
  }) => void;
}

export function registerAuxMicLevelWorklet(scope: LevelWorkletScope) {
  class AuxMicLevelProcessor extends scope.AudioWorkletProcessor {
    // Match the previous AnalyserNode's 2048-sample RMS window.
    private samples = new Float32Array(2048);
    private cursor = 0;
    private squares = 0;
    private observed = false;
    private lastSampleAtMs = 0;
    private lastPublishedAtMs = scope.currentFrame / scope.sampleRate * 1000;

    constructor() {
      super();
      this.port.onmessage = event => {
        const data = event.data;
        if (!data || typeof data !== 'object') return;
        const request = data as { type?: unknown; requestId?: unknown };
        if (request.type !== 'flush' || !Number.isSafeInteger(request.requestId)) return;
        if (this.observed) this.publish();
        this.port.postMessage({ type: 'flushed', requestId: request.requestId, observed: this.observed });
      };
    }

    private publish() {
      const level = Math.min(1, Math.sqrt(Math.max(0, this.squares) / this.samples.length));
      this.port.postMessage({ type: 'level', level, sampledAtMs: this.lastSampleAtMs });
      this.lastPublishedAtMs = this.lastSampleAtMs;
    }

    process(inputs: Float32Array[][], outputs: Float32Array[][]) {
      // A connected silent output keeps the graph active without playing the microphone.
      for (const output of outputs) for (const channel of output) channel.fill(0);
      const input = inputs[0]?.[0];
      if (!input?.length) {
        this.port.postMessage({ type: 'unavailable' });
        return true;
      }
      for (const sample of input) {
        if (!Number.isFinite(sample)) {
          this.port.postMessage({ type: 'unavailable' });
          return true;
        }
        const previous = this.samples[this.cursor];
        this.squares += sample * sample - previous * previous;
        this.samples[this.cursor] = sample;
        this.cursor = (this.cursor + 1) % this.samples.length;
      }
      this.observed = true;
      this.lastSampleAtMs = (scope.currentFrame + input.length) / scope.sampleRate * 1000;
      if (this.lastSampleAtMs - this.lastPublishedAtMs >= 100) this.publish();
      return true;
    }
  }
  scope.registerProcessor('kcm-aux-mic-level', AuxMicLevelProcessor);
}

/** Blob modules also work with the project's CommonJS-based standalone preview generator. */
export function auxMicWorkletModuleSource(): string {
  return `(${registerAuxMicLevelWorklet.toString()})(globalThis);`;
}
