import { test } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createLiveCallStore } from '../live-calls.mjs';
import { createBackend } from '../app.mjs';
const turn=(id,content)=>({id,content,role:'user',time_sec:1});
const audio=(sequence,count=0,closed=false)=>({sequence,shouting_count:count,is_shouting:false,available:true,coverage_complete:true,closed});
const text39='씨발 씨발. 내가 너 찾아간다. 일을 왜 이렇게 못해요? 말이 안 통하네. 이것도 제대로 못해요?';
test('end freezes text totals; delayed final audio creates normalized 39 result exactly once',()=>{
  let time=0;const store=createLiveCallStore(()=>new Date(1000*(++time)).toISOString());store.connecting('A');store.live('A');
  store.transcript('A',[turn('u',text39)]);store.audio('A',audio(1,2));
  assert.equal(store.snapshot()[0].final_result,null);
  store.ended('A');const ended=store.snapshot()[0].ended_at;
  assert.equal(store.snapshot()[0].final_result,null);assert.match(store.snapshot()[0].finalization_reason,/수신 대기/);
  assert.equal(store.audio('A',audio(2,2,true)),'accepted');
  const call=store.snapshot()[0],result=call.final_result;
  assert.equal(result.risk_score,39);assert.equal(result.risk_level,'주의');assert.equal(result.call_id,'A');
  assert.deepEqual(result.signals,{profanity_count:2,threat_count:1,blame_count:3,sexual_count:0,shouting_count:2});
  assert.deepEqual(result.scores,{profanity_score:6,threat_score:20,blame_score:8,sexual_score:0,shouting_score:5});
  assert.equal(result.completed_at,ended);
  store.audio('A',audio(2,2,true));assert.equal(store.audio('A',audio(3,10,true)),'closed');
  store.ended('A');store.transcript('A',[turn('u','안녕하세요.')]);store.error('A');
  assert.deepEqual(store.snapshot()[0].final_result,result);
});
test('audio final received before end is not itself proof of call end; monitor errors never finalize',()=>{
  const store=createLiveCallStore();store.connecting('A');store.live('A');store.audio('A',audio(1,0,true));
  assert.equal(store.snapshot()[0].final_result,null);store.ended('A');assert.equal(store.snapshot()[0].final_result.risk_score,0);
  store.connecting('B');store.audio('B',audio(1,0,true));store.error('B');store.ended('B');
  assert.equal(store.snapshot()[1].final_result,null);assert.equal(store.snapshot()[1].ended_at,null);
});
test('audio input validation, duplicate/reordered snapshots and call isolation',()=>{
  const store=createLiveCallStore();store.connecting('A');store.connecting('B');
  assert.equal(store.audio('unknown',audio(1)),'not_found');
  for(const value of [-1,0.5,NaN,Infinity,null,undefined,'2'])assert.equal(store.audio('A',{...audio(1),shouting_count:value}),'invalid');
  for(const value of [{...audio(1),extra:1},{...audio(1),closed:true,is_shouting:true},{...audio(1),sequence:0},{...audio(1),available:false}])assert.equal(store.audio('A',value),'invalid');
  assert.equal(store.audio('A',audio(2,2)),'accepted');assert.equal(store.audio('A',audio(1,1)),'duplicate');
  assert.equal(store.audio('A',audio(3,1)),'invalid');
  assert.equal(store.snapshot()[0].audio_signal.shouting_count,2);assert.equal(store.snapshot()[1].audio_signal,null);
});
test('incomplete/absent microphone cannot silently become zero and cannot regain complete coverage',()=>{
  const store=createLiveCallStore();store.connecting('A');store.audio('A',{...audio(1),coverage_complete:false,available:false});
  store.audio('A',audio(2,1,true));store.ended('A');
  assert.equal(store.snapshot()[0].audio_signal.coverage_complete,false);
  assert.equal(store.snapshot()[0].final_result,null);assert.match(store.snapshot()[0].finalization_reason,/未|미측정|중단/);
  store.connecting('B');store.ended('B');assert.equal(store.snapshot()[1].final_result,null);
});
test('same customer results are independent records and latest is by completion time; unknown IDs never merge',()=>{
  let clock=0;const store=createLiveCallStore(()=>new Date(1000*(++clock)).toISOString());
  const inputs=[
    ['A',('씨발 '.repeat(7))+' 내가 너 찾아간다. 너랑 섹스하자. 너 옷 벗어봐.',1,47],
    ['B',('씨발 '.repeat(7))+(' 내가 너 찾아간다.'.repeat(3))+(' 일을 왜 이렇게 못해요?'.repeat(7))+' 너랑 섹스하자.',0,80],
    ['C','씨발 씨발 내가 너 찾아간다.',0,26],
  ];
  for(const [id,text,shout,expected] of inputs){
    store.connecting(id,'customer-A');store.live(id);
    assert.equal(store.snapshot().at(-1).final_result,null);
    store.transcript(id,[turn('u',text)]);store.audio(id,audio(1,shout,true));store.ended(id);
    assert.equal(store.snapshot().at(-1).final_result.risk_score,expected);
  }
  assert.deepEqual(store.historyForCustomer('customer-A').map(r=>r.risk_score),[26,80,47]);
  store.connecting('D','customer-A');assert.equal(store.snapshot().at(-1).final_result,null);
  assert.equal(store.historyForCustomer('customer-A')[0].risk_score,26);
  assert.deepEqual(store.historyForCustomer(''),[]);
  const copy=store.historyForCustomer('customer-A');copy[0].risk_score=99;assert.equal(store.historyForCustomer('customer-A')[0].risk_score,26);
});
test('HTTP audio endpoint validates origin/body/call, uses existing SSE and never calls Retell REST',async t=>{
  const store=createLiveCallStore();store.connecting('owned');store.live('owned');
  let upstream=0;const server=createBackend({key:'',agentId:'',liveCalls:store,monitors:{start(){},release(){},close(){}},fetchImpl:async()=>{upstream++;throw new Error('not allowed');},log:()=>{}});
  server.listen(0,'127.0.0.1');await once(server,'listening');
  t.after(()=>{server.closeAllConnections();server.close();});
  const base='http://127.0.0.1:'+server.address().port;
  const post=(body,origin='http://127.0.0.1:5173',id='owned')=>fetch(base+'/api/live-calls/'+id+'/audio-signals',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify(body)});
  assert.equal((await post(audio(1),'https://untrusted.invalid')).status,403);
  assert.equal((await post(audio(1),'http://127.0.0.1:5173','missing')).status,404);
  assert.equal((await post({...audio(1),shouting_count:-1})).status,400);
  const event=fetch(base+'/api/live-calls/events');const reader=(await event).body.getReader();await reader.read();
  assert.equal((await post(audio(1,1))).status,200);
  const frame=new TextDecoder().decode((await reader.read()).value);assert.match(frame,/event: audio_signal/);assert.match(frame,/"shouting_count":1/);
  assert.equal((await post(audio(1,1))).status,200);
  store.ended('owned');await post(audio(2,1,true));assert.equal(store.snapshot()[0].final_result.risk_score,2);
  assert.equal((await post(audio(3,2,true))).status,409);
  assert.equal(upstream,0);await reader.cancel();
});
