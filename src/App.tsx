import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { AppointmentFilter, ConsultationResult, DashboardData, PageId } from './types';
import { dashboardRepository } from './services/dashboardRepository';
import { filterAppointments, getMetrics, markReviewed, parsePage } from './lib/domain';
import { Icon, type IconName } from './components/Icon';
import { Layout } from './components/Layout';
import { AppointmentList } from './components/AppointmentList';
import { BriefingPanel } from './components/BriefingPanel';
import { InventoryPanel } from './components/InventoryPanel';
import { Modal } from './components/Modal';
import { SecondaryPages } from './pages/SecondaryPages';
import { ConsultationPanel, ConsultationResultView } from './components/ConsultationPanel';
import { ConsultationEditor, type LeaveGuard } from './components/ConsultationEditor';
import { saveConsultation, startConsultation, type ConsultationSaveMode } from './lib/consultation';
import { createCallDemoState } from './data/callMockData';
import { getCallMetrics } from './lib/callRisk';
import { CallOverview } from './components/CallOverview';
import { startCallConsultation } from './lib/callConsultation';
import { applyCallSupport, type SupportHandler } from './lib/callSupport';
import { completeDemoCall, createNextDemoCall, updateCallDraft, type DraftHandler } from './lib/callWorkflow';
import { LiveConsultations } from './live/LiveConsultations';

export default function App() {
  const [page, setPage] = useState<PageId>(() => parsePage(window.location.hash));
  const [data, setData] = useState<DashboardData | null>(null);
  const [callState, setCallState] = useState(createCallDemoState);
  const calls = callState.calls;
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<AppointmentFilter>('all');
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState('DEMO-R002');
  const [modal, setModal] = useState<'details' | 'help' | 'reset' | null>(null);
  const [toast, setToast] = useState('');
  const [loadKey, setLoadKey] = useState(0);
  const [storeInfoVisit, setStoreInfoVisit] = useState(0);
  const [editorId, setEditorId] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const startLockRef = useRef(false);
  const dataRef = useRef(data);
  const guardRef = useRef<LeaveGuard | null>(null);
  const routeRef = useRef(window.location.href);
  const commitData = useCallback((next: DashboardData) => { dataRef.current = next; setData(next); }, []);
  const registerGuard = useCallback((guard: LeaveGuard | null) => { guardRef.current = guard; }, []);
  const requestLeave = useCallback((action: () => void) => {
    const leave = () => { guardRef.current = null; setEditorId(null); action(); };
    if (guardRef.current) guardRef.current(leave); else leave();
  }, []);
  useEffect(() => {
    const handler = () => {
      const target = window.location.href;
      if (target === routeRef.current) return;
      window.history.replaceState(null, '', routeRef.current);
      requestLeave(() => { window.history.replaceState(null, '', target); routeRef.current = target; setPage(parsePage(window.location.hash)); setModal(null); window.scrollTo(0, 0); });
    };
    window.addEventListener('hashchange', handler);
    return () => window.removeEventListener('hashchange', handler);
  }, [requestLeave]);
  useEffect(() => {
    let active = true;
    setLoading(true); setError('');
    dashboardRepository.load().then(result => { if (active) commitData(result); }).catch(() => { if (active) setError('샘플 데이터를 불러오지 못했습니다. 다시 시도해 주세요.'); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [loadKey, commitData]);
  useEffect(() => { if (!toast) return; const id = window.setTimeout(() => setToast(''), 4600); return () => window.clearTimeout(id); }, [toast]);
  useEffect(() => {
    if (!starting) return;
    const id = window.setTimeout(() => { startLockRef.current = false; setStarting(false); }, 500);
    return () => window.clearTimeout(id);
  }, [starting]);
  const navigate = (target: PageId, openStoreInfo = false) => requestLeave(() => { if (target === 'stores' && openStoreInfo) setStoreInfoVisit(visit => visit + 1); setPage(target); setModal(null); window.history.pushState(null, '', `#/${target}`); routeRef.current = window.location.href; window.scrollTo({ top: 0, behavior: 'auto' }); });
  const items = useMemo(() => data ? filterAppointments(data.appointments, filter, query) : [], [data, filter, query]);
  const selected = items.find(item => item.id === selectedId) ?? items[0];
  const editing = data?.appointments.find(item => item.id === editorId);
  const reset = () => requestLeave(() => { setFilter('all'); setQuery(''); setSelectedId('DEMO-R002'); setCallState(createCallDemoState()); setLoadKey(key => key + 1); setModal(null); setToast('샘플 화면을 초기화했습니다.'); });
  const onReview = (id: string) => { if (dataRef.current) commitData(markReviewed(dataRef.current, id)); setToast('이 화면에서 확인 처리했습니다. 실제 DB는 변경되지 않습니다.'); };
  const onStartCall = (id: string) => {
    const at = new Date().toISOString();
    setCallState(current => ({ ...current, calls: startCallConsultation(current.calls, id, at) }));
  };
  const onSupport: SupportHandler = (id, action) => {
    const at = new Date().toISOString();
    setCallState(current => ({ ...current, calls: applyCallSupport(current.calls, id, action, at) }));
  };
  const onCallDraft: DraftHandler = (id, field, value) => setCallState(current => updateCallDraft(current, id, field, value));
  const onCallComplete = (id: string) => {
    const at = new Date().toISOString();
    const actor = data ? `${data.employee.name} ${data.employee.position} (데모 직원)` : '데모 직원';
    setCallState(current => completeDemoCall(current, id, at, actor));
  };
  const onStart = (id: string) => {
    if (startLockRef.current) return;
    const current = dataRef.current;
    if (!current) return;
    const next = startConsultation(current, id, new Date().toISOString());
    if (next !== current) { startLockRef.current = true; setStarting(true); commitData(next); setToast('상담을 시작했습니다. 샘플 기록은 새로고침하면 초기화됩니다.'); }
  };
  const onSave = (id: string, result: ConsultationResult, mode: ConsultationSaveMode): string | undefined => {
    if (!dataRef.current) return '샘플 데이터를 확인해 주세요.';
    const saved = saveConsultation(dataRef.current, id, result, mode, new Date().toISOString());
    if (saved.notice || Object.keys(saved.errors).length) return saved.notice ?? Object.values(saved.errors).join(' ');
    guardRef.current = null; setEditorId(null); commitData(saved.data);
    setToast(!saved.changed ? '변경 사항이 없어 기존 기록과 이력을 유지했습니다.' : mode === 'amend' ? '수정 내용과 이력을 반영했습니다. 최초 완료 시각과 완료 건수는 유지됩니다.' : mode === 'complete' ? '상담을 완료했습니다. 예약 상태와 홈 집계에 반영했습니다.' : '결과를 임시 반영했습니다. 상담 중 상태를 유지합니다.');
  };
  const metrics = data ? getMetrics(data) : null;
  const callMetrics = getCallMetrics(calls);
  const statItems: { label: string; value: number; unit: string; caption: string; icon: IconName; tone: string }[] = [
    { label: 'AI 응대 중', value: callMetrics.aiResponding, unit: '건', caption: '현재 AI가 먼저 응대하는 통화', icon: 'phone', tone: 'gray' },
    { label: '직원 연결 대기', value: callMetrics.waiting, unit: '건', caption: '현재 직원 연결을 기다리는 통화', icon: 'clock', tone: 'gray' },
    { label: '위험·매우 위험 통화', value: callMetrics.dangerous, unit: '건', caption: '직원 연결 대기·상담 중 기준', icon: 'alert', tone: 'red' },
    { label: '관리자 지원 요청', value: callMetrics.pendingSupport, unit: '건', caption: '요청 대기·지원 중인 건수', icon: 'shield', tone: 'amber' },
  ];
  const table = data && <AppointmentList items={items} total={data.appointments.length} selectedId={selected?.id} filter={filter} query={query} onFilter={value => requestLeave(() => setFilter(value))} onQuery={value => requestLeave(() => setQuery(value))} onSelect={id => requestLeave(() => setSelectedId(id))} onAll={page === 'home' ? () => navigate('appointments') : undefined}/>;
  const briefing = <div className="consultation-column"><BriefingPanel appointment={selected} onReview={onReview} onDetails={() => setModal('details')}/><ConsultationPanel appointment={selected} starting={starting} onStart={onStart} onEdit={id => setEditorId(id)}/></div>;
  return <><Layout data={data} page={page} navigate={navigate}>
    {loading ? <div className="loading-view" role="status"><div className="loader"/><h1>대시보드를 준비하고 있습니다</h1><p>샘플 데이터를 불러오는 중입니다.</p></div> : error || !data ? <div className="loading-view" role="alert"><Icon name="alert" size={32}/><h1>데이터를 확인해 주세요</h1><p>{error}</p><button className="button button-primary" onClick={() => setLoadKey(key => key + 1)}>다시 시도</button></div> : page === 'home' ? <>
      <div className="page-heading"><div><h1>매장 운영 대시보드<span className="heading-dot">.</span></h1><p>예약부터 상담 준비까지, 오늘의 업무를 한눈에 확인하세요.</p></div><div className="heading-actions"><button className="button button-secondary" onClick={() => setModal('reset')}><Icon name="refresh" size={16}/>샘플 초기화</button><button className="button button-primary" onClick={() => navigate('appointments')}>예약·상담 보기<Icon name="arrow" size={16}/></button></div></div>
      <section className="stats-grid" aria-label="현재 통화 주요 현황">{statItems.map(item => <div className={`stat-card ${item.tone === 'red' ? 'featured-stat' : ''}`} key={item.label}><div className="stat-top"><span>{item.label}</span><span className={`small-icon ${item.tone}`}><Icon name={item.icon} size={19}/></span></div><div className="stat-number">{item.value}<span>{item.unit}</span></div><p>{item.caption}</p></div>)}</section>
      <CallOverview key={loadKey} state={callState} onStart={onStartCall} onSupport={onSupport} onDraft={onCallDraft} onComplete={onCallComplete} onNext={id => setCallState(current => createNextDemoCall(current, id))}/>
      <LiveConsultations/>
      <div className="appointment-overview-heading"><h2>예약·상담 현황</h2>{metrics && <p aria-label="예약 상담 집계">전체 {metrics.reservations}건 · 방문 예정 {metrics.upcoming} · 상담 중 {metrics.inProgress} · 완료 {metrics.completed} · 브리핑 미확인 {metrics.unreviewed}</p>}</div>
      <div className="dashboard-grid">{table}{briefing}</div>
      <div className="bottom-grid"><InventoryPanel data={data} onOpen={() => navigate('inventory')}/><section className="card activity-card"><div className="card-heading"><div className="title-with-icon"><span className="small-icon gray"><Icon name="activity" size={18}/></span><h2>최근 업무 흐름</h2></div><span className="small-badge">샘플 기록</span></div><div className="activity-timeline">{data.activities.map(item => <div className="activity-item" key={item.id}><span className={`activity-dot ${item.kind}`}/><div><strong>{item.label}</strong><p>{item.description}</p></div><time>{item.time}</time></div>)}</div><div className="workflow-note"><Icon name="sparkles" size={17}/><span>상담 결과가 직원의 준비로 이어집니다.</span><button className="text-button" onClick={() => setModal('help')} aria-label="프로토타입 안내 보기"><Icon name="arrow" size={16}/></button></div></section></div>
    </> : page === 'appointments' ? <><div className="page-heading"><div><span className="eyebrow">고객관리</span><h1>예약·상담관리</h1><p>고객을 선택해 사전 상담 내용과 브리핑을 확인하세요.</p></div><span className="small-badge">샘플 상담 처리</span></div><div className="dashboard-grid">{table}{briefing}</div></> : <SecondaryPages key={page === 'stores' ? storeInfoVisit : page} page={page} data={data} onHome={() => navigate('home')}/>}
  </Layout>
  {modal === 'help' && <Modal title="KCM 프로토타입 안내" onClose={() => setModal(null)}><div className="help-content"><p className="modal-lead">AI 선응대와 통화 위험 신호를 바탕으로 <strong>직원의 상담 준비와 대응을 지원하는 KCM 시연 화면</strong>입니다.</p><div className="notice-inline"><Icon name="shield" size={19}/><span>예약·직원·매장·상품·재고는 가상 예시입니다. 실시간 AI 상담 영역에는 실제 테스트 통화가 표시될 수 있습니다. KT 공식 운영 서비스가 아닙니다.</span></div><h3>지금 확인할 수 있는 동작</h3><p>통화 현황·위험 등급 필터와 근거 발언을 포함한 통화 브리핑, 통화 상담 시작·이어보기·결과 기록·완료 조회, 통화별 최종 위험도·이력·동일 고객 다음 통화 데모, 관리자 지원 요청·확인·지원 완료·재요청 데모, 메뉴 이동, 예약 검색·필터, 고객 선택, 샘플 브리핑 상세 보기, 브리핑 확인 상태 변경, 상담 시작·결과 임시 반영·완료·완료 결과 수정과 이력 조회, 재고 조회 예시를 확인할 수 있습니다. 상품관리 4개 탭과 자사·타사 전환, 매장관리 2개 탭, 가상 매장 5곳과 우리 매장 직원의 정보·리뷰 배치도 확인할 수 있습니다.</p><h3>실제 통화와 외부 저장</h3><p>고객용 화면의 Retell 통화는 Monitor와 SSE를 통해 직원 화면에 표시됩니다. 5개 위험 신호의 최종 결과와 상담 전문은 서버 환경설정에 따라 n8n으로 전송합니다. 수신 응답과 DB 저장 성공은 다르므로 저장·AI 요약 결과는 n8n에서 확인합니다.</p><h3>시연 범위 밖</h3><p>실제 로그인, DB 이력 조회, 예약 등록·변경, 재고 대여, 문자 발송은 연결하지 않았습니다.</p><p className="muted-text">예약·데모 상담은 새로고침 시 초기화됩니다. 실시간 통화 이력은 현재 서버 메모리에서 조회하며 서버 재시작 시 화면에서 사라집니다. 외부에 저장된 데이터는 별도입니다.</p></div></Modal>}
  {modal === 'reset' && <Modal title="샘플 화면을 초기화할까요?" onClose={() => setModal(null)}><p className="modal-lead">통화 초안·상담 결과·통화별 위험 이력·점수 반영 기록·지원 이력, 예약 상담 상태·결과·수정 이력, 브리핑 확인 상태와 예약 검색·통화 필터 조건이 초기 상태로 돌아갑니다. 실제 DB나 다른 서비스에는 영향을 주지 않습니다.</p><div className="modal-actions"><button className="button button-secondary" onClick={() => setModal(null)}>취소</button><button className="button button-primary" onClick={reset}>샘플 초기화</button></div></Modal>}
  {modal === 'details' && selected && <Modal title={`${selected.customerName} 고객 · 상담 상세`} onClose={() => setModal(null)} wide><div className="detail-meta"><span>{selected.id}</span><span>{selected.time} 예약</span><span>{selected.employee} 직원</span></div><h3 className="section-label">직원 상담 결과 <span className="small-badge">샘플 기록</span></h3><ConsultationResultView result={selected.consultation?.result}/><h3 className="section-label">사전 브리핑</h3><p className="detail-summary">{selected.briefing.summary}</p><h3 className="section-label">사전 상담 내용 <span className="small-badge">가상 대화</span></h3><div className="transcript">{selected.briefing.transcript.map((line, index) => <div className={`transcript-line ${line.speaker === '고객' ? 'customer' : ''}`} key={index}><strong>{line.speaker}</strong><p>{line.text}</p></div>)}</div><p className="muted-text">녹음 파일 및 실제 분석 결과는 연결되지 않았습니다.</p></Modal>}
  {editing && <ConsultationEditor key={editing.id} appointment={editing} onClose={() => { guardRef.current = null; setEditorId(null); }} onSave={onSave} registerGuard={registerGuard}/>}
  {toast && <div className="toast" role="status"><Icon name="check" size={18}/><span>{toast}</span><button aria-label="알림 닫기" onClick={() => setToast('')}><Icon name="close" size={16}/></button></div>}
  </>;
}
