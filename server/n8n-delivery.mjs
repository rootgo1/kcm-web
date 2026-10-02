/** Server-only configuration; no default customer identity or production URL. */
export function n8nConfig(/** @type {NodeJS.ProcessEnv} */ env = process.env) {
  return {
    webhookUrl: env.N8N_WEBHOOK_URL?.trim() ?? '',
    demoCustomerId: env.KCM_DEMO_CUSTOMER_ID?.trim() || null,
    demoStoreId: env.KCM_DEMO_STORE_ID?.trim() || null,
  };
}

/** Validate the store's existing ISO UTC timestamps; never invent or replace them. */
function validCallTimes(/** @type {import('../src/live/types.js').LiveCall} */ call) {
  const validTime = (/** @type {string | null} */ value) => typeof value === 'string'
    && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)
    && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
  return validTime(call.started_at) && validTime(call.ended_at)
    && Date.parse(/** @type {string} */ (call.started_at)) <= Date.parse(/** @type {string} */ (call.ended_at));
}

/** Explicit projection: never forward tokens, internal metadata or a body wrapper. */
export function callResultPayload(/** @type {import('../src/live/types.js').LiveCall} */ call) {
  const result = call.final_result;
  if (call.status !== 'ended' || !result || result.call_id !== call.call_id) throw new Error('RESULT_NOT_FINAL');
  if (!call.consultation_id || !/^consultation_\d+$/.test(call.consultation_id)) throw new Error('CONSULTATION_ID_INVALID');
  if (!call.customer_id || result.customer_id !== call.customer_id) throw new Error('CUSTOMER_ID_MISSING');
  if (!call.store_id?.trim()) throw new Error('STORE_ID_MISSING');
  if (!validCallTimes(call)) throw new Error('CONSULTATION_TIMES_INVALID');
  return {
    call_id: call.call_id,
    consultation_id: call.consultation_id,
    customer_id: call.customer_id,
    signals: {
      profanity_count: result.signals.profanity_count,
      threat_count: result.signals.threat_count,
      blame_count: result.signals.blame_count,
      sexual_count: result.signals.sexual_count,
      shouting_count: result.signals.shouting_count,
    },
    scores: {
      profanity_score: result.scores.profanity_score,
      threat_score: result.scores.threat_score,
      blame_score: result.scores.blame_score,
      sexual_score: result.scores.sexual_score,
      shouting_score: result.scores.shouting_score,
    },
    risk_score: result.risk_score,
    risk_level: result.risk_level,
    consultation: {
      store_id: call.store_id,
      status: '완료',
      used_ai: true,
      started_at: call.started_at,
      ended_at: call.ended_at,
      transcript: call.messages.map(message => ({
        turn_id: message.turn_id, role: message.role, content: message.content, start_sec: message.start_sec,
      })),
    },
  };
}

/**
 * One attempt per call in this server process. No persistent queue or implicit retry:
 * after a lost response we cannot know whether the receiving workflow already ran.
 * @param {{liveCalls: ReturnType<import('./live-calls.mjs').createLiveCallStore>, webhookUrl: string,
 * fetchImpl?: typeof fetch, log?: (line: string) => void, timeoutMs?: number}} options
 */
export function createN8nDelivery({ liveCalls, webhookUrl, fetchImpl = fetch, log = console.log, timeoutMs = 10_000 }) {
  const controllers = new Set();
  let closed = false;
  const report = (/** @type {string} */ message) => { try { log(message); } catch { /* logging must not affect a call */ } };
  const deliver = async (/** @type {string} */ callId) => {
    if (closed) return;
    const call = liveCalls.claimWebhookDelivery(callId);
    if (!call) return;
    const controller = new AbortController();
    controllers.add(controller);
    // Only fixed diagnostic codes and HTTP status numbers may reach state/logs.
    let failure = 'NETWORK_ERROR';
    try {
      failure = 'N8N_WEBHOOK_URL_MISSING';
      if (!webhookUrl) throw new Error();
      failure = 'N8N_WEBHOOK_URL_INVALID';
      const url = new URL(webhookUrl);
      if (url.protocol !== 'https:' || url.username || url.password || url.hash) throw new Error();
      failure = 'CUSTOMER_ID_MISSING';
      if (!call.customer_id) throw new Error();
      failure = 'RESULT_INVALID';
      if (!call.store_id?.trim()) { failure = 'STORE_ID_MISSING'; throw new Error(); }
      if (!validCallTimes(call)) { failure = 'CONSULTATION_TIMES_INVALID'; throw new Error(); }
      const payload = callResultPayload(call);
      failure = 'NETWORK_ERROR';
      const response = await fetchImpl(webhookUrl, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload), redirect: 'manual',
        signal: AbortSignal.any([controller.signal, AbortSignal.timeout(timeoutMs)]),
      });
      // Never read or log the response body; it may echo a secret or workflow data.
      void response.body?.cancel().catch(() => {});
      if (!response.ok) { failure = `HTTP_${response.status}`; throw new Error(); }
      liveCalls.finishWebhookDelivery(callId, 'sent');
      report(`[n8n] delivered call result: ${callId}`);
    } catch (error) {
      if (controller.signal.aborted) failure = 'SERVER_STOPPED';
      else if (error instanceof Error && error.name === 'TimeoutError') failure = 'TIMEOUT';
      liveCalls.finishWebhookDelivery(callId, 'failed', failure);
      report(`[n8n] delivery failed: ${callId} (${failure})`);
    } finally { controllers.delete(controller); }
  };
  const unsubscribe = liveCalls.subscribeFinalized(call => { void deliver(call.call_id); });
  return {
    close() { closed = true; unsubscribe(); for (const controller of controllers) controller.abort(); },
  };
}
