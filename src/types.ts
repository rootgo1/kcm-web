/** UI용 모델입니다. 실제 Supabase 테이블/컬럼 명세가 아닙니다. */
export type PageId = 'home' | 'appointments' | 'customers' | 'inventory' | 'support' | 'products' | 'marketing' | 'stores';
export type AppointmentStatus = 'reserved' | 'in_progress' | 'completed';
export type AppointmentFilter = 'all' | AppointmentStatus;
export type BriefingStatus = 'ready' | 'processing' | 'failed';
/** 통화별 시연 분석입니다. 예약 데이터나 고객의 고정 성향과 연결하지 않습니다. */
export type CallStatus = 'ai_responding' | 'waiting' | 'staff_consulting' | 'completed' | 'ended';
export type CallAnalysisStatus = 'completed' | 'processing' | 'failed' | 'not_analyzed';
export type CallRiskGrade = 'normal' | 'caution' | 'boundary' | 'danger' | 'critical';
export type CallSignal = 'profanity' | 'threat' | 'blame' | 'sexual' | 'shouting';
export interface CallEvidence {
  id?: string;
  atSeconds: number;
  text?: string;
  /** 욕설 근거는 주변 문맥을 남긴 가림 문구로만 표시합니다. */
  maskedText?: string;
}
export interface CallAnalysis {
  status: CallAnalysisStatus;
  phase: 'partial' | 'final';
  shoutingCount: number | null;
  profanityCount: number | null;
  threatCount: number | null;
  blameCount: number | null;
  sexualCount: number | null;
  summary: string | null;
  signals: Record<CallSignal, CallEvidence[]> | null;
  recommendedActions: string[];
  openingLine: string | null;
}
export interface DemoCall {
  id: string;
  /** 가상 원본 이름입니다. UI에서는 maskCustomerName으로 표시합니다. */
  customerLabel: string;
  inquiryType: string;
  status: CallStatus;
  startedAt: string | null;
  analysis: CallAnalysis;
  aiActions: string[];
  supportRequests: CallSupportRequest[];
  customerId: string | null;
  historyStatus: CustomerRisk['historyStatus'];
  initialScore: 0;
  endedAt: string | null;
  completedAt: string | null;
  completedBy: string | null;
  draft: CallResultDraft;
  result: CallResultDraft | null;
  scoreRecord: ScoreApplication | null;
}
/** 화면 전용 데모 타입입니다. 확정 DB 명세가 아닙니다. */
export interface CustomerRisk {
  id: string;
  historyStatus: 'new' | 'known' | 'unknown';
}
export interface CallResultDraft {
  outcome: '' | 'resolved' | 'needs_check' | 'unresolved';
  content: string;
  followUp: string;
}
export type ScoreCalculation = ReturnType<typeof import('./lib/riskPolicy.js').calculateCallRisk>;
export interface ScoreApplication extends ScoreCalculation {
  call_id: string;
  customerId: string | null;
  completedAt: string;
  appliedAt: string;
}
export interface CallDemoState { calls: DemoCall[]; customers: CustomerRisk[] }
export type SupportReason = 'guidance' | 'abuse' | 'policy' | 'other';
export type SupportStatus = 'pending' | 'in_progress' | 'completed';
export interface CallSupportRequest {
  id: string;
  callId: string;
  status: SupportStatus;
  reason: SupportReason;
  memo: string;
  requestedAt: string;
  requestedBy: string;
  acknowledgedAt: string | null;
  acknowledgedBy: string | null;
  completedAt: string | null;
  completedBy: string | null;
  content: string | null;
}
export type ConsultationOutcome = '' | 'guided' | 'needs_check' | 'considering' | 'other';
export type FollowUp = 'none' | 'required' | 'unknown';
export interface ConsultationResult {
  summary: string;
  outcome: ConsultationOutcome;
  followUp: FollowUp;
  followUpMemo: string;
}
export interface ConsultationHistory {
  id: string;
  kind: 'completed' | 'amended';
  before: ConsultationResult | null;
  after: ConsultationResult;
  actor: Pick<WorkspaceEmployee, 'id' | 'name' | 'position'>;
  at: string;
}
export interface ConsultationRecord {
  startedAt: string | null;
  completedAt: string | null;
  result: ConsultationResult | null;
  history: ConsultationHistory[];
}
export interface TranscriptLine { speaker: '고객' | '상담 Agent'; text: string }
export interface Briefing {
  status: BriefingStatus;
  summary: string;
  preference: string;
  checklist: string[];
  transcript: TranscriptLine[];
}
export interface Appointment {
  id: string;
  customerId: string;
  customerName: string;
  phoneMasked: string;
  time: string;
  purpose: string;
  device: string;
  budget: string;
  employee: string;
  status: AppointmentStatus;
  reviewed: boolean;
  briefing: Briefing;
  consultation?: ConsultationRecord;
}
export interface InventoryItem {
  id: string;
  name: string;
  variant: string;
  stock: number;
  reserved: number;
  lowThreshold: number;
}
export interface Loan {
  id: string;
  device: string;
  quantity: number;
  store: string;
  deadline: string;
  status: 'due_today' | 'overdue' | 'shipping';
}
export interface Activity {
  id: string;
  time: string;
  label: string;
  description: string;
  kind: 'analysis' | 'reservation' | 'inventory';
}
/** 성별은 명시적인 프로필 값이며 이름·사진에서 추정하지 않습니다. */
export type EmployeeGender = 'male' | 'female' | 'unspecified';
export interface WorkspaceEmployee {
  id: string;
  name: string;
  /** 성과 분리된 이름. 외자·복성을 안전하게 표시하기 위해 별도 저장합니다. */
  givenName: string;
  position: string;
  gender: EmployeeGender;
  reviewScore: number | null;
  specialty: string;
  style: string;
}
export interface DashboardData {
  mode: 'mock';
  date: string;
  store: string;
  employee: WorkspaceEmployee;
  appointments: Appointment[];
  inventory: InventoryItem[];
  loans: Loan[];
  activities: Activity[];
}
