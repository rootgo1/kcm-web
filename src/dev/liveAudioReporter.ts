import type { AudioSignalUpdate } from '../live/types.js';
import { createShoutingDetector } from './shouting.js';
import type { AuxMicView } from './auxMic.js';

export interface AudioReportView { callId: string; count: number; shouting: boolean; complete: boolean; error: string }
export function createLiveAudioReporter(notify: (view: AudioReportView) => void,
  send: (id: string, value: AudioSignalUpdate) => Promise<void> = async (id, value) => {
    const response = await fetch('/api/live-calls/' + encodeURIComponent(id) + '/audio-signals', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin',
      cache: 'no-store', keepalive: true, body: JSON.stringify(value), signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) throw new Error('AUDIO_SIGNALS_SEND_FAILED');
  }) {
  type Session = {
    id: string; detector: ReturnType<typeof createShoutingDetector>; value: AudioSignalUpdate;
    pending: AudioSignalUpdate | null; pumping: Promise<void> | null; error: string;
  };
  let current: Session | null = null;
  let disposed = false;
  const publish = (session: Session) => {
    if (!disposed && current === session) notify({ callId: session.id, count: session.value.shouting_count,
      shouting: session.value.is_shouting, complete: session.value.coverage_complete, error: session.error });
  };
  const pump = (session: Session): Promise<void> => {
    if (session.pumping) return session.pumping;
    session.pumping = (async () => {
      while (session.pending) {
        const value = session.pending; session.pending = null;
        try { await send(session.id, value); session.error = ''; }
        catch {
          session.pending ??= value;
          session.error = '고성 상태를 전송하지 못했습니다. 백엔드 연결을 확인한 뒤 전송 재시도를 누르세요.';
          publish(session); break;
        }
      }
    })().finally(() => { session.pumping = null; publish(session); if (session.pending && !session.error) void pump(session); });
    return session.pumping;
  };
  const queue = (session: Session, change: Partial<AudioSignalUpdate>) => {
    session.value = { ...session.value, ...change, sequence: session.value.sequence + 1 };
    session.pending = { ...session.value };
    publish(session); void pump(session);
  };
  return {
    begin(callId: string, micReady: boolean) {
      if (disposed || !callId || current?.id === callId) return;
      const session: Session = { id: callId, detector: createShoutingDetector(), pending: null, pumping: null, error: '',
        value: { sequence: 0, shouting_count: 0, is_shouting: false, available: micReady, coverage_complete: micReady, closed: false } };
      current = session;
      queue(session, {});
    },
    observe(mic: AuxMicView, at: number) {
      const session = current;
      if (!session || session.value.closed || disposed) return;
      if (mic.status !== 'running') {
        if (session.value.available) queue(session, { available: false, coverage_complete: false, is_shouting: false });
        return;
      }
      const result = session.detector.sample(mic.level, at);
      const complete = session.value.coverage_complete && result.continuous;
      if (result.shouting_count !== session.value.shouting_count || result.is_shouting !== session.value.is_shouting
        || !session.value.available || complete !== session.value.coverage_complete) {
        queue(session, { shouting_count: result.shouting_count, is_shouting: result.is_shouting, available: true, coverage_complete: complete });
      }
    },
    async finish() {
      const session = current;
      if (!session || session.value.closed) return;
      queue(session, { closed: true, is_shouting: false });
      await pump(session);
    },
    async retry() { if (current) await pump(current); },
    dispose() {
      disposed = true;
      if (current && !current.value.closed) queue(current, { closed: true, is_shouting: false, coverage_complete: false });
    },
  };
}
