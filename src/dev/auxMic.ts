import { auxMicWorkletModuleSource } from './audioLevelWorklet.js';

export interface AuxMicView {
  status: 'idle' | 'running' | 'error';
  starting: boolean;
  level: number;
  error: string;
  /** AudioContext sample clock, independent of page rendering and MessagePort delivery time. */
  sampledAtMs?: number;
}

export const idleAuxMic: AuxMicView = { status: 'idle', starting: false, level: 0, error: '' };

export function normalizedRms(samples: Float32Array): number {
  if (!samples.length) return 0;
  let squares = 0;
  for (const sample of samples) squares += sample * sample;
  return Math.min(1, Math.sqrt(squares / samples.length));
}

export function auxMicErrorMessage(error: unknown): string {
  const name = error instanceof Error ? error.name : '';
  if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
    return '보조 마이크 사용 권한이 거부되었습니다. 주소창의 사이트 권한에서 마이크를 허용한 뒤 다시 시작하세요.';
  }
  if (name === 'NotFoundError') return '사용 가능한 마이크를 찾지 못했습니다. 장치 연결과 운영체제 입력 설정을 확인하세요.';
  if (name === 'NotReadableError' || name === 'TrackStartError' || name === 'AbortError') {
    return '보조 마이크를 읽을 수 없습니다. 다른 앱의 장치 점유 또는 운영체제 마이크 설정을 확인하세요. Retell 통화는 별도로 유지됩니다.';
  }
  if (name === 'NotSupportedError') return '이 브라우저 환경에서는 보조 마이크 분석을 사용할 수 없습니다. localhost 또는 HTTPS에서 마이크·Web Audio 지원을 확인하세요.';
  if (name === 'InvalidStateError') return '보조 마이크 입력 또는 오디오 분석이 중단되었습니다. 장치와 브라우저 상태를 확인한 뒤 다시 시작하세요.';
  return '보조 마이크 분석을 시작하거나 유지하지 못했습니다. 마이크 권한과 장치를 확인한 뒤 다시 시작하세요.';
}

interface MicEnvironment {
  getUserMedia: (constraints: MediaStreamConstraints) => Promise<MediaStream>;
  createContext: () => AudioContext;
  loadWorklet: (context: AudioContext) => Promise<void>;
  createWorkletNode: (context: AudioContext) => AudioWorkletNode;
  readyTimeoutMs?: number;
  flushTimeoutMs?: number;
}

const browserEnvironment: MicEnvironment = {
  getUserMedia: constraints => {
    if (!navigator.mediaDevices?.getUserMedia) throw new DOMException('', 'NotSupportedError');
    return navigator.mediaDevices.getUserMedia(constraints);
  },
  createContext: () => {
    if (typeof AudioContext === 'undefined') throw new DOMException('', 'NotSupportedError');
    return new AudioContext();
  },
  async loadWorklet(context) {
    if (!context.audioWorklet || typeof AudioWorkletNode === 'undefined') throw new DOMException('', 'NotSupportedError');
    const url = URL.createObjectURL(new Blob([auxMicWorkletModuleSource()], { type: 'application/javascript' }));
    try { await context.audioWorklet.addModule(url); } finally { URL.revokeObjectURL(url); }
  },
  createWorkletNode: context => new AudioWorkletNode(context, 'kcm-aux-mic-level', {
    numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [1], channelCount: 1, channelCountMode: 'explicit',
  }),
};

// Owns only the independent test stream. It never receives a Retell stream or session.
export function createAuxMicController(notify: (view: AuxMicView) => void, environment = browserEnvironment) {
  type Run = {
    context?: AudioContext;
    stream?: MediaStream;
    source?: MediaStreamAudioSourceNode;
    node?: AudioWorkletNode;
    removeListeners?: () => void;
    ready: Promise<boolean>;
    settleReady: (ready: boolean) => void;
    measured: boolean;
    lastSampleAtMs?: number;
    readyTimer?: ReturnType<typeof setTimeout>;
    flushes: Map<number, { resolve: (ready: boolean) => void; timer: ReturnType<typeof setTimeout> }>;
    released?: boolean;
  };
  let current: Run | null = null;
  let disposed = false;
  let flushSequence = 0;

  const release = (run: Run) => {
    if (run.released) return;
    run.released = true;
    run.removeListeners?.();
    if (run.readyTimer !== undefined) clearTimeout(run.readyTimer);
    run.settleReady(false);
    for (const pending of run.flushes.values()) { clearTimeout(pending.timer); pending.resolve(false); }
    run.flushes.clear();
    run.source?.disconnect();
    if (run.node) {
      run.node.port.onmessage = null;
      run.node.port.close();
      run.node.disconnect();
    }
    run.stream?.getTracks().forEach(track => track.stop());
    if (run.context && run.context.state !== 'closed') void run.context.close().catch(() => {});
  };
  const fail = (run: Run, error: unknown) => {
    if (current !== run || disposed) return;
    current = null;
    release(run);
    notify({ status: 'error', starting: false, level: 0, error: auxMicErrorMessage(error) });
  };

  return {
    start(): Promise<boolean> {
      if (disposed) return Promise.resolve(false);
      if (current) return current.ready;
      let settleReady!: (ready: boolean) => void;
      const ready = new Promise<boolean>(resolve => { settleReady = resolve; });
      const run: Run = { ready, settleReady, measured: false, flushes: new Map() };
      current = run;
      notify({ ...idleAuxMic, starting: true });
      void (async () => { try {
        // Start/resume in the click gesture, before awaiting microphone permission.
        const context = environment.createContext();
        run.context = context;
        const media = environment.getUserMedia({ audio: true }).then(stream => {
          // Permission can resolve after stop/unmount or after another start.
          if (current !== run || disposed) stream.getTracks().forEach(track => track.stop());
          else run.stream = stream;
        });
        await Promise.all([media, context.resume()]);
        if (current !== run || disposed) return;
        if (context.state !== 'running' || !run.stream?.getAudioTracks().some(track => track.readyState === 'live')) {
          throw new DOMException('', 'InvalidStateError');
        }
        await environment.loadWorklet(context);
        if (current !== run || disposed) return;
        if (context.state !== 'running' || !run.stream.getAudioTracks().some(track => track.readyState === 'live')) {
          throw new DOMException('', 'InvalidStateError');
        }
        const node = environment.createWorkletNode(context);
        run.node = node;
        const source = context.createMediaStreamSource(run.stream);
        run.source = source;
        const interrupted = () => fail(run, new DOMException('', 'InvalidStateError'));
        const contextChanged = () => { if (context.state !== 'running') interrupted(); };
        const tracks = run.stream.getAudioTracks();
        const inputAvailable = () => tracks.length > 0 && tracks.every(track => track.readyState === 'live' && !track.muted);
        // An initially muted capture can warm up, but its synthetic zeros are not valid samples.
        let eligibleAfterMs = inputAvailable() ? -Infinity : Infinity;
        const muted = () => { if (run.measured) interrupted(); else eligibleAfterMs = Infinity; };
        const unmuted = () => {
          if (!run.measured && inputAvailable()) eligibleAfterMs = context.currentTime * 1000;
        };
        tracks.forEach(track => {
          track.addEventListener('ended', interrupted);
          track.addEventListener('mute', muted);
          track.addEventListener('unmute', unmuted);
        });
        context.addEventListener('statechange', contextChanged);
        node.addEventListener('processorerror', interrupted);
        run.removeListeners = () => {
          tracks.forEach(track => {
            track.removeEventListener('ended', interrupted);
            track.removeEventListener('mute', muted);
            track.removeEventListener('unmute', unmuted);
          });
          context.removeEventListener('statechange', contextChanged);
          node.removeEventListener('processorerror', interrupted);
        };
        node.port.onmessage = event => {
          if (current !== run || disposed) return;
          const data: unknown = event.data;
          if (!data || typeof data !== 'object') { interrupted(); return; }
          const message = data as { type?: unknown; level?: unknown; sampledAtMs?: unknown; requestId?: unknown; observed?: unknown };
          if (message.type === 'flushed') {
            if (typeof message.requestId !== 'number') return;
            const pending = run.flushes.get(message.requestId);
            if (!pending) return;
            if (!run.measured || message.observed !== true || !inputAvailable()) { interrupted(); return; }
            clearTimeout(pending.timer); run.flushes.delete(message.requestId); pending.resolve(true);
            return;
          }
          if (message.type !== 'level' || typeof message.level !== 'number' || !Number.isFinite(message.level)
            || message.level < 0 || message.level > 1 || typeof message.sampledAtMs !== 'number'
            || !Number.isFinite(message.sampledAtMs) || message.sampledAtMs < 0
            || (run.lastSampleAtMs !== undefined && message.sampledAtMs < run.lastSampleAtMs)) { interrupted(); return; }
          if (!inputAvailable()) { if (run.measured) interrupted(); return; }
          if (message.sampledAtMs <= eligibleAfterMs) return;
          if (run.lastSampleAtMs === message.sampledAtMs) return;
          run.lastSampleAtMs = message.sampledAtMs;
          run.measured = true;
          if (run.readyTimer !== undefined) clearTimeout(run.readyTimer);
          notify({ status: 'running', starting: false, level: message.level, error: '', sampledAtMs: message.sampledAtMs });
          run.settleReady(true);
        };
        run.readyTimer = setTimeout(interrupted, environment.readyTimeoutMs ?? 5000);
        source.connect(node);
        node.connect(context.destination); // The processor writes silence; captured microphone audio is never played.
      } catch (error) { fail(run, error); } })();
      return ready;
    },
    /** Port FIFO orders queued levels before this ACK, including the last partial 100ms window. */
    flush(): Promise<boolean> {
      const run = current;
      if (!run?.node || !run.measured || disposed) return Promise.resolve(false);
      const tracks = run.stream?.getAudioTracks();
      if (!tracks?.length || !tracks.every(track => track.readyState === 'live' && !track.muted)) {
        fail(run, new DOMException('', 'InvalidStateError'));
        return Promise.resolve(false);
      }
      return new Promise<boolean>(resolve => {
        const requestId = ++flushSequence;
        const timer = setTimeout(() => fail(run, new DOMException('', 'InvalidStateError')), environment.flushTimeoutMs ?? 5000);
        run.flushes.set(requestId, { resolve, timer });
        try { run.node!.port.postMessage({ type: 'flush', requestId }); }
        catch { fail(run, new DOMException('', 'InvalidStateError')); }
      });
    },
    stop() {
      const run = current;
      current = null;
      if (run) release(run);
      if (!disposed) notify({ ...idleAuxMic });
    },
    dispose() {
      disposed = true;
      const run = current;
      current = null;
      if (run) release(run);
    },
  };
}
