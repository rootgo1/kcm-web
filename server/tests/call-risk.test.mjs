import { test } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createLiveCallStore } from '../live-calls.mjs';
import { createBackend } from '../app.mjs';
import { callResultPayload } from '../n8n-delivery.mjs';
const turn=(id,content)=>({id,content,role:'user',time_sec:1});
const audio=(sequence,count=0,closed=false)=>({sequence,shouting_count:count,is_shouting:false,available:true,coverage_complete:true,closed});
const text39='씨발 씨발. 내가 너 찾아간다. 일을 왜 이렇게 못해요? 말이 안 통하네. 이것도 제대로 못해요?';
test('end freezes raw 39 text totals; delayed final audio creates normalized 40 result exactly once',()=>{
  let time=0;const store=createLiveCallStore(()=>new Date(1000*(++time)).toISOString());store.connecting('A');store.live('A');
  store.transcript('A',[turn('u',text39)]);store.audio('A',audio(1,2));
  assert.equal(store.snapshot()[0].final_result,null);
  store.ended('A');const ended=store.snapshot()[0].ended_at;
  assert.equal(store.snapshot()[0].final_result,null);assert.match(store.snapshot()[0].finalization_reason,/수신 대기/);
  assert.equal(store.audio('A',audio(2,2,true)),'accepted');
  const call=store.snapshot()[0],result=call.final_result;
  assert.equal(result.raw_score,39);assert.equal(result.threat_floor,40);assert.equal(result.adjusted_score,40);
  assert.equal(result.risk_score,40);assert.equal(result.risk_level,'경계');assert.equal(result.call_id,'A');
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
    ['C','씨발 씨발 내가 너 찾아간다.',0,40],
  ];
  for(const [id,text,shout,expected] of inputs){
    store.connecting(id,'customer-A');store.live(id);
    assert.equal(store.snapshot().at(-1).final_result,null);
    store.transcript(id,[turn('u',text)]);store.audio(id,audio(1,shout,true));store.ended(id);
    assert.equal(store.snapshot().at(-1).final_result.risk_score,expected);
  }
  assert.deepEqual(store.historyForCustomer('customer-A').map(r=>r.risk_score),[40,80,47]);
  store.connecting('D','customer-A');assert.equal(store.snapshot().at(-1).final_result,null);
  assert.equal(store.historyForCustomer('customer-A')[0].risk_score,40);
  assert.deepEqual(store.historyForCustomer(''),[]);
  const copy=store.historyForCustomer('customer-A');copy[0].risk_score=99;assert.equal(store.historyForCustomer('customer-A')[0].risk_score,40);
});

test('one profanity finalizes at 20, keeps raw item score 3 and preserves internal/external result fields',()=>{
  let clock=0;const store=createLiveCallStore(()=>new Date(1000*(++clock)).toISOString());
  store.connecting('floor','customer_001','consultation_900','store_005');store.live('floor');
  store.transcript('floor',[turn('u','씨발')]);store.audio('floor',audio(1,0,true));store.ended('floor');
  const call=store.snapshot()[0],result=call.final_result;
  assert.equal(result.signals.profanity_count,1);assert.equal(result.scores.profanity_score,3);
  assert.equal(result.raw_score,3);assert.equal(result.adjusted_score,20);assert.equal(result.threat_floor,0);
  assert.equal(result.risk_score,20);assert.equal(result.risk_level,'주의');assert.equal(result.rule_version,'call-risk-v5');
  assert.deepEqual(Object.keys(result).sort(),['signals','scores','raw_score','adjusted_score','threat_floor','risk_score','risk_level','rule_version','call_id','customer_id','completed_at'].sort());
  const payload=callResultPayload(call);
  assert.deepEqual(Object.keys(payload),['call_id','consultation_id','customer_id','signals','scores','risk_score','risk_level','consultation']);
  assert.equal(payload.risk_score,20);assert.equal(payload.scores.profanity_score,3);
  assert.ok(!('profanity_floor' in payload)&&!('adjusted_score' in payload)&&!('rule_version' in payload));
  store.transcript('floor',[turn('u','안녕하세요.')]);assert.deepEqual(store.snapshot()[0].final_result,result);
  store.connecting('quiet','customer_001');store.live('quiet');store.transcript('quiet',[turn('u','문의드립니다.')]);store.audio('quiet',audio(1,0,true));store.ended('quiet');
  assert.equal(store.snapshot()[1].final_result.risk_score,0);
  assert.deepEqual(store.historyForCustomer('customer_001').map(row=>row.risk_score),[0,20]);
});

test('same-turn corrections before end remove or add profanity floor; removed/user-to-agent turns do not retain it',()=>{
  const store=createLiveCallStore();
  for(const [id,before,after,expected] of [
    ['removed',[turn('u','씨발')],[],0],
    ['corrected',[turn('u','씨발')],[turn('u','안녕하세요.')],0],
    ['added',[turn('u','안녕하세요.')],[turn('u','씨발')],20],
    ['agent',[turn('u','씨발')],[{...turn('u','씨발'),role:'agent'}],0],
  ]){
    store.connecting(id);store.live(id);store.transcript(id,before);store.transcript(id,after);
    assert.equal(store.snapshot().at(-1).final_result,null);
    store.audio(id,audio(1,0,true));store.ended(id);
    const result=store.snapshot().at(-1).final_result;
    assert.equal(result.signals.profanity_count,expected===20?1:0);
    assert.equal(result.raw_score,expected===20?3:0);assert.equal(result.risk_score,expected);
  }
});

test('one, two and three separate user threats finalize at 40/60/80 with raw score table and payload shape retained',()=>{
  const store=createLiveCallStore();
  for(const [count,raw,score,level] of [[1,20,40,'경계'],[2,30,60,'위험'],[3,40,80,'매우 위험']]){
    const id='threat-'+count;
    store.connecting(id,'customer_001','consultation_'+(910+count),'store_005');store.live(id);
    const transcript=Array.from({length:count},(_,index)=>turn('u'+index,'내가 너 찾아간다.'));
    store.transcript(id,transcript);store.audio(id,audio(1,0,true));store.ended(id);
    const call=store.snapshot().at(-1),result=call.final_result;
    assert.equal(result.signals.threat_count,count);assert.equal(result.scores.threat_score,raw);assert.equal(result.raw_score,raw);
    assert.equal(result.threat_floor,score);assert.equal(result.adjusted_score,score);assert.equal(result.risk_score,score);assert.equal(result.risk_level,level);
    const payload=callResultPayload(call);assert.equal(payload.risk_score,score);assert.equal(payload.scores.threat_score,raw);
    assert.deepEqual(Object.keys(payload),['call_id','consultation_id','customer_id','signals','scores','risk_score','risk_level','consultation']);
  }
});

test('corrected/removed threat turns and repeated snapshots change only current call totals before end',()=>{
  const store=createLiveCallStore();
  const threats=[turn('u1','내가 너 찾아간다.'),turn('u2','내가 너 찾아간다.'),turn('u3','내가 너 찾아간다.')];
  for(const [remaining,raw,score] of [[3,40,80],[2,30,60],[1,20,40],[0,0,0]]){
    const id='corrected-'+remaining;store.connecting(id);store.live(id);
    store.transcript(id,threats);for(let index=0;index<10;index++)store.transcript(id,threats);
    assert.equal(store.snapshot().at(-1).risk_analysis.threatCount,3);
    const corrected=threats.map((message,index)=>index<remaining?message:{...message,content:'방문해서 확인하겠습니다.'});
    store.transcript(id,corrected);for(let index=0;index<10;index++)store.transcript(id,corrected);
    assert.equal(store.snapshot().at(-1).risk_analysis.threatCount,remaining);assert.equal(store.snapshot().at(-1).final_result,null);
    store.audio(id,audio(1,0,true));store.ended(id);
    const result=store.snapshot().at(-1).final_result;
    assert.equal(result.raw_score,raw);assert.equal(result.threat_floor,score);assert.equal(result.risk_score,score);
  }
  store.connecting('deleted');store.live('deleted');store.transcript('deleted',threats);store.transcript('deleted',[]);
  store.audio('deleted',audio(1,0,true));store.ended('deleted');assert.equal(store.snapshot().at(-1).final_result.risk_score,0);
  assert.deepEqual(store.snapshot().slice(0,4).map(call=>call.final_result.risk_score),[80,60,40,0]);
});

for (const [text, score, explicit] of [
  ['그날도 없으면 매장 뒤집어 놓을 거니까 알아서 하세요.', 60, true],
  ['너 찾아가서 팬다.', 60, true],
  ['당신 찾아가서 내가 엎어버릴 거야.', 60, true],
  ['죽여 버리겠어.', 60, true],
  ['내가 니 찾아간다고.', 40, false],
  ['가만 안 둔다.', 40, false],
]) {
  test(`explicit harm floor: ${text} retains one threat, raw item scores, final ${score} and payload contract`, () => {
    const store = createLiveCallStore();
    store.connecting('harm_fixture', 'customer_fixture', 'consultation_9901', 'store_fixture'); store.live('harm_fixture');
    const messages = [turn('u1', '씨발. 일 처리 개판이네. ' + text), { ...turn('a1', text), role: 'agent' }];
    store.transcript('harm_fixture', messages);
    for (let index = 0; index < 5; index++) store.transcript('harm_fixture', messages);
    const before = store.snapshot()[0];
    assert.equal(before.risk_analysis.profanityCount, 2);
    assert.equal(before.risk_analysis.threatCount, 1);
    assert.equal(before.risk_analysis.analysisByTurn.a1, undefined);
    assert.equal(before.risk_analysis.analysisByTurn.u1.signals.some(signal => signal.type === 'threat' && signal.explicitHarm === true), explicit);
    assert.equal(before.final_result, null);
    store.ended('harm_fixture'); assert.equal(store.snapshot()[0].final_result, null);
    store.audio('harm_fixture', audio(1, 0, true));
    const finished = store.snapshot()[0], result = finished.final_result;
    assert.equal(result.signals.threat_count, 1);
    assert.equal(result.raw_score, 26);
    assert.equal(result.scores.threat_score, 20);
    assert.equal(result.threat_floor, score);
    assert.equal(result.risk_score, score);
    assert.equal(result.risk_level, score === 60 ? '위험' : '경계');
    const payload = callResultPayload(finished);
    assert.equal(payload.risk_score, score);
    assert.equal(payload.signals.threat_count, 1);
    assert.deepEqual(Object.keys(payload), ['call_id','consultation_id','customer_id','signals','scores','risk_score','risk_level','consultation']);
    assert.doesNotMatch(JSON.stringify(payload), /explicitHarm/);
    store.ended('harm_fixture'); store.audio('harm_fixture', audio(2, 5, true));
    assert.deepEqual(store.snapshot()[0].final_result, result);
  });
}

test('harm evidence correction removes only the severity floor before completion; finalized scores stay immutable', () => {
  const store = createLiveCallStore(); store.connecting('corrected_harm'); store.live('corrected_harm');
  store.transcript('corrected_harm', [turn('u1', '매장 뒤집어 놓을 거야.')]);
  assert.equal(store.snapshot()[0].risk_analysis.analysisByTurn.u1.signals[0].explicitHarm, true);
  store.transcript('corrected_harm', [turn('u1', '내가 너 찾아간다.')]);
  assert.equal(store.snapshot()[0].risk_analysis.threatCount, 1);
  assert.equal(store.snapshot()[0].risk_analysis.analysisByTurn.u1.signals[0].explicitHarm, undefined);
  store.audio('corrected_harm', audio(1, 0, true)); store.ended('corrected_harm');
  const result = store.snapshot()[0].final_result;
  assert.equal(result.risk_score, 40);
  store.transcript('corrected_harm', [turn('u1', '매장 뒤집어 놓을 거야.')]);
  assert.deepEqual(store.snapshot()[0].final_result, result);
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
