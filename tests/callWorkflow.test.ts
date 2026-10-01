import test from 'node:test';
import './riskPolicy.test.js';
import assert from 'node:assert/strict';
import type { CallAnalysis, CallDemoState, CallResultDraft } from '../src/types.js';
import { createCallDemoState } from '../src/data/callMockData.js';
import { calculateRisk, RISK_RULE } from '../src/lib/riskScoring.js';
import { callRisk, filterCalls, getCallMetrics, scorePreview, signalEvidence } from '../src/lib/callRisk.js';
import { startCallConsultation } from '../src/lib/callConsultation.js';
import { applyCallSupport } from '../src/lib/callSupport.js';
import { applyFinalCallScore, completeCallRecord, completeDemoCall, createNextDemoCall, customerRiskHistory, latestCustomerRisk, receiveCallAnalysis, scorePendingReason, simulateCallEnd, updateCallDraft, validateCallResult } from '../src/lib/callWorkflow.js';
const at = '2026-09-30T06:00:00.000Z', doneAt = '2026-09-30T06:05:00.000Z', laterAt = '2026-09-30T06:10:00.000Z', actor = '데모 직원';
const validResult = (): CallResultDraft => ({ outcome: 'needs_check', content: '청구 항목을 확인하고 정정 절차를 안내했습니다.', followUp: '청구 항목 확인 후 재안내 필요' });
function ready(state = createCallDemoState(), id = 'C-003') {
  let next = { ...state, calls: startCallConsultation(state.calls, id, at) };
  const result = validResult();
  for (const field of ['outcome', 'content', 'followUp'] as const) next = updateCallDraft(next, id, field, result[field]);
  return next;
}
const finishedCall = () => completeDemoCall(ready(), 'C-003', doneAt, actor);
const analysis = (p: number, t: number, b: number, s: number, h: number): CallAnalysis => ({
  ...createCallDemoState().calls[2].analysis, signals: null, profanityCount:p, threatCount:t, blameCount:b, sexualCount:s, shoutingCount:h,
});
test('all demo calls start at zero and have no customer cumulative score field', () => {
  const state = createCallDemoState();
  assert.ok(state.calls.every(call => call.initialScore === 0 && !('scoreBefore' in call)));
  assert.ok(state.customers.every(customer => !('score' in customer)));
  assert.equal(scorePreview(state.calls[2]).value?.risk_score, 14);
});
test('all five missing/invalid counts are rejected and quiet calls independently finish at zero', () => {
  for (const value of [-1,0.5,NaN,Infinity,null,undefined]) for (const field of ['shoutingCount','profanityCount','threatCount','blameCount','sexualCount']) {
    assert.equal(calculateRisk({ ...analysis(0,0,0,0,0), [field]:value }).value, null);
  }
  assert.equal(calculateRisk(analysis(0,0,0,0,0)).value?.risk_score, 0);
});
test('same evidence ID is deduplicated, mismatched counts block finalization', () => {
  const call = createCallDemoState().calls[2];
  call.analysis.signals!.shouting.push({ ...call.analysis.signals!.shouting[0] });
  assert.equal(signalEvidence(call.analysis,'shouting')?.length,4);
  assert.equal(scorePreview(call).value?.risk_score,14);
  call.analysis.shoutingCount=5; assert.match(scorePreview(call).error,/불일치/);
});
test('prepared final samples and a threat warning never create a numeric score before ending', () => {
  const state=createCallDemoState();
  assert.equal(callRisk(state.calls[3]).grade,'critical'); assert.equal(callRisk(state.calls[3]).score,null);
  assert.equal(callRisk(state.calls[2]).grade,null);
  assert.equal(applyFinalCallScore(state,'C-004',at),state); assert.equal(latestCustomerRisk(state.calls,'CUSTOMER-004'),null);
});
test('new/known/unknown customer identification does not change independent call calculation', () => {
  for (const historyStatus of ['new','known','unknown'] as const) {
    const state=ready(); state.calls[2].historyStatus=historyStatus;
    assert.equal(finishedCall().calls[2].scoreRecord?.risk_score,14);
    state.calls[2].customerId=null;
    const done=completeDemoCall(state,'C-003',doneAt,actor);
    assert.equal(done.calls[2].scoreRecord?.risk_score,14);
    assert.deepEqual(customerRiskHistory(done.calls,null),[]);
  }
});
test('partial/failed/missing analysis completes the staff result but defers risk finalization', () => {
  for (const mode of ['failed','processing','not_analyzed','partial','missing'] as const) {
    const state=ready(); const call=state.calls[2];
    if(mode==='partial') call.analysis.phase='partial';
    else if(mode==='missing') call.analysis.threatCount=null;
    else call.analysis.status=mode;
    const done=completeDemoCall(state,call.id,doneAt,actor);
    assert.equal(done.calls[2].status,'completed'); assert.equal(done.calls[2].scoreRecord,null);
    assert.match(scorePendingReason(done.calls[2]),/보류/);
  }
});
test('record completion and actual call end remain separate conditions', () => {
  const state=completeCallRecord(ready(),'C-003',doneAt,actor);
  assert.equal(state.calls[2].endedAt,null); assert.equal(applyFinalCallScore(state,'C-003',at),state);
  const done=simulateCallEnd(state,'C-003',laterAt);
  assert.equal(done.calls[2].completedAt,doneAt); assert.equal(done.calls[2].endedAt,laterAt);
  assert.equal(done.calls[2].scoreRecord?.risk_score,14);
});
test('repeated partial snapshots do not add scores; delayed final result applies once', () => {
  let state=ready(); const final=structuredClone(state.calls[2].analysis);
  for(let n=0;n<3;n++) state=receiveCallAnalysis(state,'C-003',{...final,phase:'partial'},at);
  assert.equal(state.calls[2].scoreRecord,null); state=completeDemoCall(state,'C-003',doneAt,actor);
  const result=state.calls[2].result;
  state=receiveCallAnalysis(state,'C-003',final,laterAt);
  assert.equal(state.calls[2].scoreRecord?.risk_score,14); assert.equal(state.calls[2].scoreRecord?.appliedAt,laterAt);
  assert.equal(state.calls[2].result,result); assert.equal(state.calls[2].completedAt,doneAt);
  for(let n=0;n<10;n++) assert.equal(receiveCallAnalysis(state,'C-003',final,laterAt),state);
});
test('AI-only calls can finalize without a staff start; known zero is a completed result', () => {
  let state=receiveCallAnalysis(createCallDemoState(),'C-005',analysis(0,0,0,0,0),at);
  state=simulateCallEnd(state,'C-005',doneAt);
  assert.equal(state.calls[4].startedAt,null); assert.equal(state.calls[4].scoreRecord?.risk_score,0);
});
test('repeated completion/end/final input preserves first result, time, version and history', () => {
  const state=finishedCall(), copy=structuredClone(state);
  for(let n=0;n<10;n++){
    assert.equal(completeDemoCall(state,'C-003',laterAt,'다른 작성자'),state);
    assert.equal(simulateCallEnd(state,'C-003',laterAt),state);
    assert.equal(applyFinalCallScore(state,'C-003',laterAt),state);
    assert.equal(receiveCallAnalysis(state,'C-003',analysis(7,3,7,3,5),laterAt),state);
  }
  assert.deepEqual(state,copy); assert.equal(state.calls[2].scoreRecord?.rule_version,RISK_RULE.version);
});
test('completion does not mutate source, other calls, customer metadata or reservations', () => {
  const state=ready(), copy=structuredClone(state), done=completeDemoCall(state,'C-003',doneAt,actor);
  assert.deepEqual(state,copy); assert.equal(done.customers,state.customers);
  for(const i of [0,1,3,4]) assert.equal(done.calls[i],state.calls[i]);
  const invalid=ready(); invalid.calls[2].endedAt='invalid';
  assert.equal(applyFinalCallScore(invalid,'C-003',at),invalid);
});
test('result required fields, whitespace, length, conditional follow-up remain enforced', () => {
  for(const result of [{...validResult(),outcome:''},{...validResult(),content:' \n '},{...validResult(),content:'가'.repeat(1001)},{...validResult(),followUp:'가'.repeat(301)},{...validResult(),followUp:' '},{...validResult(),outcome:'unresolved',followUp:''}] as CallResultDraft[]) assert.ok(validateCallResult(result));
  assert.equal(validateCallResult({outcome:'resolved',content:'가'.repeat(1000),followUp:''}),'');
  assert.equal(validateCallResult({...validResult(),followUp:'가'.repeat(300)}),'');
});
test('before-start, missing start timestamp and empty results cannot complete', () => {
  const initial=createCallDemoState(); assert.equal(completeDemoCall(initial,'C-003',doneAt,actor),initial);
  for(const startedAt of [null,'','invalid']){const state=ready();state.calls[2].startedAt=startedAt;assert.equal(completeDemoCall(state,'C-003',doneAt,actor),state);}
  const state={...initial,calls:startCallConsultation(initial.calls,'C-003',at)};
  assert.equal(completeDemoCall(state,'C-003',doneAt,actor),state);
});
test('draft editing/cancel has no completion or risk effect and stays isolated by call', () => {
  const state=ready(); assert.equal(state.calls[2].scoreRecord,null); assert.equal(state.calls[2].completedAt,null);
  const next=updateCallDraft(state,'C-004','content','다른 통화 초안');
  assert.deepEqual(next.calls[2].draft,validResult()); assert.equal(next.calls[3].draft.content,'다른 통화 초안');
  assert.equal(updateCallDraft(next,'C-001','content','시작 전'),next);
});
test('analysis and support changes retain the draft; completion retains outstanding support', () => {
  let state=ready();const draft=state.calls[2].draft;
  state=receiveCallAnalysis(state,'C-003',structuredClone(state.calls[2].analysis),at);
  state={...state,calls:applyCallSupport(state.calls,'C-003',{type:'request',requestId:'S3',reason:'policy',memo:'',actor},at)};
  assert.equal(state.calls[2].draft,draft);
  assert.deepEqual(getCallMetrics(state.calls),{aiResponding:1,waiting:2,dangerous:1,pendingSupport:2});
  state=completeDemoCall(state,'C-003',doneAt,actor);const call=state.calls[2];
  assert.deepEqual(call.result,validResult());assert.equal(call.supportRequests[0].status,'pending');
  state={...state,calls:applyCallSupport(state.calls,'C-003',{type:'acknowledge',requestId:'S3',actor:'데모 관리자'},laterAt)};
  assert.equal(getCallMetrics(state.calls).pendingSupport,2);
  state={...state,calls:applyCallSupport(state.calls,'C-003',{type:'complete',requestId:'S3',actor:'데모 관리자',content:'정책 확인 지원'},laterAt)};
  assert.equal(getCallMetrics(state.calls).pendingSupport,1);
  assert.equal(state.calls[2].scoreRecord,call.scoreRecord);assert.equal(state.calls[2].result,call.result);assert.equal(state.calls[2].completedAt,call.completedAt);
  assert.equal(applyCallSupport(state.calls,'C-003',{type:'request',requestId:'again',reason:'other',memo:'',actor},laterAt),state.calls);
  assert.equal(startCallConsultation(state.calls,'C-003',laterAt),state.calls);assert.equal(updateCallDraft(state,'C-003','content','수정 금지'),state);
});
test('C-004 completion removes live threat alert from metrics, preserves support and final 40 boundary', () => {
  const state=completeDemoCall(ready(createCallDemoState(),'C-004'),'C-004',doneAt,actor);
  assert.equal(getCallMetrics(state.calls).dangerous,0); assert.equal(getCallMetrics(state.calls).pendingSupport,1);
  assert.equal(state.calls[3].scoreRecord?.risk_score,40); assert.equal(filterCalls(state.calls,'completed','boundary')[0].id,'C-004');
});
test('47 → independent 80 → independent 26 histories remain; fourth call starts zero', () => {
  let state=ready();
  state.calls[2].analysis=analysis(7,1,0,2,1); //15+20+0+10+2=47
  state=completeDemoCall(state,'C-003',doneAt,actor);const first=state.calls[2];
  assert.equal(first.scoreRecord?.risk_score,47);
  state=createNextDemoCall(state,'C-003');const second=state.calls.at(-1)!;
  assert.equal(second.initialScore,0);assert.equal(second.startedAt,null);assert.equal(second.scoreRecord,null);assert.equal(second.supportRequests.length,0);
  assert.equal(second.analysis.threatCount,0);assert.equal(latestCustomerRisk(state.calls,first.customerId)?.risk_score,47);
  assert.equal(callRisk(second).score,null);
  for(let n=0;n<5;n++) assert.equal(createNextDemoCall(state,'C-003'),state);
  state=ready(state,second.id);state.calls.at(-1)!.analysis=analysis(7,3,7,1,0); //15+40+20+5=80
  state=completeDemoCall(state,second.id,laterAt,actor);
  state=createNextDemoCall(state,second.id);const third=state.calls.at(-1)!;
  state=ready(state,third.id);state.calls.at(-1)!.analysis=analysis(2,1,0,0,0);
  state=completeDemoCall(state,third.id,'2026-09-30T06:15:00Z',actor);
  assert.deepEqual(customerRiskHistory(state.calls,first.customerId).map(r=>r.risk_score),[26,80,47]);
  assert.equal(latestCustomerRisk(state.calls,first.customerId)?.risk_score,26);
  assert.equal(state.calls[2],first);assert.equal(first.scoreRecord?.risk_score,47);
  state=createNextDemoCall(state,third.id);assert.equal(state.calls.at(-1)!.initialScore,0);
  assert.equal(latestCustomerRisk(state.calls,first.customerId)?.risk_score,26);
});
test('no next call before finalization; same names do not merge customer IDs; latest is by completion time', () => {
  const initial=createCallDemoState();assert.equal(createNextDemoCall(initial,'C-003'),initial);
  const recorded=completeCallRecord(ready(),'C-003',doneAt,actor);assert.equal(createNextDemoCall(recorded,'C-003'),recorded);
  const state=finishedCall();state.calls[0].customerLabel=state.calls[2].customerLabel;
  assert.deepEqual(customerRiskHistory(state.calls,state.calls[0].customerId),[]);
  assert.equal(latestCustomerRisk(state.calls,state.calls[2].customerId)?.risk_score,14);
});
test('new app memory has no drafts/results/history; inconsistent evidence blocks only scoring', () => {
  finishedCall();const fresh=createCallDemoState();
  assert.equal(fresh.calls[2].draft.outcome,'');assert.equal(fresh.calls[2].result,null);assert.equal(fresh.calls[2].scoreRecord,null);
  const state=ready(createCallDemoState(),'C-004');state.calls[3].analysis.threatCount=0;
  assert.equal(callRisk(state.calls[3]).grade,'critical');
  const done=completeDemoCall(state,'C-004',doneAt,actor);
  assert.equal(done.calls[3].status,'completed');assert.equal(done.calls[3].scoreRecord,null);
});
test('a newer completed but unscored call never mislabels an older score as the latest call',()=>{
  let state=createNextDemoCall(finishedCall(),'C-003');const id=state.calls.at(-1)!.id;
  state=ready(state,id);state.calls.at(-1)!.analysis.status='failed';
  state=completeDemoCall(state,id,laterAt,actor);
  assert.equal(latestCustomerRisk(state.calls,'CUSTOMER-003'),null);
  assert.equal(customerRiskHistory(state.calls,'CUSTOMER-003')[0].risk_score,14);
});
