import test from 'node:test';
import assert from 'node:assert/strict';
// npm test compiles these production browser controllers before running server tests.
import { createCallController } from '../../.test-dist/src/dev/retellCall.js';
import { createLiveAudioReporter } from '../../.test-dist/src/dev/liveAudioReporter.js';
import { createLiveCallStore } from '../live-calls.mjs';
import { createN8nDelivery } from '../n8n-delivery.mjs';
import { parseLiveEvent, applyLiveEvent } from '../../.test-dist/src/live/liveCalls.js';

const tick = () => new Promise(resolve => setImmediate(resolve));
function fixture(t, micReady = true) {
  let time = 0, hooks, callId;
  const store = createLiveCallStore(() => new Date(1760000000000 + (++time)*1000).toISOString());
  const sent = [], audioEvents = [], views = [];
  let browserCalls = [], stopped = 0;
  const unsubscribe = store.subscribe(event => {
    const parsed = parseLiveEvent(JSON.stringify(event));
    assert.ok(parsed); browserCalls = applyLiveEvent(browserCalls,parsed);
  });
  const delivery = createN8nDelivery({liveCalls:store,webhookUrl:'https://workflow.example.test/rc',log:()=>{},
    fetchImpl:async (_url,init)=>{sent.push(JSON.parse(init.body));return new Response(null,{status:200});}});
  const reporter = createLiveAudioReporter(()=>{},async(id,value)=>{
    audioEvents.push({id,...value});
    assert.equal(store.audio(id,value),'accepted');
  });
  const controller = createCallController({
    createWebCall(options) {
      hooks=options.hooks;callId='call_rc_'+(views.filter(view=>view.status==='connecting').length);
      store.connecting(callId,'customer_rc_fixture',undefined,'store_rc_fixture');
      const id=callId, sessionHooks=hooks;
      return {callId:id,end:async()=>{store.ended(id);sessionHooks.onEnd({});}};
    },stopCall:async()=>{},
  },'agent_rc_fixture',view=>{
    views.push({...view});
    if(view.status==='live')reporter.begin(view.callId,micReady);
    if(view.status==='ended'){void reporter.finish();stopped++;}
  });
  t.after(()=>{controller.dispose();reporter.dispose();delivery.close();unsubscribe();});
  return {store,sent,audioEvents,views,reporter,controller,
    get browserCalls(){return browserCalls;},get stopped(){return stopped;},
    start(){controller.start();store.live(callId);hooks.onStatus('live');return callId;},
    remoteEnd(){store.ended(callId);hooks.onEnd({});},
  };
}

test('RC: same customer three calls keep distinct consultation IDs, transcript and independent risk through final audio, SSE and one POST each',async t=>{
  const f=fixture(t), results=[];
  for(let i=0;i<3;i++){
    const id=f.start();
    f.controller.start(); // duplicate UI start
    f.store.transcript(id,[{id:'u',role:'user',time_sec:1,content:i===0?'일을 왜 이렇게 못해요?':'요금제 문의입니다.'},{id:'a',role:'agent',time_sec:2,content:'확인하겠습니다.'}]);
    for(let at=0;at<=700;at+=100)f.reporter.observe({status:'running',starting:false,level:i===1?.2:.02,error:''},at);
    assert.equal(f.sent.length,i);
    await f.reporter.finish(); // existing UI end order: final audio before ending Retell
    assert.equal(f.sent.length,i);
    await f.controller.end();await tick();
    const finished=f.store.snapshot().find(call=>call.call_id===id);
    assert.equal(f.sent.length,i+1);
    assert.equal(finished.webhook_delivery.status,'sent');
    assert.equal(finished.audio_signal.closed,true);
    assert.equal(finished.audio_signal.coverage_complete,true);
    assert.equal(finished.final_result.risk_score,[4,2,0][i]);
    f.store.ended(id);await f.reporter.finish();await f.controller.end();await tick();
    assert.equal(f.sent.length,i+1);
    assert.equal(f.browserCalls.find(call=>call.call_id===id).final_result.risk_score,[4,2,0][i]);
    results.push(finished);
  }
  assert.equal(new Set(results.map(call=>call.consultation_id)).size,3);
  assert.equal(new Set(results.map(call=>call.call_id)).size,3);
  assert.equal(f.stopped,3);
  for(const payload of f.sent){
    assert.match(payload.consultation_id,/^consultation_\d+$/);
    assert.equal(payload.customer_id,'customer_rc_fixture');
    assert.equal(payload.consultation.store_id,'store_rc_fixture');
    assert.deepEqual(payload.consultation.transcript.map(turn=>turn.role),['user','agent']);
    assert.deepEqual(Object.keys(payload).sort(),['call_id','consultation','consultation_id','customer_id','risk_level','risk_score','scores','signals']);
  }
  assert.deepEqual(f.store.historyForCustomer('customer_rc_fixture').map(result=>result.risk_score),[0,2,4]);
});

test('RC: remote end first waits for reporter final snapshot and then posts once',async t=>{
  const f=fixture(t);const id=f.start();await tick();
  f.store.ended(id);assert.equal(f.sent.length,0);
  f.remoteEnd();await tick();await tick();
  assert.equal(f.sent.length,1);
  assert.equal(f.store.snapshot()[0].final_result.risk_score,0);
  assert.equal(f.audioEvents.at(-1).closed,true);
});

test('RC: microphone unavailable at live never becomes a measured zero or a webhook success',async t=>{
  const f=fixture(t,false);f.start();
  f.reporter.observe({status:'running',starting:false,level:.01,error:''},100);
  await f.reporter.finish();await f.controller.end();await tick();
  assert.equal(f.sent.length,0);
  assert.equal(f.store.snapshot()[0].final_result,null);
  assert.equal(f.store.snapshot()[0].audio_signal.coverage_complete,false);
});
