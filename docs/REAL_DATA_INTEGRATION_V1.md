# 실제 데이터 연동 1차

기준: main `86508324e33a59e4a74e508bb354f9ef09c86a96`, 작업 브랜치 `feature/real-data-integration-v1`.
KT Project(`ddqcdxygqskfpiurwfvw`)의 public schema를 2026-10-06 연결된 Supabase 도구로 읽기 전용 조회했습니다.
이 문서는 프런트/백엔드의 이번 연동 범위 기록이며 팀 DB 명세나 migration을 대체하지 않습니다.

## 검증 범위

- 실제 DB metadata와 SELECT 검증: 성공. store_005 예약 48건 / 상담 205건 / 고객 201명 / AI 요약 165건 / 위험 기록 241건, 예약 연결 누락 0건.
- 연결된 도구의 DB 접근 권한과 KCM 런타임의 읽기 인증 설정은 별개입니다. API Key를 조회·요청하거나 기존 .env를 읽지 않았습니다.
- KCM Backend의 실제 Production DB REST 접근은 새 서버 설정이 필요하며, 격리된 fixture 테스트와 구분해서 보고합니다.
- DB/워크플로/Render 설정/기존 상담 저장 payload/위험 정책 변경 및 실제 통화는 실행하지 않습니다.

## 데이터 출처 감사

A는 외부/API/저장 자료, B는 로컬 상태·계산, C는 고정 참고 자료입니다. A 경로 구현과 실제 저장 성공 검증은 별개입니다.

| 기능 | 출처 | API·원본 | DB 저장 | 새로고침 이후 |
|---|---|---|---|---|
| 홈 | A+B+C | 저장 예약/브리핑 API, 실시간 SSE + 화면 통화 현황·고정 활동·홈 재고 | 새 조회 영역 읽기 전용, 화면 현황 DB 저장 없음 | DB 재조회, SSE 서버 메모리 재조회, 로컬 상태 초기화 |
| 예약·상담관리 | A + C/B 참고 영역 | reservations/consultations/customers/employees, 기존 화면 상담 | 실제 예약 조회만, 기존 시작·완료·수정은 로컬 | DB 재조회, 참고 상담 결과/수정 이력 초기화 |
| 고객관리 | A + C 참고 영역 | 현재 매장 상담으로 고객 범위 제한, 저장 상담·위험 API, SSE | 조회만 | DB 재조회, SSE는 같은 서버 프로세스에서 유지 |
| 상담지원 | C+B | callMockData, callSupport, CallDemoState | 알림/DB 저장 없음 | 지원·메모 초기화 |
| 상품관리 | A + C 명시적 참고 자료 | 새 DB catalog API, 기존 productCatalog | 조회만 | catalog 재조회, 검색·비교 초기화 |
| 스마트 재고 | A+B, 홈/fallback C | 기존 /api/inventory → n8n → DB | 기존 변경 통로 유지, 이번 쓰기 미실행 | DB 재조회, 입력 상태 초기화 |
| 마케팅 | C+B | 완료 화면 상담과 aftercare 상태 | 실제 문자/DB 저장 없음 | 안내 처리 상태 초기화 |
| 매장관리 | C+B | directoryMockData/workspaceMockData | DB 조회·저장 없음 | 고정 자료, 선택 초기화 |
| 고객 AI 상담 | A+B, 매장 표시 C | 기존 Retell/Monitor/오디오/SSE/n8n 결과 전송 | 기존 저장 통로 유지, HTTP 수신과 DB 저장은 구분 | 음성 세션 복원 없음, 서버 메모리 유지 |
| 사전 브리핑 | A, 기존 C+B 참고 영역 | 저장 AI 요약·현재 상품/요금제·예약 요청·최근 상담/위험 | 읽기 전용, 새 요약 생성 없음 | DB 재조회 |
| 체감가 | A+B | DB 가격/조건 → 서버 결정식 → 계산 응답 | 계산만, 가입/DB 쓰기 없음 | 다시 선택/계산 |
| 고객 이력 | A+B, C 참고 | 저장 consultations/risks + 서버 메모리 통화 | DB 이력 조회만 | DB 재조회, 서버 재시작 이전 메모리는 복원 안 됨 |
| 상담 이력 | A, C+B 참고 | 저장 상담·위험 조회, 기존 로컬 수정 이력 | 조회만 | 저장 이력 재조회, 로컬 이력 초기화 |

## 확인한 실제 테이블

- reservations: id, consultation_id, store_id, employee_id, source, reserved_at, visit_at, purpose, note, status. 예약에 customer_id 없음. consultation을 통해 연결.
- consultations: id, customer_id, store_id, purpose, status, used_ai/phone/visit, call_id, ai_transcription, ai_summary, started_at, ended_at, phone/visit_summary, result.
- customers: id, name, phone, privacy_consent, product_id, plan_id, selection_agreement, membership_grade, bundle 관련 필드.
- products: id, name, maker, storage_gb, color, price.
- own_plans / competitor_plans: id, name, monthly_fee, 제공량·속도·등급 필드. 타사는 company 필드가 있음.
- bundles / bundle_rules: 결합 조건·할인 방식, service/scope/fee_basis, min/max_fee, mobile_discount/mobile_rate 등.
- benefits: name/type/grade/description은 있으나 월 환산 혜택 금액 없음.
- stores/employees: 실제 id/name 및 store_id 관계.
- risks: consultation_id/customer_id/stage, risk_score/risk_level/created_at 및 다섯 신호. 저장된 점수를 다시 계산하거나 통화 간 합산하지 않음.
- ai_transcription/ai_summary는 consultations의 컬럼이며 별도 테이블이 아님.
- 실제 상담 상태는 '진행 중'/'방문 예정'/'완료'/'취소', 예약은 '예약 확정'/'방문 완료'/'취소'/'노쇼'. 기존 로컬 상태에 임의 매핑하지 않음.

## 읽기 API

- GET /api/data/status: 인증 값 없이 설정·매장 범위 준비 여부만 반환.
- GET /api/data/appointments: 기본 50건, 최대 100건, 현재 매장 예약.
- GET /api/data/customers: 기본 최근 상담 고객 20명, 최대 100명, 현재 매장 상담을 통해 범위 제한.
- GET /api/data/customers/:id/consultations: 최근 5건, 명시적 최대 20건, 저장된 단계별 위험도.
- GET /api/briefings/:reservationId: 예약·고객·현재 상품/요금제·요청사항·저장 요약·최근 상담을 결정적으로 조합.
- GET /api/products/catalog: products/own_plans/competitor_plans/bundles/benefits의 검증된 자료.
- POST /api/effective-price: 가격 계산만 수행하며 DB 요청은 모두 GET.

UI에 원본 고객명/전화, 생년월일, 성별, raw 전문을 반환하지 않습니다. 고객 이름/연락처를 마스킹하고 요약/메모 안의 알려진 고객 식별·연락처도 최소화합니다.
privacy_consent=false는 이름·연락처·자유문구를 비공개 표시하고 상세 이력을 제한합니다.
희망 상품·단말은 별도 구조화된 필드가 확인되지 않았으므로 '별도 기록 없음'으로 표시합니다.
분실한 고객 참조, 잘못된 날짜/상태/JSON, 다른 매장·고객 연결, 요청 실패는 안전한 오류 코드로 처리합니다.
설정 없음/오류/빈 결과를 구분하고 오류를 mock 성공으로 바꾸지 않습니다. 기존 로컬 예약 상담은 명시적 참고 영역에서만 유지합니다.

## 체감가 범위와 공식

입력은 등록된 plan_id, 선택 product_id/bundle_id/customer_id와 결합 확인 조건입니다. 브라우저가 가격·할인액을 지정하지 않습니다.

월 통신요금 소계 = DB 요금제 monthly_fee − 확인된 해당 회선 정액 결합 할인.

- FIXED / PER_LINE_FEE_TIER 및 MOBILE / PER_LINE / PER_LINE에서 가입 조건과 단 하나의 금액 구간이 확인될 때만 mobile_discount를 적용.
- min_fee 포함 / max_fee 미포함 구간은 실제 DB 설명과 대조했습니다.
- 결합 미선택은 '미적용', 결합 조건/할인 금액 미확정은 null/'확인 필요', DB에 명시된 0원 할인은 유효한 0원입니다.
- HOUSEHOLD/FAMILY_TOTAL 배분, 고객 문자 조건, 프리미엄 비율 할인은 임의 추론하지 않습니다.
- 단말 price는 1회 현금 가격으로 표시. 할부 기간·이자/지원금 정책이 없어 월할부는 확인 필요입니다.
- 선택약정 비율과 혜택 월 환산 금액을 만들지 않습니다. 혜택과 적용 할인 확인 상태를 별도로 표시합니다.
- 무단말·무결합은 통신요금만의 선택 범위 합계. 단말/미확정 조건이 있는 총부담은 확정하지 않습니다.
- 현재 고객 요금제는 같은 매장 상담 연결과 개인정보 동의 확인 후 서버에서 읽고, 선택 월정액과 할인 전 차이를 계산합니다.
- 음수·소수·NaN/Infinity·잘못된 ID/할인액 초과/겹친 구간 등은 오류 처리합니다.

기존 n8n '사전 브리핑'과 '체감가 계산' 워크플로를 편집기에서 읽기 전용으로 조사했습니다. 브리핑 흐름에는 LLM/행 생성 단계가 있어 호출하지 않았습니다.
체감가 draft에는 DB 외 하드코딩 정책과 복잡한 가족 배분 등이 있어 새 계산에 복사하지 않았습니다. 게시·실행·수정은 하지 않았습니다.

## 실행 설정

서버에 SUPABASE_URL, SUPABASE_READ_KEY, KCM_DEMO_STORE_ID가 필요합니다.
SUPABASE_READ_KEY는 필요한 SELECT 권한/RLS가 허용된 서버 전용 읽기 인증 값으로 관리하며 프런트/VITE 변수나 Git에 넣지 않습니다.
이번 작업에서는 키 요청/조회, 실제 .env 수정, RLS/GRANT 변경, Render 환경 설정·배포를 수행하지 않았습니다.
기존 npm run server / npm run dev로 실행합니다. 환경 설정 후 API와 화면의 실제 DB REST 읽기 E2E를 별도로 확인해야 합니다.

### 공개 배포의 고객 조회 제한

현재 공개 KCM에는 직원 인증이 없습니다. 이름·연락처 마스킹과 privacy_consent=true만으로 상담 자유서술을 공개해도 된다는 의미는 아닙니다.
따라서 신뢰된 deployment.origin이 loopback이 아닌 경우 새 고객·예약·이력·브리핑 경로는 DB 요청 전에 503 REAL_DATA_ACCESS_RESTRICTED를 반환합니다.
고객 ID를 포함한 가격 계산도 같은 제한을 적용합니다. 요청의 Host/Origin/프록시 헤더로 이 제한을 해제할 수 없습니다.
설정 상태 조회, 개인정보 없는 상품 catalog와 고객 없이 수행하는 가격 계산, 기존 Retell/SSE/스마트재고 경로는 유지합니다.
직원 접근 제어와 서버 권한 검증이 준비되기 전에는 공개 Render에서 실제 고객 데이터 조회를 활성화할 수 없습니다. 이번에 새 로그인이나 우회 환경변수는 추가하지 않았습니다.

## 최종 자동·브라우저 검증

- 전체 테스트 465/465 통과(기존 392개 유지, 신규 73개). 실패·건너뜀 0.
- 프런트 tsc --noEmit / 백엔드 tsc -p tsconfig.server.json 통과, Vite production build 성공. 기존 Retell SDK 큰 청크 경고는 유지합니다.
- npm run preview:standalone으로 00_KCM_미리보기.html을 갱신했습니다. 독립 HTML 직접 실행은 미검증입니다.
- 브라우저는 실제 Production 자료 대신 격리된 서버와 합성 DB 응답으로 검증했습니다. 실제 데이터 구조 조회와 실제 KCM REST E2E 성공을 혼동하지 않습니다.
- home/appointments/customers/products를 1920×1080, 1366×768, 390×844, 320×720에서 확인했습니다. 바깥 가로 넘침 없음; 모바일 표 내부만 가로 스크롤을 허용합니다.
- 저장 예약 로딩·7건의 5행 페이지 이동·상태/검색 필터·빈 결과·요약/요청 누락·미동의 고객 제한, 저장 고객 선택·현재 상품/요금제·상담 이력, 상품 4탭·자사/타사·비교를 확인했습니다.
- 서버 가격 결과 55,000원 − 등록 정액 할인 3,000원 = 52,000원 소계, 단말 현금가 1,200,000원/월할부 확인 필요, 합계 미확정과 입력 변경 시 이전 결과 제거를 확인했습니다. 이 금액은 격리 검증값이며 실제 판매 견적이 아닙니다.
- API 실패·서버 설정 없음·빈 자료를 각각 안내하고, 상품 참고 자료는 버튼을 선택해야 열리는 것을 확인했습니다.
- 기존 참고 예약의 상담 시작→결과 작성→완료→수정, 최초 완료 시각 보존과 이력 2건을 브라우저에서 확인했습니다. 실제 DB 쓰기는 없습니다.
- 정상 검증 탭에 기존 확장 메시지 채널 오류 문구 3건이 기록됐습니다. KCM 런타임 stack/화면 장애는 관찰하지 못했지만 구체 발신자는 미확정입니다. 이 로그를 숨기거나 제품 코드로 임의 수정하지 않았습니다.
- Git 대상 152개 파일의 고확신 비밀값 패턴 검사에서 후보 0건, 실제 .env 추적 후보 0건을 확인했습니다. 값은 출력하지 않았고 Git 과거 전체 이력은 이번 검사 범위가 아닙니다.
- 보호 대상 Retell/Monitor/SSE/위험/고성/n8n payload/IDs/스마트재고 업무/의존성/Render 설정 파일 diff는 0입니다. 서버 통합 파일은 새 API 연결과 공개 개인자료 보호만 추가했습니다.

## 이후 범위

직원 접근 제어·읽기 인증·RLS 확인 후 실제 Backend REST E2E, LLM 요약 생성, 희망 상품 구조화, 할인·할부·혜택 정책 확정, 실제 예약 상담 CRUD, 마케팅 발송/저장, 매장/직원 실제 조회는 별도 단계입니다.
