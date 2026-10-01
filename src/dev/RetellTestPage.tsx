import { useEffect, useRef, useState } from 'react';
import { createCallController, retellProxyFetch, type CallView } from './retellCall';
import { createAuxMicController, idleAuxMic } from './auxMic';
import { createLiveAudioReporter, type AudioReportView } from './liveAudioReporter';
import { SHOUT_SETTINGS } from './shouting';
import './retell-test.css';

const labels: Record<CallView['status'], string> = {
  idle: '대기', connecting: '연결 중', live: '통화 중', ending: '종료 중', ended: '통화 종료',
};

export default function RetellTestPage() {
  const controller = useRef<ReturnType<typeof createCallController> | null>(null);
  const auxMic = useRef<ReturnType<typeof createAuxMicController> | null>(null);
  const reporter = useRef<ReturnType<typeof createLiveAudioReporter> | null>(null);
  const micLatest = useRef(idleAuxMic);
  const [audioReport, setAudioReport] = useState<AudioReportView | null>(null);
  const [micView, setMicView] = useState(idleAuxMic);
  const [view, setView] = useState<CallView>({ status: 'idle', callId: '', error: '' });
  const [ready, setReady] = useState(false);
  const [setup, setSetup] = useState('SDK와 백엔드 설정을 확인하고 있습니다.');
  const [loadError, setLoadError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const busy = view.status === 'connecting' || view.status === 'live' || view.status === 'ending';

  useEffect(() => {
    reporter.current = createLiveAudioReporter(setAudioReport);
    auxMic.current = createAuxMicController(next => {
      micLatest.current = next;
      setMicView(next);
      reporter.current?.observe(next, performance.now());
    });
    return () => { reporter.current?.dispose(); reporter.current = null; auxMic.current?.dispose(); auxMic.current = null; };
  }, []);

  useEffect(() => {
    let active = true;
    const abort = new AbortController();
    setReady(false);
    setLoadError('');
    setView(previous => ({ ...previous, error: '' }));
    const load = async () => {
      try {
        // Loaded only on this dev route, never on the employee dashboard.
        const [{ RetellClient }, response] = await Promise.all([
          import('retell-client-js-sdk'),
          fetch('/retell/config', { signal: abort.signal, cache: 'no-store', credentials: 'same-origin' }),
        ]);
        if (!response.ok) throw new Error('BACKEND_UNAVAILABLE');
        const config: { agent_id?: unknown; configured?: unknown } = await response.json();
        if (typeof config.agent_id !== 'string') throw new Error('INVALID_CONFIG');
        if (!active) return;
        // Official SDK custom fetch proxy pattern; this literal is NOT an API key.
        const client = new RetellClient({ key: 'unused-server-proxy', fetch: retellProxyFetch });
        controller.current = createCallController(client, config.agent_id, next => {
          if (next.status === 'live' && next.callId) reporter.current?.begin(next.callId, micLatest.current.status === 'running');
          if (next.status === 'ended') { void reporter.current?.finish(); auxMic.current?.stop(); }
          setView(next);
        });
        setSetup(config.configured ? '백엔드 설정을 확인했습니다. 시작 버튼을 누르면 실제 Retell 통화를 시도합니다.'
          : 'Retell 설정이 없습니다. 프로젝트 .env에 API 키와 Agent ID를 작성하고 백엔드를 다시 실행하세요.');
        setReady(true);
      } catch {
        if (active) setLoadError('백엔드에 접속할 수 없습니다. 별도 터미널에서 npm run server를 실행한 뒤 설정 다시 확인을 누르세요.');
      }
    };
    void load();
    return () => { active = false; abort.abort(); controller.current?.dispose(); controller.current = null; };
  }, [attempt]);

  return <main className="retell-test">
    <section className="retell-test-card" aria-labelledby="retell-title">
      <p className="retell-test-eyebrow">개발·시연용 통화 테스트 화면</p>
      <h1 id="retell-title">KCM AI 상담 테스트</h1>
      <p>마이크로 Retell AI와 실제 Web Call을 진행합니다. 통화 내용은 백엔드 터미널에 출력됩니다.</p>
      <div className="retell-test-status" role="status" aria-live="polite">
        <span>통화 상태</span><strong>{labels[view.status]}</strong>
        {view.callId && <code>call_id: {view.callId}</code>}
      </div>
      <p className="retell-test-setup">{setup}</p>
      {(loadError || view.error) && <p className="retell-test-error" role="alert">{loadError || view.error}</p>}
      <div className="retell-test-actions">
        <button type="button" className="retell-test-start" disabled={!ready || busy} onClick={() => { void auxMic.current?.start(); controller.current?.start(); }}>통화 시작</button>
        <button type="button" disabled={!busy || view.status === 'ending'} onClick={() => { void (async () => { await reporter.current?.finish(); auxMic.current?.stop(); await controller.current?.end(); })(); }}>통화 종료</button>
        <button type="button" disabled={busy} onClick={() => setAttempt(value => value + 1)}>설정 다시 확인</button>
      </div>
      <p className="retell-test-note">브라우저에서 마이크 사용을 허용해 주세요. 권한을 차단했다면 주소창의 사이트 권한에서 변경할 수 있습니다.</p>
      <p className="retell-test-note">통화 신호와 종료 후 결과는 직원용 실시간 패널에서 확인합니다. 기존 방문 예약·데모 상담 기록과는 별도로 관리됩니다.</p>
      <section className="retell-aux-mic" aria-labelledby="aux-mic-title">
        <div className="retell-aux-mic-heading">
          <h2 id="aux-mic-title">보조 마이크 분석</h2>
          <strong className={`retell-aux-mic-state is-${micView.status}`} role="status" aria-live="polite">
            <span aria-hidden="true">● </span>{micView.status === 'running' ? '정상' : micView.status === 'error' ? '오류' : '대기'}
          </strong>
        </div>
        <div className="retell-aux-mic-level"><span>현재 음성 레벨</span><output aria-live="off">{micView.level.toFixed(2)}</output></div>
        <div className="retell-aux-mic-meter" role="meter" aria-label="보조 마이크 음성 레벨" aria-valuemin={0} aria-valuemax={1} aria-valuenow={Number(micView.level.toFixed(2))}>
          <span style={{ width: `${micView.level * 100}%` }} />
        </div>
        <div className="retell-test-actions">
          <button type="button" disabled={micView.starting || micView.status === 'running' || view.status === 'ending'} onClick={() => { void auxMic.current?.start(); }}>보조 마이크 시작</button>
          <button type="button" disabled={!micView.starting && micView.status !== 'running'} onClick={() => auxMic.current?.stop()}>보조 마이크 중지</button>
        </div>
        {micView.starting && <p className="retell-test-note" role="status">마이크 권한과 입력 장치를 확인하고 있습니다.</p>}
        {micView.error && <p className="retell-test-error" role="alert">{micView.error}</p>}
        <p className="retell-test-note">통화 없이도 시작할 수 있습니다. 보조 마이크를 켜고 통화를 시작하거나, 통화 중 켠 뒤 말하면서 값과 막대의 변화를 확인하세요. 통화 종료·페이지 이동 시 보조 마이크도 해제됩니다.</p>
        <p className="retell-test-note">RMS 기반 임시 고성 기준: {SHOUT_SETTINGS.SHOUT_THRESHOLD} 이상 {SHOUT_SETTINGS.SHOUT_MIN_DURATION_MS}ms 지속 시 1회, {SHOUT_SETTINGS.SHOUT_RELEASE_THRESHOLD} 이하 {SHOUT_SETTINGS.SHOUT_RELEASE_DURATION_MS}ms 지속 시 해제. 마이크·거리·주변 소음에 따라 결과가 달라집니다.</p>
        {audioReport && <div role="status"><strong>현재 통화 고성 {audioReport.count}회 · {audioReport.shouting ? '고성 구간' : '일반 구간'}</strong><p className="retell-test-note">통화: {audioReport.callId}{!audioReport.complete && ' · 일부 구간 미측정: 최종 점수 확정 보류'}</p></div>}
        {audioReport?.error && <p className="retell-test-error" role="alert">{audioReport.error} <button type="button" onClick={() => { void reporter.current?.retry(); }}>전송 재시도</button></p>}
        <p className="retell-test-note">통화 중 고성 횟수·상태만 KCM 백엔드로 전달합니다. 원본 음성·레벨 샘플은 전송·저장하지 않습니다. 통화 시작 시 보조 마이크도 켭니다. 측정이 중단되면 최종 점수를 보류합니다.</p>
      </section>
      <a href="#/home">직원용 KCM으로 이동</a>
    </section>
  </main>;
}
