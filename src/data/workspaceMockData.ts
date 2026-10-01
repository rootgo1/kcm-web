import type { WorkspaceEmployee } from '../types.js';

/** 사용자가 지정한 UI 예시입니다. 실제 매장 정보·직원·평점으로 검증된 자료가 아닙니다. */
export const workspaceMock = {
  store: 'KT플라자 동성로점',
  employee: {
    id: 'DEMO-E001',
    name: '이소현',
    givenName: '소현',
    position: '점장',
    gender: 'female',
    reviewScore: 4.7,
    specialty: '기기변경 · 단말기 비교',
    style: '차분한 설명형',
  } satisfies WorkspaceEmployee,
};
