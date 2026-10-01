import type { EmployeeGender } from '../types.js';

/** 프로필의 givenName만 사용합니다. 전체 이름에서 성을 잘라내지 않습니다. */
export function avatarLabel(givenName: string): string {
  const clean = givenName.trim().replace(/\s+/gu, '');
  return Array.from(clean).slice(0, 2).join('') || '?';
}

export function avatarTone(gender: EmployeeGender): 'red' | 'dark' | 'neutral' {
  if (gender === 'female') return 'red';
  if (gender === 'male') return 'dark';
  return 'neutral';
}

export function formatReviewScore(score: number | null): string {
  return score !== null && Number.isFinite(score) && score >= 0 && score <= 5
    ? score.toFixed(1) : '—';
}
