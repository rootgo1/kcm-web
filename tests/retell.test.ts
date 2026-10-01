import { test } from 'node:test';
import './auxMic.test.js';
import './shouting.test.js';
import assert from 'node:assert/strict';
import type { RetellClient, SessionHooks, WebCallSession } from 'retell-client-js-sdk';
import { callErrorMessage, createCallController, retellProxyFetch, type CallView } from '../src/dev/retellCall.js';

function setup() {
  const views: CallView[] = [];
  const calls: { hooks: SessionHooks; callId: string; ends: number }[] = [];
  const stops: string[] = [];
  const client: Pick<RetellClient, 'createWebCall' | 'stopCall'> = {
    createWebCall(options) {
      assert.equal(options.transcript, false);
      assert.equal(options.agent_id, 'agent_test');
      const call = { hooks: options.hooks!, callId: `call_${calls.length + 1}`, ends: 0 };
      calls.push(call);
      return { get callId() { return call.callId; }, async end() { call.ends++; call.hooks.onEnd?.({}); } } as WebCallSession;
    },
    async stopCall(id) { stops.push(id); },
  };
  return { calls, views, stops, controller: createCallController(client, 'agent_test', view => views.push(view)) };
}

test('Retell: duplicate start guarded synchronously; ended calls can start with a new ID', async () => {
  const { controller, calls, views } = setup();
  controller.start(); controller.start();
  assert.equal(calls.length, 1);
  calls[0].hooks.onStatus?.('live');
  assert.equal(views.at(-1)?.callId, 'call_1');
  await controller.end(); await controller.end();
  assert.equal(calls[0].ends, 1);
  controller.start();
  assert.equal(calls.length, 2);
  calls[0].hooks.onEnd?.({}); // late events from a previous call do not change the new one
  assert.equal(views.at(-1)?.status, 'connecting');
  calls[1].hooks.onStatus?.('live');
  assert.equal(views.at(-1)?.callId, 'call_2');
  controller.dispose();
});

test('Retell: ending while connecting and route unmount release the session', async () => {
  const { controller, calls, views } = setup();
  controller.start(); await controller.end();
  assert.equal(views.at(-1)?.status, 'ended');
  controller.start(); controller.dispose();
  const count = views.length;
  calls[1].hooks.onStatus?.('live'); controller.start();
  assert.equal(calls[1].ends, 1);
  assert.equal(views.length, count);
  assert.equal(calls.length, 2);
});

test('Retell: microphone failure is explained and registered call is cleaned up', () => {
  const { controller, calls, views, stops } = setup();
  controller.start();
  calls[0].hooks.onError?.(new DOMException('Permission denied', 'NotAllowedError'));
  calls[0].hooks.onEnd?.({});
  assert.match(views.at(-1)!.error, /마이크 사용 권한/);
  assert.deepEqual(stops, ['call_1']);
  controller.start();
  assert.equal(views.at(-1)?.error, '');
  controller.dispose();
});

test('Retell: error display never echoes arbitrary response body or token', () => {
  assert.match(callErrorMessage(new Error('RETELL_API_KEY_MISSING')), /RETELL_API_KEY가 없습니다/);
  assert.match(callErrorMessage(new Error('RETELL_AUTH_FAILED')), /인증에 실패/);
  assert.match(callErrorMessage(new DOMException('', 'NotFoundError')), /마이크가 없습니다/);
  assert.match(callErrorMessage(new DOMException('', 'NotReadableError')), /마이크를 사용할 수 없습니다/);
  assert.doesNotMatch(callErrorMessage(new Error('private-token-example')), /private-token-example/);
});

test('Retell: REST proxy strips placeholder authorization and blocks unrelated operations', async () => {
  const original = globalThis.fetch;
  let called = 0;
  globalThis.fetch = async (input, init) => {
    called++;
    assert.equal(input, '/retell/v3/create-web-call');
    assert.equal(new Headers(init?.headers).has('Authorization'), false);
    assert.equal(init?.cache, 'no-store');
    assert.equal(init?.credentials, 'same-origin');
    return new Response('{}');
  };
  try {
    await retellProxyFetch('https://api.retellai.com/v3/create-web-call', { method: 'POST', headers: { Authorization: 'Bearer placeholder' } });
    await assert.rejects(retellProxyFetch('https://api.retellai.com/v2/listen-live-call/call_1'), /UNSUPPORTED/);
    await assert.rejects(retellProxyFetch('https://other.invalid/v3/create-web-call'), /UNSUPPORTED/);
    assert.equal(called, 1);
  } finally { globalThis.fetch = original; }
});
