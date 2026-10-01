import { createMockData } from '../data/mockData';
import type { DashboardData } from '../types';

/** 추후 실제 DB 결과를 UI 모델로 변환하는 어댑터를 이 인터페이스 뒤에 연결합니다. */
export interface DashboardRepository { load(): Promise<DashboardData> }
export const dashboardRepository: DashboardRepository = {
  async load() {
    // API 호출·localStorage 저장 없음. 새로고침하면 샘플이 초기화됩니다.
    await new Promise<void>(resolve => window.setTimeout(resolve, 120));
    return createMockData();
  },
};
