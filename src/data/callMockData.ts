import type { CallDemoState, DemoCall } from '../types.js';
import { emptyCallDraft } from '../lib/callWorkflow.js';

function callDefaults(customerId: string, historyStatus: 'new' | 'known' = 'known') {
  return { customerId, initialScore: 0 as const, historyStatus, endedAt: null, completedAt: null, completedBy: null, draft: emptyCallDraft(), result: null, scoreRecord: null };
}

/** 최종 분석 수치는 가상 샘플이며 모든 통화는 0점부터 독립 계산합니다. 분석이 준비되어도 종료 전에는 확정하지 않습니다. */
export function createCallMockData(): DemoCall[] {
  return [
    {
      id: 'C-001', customerLabel: '이도현', inquiryType: '요금제 변경', status: 'waiting', supportRequests: [],
      ...callDefaults('CUSTOMER-001'),
      startedAt: null,
      aiActions: ['변경 희망 요금제와 이용 목적 확인', '직원 연결 요청 접수'],
      analysis: {
        status: 'completed', phase: 'final', shoutingCount: 0, profanityCount: 0, threatCount: 0, blameCount: 0, sexualCount: 0, summary: '현재 데이터 사용량에 맞는 요금제로 변경할 수 있는지 문의했습니다.',
        signals: { shouting: [], profanity: [], blame: [], sexual: [], threat: [] },
        recommendedActions: ['현재 사용량과 희망 요금 조건을 확인한 뒤 변경 조건을 안내합니다.'],
        openingLine: '사용량에 맞는 요금제를 알아보고 계신 내용 전달받았습니다. 현재 이용 조건부터 함께 확인하겠습니다.',
      },
    },
    {
      id: 'C-002', customerLabel: '박민수', inquiryType: '인터넷 이용 불편', status: 'waiting', supportRequests: [],
      ...callDefaults('CUSTOMER-002'),
      startedAt: null,
      aiActions: ['인터넷 끊김 증상 확인', '이미 진행한 재부팅 조치 확인', '직원 연결 요청 접수'],
      analysis: {
        status: 'completed', phase: 'final', shoutingCount: 1, profanityCount: 2, threatCount: 0, blameCount: 0, sexualCount: 0, summary: '인터넷이 반복해서 끊겨 불편하며 추가 점검 방법을 문의했습니다.',
        signals: { shouting: [{ id: 'C002-S1', atSeconds: 80, text: '언제 점검할 수 있는지 알려 주세요! (고성 예시)' }], profanity: [{ id: 'C002-P1', atSeconds: 91, maskedText: '[욕설 가림], 계속 끊기네요.' }, { id: 'C002-P2', atSeconds: 108, maskedText: '이런 [욕설 가림], 점검을 부탁해요.' }], threat: [], blame: [], sexual: [] },
        recommendedActions: ['불편을 확인하고 이미 시도한 조치를 반복 요구하지 않습니다.', '연결 상태와 점검 가능한 항목을 순서대로 안내합니다.'],
        openingLine: '인터넷 끊김으로 불편하신 내용과 재부팅하신 점 전달받았습니다. 다음으로 확인할 항목을 안내하겠습니다.',
      },
    },
    {
      id: 'C-003', customerLabel: '김서진', inquiryType: '청구 요금 확인', status: 'waiting', supportRequests: [],
      ...callDefaults('CUSTOMER-003'),
      startedAt: null,
      aiActions: ['문의 확인', '청구 내역 확인 절차 안내', '직원 연결 요청 접수'],
      analysis: {
        status: 'completed', phase: 'final', shoutingCount: 4, profanityCount: 3, threatCount: 0, blameCount: 0, sexualCount: 0, summary: '예상보다 높게 청구된 요금의 설명과 정정 가능 여부를 확인하고 싶어 합니다.',
        signals: {
          shouting: [
            { id: 'C003-S1', atSeconds: 30, text: '요금 항목을 확인해 주세요! (고성 예시)' },
            { id: 'C003-S2', atSeconds: 60, text: '어떤 차이인지 알려 주세요! (고성 예시)' },
            { id: 'C003-S3', atSeconds: 90, text: '직원에게 연결해 주세요! (고성 예시)' },
            { id: 'C003-S4', atSeconds: 120, text: '정정이 되는지 확인해 주세요! (고성 예시)' },
          ],
          profanity: [
            { atSeconds: 39, maskedText: '[욕설 가림], 요금이 왜 이렇게 나왔어요?' },
            { atSeconds: 74, maskedText: '이런 [욕설 가림], 같은 설명을 또 해야 해요?' },
            { atSeconds: 112, maskedText: '[욕설 가림], 내역부터 확인해 주세요.' },
          ],
          blame: [], sexual: [], threat: [],
        },
        recommendedActions: ['반복 설명을 요구하지 않고 청구 항목 확인부터 진행합니다.', '욕설이 반복되면 주의 안내 문구를 활용합니다.'],
        openingLine: '청구 요금 때문에 문의하신 내용 전달받았습니다. 앞서 말씀하신 내용을 바탕으로 어떤 항목에서 차이가 발생했는지 확인하겠습니다.',
      },
    },
    {
      id: 'C-004', customerLabel: '최지우', inquiryType: '해지 비용 문의', status: 'staff_consulting', supportRequests: [{ id: 'DEMO-S-C004-1', callId: 'C-004', status: 'pending', reason: 'abuse', memo: '위협 표현 대응 방법을 함께 확인해 주세요. (가상 샘플)', requestedAt: '2026-09-30T13:22:00+09:00', requestedBy: '데모 직원', acknowledgedAt: null, acknowledgedBy: null, completedAt: null, completedBy: null, content: null }],
      ...callDefaults('CUSTOMER-004'),
      // 처음부터 상담 중인 가상 샘플의 고정 시작 시각입니다.
      startedAt: '2026-09-30T13:20:00+09:00',
      aiActions: ['해지 비용 관련 문의 확인', '비용 확인 절차 안내', '직원 연결 요청 접수'],
      analysis: {
        status: 'completed', phase: 'final', shoutingCount: 0, profanityCount: 0, threatCount: 2, blameCount: 0, sexualCount: 0, summary: '해지 비용의 근거를 문의하며 위협 표현을 사용한 통화입니다. 관리자 지원 요청이 미처리 상태인 가상 예시입니다.',
        signals: {
          shouting: [], profanity: [],
          blame: [], sexual: [],
          threat: [{ atSeconds: 101, text: '직접 찾아가서 소란을 피우겠어요.' }, { atSeconds: 129, text: '담당 직원을 찾아가 가만두지 않겠어요.' }],
        },
        recommendedActions: ['요구 사항과 비용 근거를 간결히 확인하되 위협 표현에는 분명한 주의 안내를 합니다.', '직원 보호를 위해 관리자 지원 상태를 확인하고 조직의 실제 대응 절차를 따릅니다.'],
        openingLine: '해지 비용에 대해 문의하신 내용 전달받았습니다. 비용이 발생한 항목을 확인하겠습니다. 원활한 상담을 위해 위협적인 표현은 멈춰 주세요.',
      },
    },
    {
      id: 'C-005', customerLabel: '정유민', inquiryType: '결합 상품 문의', status: 'ai_responding', supportRequests: [],
      ...callDefaults('CUSTOMER-005', 'new'),
      startedAt: null,
      aiActions: ['문의 유형 확인'],
      analysis: { status: 'processing', phase: 'partial', shoutingCount: null, profanityCount: null, threatCount: null, blameCount: null, sexualCount: null, summary: null, signals: null, recommendedActions: [], openingLine: null },
    },
  ];
}

export function createCallDemoState(): CallDemoState {
  const calls = createCallMockData();
  return { calls, customers: calls.map(call => ({ id: call.customerId!, historyStatus: call.historyStatus })) };
}
