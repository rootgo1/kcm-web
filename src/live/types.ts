/** Wire format shared by the memory-only Node store and employee EventSource client. */
export interface LiveMessage {
  turn_id: string;
  role: 'user' | 'agent';
  content: string;
  start_sec: number | null;
  end_sec: number | null;
}

export type LiveSignalType = 'profanity' | 'threat' | 'blame' | 'sexual';
export interface LiveTextRisk {
  profanityCount: number;
  threatCount: number;
  threatDetected: boolean;
  blameCount: number;
  sexualCount: number;
  signals: { type: LiveSignalType; matchedText: string; reason: string; explicitHarm?: boolean }[];
}
/** Current received text only: never a customer score or a finalized analysis. */
export interface LiveRiskAnalysis {
  ruleVersion: string;
  analyzedUserTurns: number;
  profanityCount: number;
  threatCount: number;
  threatDetected: boolean;
  blameCount: number;
  sexualCount: number;
  analysisByTurn: Record<string, LiveTextRisk>;
}

export interface AudioSignalUpdate {
  sequence: number;
  shouting_count: number;
  is_shouting: boolean;
  available: boolean;
  coverage_complete: boolean;
  closed: boolean;
}
export type LiveFinalRisk = ReturnType<typeof import('../lib/riskPolicy.js').calculateCallRisk> & {
  call_id: string;
  customer_id: string | null;
  completed_at: string;
};
export interface LiveCall {
  call_id: string;
  // Optional for snapshots from an older running backend.
  consultation_id?: string;
  webhook_delivery?: {
    status: 'pending' | 'sent' | 'failed';
    attempted_at: string;
    completed_at: string | null;
    error: string | null;
  } | null;
  status: 'connecting' | 'live' | 'ended' | 'error';
  started_at: string | null;
  ended_at: string | null;
  updated_at: string;
  messages: LiveMessage[];
  error: string | null;
  // Missing on an older running backend; null means analysis is unavailable.
  risk_analysis?: LiveRiskAnalysis | null;
  customer_id?: string | null;
  store_id?: string | null;
  audio_signal?: AudioSignalUpdate | null;
  final_result?: LiveFinalRisk | null;
  finalization_reason?: string | null;
}

export type LiveCallEventType = 'call_status' | 'call_started' | 'transcript' | 'call_ended' | 'call_error' | 'audio_signal' | 'risk_finalized';
export type LiveCallsEvent = { type: 'snapshot'; calls: LiveCall[] } | ({ type: LiveCallEventType } & LiveCall);
