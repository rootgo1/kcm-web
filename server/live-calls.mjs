import { calculateCallRisk, validCount } from '../src/lib/riskPolicy.js';
import { analyzeTranscriptRisk } from './text-risk.mjs';

/** @typedef {import('../src/live/types.js').LiveCall} LiveCall */
/** @typedef {import('../src/live/types.js').LiveMessage} LiveMessage */
/** @typedef {import('../src/live/types.js').LiveCallsEvent} LiveCallsEvent */
/** @typedef {import('../src/live/types.js').LiveCallEventType} LiveCallEventType */

/**
 * Input is the SDK's merged FULL list, not raw WS deltas. Never append snapshots.
 * Retell IDs are preferred; legacy missing IDs use role + original snapshot position.
 * @param {unknown[]} transcript
 * @returns {LiveMessage[]}
 */
export function normalizeTranscript(transcript) {
  /** @type {Map<string, LiveMessage>} */
  const messages = new Map();
  transcript.forEach((value, index) => {
    if (!value || typeof value !== 'object') return;
    const item = /** @type {Record<string, unknown>} */ (value);
    if ((item.role !== 'user' && item.role !== 'agent') || typeof item.content !== 'string') return;
    const id = typeof item.id === 'string' && item.id ? item.id : `fallback:${item.role}:${index}`;
    messages.set(id, {
      turn_id: id, role: item.role, content: item.content,
      start_sec: typeof item.time_sec === 'number' && Number.isFinite(item.time_sec) && item.time_sec >= 0 ? item.time_sec : null,
      // Monitor has a turn start only. Do not invent an end time or finalized-sentence marker.
      end_sec: null,
    });
  });
  return [...messages.values()];
}

/** In-memory only. Completed/error calls stay available until this server is restarted. */
export function createLiveCallStore(/** @type {() => string} */ now = () => new Date().toISOString()) {
  /** @type {Map<string, LiveCall>} */
  const calls = new Map();
  /** @type {Set<(event: LiveCallsEvent) => void>} */
  const listeners = new Set();
  const emit = (/** @type {LiveCallEventType} */ type, /** @type {LiveCall} */ call) => {
    for (const listener of listeners) {
      // A broken subscriber must never interrupt Monitor processing or the voice call.
      try { listener(structuredClone({ type, ...call })); } catch { listeners.delete(listener); }
    }
  };
  const commit = (/** @type {LiveCallEventType} */ type, /** @type {LiveCall} */ call) => { calls.set(call.call_id, call); emit(type, call); };
  const finalize = (/** @type {LiveCall} */ call) => {
    if (call.status !== 'ended' || call.final_result) return call;
    const analysis = call.risk_analysis, audio = call.audio_signal;
    if (!analysis) return { ...call, finalization_reason: '텍스트 분석 확인 필요 · 점수 보류' };
    if (!audio?.closed) return { ...call, finalization_reason: '고성 최종 상태 수신 대기 · 점수 보류' };
    if (!audio.available || !audio.coverage_complete) return { ...call, finalization_reason: '마이크 미측정·중단 구간 있음 · 점수 보류' };
    const result = calculateCallRisk({ profanity_count: analysis.profanityCount, threat_count: analysis.threatCount,
      blame_count: analysis.blameCount, sexual_count: analysis.sexualCount, shouting_count: audio.shouting_count });
    return { ...call, finalization_reason: null, final_result: { ...result, call_id: call.call_id,
      customer_id: call.customer_id ?? null, completed_at: call.ended_at ?? now() } };
  };
  return {
    snapshot: () => structuredClone([...calls.values()]),
    get subscriberCount() { return listeners.size; },
    subscribe(/** @type {(event: LiveCallsEvent) => void} */ listener) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    connecting(/** @type {string} */ callId, /** @type {string | null} */ customerId = null) {
      if (calls.has(callId)) return;
      commit('call_status', { call_id: callId, status: 'connecting', started_at: null, ended_at: null, updated_at: now(), messages: [], error: null, risk_analysis: analyzeTranscriptRisk([]), customer_id: customerId, audio_signal: null, final_result: null, finalization_reason: null });
    },
    live(/** @type {string} */ callId) {
      const call = calls.get(callId);
      if (!call || call.status !== 'connecting') return;
      const at = now();
      commit('call_started', { ...call, status: 'live', started_at: at, updated_at: at });
    },
    transcript(/** @type {string} */ callId, /** @type {unknown[]} */ transcript) {
      const call = calls.get(callId);
      if (!call || call.status === 'ended' || call.status === 'error') return;
      const messages = normalizeTranscript(transcript);
      if (JSON.stringify(messages) === JSON.stringify(call.messages)) return;
      // Analysis and transcript are one snapshot. An analyzer failure must not stop
      // Monitor/SSE delivery or present old findings as if they analyzed new text.
      let risk_analysis = null;
      try { risk_analysis = analyzeTranscriptRisk(messages, call.messages, call.risk_analysis); } catch { /* unavailable, not zero */ }
      commit('transcript', { ...call, messages, risk_analysis, updated_at: now() });
    },
    ended(/** @type {string} */ callId) {
      const call = calls.get(callId);
      if (!call || call.status === 'ended' || call.status === 'error') return;
      const at = now();
      commit('call_ended', finalize({ ...call, status: 'ended', ended_at: at, updated_at: at }));
    },
    /** Monotonic snapshots are replacements, not additions. Closed results are immutable. */
    audio(/** @type {string} */ callId, /** @type {unknown} */ value) {
      const call = calls.get(callId);
      if (!call) return 'not_found';
      if (!value || typeof value !== 'object') return 'invalid';
      const input = /** @type {import('../src/live/types.js').AudioSignalUpdate} */ (value);
      const keys = ['sequence', 'shouting_count', 'is_shouting', 'available', 'coverage_complete', 'closed'];
      if (Object.keys(input).some(key => !keys.includes(key)) || !validCount(input.sequence) || input.sequence < 1
        || !validCount(input.shouting_count) || ![input.is_shouting, input.available, input.coverage_complete, input.closed].every(v => typeof v === 'boolean')
        || (input.closed && input.is_shouting) || (!input.available && input.coverage_complete)) return 'invalid';
      if (input.sequence <= (call.audio_signal?.sequence ?? 0)) return 'duplicate';
      if (call.final_result || call.audio_signal?.closed || call.status === 'error') return 'closed';
      if (call.status === 'ended' && !input.closed) return 'closed';
      if (input.shouting_count < (call.audio_signal?.shouting_count ?? 0)) return 'invalid';
      const coverage = input.coverage_complete && (!call.audio_signal || call.audio_signal.coverage_complete);
      const next = finalize({ ...call, audio_signal: { ...input, coverage_complete: coverage }, updated_at: now() });
      commit(next.final_result ? 'risk_finalized' : 'audio_signal', next);
      return 'accepted';
    },
    historyForCustomer(/** @type {string} */ customerId) {
      if (!customerId) return [];
      return structuredClone([...calls.values()].filter(call => call.customer_id === customerId && call.final_result)
        .flatMap(call => call.final_result ? [call.final_result] : []).sort((a, b) => Date.parse(b.completed_at) - Date.parse(a.completed_at)));
    },
    error(/** @type {string} */ callId) {
      const call = calls.get(callId);
      if (!call || call.status === 'ended' || call.status === 'error') return;
      commit('call_error', { ...call, status: 'error', updated_at: now(), error: '통화 모니터 연결을 확인할 수 없습니다. 실제 통화 종료 여부는 확인되지 않았습니다.' });
    },
  };
}
