import type { ConsultationOutcome, ConsultationRecord, ConsultationResult, DashboardData, FollowUp } from '../types.js';

export const outcomeLabels: Record<Exclude<ConsultationOutcome, ''>, string> = {
  guided: '안내 완료', needs_check: '추가 확인 필요', considering: '고객 검토 중', other: '기타',
};
export const followUpLabels: Record<FollowUp, string> = { none: '필요 없음', required: '필요', unknown: '미정' };
export type ConsultationSaveMode = 'draft' | 'complete' | 'amend';
export type ConsultationErrors = Partial<Record<keyof ConsultationResult, string>>;
export const emptyResult = (): ConsultationResult => ({ summary: '', outcome: '', followUp: 'unknown', followUpMemo: '' });
const emptyRecord = (): ConsultationRecord => ({ startedAt: null, completedAt: null, result: null, history: [] });

// Copy only the editable fields so input objects cannot change status, timestamps or old history.
const copyResult = (result: ConsultationResult): ConsultationResult => ({
  summary: result.summary, outcome: result.outcome, followUp: result.followUp, followUpMemo: result.followUpMemo,
});
export function sameResult(a: ConsultationResult, b: ConsultationResult): boolean {
  return a.summary === b.summary && a.outcome === b.outcome && a.followUp === b.followUp && a.followUpMemo === b.followUpMemo;
}
export function validateConsultation(result: ConsultationResult, mode: ConsultationSaveMode): ConsultationErrors {
  const errors: ConsultationErrors = {};
  if (mode !== 'draft' && !result.summary.trim()) errors.summary = '상담 요약을 입력해 주세요.';
  if (result.summary.length > 1000) errors.summary = '상담 요약은 1,000자 이내로 입력해 주세요.';
  if ((mode !== 'draft' && !result.outcome) || (result.outcome !== '' && !Object.hasOwn(outcomeLabels, result.outcome))) errors.outcome = '결과 구분을 선택해 주세요.';
  if (!Object.hasOwn(followUpLabels, result.followUp)) errors.followUp = '후속 연락 여부를 선택해 주세요.';
  if (result.followUpMemo.length > 500) errors.followUpMemo = '후속 연락 메모는 500자 이내로 입력해 주세요.';
  return errors;
}
export function startConsultation(data: DashboardData, id: string, at: string): DashboardData {
  const appointment = data.appointments.find(item => item.id === id);
  if (!appointment || appointment.status !== 'reserved') return data;
  return { ...data, appointments: data.appointments.map(item => item.id === id ? {
    ...item, status: 'in_progress', consultation: { ...emptyRecord(), startedAt: at },
  } : item) };
}
export function saveConsultation(data: DashboardData, id: string, input: ConsultationResult, mode: ConsultationSaveMode, at: string): {
  data: DashboardData; changed: boolean; errors: ConsultationErrors; notice?: string;
} {
  const unchanged = { data, changed: false, errors: {} };
  const appointment = data.appointments.find(item => item.id === id);
  if (!appointment || (mode === 'amend' ? appointment.status !== 'completed' : appointment.status !== 'in_progress')) {
    return { ...unchanged, notice: '현재 상담 상태에서는 이 작업을 반영할 수 없습니다.' };
  }
  const errors = validateConsultation(input, mode);
  if (Object.keys(errors).length) return { ...unchanged, errors };
  const result = { ...copyResult(input), summary: input.summary.trim(), followUpMemo: input.followUpMemo.trim() };
  const previous = appointment.consultation ?? emptyRecord();
  if (mode !== 'complete' && previous.result && sameResult(previous.result, result)) return unchanged;
  const history = mode === 'draft' ? previous.history : [...previous.history, {
    id: `${id}-${previous.history.length + 1}`,
    kind: mode === 'complete' ? 'completed' as const : 'amended' as const,
    before: previous.result ? copyResult(previous.result) : null,
    after: copyResult(result),
    actor: { id: data.employee.id, name: data.employee.name, position: data.employee.position },
    at,
  }];
  const consultation: ConsultationRecord = {
    ...previous, result, history, completedAt: mode === 'complete' ? at : previous.completedAt,
  };
  return {
    changed: true, errors: {},
    data: { ...data, appointments: data.appointments.map(item => item.id === id ? {
      ...item, status: mode === 'complete' ? 'completed' : item.status, consultation,
    } : item) },
  };
}

export function consultationTime(at: string | null | undefined): string {
  if (!at) return '기록 없음';
  return new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).format(new Date(at));
}
