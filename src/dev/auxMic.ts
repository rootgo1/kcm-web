export interface AuxMicView {
  status: 'idle' | 'running' | 'error';
  starting: boolean;
  level: number;
  error: string;
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
  requestFrame: (callback: FrameRequestCallback) => number;
  cancelFrame: (id: number) => void;
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
  requestFrame: callback => requestAnimationFrame(callback),
  cancelFrame: id => cancelAnimationFrame(id),
};

// Owns only the independent test stream. It never receives a Retell stream or session.
export function createAuxMicController(notify: (view: AuxMicView) => void, environment = browserEnvironment) {
  type Run = {
    context?: AudioContext;
    stream?: MediaStream;
    source?: MediaStreamAudioSourceNode;
    analyser?: AnalyserNode;
    frame?: number;
    removeListeners?: () => void;
  };
  let current: Run | null = null;
  let disposed = false;

  const release = (run: Run) => {
    run.removeListeners?.();
    if (run.frame !== undefined) environment.cancelFrame(run.frame);
    run.source?.disconnect();
    run.analyser?.disconnect();
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
    async start() {
      if (current || disposed) return;
      const run: Run = {};
      current = run;
      notify({ ...idleAuxMic, starting: true });
      try {
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
        const analyser = context.createAnalyser();
        run.analyser = analyser;
        analyser.fftSize = 2048;
        const source = context.createMediaStreamSource(run.stream);
        run.source = source;
        source.connect(analyser); // No destination connection: no microphone playback.
        const interrupted = () => fail(run, new DOMException('', 'InvalidStateError'));
        const contextChanged = () => { if (context.state !== 'running') interrupted(); };
        const tracks = run.stream.getAudioTracks();
        tracks.forEach(track => track.addEventListener('ended', interrupted));
        context.addEventListener('statechange', contextChanged);
        run.removeListeners = () => {
          tracks.forEach(track => track.removeEventListener('ended', interrupted));
          context.removeEventListener('statechange', contextChanged);
        };
        const samples = new Float32Array(analyser.fftSize);
        let lastUpdate = -Infinity;
        const measure: FrameRequestCallback = time => {
          if (current !== run || disposed) return;
          try {
            if (time - lastUpdate >= 100) {
              analyser.getFloatTimeDomainData(samples);
              const level = normalizedRms(samples);
              if (!Number.isFinite(level)) throw new Error('INVALID_AUDIO_SAMPLES');
              notify({ status: 'running', starting: false, level, error: '' });
              lastUpdate = time;
            }
            run.frame = environment.requestFrame(measure);
          } catch (error) { fail(run, error); }
        };
        measure(0);
      } catch (error) { fail(run, error); }
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
