import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createShoutingDetector, SHOUT_SETTINGS } from '../src/dev/shouting.js';
import { createLiveAudioReporter, type AudioReportView } from '../src/dev/liveAudioReporter.js';
import type { AudioSignalUpdate } from '../src/live/types.js';
const tick=()=>new Promise<void>(resolve=>setImmediate(resolve));
function feed(detector:ReturnType<typeof createShoutingDetector>,level:number,from:number,to:number){
  let last=detector.sample(level,from);
  for(let at=from+100;at<=to;at+=100)last=detector.sample(level,at);
  return last;
}
test('shouting: below threshold, brief spike, exact duration and sustained loud interval',()=>{
  const d=createShoutingDetector();
  assert.equal(feed(d,0.1,0,2000).shouting_count,0);
  assert.equal(feed(d,0.2,2100,2400).shouting_count,0);
  assert.equal(d.sample(0.2,2449).shouting_count,0);
  d.sample(0,2450);
  assert.equal(feed(d,0.12,2500,2800).shouting_count,0);
  assert.equal(d.sample(0.12,2849).shouting_count,0);
  assert.equal(d.sample(0.12,2850).shouting_count,1);
  assert.equal(feed(d,0.6,2900,6000).shouting_count,1);
});
test('shouting: hysteresis and release duration prevent threshold jitter double counting',()=>{
  const d=createShoutingDetector();feed(d,0.2,0,600);
  for(let at=700;at<=2000;at+=100)d.sample(at%200===0?0.11:0.13,at);
  assert.equal(d.sample(0.08,2100).shouting_count,1);
  assert.equal(feed(d,0.08,2200,2300).is_shouting,true);
  assert.equal(d.sample(0.08,2399).is_shouting,true);
  assert.equal(d.sample(0.13,2400).shouting_count,1); // interrupted release cannot start another interval
  assert.equal(feed(d,0.08,2500,2700).is_shouting,true);
  assert.equal(d.sample(0.08,2799).is_shouting,true);
  assert.equal(d.sample(0.08,2800).is_shouting,false);
  assert.equal(feed(d,0.12,2900,3200).shouting_count,1);
  assert.equal(d.sample(0.12,3249).shouting_count,1);
  assert.equal(d.sample(0.12,3250).shouting_count,2);
});
test('shouting: gaps do not pretend sustained audio; invalid timestamps/levels cannot count',()=>{
  const d=createShoutingDetector();d.sample(0.9,0);
  assert.deepEqual(d.sample(0.9,5000),{shouting_count:0,is_shouting:false,continuous:false});
  for(const value of [-1,NaN,Infinity,2])assert.equal(d.sample(value,5100).shouting_count,0);
  assert.equal(d.sample(1,4900).shouting_count,0);
  assert.equal(SHOUT_SETTINGS.SHOUT_RELEASE_THRESHOLD<SHOUT_SETTINGS.SHOUT_THRESHOLD,true);
});
test('shouting: separate detectors isolate different calls',()=>{
  const a=createShoutingDetector(),b=createShoutingDetector();feed(a,0.2,0,1000);
  assert.equal(a.sample(0.2,1100).shouting_count,1);assert.equal(b.sample(0.2,1100).shouting_count,0);
});
test('reporter: no active call sends nothing; counts reset per ID and never send raw audio/levels',async()=>{
  const sent:{id:string;value:AudioSignalUpdate}[]=[],views:AudioReportView[]=[];
  const reporter=createLiveAudioReporter(v=>views.push(v),async(id,value)=>{sent.push({id,value});});
  const mic={status:'running' as const,starting:false,level:0.2,error:''};
  reporter.observe(mic,0);assert.equal(sent.length,0);
  reporter.begin('A',true);for(let at=0;at<=2000;at+=100)reporter.observe(mic,at);
  await reporter.finish();await tick();
  assert.equal(sent.at(-1)?.id,'A');assert.equal(sent.at(-1)?.value.shouting_count,1);assert.equal(sent.at(-1)?.value.closed,true);
  reporter.begin('B',true);await tick();
  assert.equal(sent.at(-1)?.value.shouting_count,0);assert.equal(sent.at(-1)?.id,'B');
  assert.doesNotMatch(JSON.stringify(sent),/level|samples|audio_data|access_token/);
  reporter.dispose();await tick();assert.equal(sent.at(-1)?.value.coverage_complete,false);
});
test('reporter: outbox serializes and coalesces snapshots; final snapshot survives in-flight request',async()=>{
  let release!:()=>void;const gate=new Promise<void>(r=>{release=r;});const sent:AudioSignalUpdate[]=[];
  const reporter=createLiveAudioReporter(()=>{},async(_id,value)=>{sent.push(value);if(sent.length===1)await gate;});
  reporter.begin('A',true);
  for(let at=0;at<=700;at+=100)reporter.observe({status:'running',starting:false,level:0.2,error:''},at);
  const finishing=reporter.finish();release();await finishing;await tick();
  assert.equal(sent.length,2);assert.equal(sent[1].closed,true);assert.equal(sent[1].shouting_count,1);
  assert.ok(sent[1].sequence>sent[0].sequence);
});
test('reporter: failed send can retry same snapshot without duplicate increments, mic interruption marks incomplete',async()=>{
  let fail=true;const sent:AudioSignalUpdate[]=[];const views:AudioReportView[]=[];
  const reporter=createLiveAudioReporter(v=>views.push(v),async(_id,value)=>{if(fail)throw new Error('network');sent.push(value);});
  reporter.begin('A',true);await tick();assert.match(views.at(-1)!.error,/전송하지 못/);
  fail=false;await reporter.retry();assert.equal(sent[0].sequence,1);
  reporter.observe({status:'error',starting:false,level:0,error:'device'},10);
  await reporter.finish();await tick();assert.equal(sent.at(-1)?.coverage_complete,false);
});
