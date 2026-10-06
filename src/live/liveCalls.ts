import { calculateCallRisk } from '../lib/riskPolicy.js';
import type { LiveCall, LiveCallsEvent, LiveRiskAnalysis, LiveTextRisk } from './types.js';

const events = ['snapshot', 'call_status', 'call_started', 'transcript', 'call_ended', 'call_error', 'audio_signal', 'risk_finalized'] as const;
const statuses = new Set(['connecting', 'live', 'ended', 'error']);
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object';
const optionalTime = (value: unknown) => value === null || typeof value === 'string';
const count = (value: unknown): value is number => Number.isSafeInteger(value) && (value as number) >= 0;

function isTextRisk(value: unknown): value is LiveTextRisk {
  if (!record(value) || !count(value.profanityCount) || !count(value.threatCount) || !count(value.blameCount) || !count(value.sexualCount) ||
    value.threatDetected !== (value.threatCount > 0) || !Array.isArray(value.signals)) return false;
  if (!value.signals.every(signal => record(signal) && ['profanity', 'threat', 'blame', 'sexual'].includes(String(signal.type)) &&
    typeof signal.matchedText === 'string' && typeof signal.reason === 'string' &&
    (signal.explicitHarm === undefined || typeof signal.explicitHarm === 'boolean' && (signal.explicitHarm === false || signal.type === 'threat')))) return false;
  return value.profanityCount === value.signals.filter(signal => signal.type === 'profanity').length &&
    value.threatCount === value.signals.filter(signal => signal.type === 'threat').length &&
    value.blameCount === value.signals.filter(signal => signal.type === 'blame').length &&
    value.sexualCount === value.signals.filter(signal => signal.type === 'sexual').length;
}

/** Validate server findings without running text classification in the browser. */
function isRiskAnalysis(value: unknown, messages: LiveCall['messages']): value is LiveRiskAnalysis {
  if (!record(value) || typeof value.ruleVersion !== 'string' || !value.ruleVersion || !record(value.analysisByTurn) || Array.isArray(value.analysisByTurn) ||
    !count(value.analyzedUserTurns) || !count(value.profanityCount) || !count(value.threatCount) || !count(value.blameCount) || !count(value.sexualCount) ||
    value.threatDetected !== (value.threatCount > 0)) return false;
  const users = new Set(messages.filter(message => message.role === 'user').map(message => message.turn_id));
  const turns = Object.entries(value.analysisByTurn);
  if (turns.length !== users.size || value.analyzedUserTurns !== users.size || !turns.every(([id, result]) => users.has(id) && isTextRisk(result))) return false;
  return (['profanityCount', 'threatCount', 'blameCount', 'sexualCount'] as const).every(field =>
    value[field] === turns.reduce((total, [, result]) => total + (result as LiveTextRisk)[field], 0));
}

// Older backend / invalid analysis must not interrupt the already-working transcript.
function withValidRisk(call: LiveCall): LiveCall {
  const analysis = isRiskAnalysis(call.risk_analysis, call.messages) ? call.risk_analysis : null;
  const explicitHarmThreat = analysis !== null && Object.values(analysis.analysisByTurn).some(turn =>
    turn.signals.some(signal => signal.type === 'threat' && signal.explicitHarm === true));
  const audio = call.audio_signal;
  const validAudio = audio && count(audio.sequence) && count(audio.shouting_count) &&
    [audio.is_shouting, audio.available, audio.coverage_complete, audio.closed].every(v => typeof v === 'boolean');
  let final: LiveCall['final_result'] = null;
  const received = call.final_result;
  if (call.status === 'ended' && received && received.call_id === call.call_id && received.completed_at === call.ended_at) {
    try {
      const checked = calculateCallRisk(received.signals, { explicitHarmThreat });
      if (received.rule_version === checked.rule_version && received.risk_score === checked.risk_score && received.risk_level === checked.risk_level
        && received.raw_score === checked.raw_score && received.adjusted_score === checked.adjusted_score
        && received.threat_floor === checked.threat_floor && JSON.stringify(received.scores) === JSON.stringify(checked.scores)) {
        final = { ...checked, call_id: call.call_id, completed_at: received.completed_at,
          customer_id: typeof received.customer_id === 'string' ? received.customer_id : null };
      }
    } catch { /* Invalid results must not become a normal 0 score. */ }
  }
  return { ...call, customer_id: typeof call.customer_id === 'string' ? call.customer_id : null,
    risk_analysis: analysis,
    audio_signal: validAudio ? audio : null, final_result: final,
    finalization_reason: typeof call.finalization_reason === 'string' ? call.finalization_reason : null };
}

function isCall(value: unknown): value is LiveCall {
  if (!record(value) || typeof value.call_id !== 'string' || typeof value.status !== 'string' || !statuses.has(value.status) ||
    !optionalTime(value.started_at) || !optionalTime(value.ended_at) || typeof value.updated_at !== 'string' ||
    !optionalTime(value.error) || !Array.isArray(value.messages)) return false;
  const ids = new Set<string>();
  return value.messages.every(message => {
    if (!record(message) || typeof message.turn_id !== 'string' || ids.has(message.turn_id) ||
      (message.role !== 'user' && message.role !== 'agent') || typeof message.content !== 'string') return false;
    ids.add(message.turn_id);
    return [message.start_sec, message.end_sec].every(time => time === null || typeof time === 'number' && Number.isFinite(time) && time >= 0);
  });
}

export function parseLiveEvent(raw: string): LiveCallsEvent | null {
  try {
    const event: unknown = JSON.parse(raw);
    if (!record(event)) return null;
    if (event.type === 'snapshot') {
      if (!Array.isArray(event.calls) || !event.calls.every(isCall) || new Set(event.calls.map(call => call.call_id)).size !== event.calls.length) return null;
      return { type: 'snapshot', calls: event.calls.map(withValidRisk) };
    }
    const type = event.type;
    return (type === 'call_status' || type === 'call_started' || type === 'transcript' || type === 'call_ended' || type === 'call_error' || type === 'audio_signal' || type === 'risk_finalized') && isCall(event)
      ? { ...withValidRisk(event), type } : null;
  } catch { return null; }
}

/** The next full call replaces its previous state/messages, never concatenates turns. */
export function applyLiveEvent(calls: LiveCall[], event: LiveCallsEvent): LiveCall[] {
  if (event.type === 'snapshot') return event.calls;
  const { type: _type, ...next } = event;
  const index = calls.findIndex(call => call.call_id === next.call_id);
  return index < 0 ? [...calls, next] : calls.map(call => call.call_id === next.call_id ? next : call);
}

export type LiveConnection = 'connecting' | 'connected' | 'reconnecting';
type EventSourcePort = Pick<EventTarget, 'addEventListener' | 'removeEventListener'> & { close: () => void };
export function subscribeLiveCalls(onEvent: (event: LiveCallsEvent) => void, onConnection: (status: LiveConnection) => void,
  createSource: () => EventSourcePort = () => new EventSource('/api/live-calls/events')) {
  let closed = false;
  const source = createSource();
  const receive: EventListener = event => {
    if (closed) return;
    const parsed = parseLiveEvent((event as MessageEvent<string>).data);
    if (parsed) { onEvent(parsed); onConnection('connected'); }
    else onConnection('reconnecting');
  };
  const reconnect = () => { if (!closed) onConnection('reconnecting'); };
  for (const event of events) source.addEventListener(event, receive);
  source.addEventListener('error', reconnect);
  // EventSource owns reconnect timing. Never create a second source in onerror.
  return () => {
    closed = true;
    for (const event of events) source.removeEventListener(event, receive);
    source.removeEventListener('error', reconnect);
    source.close();
  };
}

export const liveStatusLabels: Record<LiveCall['status'], string> = {
  connecting: '통화 연결 확인 중', live: 'AI 응대 중', ended: '통화 종료', error: '연결 확인 필요',
};
export function isNearConversationBottom(scrollTop: number, clientHeight: number, scrollHeight: number) {
  return scrollHeight - clientHeight - scrollTop <= 64;
}
